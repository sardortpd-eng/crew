/**
 * In-process MCP tools that let the `lead` agent actually run the crew: see the
 * roster, delegate a task to a specialist, and verify a builder's work. The
 * heavy lifting (spawning, sending, verifying, and all the caps) is injected by
 * the app via {@link LeadDeps} — this module only declares the tool surface so
 * it can be unit-tested without the SDK or a real agent.
 */
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

/** Outcome of delegating a task to a specialist. */
export type AssignResult =
  | {
      readonly ok: true;
      readonly agentId: string;
      readonly result: string;
      readonly errored: boolean;
    }
  | { readonly ok: false; readonly error: string };

/** Crew operations the lead's tools delegate to (enforced + wired by the app). */
export type LeadDeps = {
  /** The hireable specialist presets and the agents already on the team. */
  readonly listTeam: () => {
    readonly presets: ReadonlyArray<{ name: string; description: string }>;
    readonly agents: ReadonlyArray<{ id: string; preset: string; status: string }>;
  };
  /** Spawn-or-reuse a specialist, run the task to completion, return its output. */
  readonly assign: (args: {
    preset: string;
    task: string;
    agentId?: string;
  }) => Promise<AssignResult>;
  /** Run the quality gates on an agent's work. */
  readonly verify: (agentId: string) => Promise<{ status: string; gate?: string }>;
  /** Have the reviewer agent review another agent's changes; returns findings. */
  readonly review: (agentId: string) => Promise<string>;
};

/** The MCP server name; tools surface to the lead as `mcp__crew__<tool>`. */
export const LEAD_SERVER_NAME = "crew";

function text(body: string) {
  return { content: [{ type: "text" as const, text: body }] };
}

// --- Pure formatters (unit-tested independently of the SDK) ---

/** Renders the roster + current team for the `list_team` tool. */
export function formatTeam(team: ReturnType<LeadDeps["listTeam"]>): string {
  const roster = team.presets.map((p) => `- ${p.name}: ${p.description}`).join("\n");
  const agents =
    team.agents.length > 0
      ? team.agents.map((a) => `- ${a.id} (${a.preset}) — ${a.status}`).join("\n")
      : "(none yet)";
  return `Specialists you can assign:\n${roster}\n\nAgents on the team:\n${agents}`;
}

/** Renders an {@link AssignResult} for the `assign` tool. */
export function formatAssign(r: AssignResult): string {
  if (!r.ok) return `ASSIGN FAILED: ${r.error}`;
  const tag = r.errored ? "completed WITH ERRORS" : "completed";
  return `${r.agentId} ${tag}:\n${r.result}`;
}

/** Renders a verify outcome for the `verify` tool. */
export function formatVerify(agentId: string, v: { status: string; gate?: string }): string {
  return `verify ${agentId}: ${v.status}${v.gate ? ` (${v.gate})` : ""}`;
}

/** Renders the reviewer's findings for the `review` tool. */
export function formatReview(agentId: string, findings: string): string {
  return `review of ${agentId}:\n${findings || "(no findings returned)"}`;
}

/** Builds the in-process MCP server exposing the lead's orchestration tools. */
export function createLeadServer(deps: LeadDeps) {
  return createSdkMcpServer({
    name: LEAD_SERVER_NAME,
    version: "1.0.0",
    tools: [
      tool(
        "list_team",
        "List the specialist presets you can delegate to and the agents already on the team.",
        {},
        async () => text(formatTeam(deps.listTeam())),
      ),
      tool(
        "assign",
        "Delegate a task to a specialist. Pass `agentId` to reuse an existing agent for a " +
          "follow-up, or `preset` to hire a new one. Blocks until the agent finishes and " +
          "returns its output. Builders' edits still go through the normal approval/guardrails.",
        {
          preset: z.string().describe("Specialist preset to hire (ignored when agentId is given)."),
          task: z.string().describe("A concrete, self-contained task for the agent."),
          agentId: z.string().optional().describe("Reuse this existing agent instead of hiring."),
        },
        async (args) =>
          text(
            formatAssign(
              await deps.assign({ preset: args.preset, task: args.task, agentId: args.agentId }),
            ),
          ),
      ),
      tool(
        "verify",
        "Run the project's quality gates (build/typecheck/tests) on an agent's work. " +
          "Returns pass/fail so you can decide whether to reassign fixes.",
        { agentId: z.string().describe("The agent whose work to verify.") },
        async (args) => text(formatVerify(args.agentId, await deps.verify(args.agentId))),
      ),
      tool(
        "review",
        "Have the read-only reviewer agent review another agent's changes and return its " +
          "findings (issues by severity + a verdict). Use before integrating risky work.",
        { agentId: z.string().describe("The agent whose changes to review.") },
        async (args) => text(formatReview(args.agentId, await deps.review(args.agentId))),
      ),
    ],
  });
}
