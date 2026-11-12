import assert from "node:assert/strict";
import { test } from "node:test";
import { NOVELTY_MIN, nameWords, novelty, overlap, words } from "./novelty";
import { JUMP_Z, marketReaction } from "./reaction";

const exclude = nameWords("TeraWulf", "WULF");

test("a reworded wire story is a repeat", () => {
  const n = novelty("Google backstops TeraWulf debt for Anthropic data center", ["TeraWulf gets credit backstop from Google for Anthropic data-center project"], exclude);
  assert.ok(n.novelty < NOVELTY_MIN, `novelty ${n.novelty}`);
});

test("a different story about the same company is new", () => {
  const n = novelty("TeraWulf reports third-quarter revenue", ["TeraWulf gets credit backstop from Google for Anthropic data-center project"], exclude);
  assert.ok(n.novelty >= NOVELTY_MIN, `novelty ${n.novelty}`);
});

test("overlap ignores the company name and stopwords", () => {
  assert.equal(overlap(words("TeraWulf shares rise", exclude), words("TeraWulf stock falls", exclude)), 0);
});

test("a move many times the usual daily spread is a jump; an ordinary one is not", () => {
  // Alternating ±1% days, then a 10% drop: sortable day keys stand in for dates.
  const dated: { date: string; close: number }[] = [];
  let close = 100;
  for (let i = 0; i < 70; i++) {
    close *= 1 + (i % 2 ? 0.01 : -0.01);
    dated.push({ date: `D${String(i).padStart(3, "0")}`, close });
  }
  dated.push({ date: "D070", close: dated[69].close * 0.9 });
  const r = marketReaction(dated, "D070", "D999");
  assert.ok(r && r.jump && r.z <= -JUMP_Z, JSON.stringify(r));
  const calm = marketReaction(dated.slice(0, 70), "D065", "D999");
  assert.ok(calm && !calm.jump, JSON.stringify(calm));
});
