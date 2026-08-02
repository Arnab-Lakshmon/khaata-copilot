"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import GlareHover from "./GlareHover";

const links = [
  ["Home", "/"],
  ["Ledger", "/ledger"],
  ["Reconciliation", "/reconciliation"],
  ["Reminders", "/reminders"],
  ["Health", "/health"],
] as const;

export default function AppNav() {
  const pathname = usePathname();

  return (
    <GlareHover
      width="100%"
      height="auto"
      background="transparent"
      borderColor="transparent"
      borderRadius="1rem"
      glareColor="#FAF6F0"
      glareOpacity={0.12}
      glareAngle={-45}
    >
      <nav className="flex w-full flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl bg-[#17211d]/[0.08] px-6 py-4 sm:flex-nowrap" aria-label="Primary navigation">
        <Link href="/" className="font-satoshi shrink-0 text-sm font-black tracking-[0.16em] text-[#17211d] uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d85b3f]">
          Khaata Copilot
        </Link>
        <div className="flex w-full flex-1 flex-wrap items-center justify-between gap-x-5 gap-y-3 sm:ml-10 sm:w-auto sm:flex-nowrap">
          {links.map(([label, href]) => {
            const active = href === "/" ? pathname === "/" : pathname === href;
            return (
              <Link key={href} href={href} className={`font-satoshi shrink-0 border-b-2 pb-1 text-lg font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d85b3f] ${active ? "border-[#d85b3f] text-[#17211d]" : "border-transparent text-[#17211d]/55 hover:border-[#17211d]/30 hover:text-[#17211d]"}`} aria-current={active ? "page" : undefined}>
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </GlareHover>
  );
}
