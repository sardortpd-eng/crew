import { describe, expect, test } from "bun:test";
import {
  createLeadServer,
  formatAssign,
  formatTeam,
  formatVerify,
  LEAD_SERVER_NAME,
  type LeadDeps,
} from "./leadTools.ts";

describe("formatTeam", () => {
  test("lists the roster and the current team", () => {
    const out = formatTeam({
      presets: [{ name: "coder", description: "writes code" }],
      agents: [{ id: "coder-1", preset: "coder", status: "idle" }],
    });
    expect(out).toContain("coder: writes code");
    expect(out).toContain("coder-1 (coder) — idle");
  });

  test("shows '(none yet)' when no agents are on the team", () => {
    expect(formatTeam({ presets: [], agents: [] })).toContain("(none yet)");
  });
});

describe("formatAssign", () => {
  test("a clean result reports completion + the agent output", () => {
    expect(formatAssign({ ok: true, agentId: "coder-1", result: "shipped", errored: false })).toBe(
      "coder-1 completed:\nshipped",
    );
  });

  test("an errored turn is flagged", () => {
    expect(formatAssign({ ok: true, agentId: "coder-1", result: "boom", errored: true })).toContain(
      "completed WITH ERRORS",
    );
  });

  test("a failure (cap/budget/unknown preset) surfaces as ASSIGN FAILED", () => {
    expect(formatAssign({ ok: false, error: "team is at capacity" })).toBe(
      "ASSIGN FAILED: team is at capacity",
    );
  });
});

describe("formatVerify", () => {
  test("renders status and the failing gate", () => {
    expect(formatVerify("coder-1", { status: "failed", gate: "typecheck" })).toBe(
      "verify coder-1: failed (typecheck)",
    );
    expect(formatVerify("coder-1", { status: "passed" })).toBe("verify coder-1: passed");
  });
});

describe("createLeadServer", () => {
  test("builds an in-process MCP server named 'crew'", () => {
    const deps: LeadDeps = {
      listTeam: () => ({ presets: [], agents: [] }),
      assign: async () => ({ ok: true, agentId: "x", result: "", errored: false }),
      verify: async () => ({ status: "passed" }),
    };
    const server = createLeadServer(deps);
    expect(server.name).toBe(LEAD_SERVER_NAME);
    expect(server.instance).toBeDefined();
  });
});
