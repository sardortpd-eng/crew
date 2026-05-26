import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSession, saveSession, sessionPath, type SessionSnapshot } from "./sessionStore.ts";

let cwd: string;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "crew-sess-"));
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

const snapshot: SessionSnapshot = {
  agents: [
    { id: "coder-1", presetName: "coder", sessionId: "sess-abc" },
    { id: "reviewer-1", presetName: "reviewer" },
  ],
  tasks: [{ id: "task-1", title: "build it", preset: "coder", status: "done" }],
  focusedAgentId: "coder-1",
  safetyMode: "plan",
};

describe("sessionStore", () => {
  test("save → load round-trips the snapshot", () => {
    expect(loadSession(cwd)).toBeNull();
    saveSession(cwd, snapshot);
    expect(loadSession(cwd)).toEqual(snapshot);
  });

  test("invalid JSON loads as null without throwing", () => {
    mkdirSync(join(cwd, ".crew"), { recursive: true });
    writeFileSync(sessionPath(cwd), "{ not json");
    expect(loadSession(cwd)).toBeNull();
  });

  test("schema-invalid snapshot loads as null", () => {
    mkdirSync(join(cwd, ".crew"), { recursive: true });
    writeFileSync(sessionPath(cwd), JSON.stringify({ agents: "nope" }));
    expect(loadSession(cwd)).toBeNull();
  });
});
