"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";

interface TickerInputProps {
  busy: boolean;
  initial?: string;
  onSubmit: (ticker: string) => void;
}

export function TickerInput({ busy, initial = "", onSubmit }: TickerInputProps) {
  const [value, setValue] = useState(initial);

  function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ticker = value.trim().toUpperCase();
    if (ticker && !busy) onSubmit(ticker);
  }

  return (
    <form onSubmit={handle} className="flex w-full max-w-md gap-2" role="search">
      <label htmlFor="ticker" className="sr-only">
        Ticker symbol
      </label>
      <input
        id="ticker"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^A-Za-z0-9.\-]/g, ""))}
        placeholder="Enter ticker symbol"
        autoComplete="off"
        spellCheck={false}
        maxLength={10}
        className="h-9 min-w-0 flex-1 rounded-sm border border-zinc-800 bg-zinc-900 px-3 font-mono text-sm uppercase text-zinc-100 placeholder:font-sans placeholder:normal-case placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none"
      />
      <Button type="submit" variant="primary" disabled={busy || value.trim().length === 0} className="h-9 px-4">
        {busy ? "Analyzing" : "Analyze"}
      </Button>
    </form>
  );
}
