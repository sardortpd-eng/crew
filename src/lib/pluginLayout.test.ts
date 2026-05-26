import { describe, expect, test } from "bun:test";
import { type PluginProbe, makeManifest, summarizePlugin } from "./pluginLayout.ts";

const empty: PluginProbe = {
  hasManifest: false,
  commands: 0,
  agents: 0,
  skills: 0,
  hasMcp: false,
  hasHooks: false,
};

describe("summarizePlugin", () => {
  test("a dir with no installable content is empty", () => {
    const s = summarizePlugin(empty);
    expect(s.isEmpty).toBe(true);
    expect(s.components).toEqual([]);
    expect(s.needsManifest).toBe(false);
  });

  test("content without a manifest needs one synthesized", () => {
    const s = summarizePlugin({ ...empty, skills: 1 });
    expect(s.isEmpty).toBe(false);
    expect(s.needsManifest).toBe(true);
    expect(s.components).toContain("1 skill");
  });

  test("a manifest alone is a valid (non-empty) plugin and needs no synthesis", () => {
    const s = summarizePlugin({ ...empty, hasManifest: true });
    expect(s.isEmpty).toBe(false);
    expect(s.needsManifest).toBe(false);
  });

  test("components pluralize and cover every kind", () => {
    const s = summarizePlugin({
      hasManifest: true,
      commands: 3,
      agents: 1,
      skills: 2,
      hasMcp: true,
      hasHooks: true,
    });
    expect(s.components).toEqual(["3 commands", "1 agent", "2 skills", "MCP servers", "hooks"]);
    expect(s.needsManifest).toBe(false);
  });
});

describe("makeManifest", () => {
  test("produces parseable JSON with the given name and a version", () => {
    const parsed = JSON.parse(makeManifest("my-plugin"));
    expect(parsed.name).toBe("my-plugin");
    expect(typeof parsed.version).toBe("string");
  });
});
