"use client";

import { useCallback, useRef, useState } from "react";
import type { Entity } from "@/types";
import { Header } from "@/components/layout/header";
import { EntityMap } from "@/components/map/entity-map";
import { Legend } from "@/components/map/legend";
import { MemoContainer } from "@/components/memo/memo-container";
import { EntityPanel } from "@/components/panel/entity-panel";
import { Toast } from "@/components/ui/toast";
import { WULF_SAMPLE, WULF_SAMPLE_MEMO } from "@/lib/dev/wulf-sample";

export default function HomePage() {
  const graph = WULF_SAMPLE;
  const [selected, setSelected] = useState<Entity | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  const focusEntity = useCallback(
    (id: string) => {
      const entity = graph.nodes.find((n) => n.id === id);
      if (!entity) return;
      setSelected(entity);
      setFocusRequest((n) => n + 1);
      mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [graph.nodes],
  );

  return (
    <div className="min-h-screen">
      <Header />
      <section ref={mapRef} className="scroll-mt-4 px-6 py-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xs font-medium uppercase tracking-widest text-zinc-500">Entity map</h2>
          <Legend />
        </div>
        <div className="h-[70vh] min-h-[480px] border border-zinc-800">
          <EntityMap graph={graph} selectedId={selected?.id ?? null} focusRequest={focusRequest} onSelect={setSelected} />
        </div>
      </section>
      <MemoContainer
        memo={WULF_SAMPLE_MEMO}
        company={graph.company}
        generatedAt="2026-10-10"
        sourceCount={2}
        onEntityClick={focusEntity}
      />
      <EntityPanel
        entity={selected}
        companyName={graph.company.name}
        onClose={() => setSelected(null)}
        onToast={setToast}
      />
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
