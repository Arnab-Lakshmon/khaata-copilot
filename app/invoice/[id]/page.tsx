import { notFound } from "next/navigation";
import WhatsAppShare from "../../../components/WhatsAppShare";

export const dynamic = "force-dynamic";

type Invoice = {
  id: string;
  ledger_entry_id: string;
  invoice_number: string;
  amount: number;
  due_date: string;
  status: "unpaid" | "paid" | "partial";
  created_at?: string;
};

type LedgerEntry = {
  id: string;
  shop_id: string;
  party_name: string | null;
  amount: number | null;
  paid_bool: boolean | null;
  created_at: string;
  parsed_json: { item_description?: string } | null;
};

type Shop = { id: string; name?: string | null; shop_name?: string | null };

function getSupabaseConfig() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

async function getInvoice(id: string) {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  const invoiceResponse = await fetch(`${config.base}/rest/v1/invoices?id=eq.${encodeURIComponent(id)}&select=id,ledger_entry_id,invoice_number,amount,due_date,status&limit=1`, { headers: config.headers, cache: "no-store" });
  if (!invoiceResponse.ok) throw new Error(`Supabase invoice query failed (${invoiceResponse.status}).`);
  const invoices = (await invoiceResponse.json()) as Invoice[];
  const invoice = invoices[0];
  if (!invoice) return null;

  const entryResponse = await fetch(`${config.base}/rest/v1/ledger_entries?id=eq.${encodeURIComponent(invoice.ledger_entry_id)}&select=id,shop_id,party_name,amount,paid_bool,created_at,parsed_json&limit=1`, { headers: config.headers, cache: "no-store" });
  if (!entryResponse.ok) throw new Error(`Supabase ledger entry query failed (${entryResponse.status}).`);
  const entries = (await entryResponse.json()) as LedgerEntry[];
  const entry = entries[0];
  if (!entry) throw new Error("Invoice exists but its linked ledger entry was not found.");

  const shopResponse = await fetch(`${config.base}/rest/v1/shops?id=eq.${encodeURIComponent(entry.shop_id)}&select=id,name&limit=1`, { headers: config.headers, cache: "no-store" });
  if (!shopResponse.ok) throw new Error(`Supabase shop query failed (${shopResponse.status}).`);
  const shops = (await shopResponse.json()) as Shop[];
  const shop = shops[0];
  if (!shop) throw new Error("Invoice exists but its linked shop was not found.");
  return { invoice, entry, shop };
}

function formatDate(value: string | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function formatAmount(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
}

function getPublicBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/\/$/, "");
  return configured || (vercel ? `https://${vercel}` : "https://khaata-copilot.vercel.app");
}

export default async function InvoicePage({ params }: { params: { id: string } }) {
  const data = await getInvoice(params.id);
  if (!data) notFound();
  const { invoice, entry, shop } = data;
  const shopName = shop.name || "Khaata Copilot Shop";
  const itemDescription = entry.parsed_json?.item_description || "General sale";
  const status = invoice.status || (entry.paid_bool ? "paid" : "unpaid");
  const publicUrl = `${getPublicBaseUrl()}/invoice/${encodeURIComponent(invoice.id)}`;
  const whatsappMessage = `${shopName} invoice ${invoice.invoice_number} for ${formatAmount(invoice.amount ?? entry.amount)}. Due ${formatDate(invoice.due_date)}. View invoice: ${publicUrl}`;

  return <main className="min-h-screen bg-[#f4f0e8] px-6 py-8 text-[#17211d] sm:px-10 lg:px-16"><div className="mx-auto max-w-3xl"><a href="/ledger" className="font-satoshi text-sm font-bold tracking-[0.16em] uppercase">← Back to ledger</a><article className="mt-12 overflow-hidden rounded-[2rem] border border-[#17211d]/15 bg-white shadow-[8px_8px_0_#17211d]"><header className="border-b border-[#17211d]/10 bg-[#17211d] p-7 text-white sm:p-10"><div className="flex flex-col justify-between gap-8 sm:flex-row"><div><p className="font-satoshi text-sm font-bold tracking-[0.16em] text-[#f1d5a5] uppercase">{shopName}</p><h1 className="font-tanker mt-4 text-6xl leading-none sm:text-7xl">Invoice</h1></div><div className="sm:text-right"><p className="font-satoshi text-xs font-bold tracking-[0.16em] text-white/60 uppercase">Invoice number</p><p className="font-satoshi mt-2 text-lg font-bold">{invoice.invoice_number}</p></div></div></header><section className="p-7 sm:p-10"><div className="grid gap-6 border-b border-[#17211d]/10 pb-8 sm:grid-cols-3"><div><p className="font-satoshi text-xs font-bold tracking-[0.12em] text-[#17211d]/50 uppercase">Issued</p><p className="font-satoshi mt-2 font-bold">{formatDate(entry.created_at)}</p></div><div><p className="font-satoshi text-xs font-bold tracking-[0.12em] text-[#17211d]/50 uppercase">Due date</p><p className="font-satoshi mt-2 font-bold">{formatDate(invoice.due_date)}</p></div><div><p className="font-satoshi text-xs font-bold tracking-[0.12em] text-[#17211d]/50 uppercase">Billed to</p><p className="font-satoshi mt-2 font-bold">{entry.party_name || "—"}</p></div></div><div className="mt-8"><div className="flex items-start justify-between gap-6 border-b border-[#17211d]/10 pb-5"><div><p className="font-satoshi font-bold">{itemDescription}</p><p className="font-satoshi mt-1 text-sm text-[#17211d]/55">Sale recorded in the shop ledger</p></div><p className="font-satoshi text-xl font-bold">{formatAmount(invoice.amount ?? entry.amount)}</p></div><div className="flex items-center justify-between pt-6"><p className="font-satoshi text-sm font-bold tracking-[0.12em] text-[#17211d]/50 uppercase">Payment status</p><span className={`font-satoshi rounded-full px-4 py-2 text-sm font-bold ${status === "paid" ? "bg-[#d8ead7] text-[#23613a]" : status === "partial" ? "bg-[#f1d5a5] text-[#795615]" : "bg-[#f4d8d0] text-[#a13c28]"}`}>{status}</span></div><WhatsAppShare message={whatsappMessage}/></div></section></article></div></main>;
}
