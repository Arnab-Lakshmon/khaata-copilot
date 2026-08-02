import { NextResponse } from "next/server";
import { decideDeterministicMatch, decideFuzzyMatch, parseTransactionLine, payerNameFromReference, type FuzzyDecision, type OpenInvoice } from "../../../../lib/reconciliation";

export const runtime = "nodejs";

type InvoiceRow = { id: string; ledger_entry_id: string; invoice_number: string; amount: number | string; due_date: string; status: string };
type LedgerRow = { id: string; party_name: string };
type ConfirmedTransactionRow = { matched_invoice_id: string; amount: number | string };
type Pending = { id: string; rawLine: string; transaction: ReturnType<typeof parseTransactionLine>; payerName: string };

function configuredClient() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error("Supabase is not configured.");
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" } };
}
async function rest<T>(base: string, headers: HeadersInit, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}/rest/v1/${path}`, { headers, ...init });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}
function event(data: unknown) { return `${JSON.stringify(data)}\n`; }

async function generatedReasoning(transaction: Pending, candidate: FuzzyDecision) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini is not configured for fuzzy-match explanations.");
  const facts = { payer: transaction.payerName || transaction.transaction.rawReference, invoiceParty: candidate.invoice.party_name, invoiceNumber: candidate.invoice.invoice_number, transactionAmount: transaction.transaction.amount, invoiceAmount: Number(candidate.invoice.amount), nameSimilarity: candidate.nameSimilarity, amountSimilarity: candidate.amountSimilarity, dateDifferenceDays: candidate.dateDifferenceDays, possiblePartial: candidate.possiblePartial, possibleSplit: candidate.possibleSplit, confidence: candidate.confidence };
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: `Write one concise, plain-English payment-review explanation using ONLY these facts. Explain uncertainty; do not claim this is confirmed. Vary wording naturally between cases. Use ₹, never $. Facts: ${JSON.stringify(facts)}` }] }] }),
  });
  if (!response.ok) throw new Error(`Gemini explanation failed: ${await response.text()}`);
  const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned no explanation.");
  return text;
}

export async function POST(request: Request) {
  let lines: string[];
  try { const body = await request.json(); lines = Array.isArray(body.lines) ? body.lines.map(String).filter((line: string) => line.trim()) : []; }
  catch { return NextResponse.json({ error: "Send transaction lines as JSON." }, { status: 400 }); }
  if (!lines.length) return NextResponse.json({ error: "Add at least one transaction line." }, { status: 400 });
  if (lines.length > 100) return NextResponse.json({ error: "Import up to 100 lines at a time." }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({ async start(controller) {
    const send = (data: unknown) => controller.enqueue(encoder.encode(event(data)));
    try {
      const { base, headers } = configuredClient();
      send({ type: "status", message: "Resolving the demo shop and its open invoices…" });
      const shops = await rest<{ id: string }[]>(base, headers, "shops?demo_flag=eq.true&select=id&limit=1");
      if (!shops[0]) throw new Error("Demo shop not found.");
      const invoices = await rest<InvoiceRow[]>(base, headers, "invoices?status=in.(unpaid,partial)&select=id,ledger_entry_id,invoice_number,amount,due_date,status");
      const confirmedTransactions = await rest<ConfirmedTransactionRow[]>(base, headers, `transactions?shop_id=eq.${shops[0].id}&matched_invoice_id=not.is.null&select=matched_invoice_id,amount`);
      const confirmedAmountByInvoice = new Map<string, number>();
      for (const transaction of confirmedTransactions) confirmedAmountByInvoice.set(transaction.matched_invoice_id, (confirmedAmountByInvoice.get(transaction.matched_invoice_id) || 0) + Number(transaction.amount || 0));
      const ledgerIds = invoices.map((invoice) => invoice.ledger_entry_id).filter(Boolean);
      const ledgerRows = ledgerIds.length ? await rest<LedgerRow[]>(base, headers, `ledger_entries?id=in.(${ledgerIds.join(",")})&shop_id=eq.${shops[0].id}&select=id,party_name`) : [];
      const partyByLedgerId = new Map(ledgerRows.map((row) => [row.id, row.party_name]));
      const openInvoices: OpenInvoice[] = invoices.filter((invoice) => partyByLedgerId.has(invoice.ledger_entry_id)).map((invoice) => ({ ...invoice, party_name: partyByLedgerId.get(invoice.ledger_entry_id)!, remainingBalance: invoice.status === "partial" ? Math.max(0, Number(invoice.amount) - (confirmedAmountByInvoice.get(invoice.id) || 0)) : Number(invoice.amount) }));
      const results: unknown[] = [];
      const pending: Pending[] = [];
      for (let index = 0; index < lines.length; index += 1) {
        const rawLine = lines[index]; const transaction = parseTransactionLine(rawLine);
        send({ type: "status", message: `Checking transaction ${index + 1} of ${lines.length} against ${openInvoices.length} open invoices…` });
        if (transaction.amount === null) { results.push({ rawLine, status: "unmatched", reason: "No usable amount found." }); continue; }
        const payerName = payerNameFromReference(transaction.rawReference);
        const inserted = await rest<{ id: string }[]>(base, headers, "transactions", { method: "POST", body: JSON.stringify({ shop_id: shops[0].id, raw_line: transaction.rawLine, amount: transaction.amount, payer_name: payerName || transaction.rawReference, upi_ref: null, transaction_date: transaction.transactionDate, match_type: "unmatched" }) });
        const deterministic = decideDeterministicMatch(transaction, openInvoices);
        if (deterministic.matched) {
          send({ type: "status", message: `Reference matched invoice ${deterministic.invoice.invoice_number} by ${deterministic.referenceMatchedBy} substring.` });
          await rest(base, headers, `transactions?id=eq.${inserted[0].id}`, { method: "PATCH", body: JSON.stringify({ matched_invoice_id: deterministic.invoice.id, match_type: "deterministic", confidence_score: 100 }) });
          await rest(base, headers, `invoices?id=eq.${deterministic.invoice.id}`, { method: "PATCH", body: JSON.stringify({ status: "paid" }) });
          results.push({ rawLine, status: "matched", transactionDate: transaction.transactionDate, invoiceNumber: deterministic.invoice.invoice_number, partyName: deterministic.invoice.party_name, conditions: ["Exact amount", "Date within ±2 days", `Reference matched by ${deterministic.referenceMatchedBy}`] });
        } else { send({ type: "status", message: "Row unmatched by deterministic pass; holding it for fuzzy review." }); pending.push({ id: inserted[0].id, rawLine, transaction, payerName }); }
      }
      for (const item of pending) {
        const splitInvoiceIds = new Set<string>();
        for (const other of pending) if (other.id !== item.id && other.payerName && other.payerName === item.payerName && Math.abs(Date.parse(item.transaction.transactionDate) - Date.parse(other.transaction.transactionDate)) <= 7 * 86_400_000) for (const invoice of openInvoices) if (Number(item.transaction.amount) + Number(other.transaction.amount) === Number(invoice.amount)) splitInvoiceIds.add(invoice.id);
        send({ type: "status", message: `Trying fuzzy match for ${item.payerName || "unlabelled payer"}…` });
        const candidate = decideFuzzyMatch(item.transaction, item.payerName, openInvoices, splitInvoiceIds);
        if (!candidate || candidate.confidence < 70) { send({ type: "status", message: "No fuzzy proposal cleared the 70% review threshold; keeping it unmatched." }); results.push({ rawLine: item.rawLine, status: "unmatched", transactionDate: item.transaction.transactionDate, reason: "No sufficiently confident fuzzy proposal." }); continue; }
        send({ type: "status", message: `Name similarity ${candidate.nameSimilarity}%; proposing ${candidate.invoice.invoice_number} at ${candidate.confidence}% confidence for human review.` });
        const reasoning = await generatedReasoning(item, candidate);
        results.push({ rawLine: item.rawLine, status: "needs_review", transactionId: item.id, transactionDate: item.transaction.transactionDate, payerName: item.payerName, invoiceId: candidate.invoice.id, invoiceNumber: candidate.invoice.invoice_number, partyName: candidate.invoice.party_name, amount: item.transaction.amount, invoiceAmount: Number(candidate.invoice.amount), confidence: candidate.confidence, reasoning, possiblePartial: candidate.possiblePartial, possibleSplit: candidate.possibleSplit });
      }
      send({ type: "complete", results });
    } catch (error) { send({ type: "error", message: error instanceof Error ? error.message : "Import failed." }); }
    finally { controller.close(); }
  } });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache, no-transform" } });
}
