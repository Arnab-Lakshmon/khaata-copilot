"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AppNav from "../components/AppNav";
import GlareHover from "../components/GlareHover";

export default function Home() {
  const router = useRouter();
  const [isEntering, setIsEntering] = useState(false);

  function enterDemoShop(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (isEntering) return;
    setIsEntering(true);
    window.setTimeout(() => router.push("/ledger"), 450);
  }

  return (
    <main className="min-h-screen bg-[#f4f0e8] text-[#17211d]">
      <div className={`mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-7 transition-[transform,opacity] duration-[450ms] ease-in-out sm:px-10 lg:px-16 ${isEntering ? "scale-[1.08] opacity-0" : "scale-100 opacity-100"}`}>
        <AppNav />

        <section className="flex flex-1 items-center py-20">
          <div className="mx-auto max-w-5xl text-center">
            <p className="font-satoshi mb-7 text-sm font-medium tracking-[0.16em] text-[#d85b3f] uppercase">
              Your shop, in sync
            </p>
            <h1 className="font-tanker mx-auto max-w-5xl text-[clamp(4rem,12vw,9.5rem)] leading-[0.86] tracking-[-0.03em] text-[#17211d]">
              Make every rupee count.
            </h1>
            <p className="font-satoshi mx-auto mt-9 max-w-2xl text-lg leading-8 text-[#17211d]/70 sm:text-xl">
              A calm, clear command centre for Indian shop owners to keep track
              of sales, payments, and what needs attention next.
            </p>
            <div className="mx-auto mt-10 flex w-fit justify-center">
              <GlareHover
                width="100%"
                height="auto"
                background="transparent"
                borderColor="transparent"
                borderRadius="9999px"
                glareColor="#FAF6F0"
                glareOpacity={0.12}
                glareAngle={-45}
              >
                <Link
                  href="/ledger"
                  onClick={enterDemoShop}
                  className="font-satoshi inline-flex items-center rounded-full bg-[#d85b3f] px-9 py-5 text-base font-bold text-white shadow-[5px_5px_0_#17211d] transition-transform hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[3px_3px_0_#17211d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d85b3f]"
                >
                  Enter as Demo Shop
                </Link>
              </GlareHover>
            </div>
          </div>
        </section>

        <footer className="flex items-end justify-between border-t border-[#17211d]/15 pt-5">
          <p className="font-satoshi text-xs text-[#17211d]/60">
            A simple start for a smarter shop.
          </p>
        </footer>
      </div>
    </main>
  );
}
