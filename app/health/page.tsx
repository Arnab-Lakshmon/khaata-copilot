"use client";

import { useEffect, useRef, useState } from "react";
import PixelHeader from "@/components/PixelHeader";
import AppNav from "../../components/AppNav";

type Invoice = {
  id: string;
  invoice_number: string;
  party_name: string;
  amount: number | string;
  due_date: string;
  status: "paid" | "partial" | "unpaid";
};
type Health = {
  score: number;
  collectionRate: number;
  reconciliationRate: number;
  bookkeepingRate: number;
  invoiceList: Invoice[];
  weights: { collection: number; reconciliation: number; bookkeeping: number };
};
const money = (value: number | string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value));
const date = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
const pct = (value: number) => `${Math.round(value * 100)}%`;
const scoreColor = (score: number) =>
  score < 40 ? "#d85b3f" : score < 70 ? "#c58b2d" : "#388452";

export default function HealthPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftDate, setDraftDate] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [askStatus, setAskStatus] = useState("");
  const [asking, setAsking] = useState(false);
  const answerRef = useRef<HTMLDivElement>(null);
  async function refresh() {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setHealth(body);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load shop health.",
      );
    }
  }
  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(id);
  }, []);
  function beginEdit(invoice: Invoice) {
    setEditingId(invoice.id);
    setDraftDate(invoice.due_date.slice(0, 10));
    setError("");
  }
  async function saveDueDate(invoiceId: string) {
    setSavingId(invoiceId);
    try {
      const response = await fetch("/api/health", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, dueDate: draftDate }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setEditingId(null);
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not update due date.",
      );
    } finally {
      setSavingId(null);
    }
  }
  async function ask() {
    if (!question.trim() || asking) return;
    setAsking(true);
    setAnswer("");
    setAskStatus("");
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!response.ok || !response.body)
        throw new Error("Could not ask Khaata.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "status") setAskStatus(event.message);
          if (event.type === "complete") setAnswer(event.answer);
          if (event.type === "error") throw new Error(event.message);
          answerRef.current?.scrollTo({ top: answerRef.current.scrollHeight });
        }
        if (done) break;
      }
    } catch (reason) {
      setAskStatus(
        reason instanceof Error ? reason.message : "Could not ask Khaata.",
      );
    } finally {
      setAsking(false);
    }
  }
  const score = health?.score || 0;
  const circumference = 2 * Math.PI * 52;
  return (
    <main className="min-h-screen bg-[#f4f0e8] px-6 py-8 text-[#17211d] sm:px-10 lg:px-16">
      <div className="mx-auto max-w-6xl">
        <AppNav />
        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)] lg:items-stretch">
        <header className="flex flex-col justify-between gap-4 border-b border-[#17211d]/15 pb-5 lg:col-start-1 lg:row-start-1">
          <div>
            <p className="font-satoshi text-sm font-bold tracking-[0.16em] text-[#d85b3f] uppercase">
              Shop health dashboard
            </p>
            <h1 className="font-tanker mt-4 text-6xl leading-none sm:text-7xl">
              Know what needs care.
            </h1>
            <p className="font-satoshi mt-6 max-w-xl text-lg leading-8 text-[#17211d]/65">
              One view of collections, payment matching, and the rhythm of your
              bookkeeping.
            </p>
          </div>
          <div>
          <div className="hidden">
              <span>
                {health ? score : "—"}
              </span>
            </div>
            <div>
              <p className="font-satoshi text-xs font-bold tracking-[0.14em] text-[#17211d]/50 uppercase">
                Health score
              </p>
              <p className="font-satoshi mt-2 max-w-[10rem] text-sm text-[#17211d]/65">
                {health
                  ? score >= 70
                    ? "The shop is in a healthy rhythm."
                    : score >= 40
                      ? "A few areas need attention."
                      : "Collections and records need care."
                  : "Calculating from your shop data…"}
              </p>
            </div>
          </div>
        </header>
        {error && (
          <p className="font-satoshi mt-8 font-bold text-[#d85b3f]">{error}</p>
        )}
        {health && (
          <>
            <section className="contents">
              <article className="h-full rounded-[2rem] border border-[#17211d]/15 bg-white/55 p-5 shadow-[6px_6px_0_#17211d] sm:p-6 lg:col-start-1 lg:row-start-2">
                <div className="flex items-center gap-5 border-b border-[#17211d]/15 pb-5">
                  <div className="relative h-28 w-28 shrink-0">
                    <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                      <circle cx="60" cy="60" r="52" fill="none" stroke="#17211d" strokeOpacity=".1" strokeWidth="10" />
                      <circle cx="60" cy="60" r="52" fill="none" stroke={scoreColor(score)} strokeLinecap="round" strokeWidth="10" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - score / 100)} />
                    </svg>
                    <span className="font-tanker absolute inset-0 flex items-center justify-center text-4xl">{health ? score : "—"}</span>
                  </div>
                  <div>
                    <p className="font-satoshi text-xs font-bold tracking-[0.14em] text-[#17211d]/50 uppercase">Health score</p>
                    <p className="font-satoshi mt-2 max-w-[16rem] text-sm text-[#17211d]/65">
                      {health ? score >= 70 ? "The shop is in a healthy rhythm." : score >= 40 ? "A few areas need attention." : "Collections and records need care." : "Calculating from your shop data…"}
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid h-[145px] grid-cols-3 divide-x divide-[#17211d]/15">
                {[
                ["Collection rate", health.collectionRate, "50% weight", "% of invoiced amount actually received"],
                ["Reconciliation", health.reconciliationRate, "30% weight", "% of payments matched to a sale"],
                ["Bookkeeping ≤ 3 days", health.bookkeepingRate, "20% weight", "% of entries logged within 3 days"],
                ].map(([label, value, weight, subtitle]) => (
                <article
                  key={String(label)}
                  className="px-3 first:pl-0 last:pr-0 sm:px-4"
                >
                  <p className="font-satoshi text-xs font-bold tracking-[0.1em] text-[#17211d]/50 uppercase">
                    {label}
                  </p>
                  <p className="font-tanker mt-2 text-3xl">{pct(Number(value))}</p>
                  <p className="font-satoshi mt-1 text-xs text-[#17211d]/55">{weight}</p>
                  <p className="font-satoshi mt-1 text-xs leading-5 text-[#17211d]/50">{subtitle}</p>
                </article>
                ))}
                </div>
              </article>
              <article className="flex h-full min-h-0 flex-col rounded-[2rem] border border-[#d85b3f] bg-[#17211d] p-5 text-white shadow-[5px_5px_0_#17211d] sm:p-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
              <PixelHeader
                text="ASK KHAATA"
                active={asking}
                pixelColor="#17211d"
                className="font-satoshi text-xs font-bold tracking-[0.14em] text-[#f1d5a5] uppercase"
              />
              <h2 className="font-satoshi mt-2 text-xl font-bold">
                What do you want to know?
              </h2>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void ask();
                }}
                className="mt-4 flex flex-col gap-2"
              >
                <input
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  maxLength={500}
                  placeholder="Who owes me the most money?"
                  className="font-satoshi min-w-0 rounded-xl border border-white/20 bg-white px-3 py-2 text-sm text-[#17211d] outline-none"
                />
                <button
                  disabled={asking || !question.trim()}
                  className="font-satoshi rounded-xl bg-[#d85b3f] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {asking ? "Thinking…" : "Ask"}
                </button>
              </form>
              {askStatus && (
                <p className="font-satoshi mt-2 text-xs text-white/60">
                  {askStatus}
                </p>
              )}
              <div
                ref={answerRef}
                aria-live="polite"
                  className="mt-4 min-h-0 max-h-52 flex-1 overflow-y-auto rounded-xl bg-white/10 p-3"
              >
                <p className="font-satoshi whitespace-pre-wrap text-xs leading-5">
                  {answer || "Your answer will appear here."}
                </p>
              </div>
              </article>
            </section>
            <section className="mt-6 rounded-[2rem] border border-[#17211d]/15 bg-white/55 p-4 shadow-[6px_6px_0_#17211d] sm:p-6">
              <p className="font-satoshi text-xs font-bold tracking-[0.14em] text-[#17211d]/50 uppercase">
                Accounts receivable
              </p>
              <h2 className="font-satoshi mt-2 text-2xl font-bold">
                All invoices
              </h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[680px] border-collapse text-left font-satoshi">
                  <thead>
                    <tr className="border-b border-[#17211d]/10 text-xs font-bold tracking-[0.1em] text-[#17211d]/50 uppercase">
                      <th className="py-4 pr-4">Invoice</th>
                      <th className="py-4 pr-4">Party</th>
                      <th className="py-4 pr-4">Amount</th>
                      <th className="py-4 pr-4">Due date</th>
                      <th className="py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {health.invoiceList.map((invoice) => (
                      <tr
                        key={invoice.id}
                        className="border-b border-[#17211d]/10 last:border-0"
                      >
                        <td className="py-5 pr-4 font-bold">
                          {invoice.invoice_number}
                        </td>
                        <td className="py-5 pr-4">{invoice.party_name}</td>
                        <td className="py-5 pr-4 font-bold">
                          {money(invoice.amount)}
                        </td>
                        <td className="py-5 pr-4">
                          {editingId === invoice.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="date"
                                value={draftDate}
                                onChange={(event) =>
                                  setDraftDate(event.target.value)
                                }
                                className="rounded-lg border border-[#17211d]/25 bg-white px-2 py-1 text-sm outline-none focus:border-[#d85b3f]"
                              />
                              <button
                                onClick={() => void saveDueDate(invoice.id)}
                                disabled={savingId === invoice.id}
                                className="rounded-full bg-[#17211d] px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
                              >
                                {savingId === invoice.id ? "Saving…" : "Save"}
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="text-xs font-bold text-[#17211d]/55"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => beginEdit(invoice)}
                              className="group inline-flex items-center gap-2 rounded px-1 py-1 text-left hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#d85b3f]"
                              aria-label={`Edit due date for ${invoice.invoice_number}`}
                            >
                              <span>{date(invoice.due_date)}</span>
                              <span
                                aria-hidden="true"
                                className="text-[#17211d]/45 transition-colors group-hover:text-[#d85b3f]"
                              >
                                ✎
                              </span>
                            </button>
                          )}
                        </td>
                        <td className="py-5">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${invoice.status === "paid" ? "bg-[#d8ead7] text-[#23613a]" : invoice.status === "partial" ? "bg-[#f1d5a5] text-[#795615]" : "bg-[#f4d8d0] text-[#a13c28]"}`}
                          >
                            {invoice.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
        </div>
      </div>
    </main>
  );
}
