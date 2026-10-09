import type { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-md border border-zinc-800 bg-zinc-900/50 p-5 ${className}`} {...props} />;
}

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-medium uppercase tracking-widest text-zinc-500">{children}</h2>;
}
