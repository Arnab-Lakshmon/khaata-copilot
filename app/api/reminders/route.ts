import { NextResponse } from "next/server";

export const runtime = "nodejs";

type InvoiceRow = { id: string; ledger_entry_id: string; invoice_number: string; amount: number | string; due_date: string; status: "unpaid" | "partial" };
type LedgerRow = { id: string; party_name: string | null };

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

async function draftReminder(invoice: InvoiceRow & { party_name: string }, tone: "polite" | "firm") {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini is not configured for reminder drafting.");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: `Write one WhatsApp-ready payment reminder in plain text, 45 words maximum. Tone: ${tone}. The wording must clearly reflect that tone. Mention the customer name, amount owed using the ₹ symbol (never $, USD, or another currency), invoice number, and due date. Do not invent facts, add a subject, use markdown, or include a greeting sign-off longer than one line. Facts: ${JSON.stringify({ customer: invoice.party_name, amountOwed: `₹${Number(invoice.amount)}`, invoiceNumber: invoice.invoice_number, dueDate: invoice.due_date })}` }] }] }),
  });
  if (!response.ok) throw new Error(`Gemini reminder failed: ${await response.text()}`);
  const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned no reminder draft.");
  return text.replace(/^```(?:text)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export async function POST(request: Request) {
  let tone: "polite" | "firm" = "polite";
  try { const body = await request.json(); tone = body.tone === "firm" ? "firm" : "polite"; } catch { /* default tone */ }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({ async start(controller) {
    const send = (data: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(data)}\n`));
    try {
      const { base, headers } = config();
      const today = new Date().toISOString().slice(0, 10);
      send({ type: "status", message: "Finding overdue invoices in the demo shop…" });
      const shops = await rest<{ id: string }[]>(base, headers, "shops?demo_flag=eq.true&select=id&limit=1");
      if (!shops[0]) throw new Error("Demo shop not found.");
      const invoices = await rest<InvoiceRow[]>(base, headers, `invoices?status=in.(unpaid,partial)&due_date=lt.${today}&select=id,ledger_entry_id,invoice_number,amount,due_date,status&order=due_date.asc`);
      const ids = invoices.map((invoice) => invoice.ledger_entry_id).filter(Boolean);
      const entries = ids.length ? await rest<LedgerRow[]>(base, headers, `ledger_entries?id=in.(${ids.join(",")})&shop_id=eq.${shops[0].id}&select=id,party_name`) : [];
      const names = new Map(entries.map((entry) => [entry.id, entry.party_name || "Customer"]));
      const overdue = invoices.filter((invoice) => names.has(invoice.ledger_entry_id)).map((invoice) => ({ ...invoice, party_name: names.get(invoice.ledger_entry_id)! }));
      send({ type: "status", message: `${overdue.length} overdue invoice${overdue.length === 1 ? "" : "s"} found. Drafting ${tone} reminders…` });
      const drafts = [];
      for (let index = 0; index < overdue.length; index += 1) {
        const invoice = overdue[index];
        send({ type: "status", message: `Drafting reminder ${index + 1} of ${overdue.length} for ${invoice.party_name}…` });
        const message = await draftReminder(invoice, tone);
        drafts.push({ ...invoice, message });
      }
      send({ type: "complete", drafts });
    } catch (error) { send({ type: "error", message: error instanceof Error ? error.message : "Reminder drafting failed." }); }
    finally { controller.close(); }
  } });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache, no-transform" } });
}

export async function GET() { return NextResponse.json({ error: "Use POST to draft overdue reminders." }, { status: 405 }); }
