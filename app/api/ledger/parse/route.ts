import { NextResponse } from "next/server";
import { cleanParsed, fallbackParse } from "../../../../lib/ledger";

export async function POST(request: Request) {
  const { text } = await request.json().catch(() => ({}));
  if (typeof text !== "string" || !text.trim()) return NextResponse.json({ error: "Please enter a note." }, { status: 400 });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ parsed: fallbackParse(text), source: "local-fallback", warning: "Gemini unavailable; used local parser." });
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const systemPrompt = "Extract a shop ledger note, including natural Hinglish. Return JSON only with exactly: type (sale|purchase|payment), party_name string, amount number or null, item_description string, paid boolean, paid_was_explicit boolean. Words like becha, bechi, or beche mean sale even if payment appears. payment hogaya, payment ho gaya, and hogaya mean paid=true. In riya ko 195 rupye ke aam becha, party_name is Riya, amount is 195, item_description is aam, and type is sale. If payment status is unclear, paid=false and paid_was_explicit=false. Never invent an amount.";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: "user", parts: [{ text }] }], generationConfig: { temperature: 0, responseMimeType: "application/json" } }),
  });
  if (!response.ok) {
    console.error("Gemini ledger parse failed", response.status, await response.text());
    return NextResponse.json({ parsed: fallbackParse(text), source: "local-fallback", warning: "Gemini unavailable; used local parser." });
  }
  const result = await response.json();
  const content = result.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  try {
    return NextResponse.json({ parsed: cleanParsed(JSON.parse(content), text), source: "gemini" });
  } catch (error) {
    console.error("Gemini ledger parse returned invalid JSON", error);
    return NextResponse.json({ parsed: fallbackParse(text), source: "local-fallback", warning: "Gemini returned invalid JSON; used local parser." });
  }
}
