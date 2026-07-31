import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f4f0e8] text-[#17211d]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-7 sm:px-10 lg:px-16">
        <header className="flex items-center justify-between border-b border-[#17211d]/15 pb-6">
          <p className="font-satoshi text-sm font-bold tracking-[0.18em] uppercase">
            Khaata Copilot
          </p>
          <p className="font-satoshi text-xs tracking-[0.14em] text-[#17211d]/60 uppercase">
            Built for everyday business
          </p>
        </header>

        <section className="flex flex-1 items-center py-20 sm:py-28">
          <div className="max-w-4xl">
            <p className="font-satoshi mb-7 text-sm font-medium tracking-[0.16em] text-[#d85b3f] uppercase">
              Your shop, in sync
            </p>
            <h1 className="font-tanker max-w-4xl text-[clamp(4rem,12vw,9.5rem)] leading-[0.86] tracking-[-0.03em] text-[#17211d]">
              Make every rupee count.
            </h1>
            <p className="font-satoshi mt-9 max-w-xl text-lg leading-8 text-[#17211d]/70 sm:text-xl">
              A calm, clear command centre for Indian shop owners to keep track
              of sales, payments, and what needs attention next.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/ledger"
              className="font-satoshi mt-10 inline-flex items-center rounded-full bg-[#d85b3f] px-7 py-4 text-sm font-bold text-white shadow-[5px_5px_0_#17211d] transition-transform hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[3px_3px_0_#17211d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d85b3f]"
            >
              Enter as Demo Shop
            </Link>
            <Link href="/reconciliation" className="font-satoshi inline-flex items-center rounded-full border border-[#17211d]/25 px-7 py-4 text-sm font-bold transition-colors hover:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d85b3f]">Match UPI payments</Link>
            <Link href="/reminders" className="font-satoshi inline-flex items-center rounded-full border border-[#17211d]/25 px-7 py-4 text-sm font-bold transition-colors hover:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d85b3f]">Chase overdue invoices</Link>
            <Link href="/health" className="font-satoshi inline-flex items-center rounded-full border border-[#17211d]/25 px-7 py-4 text-sm font-bold transition-colors hover:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d85b3f]">View shop health</Link>
            </div>
          </div>
        </section>

        <footer className="flex items-end justify-between border-t border-[#17211d]/15 pt-5">
          <p className="font-satoshi text-xs text-[#17211d]/60">
            A simple start for a smarter shop.
          </p>
          <p className="font-satoshi text-xs font-bold tracking-[0.12em] uppercase">
            Day 01 / Foundation
          </p>
        </footer>
      </div>
    </main>
  );
}
