import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendAudit, auditPath, readAudit } from "./auditLog.ts";

let cwd: string;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "crew-audit-"));
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe("auditLog", () => {
  test("append → read round-trips entries in order", async () => {
    await appendAudit(cwd, { kind: "spawn", agentId: "coder-1", detail: "coder" });
    await appendAudit(cwd, { kind: "tool", agentId: "coder-1", detail: "Bash(ls)" });
    const entries = readAudit(cwd);
    expect(entries.map((e) => e.kind)).toEqual(["spawn", "tool"]);
    expect(entries[1]).toMatchObject({ agentId: "coder-1", detail: "Bash(ls)" });
    expect(entries[0]?.ts).toBeTruthy();
  });

  test("readAudit tails to the limit", async () => {
    for (let i = 0; i < 30; i += 1) await appendAudit(cwd, { kind: "tool", detail: `t${i}` });
    const entries = readAudit(cwd, 5);
    expect(entries).toHaveLength(5);
    expect(entries[4]?.detail).toBe("t29");
  });

  test("truncates very long detail", async () => {
    await appendAudit(cwd, { kind: "message", detail: "x".repeat(500) });
    expect(readAudit(cwd)[0]?.detail?.endsWith("…")).toBe(true);
  });

  test("tolerates malformed lines", () => {
    mkdirSync(join(cwd, ".crew"), { recursive: true });
    writeFileSync(auditPath(cwd), 'not json\n{"ts":"t","kind":"ok"}\n');
    expect(readAudit(cwd).map((e) => e.kind)).toEqual(["ok"]);
  });

  test("no file → empty", () => {
    expect(readAudit(cwd)).toEqual([]);
  });
});
