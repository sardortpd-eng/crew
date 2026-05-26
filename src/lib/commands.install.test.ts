import { describe, expect, test } from "bun:test";
import { parseCommand } from "./commands.ts";

describe("/install + /uninstall parsing", () => {
  test("/install <repo> carries the full arg (incl. flags) for the handler to parse", () => {
    const cmd = parseCommand("/install owner/repo --global");
    expect(cmd.kind).toBe("install");
    if (cmd.kind === "install" && cmd.op.type === "add") {
      expect(cmd.op.arg).toBe("owner/repo --global");
    } else {
      throw new Error("expected install/add");
    }
  });

  test("/install update [name] parses (name optional)", () => {
    const all = parseCommand("/install update");
    if (all.kind === "install" && all.op.type === "update") expect(all.op.name).toBeUndefined();
    else throw new Error("expected install/update");
    const one = parseCommand("/install update greeter-pack");
    if (one.kind === "install" && one.op.type === "update")
      expect(one.op.name).toBe("greeter-pack");
    else throw new Error("expected install/update name");
  });

  test("/install list and /install ls are the list op", () => {
    for (const raw of ["/install list", "/install ls"]) {
      const cmd = parseCommand(raw);
      expect(cmd.kind).toBe("install");
      if (cmd.kind === "install") expect(cmd.op.type).toBe("list");
    }
  });

  test("/install with no args is an error", () => {
    expect(parseCommand("/install").kind).toBe("error");
  });

  test("/uninstall <name> parses", () => {
    const cmd = parseCommand("/uninstall greeter-pack");
    expect(cmd.kind).toBe("uninstall");
    if (cmd.kind === "uninstall") expect(cmd.name).toBe("greeter-pack");
  });

  test("/uninstall with no name is an error", () => {
    expect(parseCommand("/uninstall").kind).toBe("error");
  });
});
