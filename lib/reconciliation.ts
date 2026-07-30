export type ImportedTransaction = {
  rawLine: string;
  rawReference: string;
  amount: number | null;
  transactionDate: string;
};

export type OpenInvoice = {
  id: string;
  invoice_number: string;
  amount: number | string;
  due_date: string;
  party_name: string;
};

export type FuzzyDecision = {
  invoice: OpenInvoice;
  confidence: number;
  nameSimilarity: number;
  amountSimilarity: number;
  dateSimilarity: number;
  possiblePartial: boolean;
  possibleSplit: boolean;
  dateDifferenceDays: number;
};

export type DeterministicDecision =
  | { matched: true; invoice: OpenInvoice; referenceMatchedBy: "party name" | "invoice number" }
  | { matched: false; reason: "no amount and date candidate" | "reference did not uniquely identify an invoice" };

const amountPattern = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:₹|rs\.?|inr)/i;
const isoDatePattern = /\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.]([0-2]?\d|3[01])\b/;
const indianDatePattern = /\b([0-2]?\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})\b/;

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function validDate(year: number, month: number, day: number) {
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day;
}

export function parseTransactionLine(rawLine: string): ImportedTransaction {
  const rawReference = rawLine.trim();
  const amountMatch = rawReference.match(amountPattern);
  const fallbackNumber = Array.from(rawReference.matchAll(/\b[\d,]+(?:\.\d{1,2})?\b/g))
    .map((match) => match[0])
    .filter((value) => !/^20\d{2}$/.test(value) && Number(value.replace(/,/g, "")) > 0)
    .sort((left, right) => Number(right.replace(/,/g, "")) - Number(left.replace(/,/g, "")))[0];
  const amountText = amountMatch?.[1] || amountMatch?.[2] || fallbackNumber;
  const amount = amountText ? Number(amountText.replace(/,/g, "")) : null;
  const iso = rawReference.match(isoDatePattern);
  const indian = rawReference.match(indianDatePattern);
  const parsedDate = iso && validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
    ? `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`
    : indian && validDate(Number(indian[3]), Number(indian[2]), Number(indian[1]))
      ? `${indian[3]}-${String(indian[2]).padStart(2, "0")}-${String(indian[1]).padStart(2, "0")}`
      : localToday();
  return { rawLine, rawReference, amount: amount && Number.isFinite(amount) ? amount : null, transactionDate: parsedDate };
}

export function normalizeReference(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function payerNameFromReference(value: string) {
  return value
    .replace(amountPattern, " ")
    .replace(isoDatePattern, " ")
    .replace(indianDatePattern, " ")
    .replace(/\b(?:upi|imps|neft|ref|txn|transaction|payment|paid|from|to|bank|transfer)\b/gi, " ")
    .replace(/[|/\\-]+/g, " ")
    .replace(/\b\d{6,}\b/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s—–-]+|[\s—–-]+$/g, "")
    .trim();
}

function levenshtein(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const saved = previous[column];
      previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1, diagonal + (left[row - 1] === right[column - 1] ? 0 : 1));
      diagonal = saved;
    }
  }
  return previous[right.length];
}

function phoneticSkeleton(value: string) {
  return normalizeReference(value).replace(/[aeiou]/g, "").replace(/ph/g, "f").replace(/v/g, "w").replace(/sh/g, "s");
}

export function nameSimilarity(payerName: string, partyName: string) {
  const payer = normalizeReference(payerName);
  const party = normalizeReference(partyName);
  if (!payer || !party) return 0;
  const payerTokens = payer.split(" ");
  const partyTokens = party.split(" ");
  const overlap = payerTokens.filter((token) => token.length > 1 && partyTokens.some((other) => other === token || other.startsWith(token) || token.startsWith(other))).length / Math.max(payerTokens.length, partyTokens.length);
  const edit = 1 - levenshtein(payer, party) / Math.max(payer.length, party.length);
  const skeletonLeft = phoneticSkeleton(payer);
  const skeletonRight = phoneticSkeleton(party);
  const phonetic = skeletonLeft && skeletonRight ? 1 - levenshtein(skeletonLeft, skeletonRight) / Math.max(skeletonLeft.length, skeletonRight.length) : 0;
  return Math.round(Math.max(overlap, edit, phonetic) * 100);
}

