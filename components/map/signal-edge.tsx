"use client";

import { type Edge, EdgeLabelRenderer, type EdgeProps, getStraightPath } from "@xyflow/react";
import { memo } from "react";

export interface SignalEdgeData extends Record<string, unknown> {
  label?: string;
  /** Arrowhead at the subject company's end (true) or the entity's end (false). */
  arrowAtSource?: boolean;
  /** Entities that dropped out of the filings hang off a dashed line. */
  dashed?: boolean;
  /** Connected to the hovered or selected box. */
  active?: boolean;
  /** Changes each time a box is selected, so the one-time flash replays for the new selection. */
  flashKey?: string | null;
  opacity?: number;
  /** Draw the line in on load; off once the map has settled, so a remount never redraws it. */
  drawIn?: boolean;
  /** Position in the entrance sequence, after all boxes. */
  delayMs?: number;
  /** Line width from the entity's severity: 2.5 high, 1.5 medium, 1 low or none. */
  width?: number;
  /** High-severity lines send one dot from the company to the entity once the line is drawn. */
  energy?: boolean;
  /** Counter view: lines to the boxes the Devil's Advocate flags are dashed. */
  counterDash?: boolean;
  /** The entity's figure, e.g. "$3.20B" or "401 MW", shown after the relationship. */
  figure?: string | null;
  /** Year a debt instrument is due. */
  due?: string | null;
  /** Due within two years: the label turns red. */
  urgent?: boolean;
}

export type SignalFlowEdge = Edge<SignalEdgeData, "signal">;

export const EDGE_IDLE = "rgb(var(--zinc-500))";
/** zinc-400 in dark mode; the inverted scale makes it darker than idle in light mode. */
export const EDGE_ACTIVE = "rgb(var(--zinc-400))";

function SignalEdgeComponent({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<SignalFlowEdge>) {
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const { label, arrowAtSource = false, dashed = false, active = false, flashKey = null, opacity = 1, drawIn = false, delayMs = 0, width = 1.5, energy = false, counterDash = false, figure = null, due = null, urgent = false } = data ?? {};
  const stroke = active ? EDGE_ACTIVE : EDGE_IDLE;
  const marker = `url(#signal-arrow-${active ? "active" : "idle"})`;

  return (
    <>
      <g className="edge-fade" style={{ opacity, transition: "opacity 200ms ease-out" }}>
        <path
          key={flashKey ?? "idle"}
          id={id}
          d={path}
          fill="none"
          pathLength={1}
          className={`signal-edge ${drawIn && !dashed ? "edge-draw" : ""} ${active && flashKey ? "edge-flash" : ""}`}
          style={{
            stroke,
            strokeWidth: active ? width + 1 : width,
            strokeDasharray: dashed ? "0.01 0.01" : counterDash && !drawIn ? "0.012 0.012" : undefined,
            ...(counterDash && !drawIn ? { stroke: "#dc2626" } : {}),
            animationDelay: `${delayMs}ms`,
          }}
          markerStart={arrowAtSource ? marker : undefined}
          markerEnd={arrowAtSource ? undefined : marker}
        />
        {energy && drawIn && !dashed ? (
          <circle r={1.5} opacity={0} style={{ fill: stroke }} className="energy-dot">
            <animateMotion path={path} begin={`${(delayMs + 400) / 1000}s`} dur="0.8s" fill="freeze" />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" begin={`${(delayMs + 400) / 1000}s`} dur="0.8s" fill="freeze" />
          </circle>
        ) : null}
        {/* A wider invisible path makes the line easy to hover. */}
        <path d={path} fill="none" stroke="transparent" strokeWidth={14} className="react-flow__edge-interaction" />
      </g>
      {label ? (
        <EdgeLabelRenderer>
          <div
            className={`edge-pill nodrag nopan pointer-events-none absolute flex items-center gap-1.5 whitespace-nowrap rounded-xs border px-2 py-1 font-sans text-[10px] font-medium uppercase leading-none tracking-[0.06em] text-zinc-200 ${urgent ? "border-red-600 bg-zinc-900" : active ? "border-zinc-600 bg-zinc-800" : "border-zinc-700 bg-zinc-900"}`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              opacity,
              transition: "opacity 200ms ease-out, background-color 150ms ease-out",
              animationDelay: `${delayMs + 200}ms`,
            }}
          >
            <span>{label}</span>
            {figure ? <span className="edge-figure font-mono normal-case tracking-normal text-zinc-50">{figure}</span> : null}
            {due ? <span className={`font-mono tracking-normal ${urgent ? "text-red-500" : "text-zinc-400"}`}>due {due}</span> : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const SignalEdge = memo(SignalEdgeComponent);

/** Arrowheads for the map, about 14px on a 1.5px line. Rendered once inside the canvas. */
export function SignalMarkers() {
  return (
    <svg className="absolute h-0 w-0" aria-hidden>
      <defs>
        {(["idle", "active"] as const).map((state) => (
          <marker
            key={state}
            id={`signal-arrow-${state}`}
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="9"
            markerHeight="9"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: state === "active" ? EDGE_ACTIVE : EDGE_IDLE }} />
          </marker>
        ))}
      </defs>
    </svg>
  );
}
