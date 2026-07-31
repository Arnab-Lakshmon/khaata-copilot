"use client";

export default function WhatsAppShare({ message, onShare }: { message: string; onShare?: () => void }) {
  const href = `https://wa.me/?text=${encodeURIComponent(message)}`;
  return <a href={href} onClick={onShare} target="_blank" rel="noreferrer" className="font-satoshi mt-8 inline-flex rounded-full bg-[#25D366] px-6 py-3 text-sm font-bold text-[#12351f]">Share on WhatsApp</a>;
}