export function dateDifferenceDays(transactionDate: string, dueDate: string) {
  const transactionMs = Date.parse(`${transactionDate}T00:00:00Z`);
  const dueMs = Date.parse(dueDate);
  return Number.isFinite(transactionMs) && Number.isFinite(dueMs) ? Math.round(Math.abs(transactionMs - dueMs) / 86_400_000) : 99;
}

export function decideFuzzyMatch(transaction: ImportedTransaction, payerName: string, invoices: OpenInvoice[], splitInvoiceIds = new Set<string>()): FuzzyDecision | null {
  if (transaction.amount === null) return null;
  const transactionAmount = transaction.amount;
  const candidates = invoices.map((invoice) => {
    const invoiceAmount = Number(invoice.amount);
    const possiblePartial = transactionAmount < invoiceAmount;
    const possibleSplit = splitInvoiceIds.has(invoice.id);
    const amountSimilarity = transactionAmount === invoiceAmount || possibleSplit ? 100 : possiblePartial ? Math.max(35, Math.round((transactionAmount / invoiceAmount) * 100)) : Math.max(0, Math.round(100 - ((transactionAmount - invoiceAmount) / invoiceAmount) * 100));
    const difference = dateDifferenceDays(transaction.transactionDate, invoice.due_date);
    const dateSimilarity = difference <= 2 ? 100 : difference <= 7 ? Math.max(35, 100 - (difference - 2) * 13) : 0;
    const similarity = nameSimilarity(payerName, invoice.party_name);
    const confidence = Math.round(amountSimilarity * 0.5 + similarity * 0.35 + dateSimilarity * 0.15);
    return { invoice, confidence, nameSimilarity: similarity, amountSimilarity, dateSimilarity, possiblePartial, possibleSplit, dateDifferenceDays: difference };
  }).filter((candidate) => candidate.dateSimilarity > 0 && candidate.nameSimilarity >= 25);
  return candidates.sort((left, right) => right.confidence - left.confidence)[0] || null;
}

export function datesWithinTwoDays(transactionDate: string, dueDate: string) {
  const transactionMs = Date.parse(`${transactionDate}T00:00:00Z`);
  const dueMs = Date.parse(dueDate);
  return Number.isFinite(transactionMs) && Number.isFinite(dueMs) && Math.abs(transactionMs - dueMs) <= 2 * 86_400_000;
}

export function decideDeterministicMatch(transaction: ImportedTransaction, invoices: OpenInvoice[]): DeterministicDecision {
  const amountAndDate = invoices.filter((invoice) => transaction.amount !== null && Number(invoice.amount) === transaction.amount && datesWithinTwoDays(transaction.transactionDate, invoice.due_date));
  if (!amountAndDate.length) return { matched: false, reason: "no amount and date candidate" };
  const reference = normalizeReference(transaction.rawReference);
  const referenceMatches: Array<{ invoice: OpenInvoice; referenceMatchedBy: "party name" | "invoice number" }> = [];
  amountAndDate.forEach((invoice) => {
    const party = normalizeReference(invoice.party_name);
    const number = normalizeReference(invoice.invoice_number);
    if (party.length >= 3 && reference.includes(party)) referenceMatches.push({ invoice, referenceMatchedBy: "party name" });
    else if (number.length >= 3 && reference.includes(number)) referenceMatches.push({ invoice, referenceMatchedBy: "invoice number" });
  });
  return referenceMatches.length === 1
    ? { matched: true, ...referenceMatches[0] }
    : { matched: false, reason: "reference did not uniquely identify an invoice" };
}
