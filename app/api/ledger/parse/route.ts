import { NextResponse } from "next/server";
import { cleanParsed, fallbackParse } from "../../../../lib/ledger";

export async function POST(request: Request) {
  const { text } = await request.json().catch(() => ({}));
  if (typeof text !== "string" || !text.trim()) return NextResponse.json({ error: "Please enter a note." }, { status: 400 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ parsed: fallbackParse(text), source: "local-fallback" });
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4o-mini", temperature: 0, response_format: { type: "json_object" }, messages: [
      { role: "system", content: "Extract a shop ledger note. Return JSON only with exactly: type (sale|purchase|payment), party_name string, amount number or null, item_description string, paid boolean, paid_was_explicit boolean. If payment status is unclear, paid=false and paid_was_explicit=false. Never invent an amount." },
      { role: "user", content: text },
    ] }),
  });
  if (!response.ok) return NextResponse.json({ parsed: fallbackParse(text), warning: "OpenAI unavailable; used local parser." });
  const result = await response.json();
  const parsed = JSON.parse(result.choices?.[0]?.message?.content || "{}");
  return NextResponse.json({ parsed: cleanParsed(parsed, text), source: "openai" });
}
