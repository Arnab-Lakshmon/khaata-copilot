import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Invoice = { id: string; ledger_entry_id: string; invoice_number: string; amount: number | string; due_date: string; status: "paid" | "partial" | "unpaid" };
type Ledger = { id: string; party_name: string | null; created_at: string; parsed_json: { item_description?: string } | null };
type Transaction = { id: string; amount: number | string; matched_invoice_id: string | null; match_type: string | null; payer_name: string | null; transaction_date: string | null; created_at: string };

function config() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error("Supabase is not configured.");
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" } };
}

async function rest<T>(base: string, headers: HeadersInit, path: string): Promise<T> {
  const response = await fetch(`${base}/rest/v1/${path}`, { headers, cache: "no-store" });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

function rate(value: number, total: number) { return total ? Math.max(0, Math.min(1, value / total)) : 1; }
function clean(value: string | null) { return value?.trim() || "Unknown payer"; }
function cleanDescription(value: string | undefined) {
  const description = value?.trim();
  if (!description) return "Sale";
  const legacyMarkers = /\b(?:sold|sell|sale|becha|bechi|beche|paid|payment|hogaya|ho gaya|rs\.?|rupees?|inr)\b|Ã¢â€šÂ¹|\?/i;
  return legacyMarkers.test(description) ? "Sale" : description.slice(0, 120);
}

async function answer(question: string, context: unknown) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini is not configured for Ask Khaata.");
  const prompt = `You are Ask Khaata, a careful shop-finance assistant. Answer the user's question in plain, conversational English or Hinglish, whichever fits the question. Use ONLY the structured shop context below. Never invent, estimate, or infer numbers that are not directly derivable from it. If the answer is not derivable, say exactly: "I don't have enough data to answer that." Mention the relevant names, amounts, dates, and status clearly. Keep the answer concise (maximum 120 words).\n\nSHOP CONTEXT (current demo shop):\n${JSON.stringify(context)}\n\nUSER QUESTION: ${question}`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(process.env.GEMINI_MODEL || "gemini-3.1-flash-lite")}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!response.ok) throw new Error(`Gemini failed: ${await response.text()}`);
  const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned no answer.");
  return text.replace(/^```(?:text)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export async function POST(request: Request) {
  let question = "";
  try { const body = await request.json(); question = typeof body.question === "string" ? body.question.trim() : ""; } catch { /* handled below */ }
  if (!question || question.length > 500) return NextResponse.json({ error: "Ask a question up to 500 characters." }, { status: 400 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({ async start(controller) {
    const send = (data: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(data)}\n`));
    try {
      const { base, headers } = config();
      send({ type: "status", message: "Reading the demo shop ledger…" });
      const shops = await rest<{ id: string }[]>(base, headers, "shops?demo_flag=eq.true&select=id&limit=1");
      if (!shops[0]) throw new Error("Demo shop not found.");
      const shopId = shops[0].id;
      const [invoices, ledger, transactions] = await Promise.all([
        rest<Invoice[]>(base, headers, "invoices?select=id,ledger_entry_id,invoice_number,amount,due_date,status&order=due_date.asc"),
        rest<Ledger[]>(base, headers, `ledger_entries?shop_id=eq.${encodeURIComponent(shopId)}&select=id,party_name,created_at,parsed_json`),
        rest<Transaction[]>(base, headers, `transactions?shop_id=eq.${encodeURIComponent(shopId)}&select=id,amount,matched_invoice_id,match_type,payer_name,transaction_date,created_at&order=transaction_date.desc`),
      ]);
      const entryById = new Map(ledger.map((entry) => [entry.id, entry]));
      const scopedInvoices = invoices.filter((invoice) => entryById.has(invoice.ledger_entry_id)).map((invoice) => ({ ...invoice, party_name: entryById.get(invoice.ledger_entry_id)?.party_name || "Unknown party", item_description: cleanDescription(entryById.get(invoice.ledger_entry_id)?.parsed_json?.item_description) }));
      const scopedTransactions = transactions.map((transaction) => ({ amount: Number(transaction.amount || 0), payer_name: clean(transaction.payer_name), transaction_date: transaction.transaction_date || transaction.created_at.slice(0, 10), matched_invoice_id: transaction.matched_invoice_id, match_status: transaction.matched_invoice_id ? "matched" : (transaction.match_type || "unmatched") }));
      const now = new Date(); const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10); const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
      const collectedThisMonth = scopedTransactions.filter((transaction) => transaction.matched_invoice_id && transaction.transaction_date >= monthStart && transaction.transaction_date < nextMonth).reduce((sum, transaction) => sum + transaction.amount, 0);
      const paidAmount = scopedInvoices.reduce((sum, invoice) => sum + (invoice.status === "paid" ? Number(invoice.amount) : 0), 0);
      const totalInvoiced = scopedInvoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
      const collectionRate = rate(paidAmount, totalInvoiced); const reconciliationRate = rate(scopedTransactions.filter((transaction) => Boolean(transaction.matched_invoice_id)).length, scopedTransactions.length); const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000; const bookkeepingRate = rate(ledger.filter((entry) => new Date(entry.created_at).getTime() >= cutoff).length, ledger.length); const score = Math.round(collectionRate * 50 + reconciliationRate * 30 + bookkeepingRate * 20);
      const duplicateLookingPayments = scopedTransactions.filter((transaction, index, all) => all.some((other, otherIndex) => otherIndex > index && other.amount === transaction.amount && other.payer_name === transaction.payer_name && other.transaction_date === transaction.transaction_date)).map((transaction) => ({ payer_name: transaction.payer_name, amount: transaction.amount, transaction_date: transaction.transaction_date }));
      const context = { invoices: scopedInvoices.map(({ id, invoice_number, party_name, item_description, amount, due_date, status }) => ({ id, invoice_number, party_name, item_description, amount: Number(amount), due_date, status })), transactions: scopedTransactions, health: { score, collection_rate: collectionRate, reconciliation_rate: reconciliationRate, bookkeeping_rate: bookkeepingRate, weights: { collection: 50, reconciliation: 30, bookkeeping: 20 } }, derived: { current_month: `${monthStart} to ${nextMonth} exclusive`, collected_this_month: collectedThisMonth, duplicate_looking_payments: duplicateLookingPayments, invoice_party_lookup: Object.fromEntries(scopedInvoices.map((invoice) => [invoice.id, invoice.party_name])) } };
      send({ type: "status", message: "Checking the numbers and preparing an answer…" });
      send({ type: "complete", answer: await answer(question, context) });
    } catch (error) { send({ type: "error", message: error instanceof Error ? error.message : "Ask Khaata could not answer." }); }
    finally { controller.close(); }
  } });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache, no-transform" } });
}

export async function GET() { return NextResponse.json({ error: "Use POST to ask Khaata." }, { status: 405 }); }
