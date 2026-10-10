"use client";

import { useState } from "react";
import type { Entity } from "@/types";
import { Header } from "@/components/layout/header";
import { EntityMap } from "@/components/map/entity-map";
import { Legend } from "@/components/map/legend";
import { WULF_SAMPLE } from "@/lib/dev/wulf-sample";

export default function HomePage() {
  const [selected, setSelected] = useState<Entity | null>(null);

  return (
    <div className="min-h-screen">
      <Header />
      <section className="px-6 py-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xs font-medium uppercase tracking-widest text-zinc-500">Entity map</h2>
          <Legend />
        </div>
        <div className="h-[70vh] min-h-[480px] border border-zinc-800">
          <EntityMap graph={WULF_SAMPLE} selectedId={selected?.id ?? null} focusRequest={0} onSelect={setSelected} />
        </div>
      </section>
    </div>
  );
}
