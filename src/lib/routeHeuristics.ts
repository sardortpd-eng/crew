/** A routing decision: which preset, and a short human-readable reason. */
export type RouteMatch = { readonly preset: string; readonly reason: string };

/** Specialist presets scored by how many of their keyword patterns match. */
const SPECIALISTS: ReadonlyArray<{ preset: string; patterns: readonly RegExp[] }> = [
  {
    preset: "security",
    patterns: [/security/, /vulnerab/, /owasp/, /inject/, /xss/, /csrf/, /\bsecret/],
  },
  { preset: "tester", patterns: [/\btest/, /\bspec/, /coverage/, /\be2e\b/] },
  {
    preset: "debugger",
    patterns: [
      /\bdebug/,
      /\bbug/,
      /broken/,
      /failing/,
      /crash/,
      /stack ?trace/,
      /traceback/,
      /not working/,
      /\bfix\b/,
    ],
  },
  {
    preset: "reviewer",
    patterns: [/\breview/, /\baudit/, /critique/, /feedback/, /look over/, /\bpr\b/],
  },
  { preset: "planner", patterns: [/\bplan/, /roadmap/, /break ?down/, /steps to/, /strategy/] },
  { preset: "architect", patterns: [/architect/, /system design/, /\bdesign the/, /trade-?off/] },
  {
    preset: "explorer",
    patterns: [
      /explore/,
      /\bfind\b/,
      /where (is|are)/,
      /locate/,
      /map the/,
      /how does/,
      /understand/,
      /search for/,
    ],
  },
  { preset: "docs", patterns: [/document/, /\bdocs?\b/, /readme/, /comment/, /write up/] },
  {
    preset: "refactorer",
    patterns: [/refactor/, /clean ?up/, /restructure/, /rename/, /tidy/, /simplify/],
  },
];

/** Generic build verbs — only chosen when no specialist matched. */
const CODER_PATTERNS: readonly RegExp[] = [
  /build/,
  /\badd\b/,
  /implement/,
  /create/,
  /\bwrite\b/,
  /\bmake\b/,
  /\bcode\b/,
  /wire up/,
  /set up/,
];

/**
 * Picks the best preset for a prompt by keyword scoring. A unique specialist
 * winner wins; `coder` is the fallback for generic build verbs. Only available
 * presets are considered. Ties or no-match return null so the caller defers to
 * the LLM classifier.
 */
export function heuristicRoute(
  prompt: string,
  availablePresets: readonly string[],
): RouteMatch | null {
  const text = prompt.toLowerCase();
  const available = new Set(availablePresets);

  const scored = SPECIALISTS.filter((rule) => available.has(rule.preset)).map((rule) => ({
    preset: rule.preset,
    score: rule.patterns.reduce((n, p) => n + (p.test(text) ? 1 : 0), 0),
  }));

  const top = Math.max(0, ...scored.map((s) => s.score));
  if (top > 0) {
    const winners = scored.filter((s) => s.score === top);
    const winner = winners[0];
    if (winners.length !== 1 || !winner) return null; // tie → defer to the LLM
    return { preset: winner.preset, reason: `matched ${winner.preset} keywords` };
  }

  if (available.has("coder") && CODER_PATTERNS.some((p) => p.test(text))) {
    return { preset: "coder", reason: "build/implement request" };
  }
  return null;
}
