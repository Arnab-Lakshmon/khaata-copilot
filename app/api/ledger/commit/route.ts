import { NextResponse } from "next/server";
import { cleanParsed } from "../../../../lib/ledger";

export async function POST(request: Request) {
  const { raw_text, parsed } = await request.json();
  if (!raw_text || !parsed || parsed.amount === null || parsed.amount === undefined || Number(parsed.amount) <= 0) return NextResponse.json({ error: "Add a valid amount before confirming." }, { status: 400 });
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const shop = await fetch(`${base}/rest/v1/shops?demo_flag=eq.true&select=id&limit=1`, { headers }).then((r) => r.json());
  const shopId = shop?.[0]?.id;
  if (!shopId) return NextResponse.json({ error: "Demo shop not found." }, { status: 500 });
  const value = cleanParsed(parsed, raw_text);
  const entry = await fetch(`${base}/rest/v1/ledger_entries`, { method: "POST", headers, body: JSON.stringify({ shop_id: shopId, raw_text, parsed_json: value, type: value.type, amount: value.amount, party_name: value.party_name, paid_bool: value.paid }) }).then(async (r) => r.ok ? r.json() : Promise.reject(new Error(await r.text())));
  if (value.type !== "sale") return NextResponse.json({ entry_id: entry[0].id });
  const shopShort = String(shopId).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase() || "DEMO";
  const entryKey = String(entry[0].id).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
  const invoiceNumber = `KC-${shopShort}-${entryKey}`;
  const due = new Date(Date.now() + 7 * 86400000).toISOString();
  const invoice = await fetch(`${base}/rest/v1/invoices`, { method: "POST", headers, body: JSON.stringify({ ledger_entry_id: entry[0].id, invoice_number: invoiceNumber, amount: value.amount, due_date: due, status: value.paid ? "paid" : "unpaid" }) }).then(async (r) => r.ok ? r.json() : Promise.reject(new Error(await r.text())));
  return NextResponse.json({ entry_id: entry[0].id, invoice_id: invoice[0].id, invoice_number: invoiceNumber });
}
