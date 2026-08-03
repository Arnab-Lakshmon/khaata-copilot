"use client";

import { useState } from "react";
import WhatsAppShare from "../../components/WhatsAppShare";
import AppNav from "../../components/AppNav";

type Draft = {
  id: string;
  invoice_number: string;
  amount: number | string;
  due_date: string;
  status: string;
  party_name: string;
  message: string;
  last_reminded_at: string;
};
function money(value: number | string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}
function date(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
function gstDeadline() {
  const now = new Date();
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
  }).format(new Date(now.getFullYear(), now.getMonth() + 1, 20));
}
function gstFilingMonth() {
  return new Intl.DateTimeFormat("en-IN", { month: "long" }).format(new Date());
}

export default function RemindersPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [tones, setTones] = useState<Record<string, "polite" | "firm">>({});
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function requestDraft(body: {
    tone: "polite" | "firm";
    invoiceId?: string;
    tones?: Record<string, "polite" | "firm">;
  }) {
    const response = await fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No streaming response received.");
    const decoder = new TextDecoder();
    let buffer = "";
    let result: Draft[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === "status") setStatus(event.message);
        if (event.type === "complete") result = event.drafts;
        if (event.type === "error") throw new Error(event.message);
      }
    }
    return result;
  }
  async function chase() {
    setBusy(true);
    setError("");
    setDrafts([]);
    try {
      const result = await requestDraft({ tone: "polite", tones });
      setDrafts(result);
      setStatus(
        result.length
          ? "Drafts ready to review."
          : "No overdue invoices found.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not draft reminders.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function changeTone(draft: Draft) {
    const nextTone =
      (tones[draft.id] || "polite") === "polite" ? "firm" : "polite";
    setTones((current) => ({ ...current, [draft.id]: nextTone }));
    setRegenerating(draft.id);
    try {
      const result = await requestDraft({
        tone: nextTone,
        invoiceId: draft.id,
      });
      if (result[0])
        setDrafts((current) =>
          current.map((item) => (item.id === draft.id ? result[0] : item)),
        );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not regenerate this reminder.",
      );
    } finally {
      setRegenerating(null);
    }
  }
  return (
    <main className="min-h-screen bg-[#f4f0e8] px-6 py-8 text-[#17211d] sm:px-10 lg:px-16">
      <div className="mx-auto max-w-5xl">
        <AppNav />
        <div className="mt-16 grid gap-10 lg:grid-cols-[1fr_0.75fr] lg:items-end">
          <div>
            <p className="font-satoshi text-sm font-bold tracking-[0.16em] text-[#d85b3f] uppercase">
              Reminder agent
            </p>
            <h1 className="font-tanker mt-4 text-6xl leading-none sm:text-8xl">
              Close the loop.
            </h1>
            <p className="font-satoshi mt-6 max-w-xl text-lg leading-8 text-[#17211d]/65">
              Turn overdue invoices into thoughtful, ready-to-send WhatsApp
              messages.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-[#17211d]/15 bg-[#17211d] p-6 text-white">
            <p className="font-satoshi text-xs font-bold tracking-[0.14em] text-[#f1d5a5] uppercase">
              GST calendar nudge
            </p>
            <p className="font-tanker mt-3 text-4xl">GSTR-3B</p>
            <p className="font-satoshi mt-2 text-sm text-white/65">
              {gstFilingMonth()}&apos;s GSTR-3B is typically due {gstDeadline()}.
            </p>
          </div>
        </div>
        <section className="mt-12 rounded-[2rem] border border-[#17211d]/15 bg-white/55 p-5 shadow-[6px_6px_0_#17211d] sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-6 border-b border-[#17211d]/15 pb-6">
            <div>
              <p className="font-satoshi text-xs font-bold tracking-[0.14em] text-[#17211d]/50 uppercase">
                Bulk chase
              </p>
              <h2 className="font-satoshi mt-2 text-2xl font-bold">
                Draft every overdue reminder
              </h2>
            </div>
            <button
              onClick={chase}
              disabled={busy}
              className="font-satoshi rounded-full bg-[#d85b3f] px-6 py-3 text-sm font-bold text-white shadow-[4px_4px_0_#17211d] disabled:opacity-50"
            >
              {busy ? "Drafting…" : "Chase all overdue"}
            </button>
          </div>
          {status && (
            <p className="font-satoshi mt-4 text-sm text-[#17211d]/65">
              {status}
            </p>
          )}
          {error && (
            <p className="font-satoshi mt-4 text-sm font-bold text-[#d85b3f]">
              {error}
            </p>
          )}
          <div className="mt-8 space-y-4">
            {drafts.map((draft) => {
              const flagged =
                Boolean(draft.last_reminded_at) &&
                Date.now() - new Date(draft.last_reminded_at).getTime() >
                  3 * 24 * 60 * 60 * 1000;
              return (
                <article
                  key={draft.id}
                  className="rounded-2xl border border-[#17211d]/15 bg-white p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-satoshi text-xs font-bold tracking-[0.12em] text-[#17211d]/50 uppercase">
                        {draft.invoice_number} · {draft.status}
                      </p>
                      <h3 className="font-satoshi mt-2 text-xl font-bold">
                        {draft.party_name}
                      </h3>
                      <p className="font-satoshi mt-1 text-sm text-[#17211d]/60">
                        {money(draft.amount)} · due {date(draft.due_date)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <div className="flex items-center gap-1 rounded-full border border-[#17211d]/20 p-1 font-satoshi text-xs font-bold">
                        <button
                          onClick={() =>
                            (tones[draft.id] || "polite") !== "polite" &&
                            changeTone(draft)
                          }
                          className={`rounded-full px-3 py-1 ${(tones[draft.id] || "polite") === "polite" ? "bg-[#f1d5a5]" : ""}`}
                        >
                          Polite
                        </button>
                        <button
                          onClick={() =>
                            (tones[draft.id] || "polite") !== "firm" &&
                            changeTone(draft)
                          }
                          className={`rounded-full px-3 py-1 ${(tones[draft.id] || "polite") === "firm" ? "bg-[#f1d5a5]" : ""}`}
                        >
                          Firm
                        </button>
                      </div>
                      <span className="font-satoshi rounded-full bg-[#f4d8d0] px-3 py-1 text-xs font-bold text-[#a13c28]">
                        Overdue
                      </span>
                      {flagged && (
                        <span className="font-satoshi rounded-full bg-[#a13c28] px-3 py-1 text-xs font-bold text-white">
                          Still unpaid after reminder
                        </span>
                      )}
                    </div>
                  </div>
                  {regenerating === draft.id ? (
                    <div className="mt-5 animate-pulse rounded-xl bg-[#f4f0e8] p-4">
                      <div className="h-3 w-4/5 rounded bg-[#17211d]/10" />
                      <div className="mt-3 h-3 w-3/5 rounded bg-[#17211d]/10" />
                      <div className="mt-3 h-3 w-2/5 rounded bg-[#17211d]/10" />
                    </div>
                  ) : (
                    <>
                      <p className="font-satoshi mt-5 whitespace-pre-wrap rounded-xl bg-[#f4f0e8] p-4 text-sm leading-6">
                        {draft.message}
                      </p>
                      <WhatsAppShare
                        message={draft.message}
                        onShare={() => {
                          void fetch("/api/reminders", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ invoiceId: draft.id }),
                          });
                          setDrafts((current) =>
                            current.map((item) =>
                              item.id === draft.id
                                ? {
                                    ...item,
                                    last_reminded_at: new Date().toISOString(),
                                  }
                                : item,
                            ),
                          );
                        }}
                      />
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
