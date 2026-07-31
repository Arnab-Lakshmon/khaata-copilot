import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Invoice = { id: string; ledger_entry_id: string; invoice_number: string; amount: number | string; due_date: string; status: "paid" | "partial" | "unpaid" };
type Ledger = { id: string; party_name: string | null; created_at: string };
type Transaction = { matched_invoice_id: string | null; amount: number | string };

function config() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error("Supabase is not configured.");
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" } };
}
async function rest<T>(base: string, headers: HeadersInit, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}/rest/v1/${path}`, { headers, cache: "no-store", ...init });
  if (!response.ok) throw new Error(await response.text());
  return response.status === 204 ? ({} as T) : response.json() as Promise<T>;
}
function rate(value: number, total: number) { return total ? Math.max(0, Math.min(1, value / total)) : 1; }

export async function GET() {
  try {
    const { base, headers } = config();
    const shops = await rest<{ id: string }[]>(base, headers, "shops?demo_flag=eq.true&select=id&limit=1");
    if (!shops[0]) throw new Error("Demo shop not found.");
    const shopId = shops[0].id;
    const [invoices, ledger, transactions] = await Promise.all([
      rest<Invoice[]>(base, headers, "invoices?select=id,ledger_entry_id,invoice_number,amount,due_date,status&order=due_date.asc"),
      rest<Ledger[]>(base, headers, `ledger_entries?shop_id=eq.${shopId}&select=id,party_name,created_at&order=created_at.desc`),
      rest<Transaction[]>(base, headers, `transactions?shop_id=eq.${shopId}&select=matched_invoice_id,amount`),
    ]);
    const ledgerIds = invoices.map((invoice) => invoice.ledger_entry_id).filter(Boolean);
    const invoiceEntries = ledgerIds.length ? await rest<Ledger[]>(base, headers, `ledger_entries?id=in.(${ledgerIds.join(",")})&shop_id=eq.${shopId}&select=id,party_name,created_at`) : [];
    const parties = new Map(invoiceEntries.map((entry) => [entry.id, entry.party_name || "Unknown party"]));
    const invoiceList = invoices.filter((invoice) => parties.has(invoice.ledger_entry_id)).map((invoice) => ({ ...invoice, party_name: parties.get(invoice.ledger_entry_id)! })).sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
    const totalInvoiced = invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
    const paidByTransaction = new Map<string, number>();
    for (const transaction of transactions) if (transaction.matched_invoice_id) paidByTransaction.set(transaction.matched_invoice_id, (paidByTransaction.get(transaction.matched_invoice_id) || 0) + Number(transaction.amount || 0));
    const paidAmount = invoices.reduce((sum, invoice) => sum + (paidByTransaction.has(invoice.id) ? Math.min(Number(invoice.amount), paidByTransaction.get(invoice.id) || 0) : invoice.status === "paid" ? Number(invoice.amount) : 0), 0);
    const collectionRate = rate(paidAmount, totalInvoiced);
    const reconciliationRate = rate(transactions.filter((transaction) => Boolean(transaction.matched_invoice_id)).length, transactions.length);
    const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const bookkeepingRate = rate(ledger.filter((entry) => new Date(entry.created_at).getTime() >= cutoff).length, ledger.length);
    const score = Math.round((collectionRate * 50) + (reconciliationRate * 30) + (bookkeepingRate * 20));
    await rest(base, headers, "health_snapshots", { method: "POST", body: JSON.stringify({ shop_id: shopId, score, collection_rate: Number(collectionRate.toFixed(4)), reconciliation_rate: Number(reconciliationRate.toFixed(4)), date: new Date().toISOString().slice(0, 10) }) });
    return NextResponse.json({ score, collectionRate, reconciliationRate, bookkeepingRate, invoiceList, weights: { collection: 50, reconciliation: 30, bookkeeping: 20 }, generatedAt: new Date().toISOString() });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load shop health." }, { status: 500 }); }
}
