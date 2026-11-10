"use client";

import { Graph, layout } from "@dagrejs/dagre";
import { Background, BackgroundVariant, Controls, type Edge, Handle, MarkerType, type Node, type NodeProps, Position, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { memo, useEffect, useMemo } from "react";
import type { CommitteeTurn, DistressScore } from "@/types";
import { Referee, type Point } from "@/lib/committee/referee";
import { BAND_STYLE, pctText } from "@/components/distress/distress-card";

const TURN_W = 250;
const TURN_H = 116;
const OUTCOME_W = 210;
const OUTCOME_H = 110;
const OUTCOME_ID = "outcome";

const WHO: Record<CommitteeTurn["speaker"], string> = { analyst: "Analyst", devil: "Devil", chair: "Chair", user: "Member" };
const MOVE: Record<CommitteeTurn["move"], string> = { open: "opens", attack: "attacks", rebut: "rebuts", concede: "concedes", answer: "answers", news: "market news" };

/** Edge look by the move the later turn makes against the earlier one. */
const EDGE: Record<CommitteeTurn["move"], { color: string; dash?: string; label: string }> = {
  attack: { color: "#dc2626", dash: "6 4", label: "attacks" },
  rebut: { color: "#10b981", label: "rebuts" },
  concede: { color: "#f59e0b", dash: "2 4", label: "concedes" },
  answer: { color: "rgb(var(--zinc-500))", label: "answers" },
  news: { color: "rgb(var(--zinc-500))", dash: "2 4", label: "news" },
  open: { color: "rgb(var(--zinc-500))", label: "" },
};

const STATUS_TEXT: Record<Point["status"], string> = { open: "Open", rebutted: "Rebutted", conceded: "Conceded" };
const STATUS_TONE: Record<Point["status"], string> = { open: "text-red-500 border-red-700/60", rebutted: "text-emerald-500 border-emerald-700/60", conceded: "text-amber-500 border-amber-700/60" };

interface TurnData extends Record<string, unknown> {
  turn: CommitteeTurn;
  point: Point | null;
  onOpen: (id: string) => void;
}
interface OutcomeData extends Record<string, unknown> {
  distress: DistressScore | null;
  open: number;
}
type TurnNode = Node<TurnData, "turn">;
type OutcomeNode = Node<OutcomeData, "outcome">;

const TurnBox = memo(function TurnBox({ data }: NodeProps<TurnNode>) {
  const { turn, point } = data;
  const side = turn.speaker === "devil" ? "devil" : turn.speaker === "analyst" ? "analyst" : "floor";
  const border = side === "devil" ? "border-red-600" : side === "analyst" ? "border-emerald-600" : "border-zinc-600";
  const label = side === "devil" ? "text-red-500" : side === "analyst" ? "text-emerald-500" : "text-zinc-400";
  const struck = turn.status === "unsupported";
  const loadBearing = point?.status === "open" && point.strength === "strong" && !struck;
  return (
    <button
      type="button"
      onClick={() => data.onOpen(turn.id)}
      title="Show this line in the transcript"
      className={`surface block h-full w-full rounded-xs border border-l-[3px] ${border} px-3 py-2 text-left ${struck ? "opacity-50" : ""} ${loadBearing ? "ring-2 ring-red-600" : ""}`}
      style={{ width: TURN_W, height: TURN_H, background: side === "devil" ? "var(--devil-bg)" : undefined }}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-zinc-600" />
      <span className="flex items-center gap-1.5">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${label}`}>{WHO[turn.speaker]}</span>
        <span className="text-[10px] text-zinc-500">{turn.speaker === "user" ? "asks" : MOVE[turn.move]}</span>
        <span className="font-mono text-[10px] text-zinc-600">{turn.id}</span>
        {point ? <span className={`ml-auto rounded-xs border px-1 text-[9px] font-semibold uppercase tracking-wider ${STATUS_TONE[point.status]}`}>{STATUS_TEXT[point.status]}</span> : null}
      </span>
      <span className={`mt-1 line-clamp-3 text-[11.5px] leading-snug ${struck ? "text-zinc-500 line-through decoration-red-600/70" : "text-zinc-200"}`}>{turn.text}</span>
      <span className="mt-1 flex items-center gap-1.5 text-[10px] text-zinc-500">
        {struck ? <span className="font-semibold uppercase tracking-wider text-red-500">Struck</span> : turn.status === "pending" ? <span>Checking</span> : null}
        {turn.evidence ? <span className="truncate">📎 {turn.evidence.title}</span> : null}
        {loadBearing ? <span className="ml-auto shrink-0 font-semibold uppercase tracking-wider text-red-500">Unanswered</span> : null}
      </span>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-zinc-600" />
    </button>
  );
});

const OutcomeBox = memo(function OutcomeBox({ data }: NodeProps<OutcomeNode>) {
  const d = data.distress;
  return (
    <div className="surface rounded-xs border-2 border-zinc-500 px-3 py-2" style={{ width: OUTCOME_W, height: OUTCOME_H }}>
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-zinc-600" />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Bankruptcy in 12 months</p>
      <p className={`font-mono text-2xl font-semibold ${d ? BAND_STYLE[d.band].text : "text-zinc-500"}`}>{d ? pctText(d.probability) : "n/a"}</p>
      <p className="text-[10px] leading-snug text-zinc-500">
        {d ? `${BAND_STYLE[d.band].label} · average ${pctText(d.baseRate)}. ` : ""}
        {data.open ? `${data.open} point${data.open === 1 ? "" : "s"} against the credit left open.` : "No point against the credit left open."}
      </p>
    </div>
  );
});

const nodeTypes = { turn: TurnBox, outcome: OutcomeBox };

/** Replays the turns through the same referee the server used, so the map's open and rebutted points match the scoreboard. */
function pointsOf(turns: CommitteeTurn[]): Map<string, Point> {
  const ref = new Referee([]);
  for (const t of turns) ref.record(t);
  return ref.points;
}

function build(turns: CommitteeTurn[], distress: DistressScore | null, onOpen: (id: string) => void): { nodes: Node[]; edges: Edge[] } {
  const points = pointsOf(turns);
  const ids = new Set(turns.map((t) => t.id));
  const open = Array.from(points.values()).filter((p) => p.status === "open");
  const g = new Graph();
  g.setGraph({ rankdir: "LR", nodesep: 28, ranksep: 70, marginx: 16, marginy: 16 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const t of turns) g.setNode(t.id, { width: TURN_W, height: TURN_H });
  const edges: Edge[] = [];
  for (const t of turns) {
    if (!t.replyingTo || !ids.has(t.replyingTo)) continue;
    g.setEdge(t.replyingTo, t.id);
    const look = EDGE[t.move];
    edges.push({
      id: `${t.replyingTo}-${t.id}`,
      source: t.replyingTo,
      target: t.id,
      label: look.label,
      labelStyle: { fill: look.color, fontSize: 10, fontWeight: 600 },
      labelBgStyle: { fill: "rgb(var(--zinc-950))" },
      // The arrow points at the line being answered.
      markerStart: { type: MarkerType.ArrowClosed, color: look.color, width: 16, height: 16 },
      style: { stroke: look.color, strokeWidth: t.status === "unsupported" ? 1 : 2, strokeDasharray: look.dash, opacity: t.status === "unsupported" ? 0.4 : 1 },
    });
  }
  if (turns.length) {
    g.setNode(OUTCOME_ID, { width: OUTCOME_W, height: OUTCOME_H });
    for (const p of open) {
      g.setEdge(p.turnId, OUTCOME_ID);
      const strong = p.strength === "strong";
      edges.push({
        id: `${p.turnId}-${OUTCOME_ID}`,
        source: p.turnId,
        target: OUTCOME_ID,
        label: strong ? "unanswered, strong" : "unanswered",
        labelStyle: { fill: "#dc2626", fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: "rgb(var(--zinc-950))" },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#dc2626", width: 16, height: 16 },
        style: { stroke: "#dc2626", strokeWidth: strong ? 3 : 1.5, strokeDasharray: "6 4" },
      });
    }
  }
  layout(g);
  const nodes: Node[] = turns.map((t) => {
    const pos = g.node(t.id);
    return { id: t.id, type: "turn", position: { x: pos.x - TURN_W / 2, y: pos.y - TURN_H / 2 }, data: { turn: t, point: points.get(t.id) ?? null, onOpen }, draggable: false };
  });
  if (turns.length) {
    const pos = g.node(OUTCOME_ID);
    // The outcome sits right of everything, whatever links to it.
    const right = Math.max(...nodes.map((n) => n.position.x + TURN_W));
    nodes.push({ id: OUTCOME_ID, type: "outcome", position: { x: Math.max(pos.x - OUTCOME_W / 2, right + 70), y: pos.y - OUTCOME_H / 2 }, data: { distress, open: open.length }, draggable: false });
  }
  return { nodes, edges };
}

function Flow({ turns, distress, onOpen }: ArgumentFlowProps) {
  const { nodes, edges } = useMemo(() => build(turns, distress, onOpen), [turns, distress, onOpen]);
  const { fitView } = useReactFlow();
  useEffect(() => {
    const t = setTimeout(() => void fitView({ padding: 0.12, duration: 300 }), 30);
    return () => clearTimeout(t);
  }, [nodes.length, fitView]);
  return (
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView minZoom={0.2} maxZoom={1.5} nodesConnectable={false} proOptions={{ hideAttribution: true }}>
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgb(var(--zinc-800))" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

interface ArgumentFlowProps {
  turns: CommitteeTurn[];
  distress: DistressScore | null;
  /** Shows a line in the transcript. */
  onOpen: (id: string) => void;
}

/**
 * The debate as a graph: each line points at the line it answers, coloured by
 * the move. Points against the credit that nobody rebutted run to the
 * forecast on the right; a strong one is ringed red, because it is the point
 * the case rests on.
 */
export function ArgumentFlow(props: ArgumentFlowProps) {
  return (
    <div>
      <div className="h-[560px] overflow-hidden rounded-xs border border-zinc-800">
        <ReactFlowProvider>
          <Flow {...props} />
        </ReactFlowProvider>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
        <span>
          <span className="text-red-500">- - -</span> attacks
        </span>
        <span>
          <span className="text-emerald-500">&mdash;</span> rebuts
        </span>
        <span>
          <span className="text-amber-500">&middot;&middot;&middot;</span> concedes
        </span>
        <span>Arrows point at the line being answered. Red ring: a strong point nobody rebutted. Faded: struck by the verifier.</span>
      </p>
    </div>
  );
}
