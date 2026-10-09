"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Input } from "@/components/ui/input";

export function TickerSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbol = value.trim().toUpperCase().replace(/[^A-Z.\-]/g, "");
    if (symbol) router.push(`/ticker/${symbol}`);
  }

  return (
    <form onSubmit={onSubmit} role="search" className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
      <label htmlFor="ticker-search" className="sr-only">
        Ticker
      </label>
      <Input
        id="ticker-search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ticker, e.g. WULF"
        autoComplete="off"
        spellCheck={false}
        className="py-2 pl-9 font-mono uppercase placeholder:normal-case"
      />
    </form>
  );
}
