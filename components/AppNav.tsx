"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["Ledger", "/ledger"],
  ["Reconciliation", "/reconciliation"],
  ["Reminders", "/reminders"],
  ["Health", "/health"],
] as const;

export default function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-x-8 gap-y-4 border-b border-[#17211d]/15 pb-6 sm:flex-nowrap" aria-label="Primary navigation">
      <Link href="/" className="font-satoshi shrink-0 text-sm font-bold tracking-[0.16em] uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d85b3f]">
        Khaata Copilot
      </Link>
      <div className="flex w-full flex-wrap items-center gap-x-5 gap-y-3 sm:w-auto sm:flex-nowrap">
        {links.map(([label, href]) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} className={`font-satoshi shrink-0 border-b-2 pb-1 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d85b3f] ${active ? "border-[#d85b3f] text-[#17211d]" : "border-transparent text-[#17211d]/55 hover:border-[#17211d]/30 hover:text-[#17211d]"}`} aria-current={active ? "page" : undefined}>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
