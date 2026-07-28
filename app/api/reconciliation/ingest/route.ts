import { NextResponse } from "next/server";
import { decideDeterministicMatch, parseTransactionLine, type OpenInvoice } from "../../../../lib/reconciliation";

export const runtime = "nodejs";

type InvoiceRow = { id: string; ledger_entry_id: string; invoice_number: string; amount: number | string; due_date: string; status: string };
type LedgerRow = { id: string; party_name: string };

function configuredClient() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error("Supabase is not configured.");
  return {
    base,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" },
  };
}

async function rest<T>(base: string, headers: HeadersInit, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}/rest/v1/${path}`, { headers, ...init });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

function event(data: unknown) { return `${JSON.stringify(data)}\n`; }

export async function POST(request: Request) {
  let lines: string[];
  try {
    const body = await request.json();
    lines = Array.isArray(body.lines) ? body.lines.map(String).filter((line: string) => line.trim()) : [];
  } catch { return NextResponse.json({ error: "Send transaction lines as JSON." }, { status: 400 }); }
  if (!lines.length) return NextResponse.json({ error: "Add at least one transaction line." }, { status: 400 });
  if (lines.length > 100) return NextResponse.json({ error: "Import up to 100 lines at a time." }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(event(data)));
      try {
        const { base, headers } = configuredClient();
        send({ type: "status", message: `Resolving the demo shop and its open invoices…` });
        const shops = await rest<{ id: string }[]>(base, headers, "shops?demo_flag=eq.true&select=id&limit=1");
        if (!shops[0]) throw new Error("Demo shop not found.");
        const invoices = await rest<InvoiceRow[]>(base, headers, "invoices?status=in.(unpaid,partial)&select=id,ledger_entry_id,invoice_number,amount,due_date,status");
        const ledgerIds = invoices.map((invoice) => invoice.ledger_entry_id).filter(Boolean);
        const ledgerRows = ledgerIds.length
          ? await rest<LedgerRow[]>(base, headers, `ledger_entries?id=in.(${ledgerIds.join(",")})&shop_id=eq.${shops[0].id}&select=id,party_name`)
          : [];
        const partyByLedgerId = new Map(ledgerRows.map((row) => [row.id, row.party_name]));
        const openInvoices: OpenInvoice[] = invoices
          .filter((invoice) => partyByLedgerId.has(invoice.ledger_entry_id))
          .map((invoice) => ({ ...invoice, party_name: partyByLedgerId.get(invoice.ledger_entry_id)! }));
        const results: unknown[] = [];
        for (let index = 0; index < lines.length; index += 1) {
          const rawLine = lines[index];
          send({ type: "status", message: `Checking transaction ${index + 1} of ${lines.length} against ${openInvoices.length} open invoices…` });
          const transaction = parseTransactionLine(rawLine);
          if (transaction.amount === null) {
            send({ type: "status", message: "No usable amount found, holding." });
            results.push({ rawLine, status: "unmatched", reason: "No usable amount found." });
            continue;
          }
          const inserted = await rest<{ id: string }[]>(base, headers, "transactions", {
            method: "POST",
            body: JSON.stringify({ shop_id: shops[0].id, raw_line: transaction.rawLine, amount: transaction.amount, payer_name: transaction.rawReference, upi_ref: null, transaction_date: transaction.transactionDate, match_type: "unmatched" }),
          });
          const decision = decideDeterministicMatch(transaction, openInvoices);
          if (decision.matched) {
            send({ type: "status", message: `Reference matched invoice ${decision.invoice.invoice_number} by ${decision.referenceMatchedBy} substring.` });
            await rest(base, headers, `transactions?id=eq.${inserted[0].id}`, { method: "PATCH", body: JSON.stringify({ matched_invoice_id: decision.invoice.id, match_type: "deterministic" }) });
            results.push({ rawLine, status: "matched", transactionDate: transaction.transactionDate, invoiceNumber: decision.invoice.invoice_number, partyName: decision.invoice.party_name, conditions: ["Exact amount", "Date within ±2 days", `Reference matched by ${decision.referenceMatchedBy}`] });
          } else {
            send({ type: "status", message: "No confident match, holding." });
            results.push({ rawLine, status: "unmatched", transactionDate: transaction.transactionDate, reason: decision.reason });
          }
        }
        send({ type: "complete", results });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "Import failed." });
      } finally { controller.close(); }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache, no-transform" } });
}
