import { describe, expect, test } from "bun:test";
import { createPermissionHandler } from "./permissions.ts";

const ctx = () => ({ signal: new AbortController().signal, toolUseID: "t1" });

describe("createPermissionHandler", () => {
  test("allows allowlisted tools without asking", async () => {
    let asked = false;
    const canUse = createPermissionHandler({
      allowedTools: ["Read"],
      requestApproval: async () => {
        asked = true;
        return false;
      },
    });

    const result = await canUse("Read", { file_path: "/x" }, ctx());

    expect(result.behavior).toBe("allow");
    expect(asked).toBe(false);
  });

  test("allows a non-allowlisted tool when the user approves", async () => {
    const canUse = createPermissionHandler({
      allowedTools: ["Read"],
      requestApproval: async () => true,
    });

    const result = await canUse("Bash", { command: "ls" }, ctx());

    expect(result.behavior).toBe("allow");
  });

  test("denies a non-allowlisted tool when the user rejects", async () => {
    const canUse = createPermissionHandler({
      allowedTools: [],
      requestApproval: async () => false,
    });

    const result = await canUse("Write", { file_path: "/x" }, ctx());

    expect(result.behavior).toBe("deny");
    if (result.behavior === "deny") expect(result.message).toContain("Write");
  });

  test("denies on timeout", async () => {
    const canUse = createPermissionHandler({
      allowedTools: [],
      requestApproval: () => new Promise<boolean>(() => {}), // never resolves
      timeoutMs: 10,
    });

    const result = await canUse("Bash", {}, ctx());

    expect(result.behavior).toBe("deny");
  });

  test("denies when the signal aborts before a decision", async () => {
    const controller = new AbortController();
    const canUse = createPermissionHandler({
      allowedTools: [],
      requestApproval: () => new Promise<boolean>(() => {}),
      timeoutMs: 10_000,
    });

    const pending = canUse("Bash", {}, { signal: controller.signal, toolUseID: "t1" });
    controller.abort();
    const result = await pending;

    expect(result.behavior).toBe("deny");
  });

  test("AskUserQuestion: the answer is fed back as a deny message (interrupt:false)", async () => {
    const canUse = createPermissionHandler({
      allowedTools: [],
      requestApproval: async () => false,
      requestQuestion: async () => "Postgres",
    });
    const result = await canUse("AskUserQuestion", { questions: [] }, ctx());
    expect(result.behavior).toBe("deny");
    if (result.behavior === "deny") {
      expect(result.message).toContain("Postgres");
      expect(result.interrupt).toBe(false);
    }
  });

  test("AskUserQuestion: a dismissal is a benign deny", async () => {
    const canUse = createPermissionHandler({
      allowedTools: [],
      requestApproval: async () => false,
      requestQuestion: async () => null,
    });
    const result = await canUse("AskUserQuestion", {}, ctx());
    expect(result.behavior).toBe("deny");
    if (result.behavior === "deny") expect(result.interrupt).toBe(false);
  });

  test("ExitPlanMode: approval allows (exits plan mode)", async () => {
    const canUse = createPermissionHandler({
      allowedTools: [],
      requestApproval: async () => false,
      requestPlanApproval: async () => true,
    });
    const result = await canUse("ExitPlanMode", { plan: "do X" }, ctx());
    expect(result.behavior).toBe("allow");
  });

  test("ExitPlanMode: rejection denies with guidance (interrupt:false)", async () => {
    const canUse = createPermissionHandler({
      allowedTools: [],
      requestApproval: async () => true,
      requestPlanApproval: async () => false,
    });
    const result = await canUse("ExitPlanMode", { plan: "do X" }, ctx());
    expect(result.behavior).toBe("deny");
    if (result.behavior === "deny") expect(result.interrupt).toBe(false);
  });

  test("without special handlers, these tools fall back to the y/n flow", async () => {
    const canUse = createPermissionHandler({ allowedTools: [], requestApproval: async () => true });
    const result = await canUse("AskUserQuestion", {}, ctx());
    expect(result.behavior).toBe("allow"); // generic approval path
  });
});
