"use client";

import { ChangeEvent, useRef, useState } from "react";

type Result = { rawLine: string; status: "matched" | "unmatched"; transactionDate?: string; invoiceNumber?: string; partyName?: string; conditions?: string[]; reason?: string };

function csvLines(text: string) {
  const rows = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!rows.length) return [];
  const first = rows[0].toLowerCase();
  if (!/amount|reference|transaction|date/.test(first)) return rows;
  const headers = rows[0].split(",").map((value) => value.trim().toLowerCase());
  const amountIndex = headers.findIndex((value) => /amount|value|paid/.test(value));
  const dateIndex = headers.findIndex((value) => /date|time/.test(value));
  const referenceIndex = headers.findIndex((value) => /reference|payer|name|narration|description|transaction/.test(value));
  return rows.slice(1).map((row) => {
    const values = row.split(",").map((value) => value.trim());
    if (amountIndex < 0 && dateIndex < 0 && referenceIndex < 0) return row;
    return [referenceIndex >= 0 ? values[referenceIndex] : values.join(" "), amountIndex >= 0 ? `₹${values[amountIndex]}` : "", dateIndex >= 0 ? values[dateIndex] : ""].filter(Boolean).join(" — ");
  });
}

export default function ReconciliationPage() {
  const [input, setInput] = useState("");
  const [stream, setStream] = useState<string[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const streamRef = useRef<HTMLDivElement>(null);
  const lines = input.split(/\r?\n/).filter((line) => line.trim());

  function uploadCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setInput(csvLines(String(reader.result || "")).join("\n"));
    reader.readAsText(file);
  }

  async function match() {
    if (!lines.length) return setMessage("Paste at least one transaction, or upload a CSV.");
    setBusy(true); setMessage(""); setResults([]); setStream([]);
    try {
      const response = await fetch("/api/reconciliation/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines }) });
      if (!response.ok || !response.body) throw new Error((await response.json().catch(() => ({}))).error || "Could not start matching.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const events = buffer.split("\n"); buffer = events.pop() || "";
        for (const line of events) {
          if (!line) continue;
          const payload = JSON.parse(line);
          if (payload.type === "status") setStream((current) => [...current, payload.message]);
          if (payload.type === "complete") setResults(payload.results);
          if (payload.type === "error") setMessage(payload.message);
          requestAnimationFrame(() => streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight }));
        }
        if (done) break;
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not match transactions."); }
    finally { setBusy(false); }
  }

  const matched = results.filter((result) => result.status === "matched").length;
  return <main className="min-h-screen bg-[#f4f0e8] px-6 py-8 text-[#17211d] sm:px-10 lg:px-16"><div className="mx-auto max-w-6xl"><a href="/" className="font-satoshi text-sm font-bold tracking-[0.16em] uppercase">← Khaata Copilot</a><div className="mt-14 grid gap-10 lg:grid-cols-[1.1fr_.9fr]"><section><p className="font-satoshi text-sm font-bold tracking-[.16em] text-[#d85b3f] uppercase">Payment intake</p><h1 className="font-tanker mt-4 text-6xl leading-[.88] sm:text-8xl">Match what came in.</h1><p className="font-satoshi mt-6 max-w-xl text-lg leading-8 text-[#17211d]/65">Paste one UPI transaction per line, or bring in a CSV. Only exact, date-near, reference-backed matches are marked.</p><label className="font-satoshi mt-10 block text-sm font-bold">Transactions <span className="font-normal text-[#17211d]/55">({lines.length} lines)</span><textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder={"Rajesh Kumar — ₹4,500 — 2026-07-29\nUPI/NEHA STORES/₹1,250/29-07-2026"} className="mt-3 min-h-64 w-full rounded-[1.5rem] border border-[#17211d]/20 bg-white/65 p-5 font-medium leading-7 outline-none transition focus:border-[#d85b3f]" /></label><div className="mt-4 flex flex-wrap items-center gap-3"><label className="font-satoshi cursor-pointer rounded-full border border-[#17211d]/25 px-5 py-3 text-sm font-bold hover:bg-white/60">Upload CSV<input type="file" accept=".csv,text/csv" onChange={uploadCsv} className="sr-only" /></label><button onClick={match} disabled={busy} className="font-satoshi rounded-full bg-[#d85b3f] px-6 py-3 text-sm font-bold text-white shadow-[3px_3px_0_#17211d] disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Matching…" : "Import & match"}</button></div>{message && <p className="font-satoshi mt-4 text-sm font-bold text-[#b33f29]">{message}</p>}</section><aside className="rounded-[1.75rem] border border-[#17211d]/20 bg-[#17211d] p-5 text-[#e9e1d2] shadow-[6px_6px_0_#d85b3f] sm:p-7"><p className="font-array text-xs tracking-[.15em] text-[#e9e1d2]/60 uppercase">Live agent reasoning stream</p><div ref={streamRef} aria-live="polite" className="font-array mt-5 h-80 overflow-y-auto border-y border-[#e9e1d2]/15 py-4 text-sm leading-6">{stream.length ? stream.map((line, index) => <p key={`${line}-${index}`} className="mb-3"><span className="mr-2 text-[#d85b3f]">›</span>{line}</p>) : <p className="text-[#e9e1d2]/45">Waiting for a batch.</p>}</div><p className="font-satoshi mt-5 text-xs leading-5 text-[#e9e1d2]/55">This records only the checks actually performed: amount, due-date window, and reference substring.</p></aside></div>{results.length > 0 && <section className="mt-16 border-t border-[#17211d]/15 pt-8"><p className="font-satoshi text-sm font-bold tracking-[.14em] text-[#17211d]/60 uppercase">Results</p><h2 className="font-tanker mt-2 text-5xl">{matched} matched · {results.length - matched} unmatched</h2><div className="mt-7 grid gap-4">{results.map((result, index) => <article key={`${result.rawLine}-${index}`} className={`rounded-2xl border p-5 ${result.status === "matched" ? "border-[#27805f]/30 bg-[#daf1e6]" : "border-[#17211d]/15 bg-white/55"}`}><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><p className="font-satoshi text-base font-bold">{result.rawLine}</p><p className="font-satoshi mt-1 text-sm text-[#17211d]/60">Transaction date: {result.transactionDate || "Not recorded"}</p></div><span className={`font-satoshi h-fit rounded-full px-3 py-1 text-xs font-bold ${result.status === "matched" ? "bg-[#27805f] text-white" : "bg-[#17211d]/10 text-[#17211d]/65"}`}>{result.status === "matched" ? "Matched" : "Unmatched"}</span></div>{result.status === "matched" ? <div className="font-satoshi mt-4 text-sm"><p className="font-bold">{result.invoiceNumber} · {result.partyName}</p><ul className="mt-2 flex flex-wrap gap-2">{result.conditions?.map((condition) => <li key={condition} className="rounded-full bg-white/70 px-3 py-1">{condition}</li>)}</ul></div> : <p className="font-satoshi mt-3 text-sm text-[#17211d]/60">{result.reason === "no amount and date candidate" ? "No invoice shared the exact amount and date window." : result.reason}</p>}</article>)}</div></section>}</div></main>;
}
