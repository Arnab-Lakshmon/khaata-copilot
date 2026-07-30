import { NextResponse } from "next/server";

export const runtime = "nodejs";

function client() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error("Supabase is not configured.");
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" } };
}
async function rest(base: string, headers: HeadersInit, path: string, init?: RequestInit) { const response = await fetch(`${base}/rest/v1/${path}`, { headers, ...init }); if (!response.ok) throw new Error(await response.text()); return response.json(); }

export async function POST(request: Request) {
  try {
    const { transactionId, invoiceId, confidence, action, invoiceAmount } = await request.json();
    if (!transactionId || !invoiceId || !Number.isFinite(Number(confidence)) || !["confirm", "reject"].includes(action)) return NextResponse.json({ error: "Invalid review decision." }, { status: 400 });
    const { base, headers } = client();
    const shops = await rest(base, headers, "shops?demo_flag=eq.true&select=id&limit=1");
    if (!shops[0]) throw new Error("Demo shop not found.");
    const transaction = await rest(base, headers, `transactions?id=eq.${transactionId}&shop_id=eq.${shops[0].id}&select=id,match_type,amount`);
    if (!transaction[0] || transaction[0].match_type !== "unmatched") return NextResponse.json({ error: "This transaction is no longer available for review." }, { status: 409 });
    const invoice = await rest(base, headers, `invoices?id=eq.${invoiceId}&status=in.(unpaid,partial)&select=id,amount,status`);
    if (!invoice[0]) return NextResponse.json({ error: "The proposed invoice is no longer open." }, { status: 409 });
    await rest(base, headers, "reconciliation_match_decisions", { method: "POST", body: JSON.stringify({ transaction_id: transactionId, proposed_invoice_id: invoiceId, decision: action === "confirm" ? "confirmed" : "rejected", confidence_score: Number(confidence) }) });
    if (action === "confirm") {
      await rest(base, headers, `transactions?id=eq.${transactionId}`, { method: "PATCH", body: JSON.stringify({ matched_invoice_id: invoiceId, match_type: "fuzzy", confidence_score: Number(confidence) }) });
      const existing = await rest(base, headers, `transactions?matched_invoice_id=eq.${invoiceId}&select=amount`);
      const settledAmount = existing.reduce((total: number, row: { amount: number | string }) => total + Number(row.amount), 0);
      await rest(base, headers, `invoices?id=eq.${invoiceId}`, { method: "PATCH", body: JSON.stringify({ status: settledAmount >= Number(invoice[0].amount || invoiceAmount) ? "paid" : "partial" }) });
    }
    return NextResponse.json({ ok: true, action });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save review." }, { status: 500 }); }
}
