export type LedgerType = "sale" | "purchase" | "payment";

export type ParsedLedger = {
  type: LedgerType;
  party_name: string;
  amount: number | null;
  item_description: string;
  paid: boolean;
  paid_was_explicit: boolean;
};

export function fallbackParse(rawText: string): ParsedLedger {
  const text = rawText.trim();
  const lower = text.toLowerCase();
  const normalized = lower.replace(/[₹?]/g, " rs ").replace(/rs\.?/g, " rs ");
  const type: LedgerType = /\b(bought|buy|purchase|purchased|from supplier)\b/.test(lower)
    ? "purchase"
    : /\b(paid|payment|received|gave)\b/.test(lower) && !/\b(sold|sale|becha|bechi|beche)\b/.test(lower)
      ? "payment"
      : "sale";
  const amountMatch = normalized.match(/\brs\s*([\d,]+(?:\.\d+)?)|\b([\d,]+(?:\.\d+)?)\s*\brs\b|\b([\d,]+(?:\.\d+)?)\s+(?=(?:paid|for)\b)/);
  const amountDigits = amountMatch?.[0].match(/[\d,]+(?:\.\d+)?/);
  let amount = amountDigits ? Number(amountDigits[0].replace(/,/g, "")) : null;
  if (!amount || amount <= 0) {
    const candidates = Array.from(normalized.matchAll(/\b\d[\d,]*(?:\.\d+)?\b/g))
      .filter((match) => !new RegExp(`${match[0]}\\s*kg\\b`, "i").test(normalized))
      .map((match) => Number(match[0].replace(/,/g, "")));
    amount = candidates.length ? candidates[candidates.length - 1] : null;
  }
  const paidMatch = lower.match(/\b(paid|pay|payment received|settled|payment hogaya|payment ho gaya|hogaya|ho gaya|unpaid|not paid|due)\b/);
  const paid = paidMatch ? !/(unpaid|not paid|due)/.test(paidMatch[1]) : false;
  const partyMatch = text.match(/\b(?:to|from)\s+([A-Za-z][A-Za-z .'-]*?)(?=,|\s+(?:₹|rs\.?|rupees?|inr)|\s+(?:paid|unpaid|for)\b|\s+\d|$)/i) || text.match(/^([A-Za-z][A-Za-z .'-]*?)\s+(?:ko\s+)?(?:paid|payment|becha|bechi|beche)\b/i) || text.match(/^([A-Za-z][A-Za-z .'-]*?)\s+ko\b/i);
  const paymentParty = type === "payment" && partyMatch?.[1] ? partyMatch[1].trim() : null;
  const party_name = paymentParty || partyMatch?.[1].trim() || (type === "payment" ? "Customer" : "Unknown party");
  const item_description = text.replace(partyMatch?.[0] || "", "").replace(/,?\s*(?:₹|rs\.?|rupees?|inr|\?)\s*[\d,]+(?:\.\d+)?/gi, "").replace(/\b[\d,]+(?:\.\d+)?\s+(?:paid|rupees?)\b/gi, "").trim();
  return { type, party_name, amount, item_description: item_description || "General transaction", paid, paid_was_explicit: Boolean(paidMatch) };
}

export function cleanParsed(value: Partial<ParsedLedger>, rawText: string): ParsedLedger {
  const fallback = fallbackParse(rawText);
  return {
    type: value.type === "purchase" || value.type === "payment" ? value.type : value.type === "sale" ? "sale" : fallback.type,
    party_name: String(value.party_name || fallback.party_name),
    amount: typeof value.amount === "number" && Number.isFinite(value.amount) ? value.amount : fallback.amount,
    item_description: String(value.item_description || fallback.item_description),
    paid: typeof value.paid === "boolean" ? value.paid : fallback.paid,
    paid_was_explicit: typeof value.paid_was_explicit === "boolean" ? value.paid_was_explicit : fallback.paid_was_explicit,
  };
}
