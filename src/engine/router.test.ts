import { describe, expect, test } from "bun:test";
import type { Query } from "@anthropic-ai/claude-agent-sdk";
import { listPresets } from "./presets.ts";
import { parseDecision, pickFromText, routePrompt } from "./router.ts";
import type { Options, SDKMessage } from "./types.ts";

const PRESETS = listPresets();

/** A fake queryFn yielding a success result with the given structured output. */
function fakeQuery(
  structuredOutput: unknown,
  spy?: (params: { prompt: string; options?: Options }) => void,
) {
  return (params: { prompt: string; options?: Options }): Query => {
    spy?.(params);
    async function* gen(): AsyncGenerator<SDKMessage, void> {
      yield {
        type: "result",
        subtype: "success",
        result: typeof structuredOutput === "string" ? structuredOutput : "",
        structured_output: structuredOutput,
        session_id: "s",
        uuid: "u",
      } as unknown as SDKMessage;
    }
    return gen() as unknown as Query;
  };
}

describe("routePrompt", () => {
  test("uses the heuristic and skips the LLM for an obvious prompt", async () => {
    let called = false;
    const result = await routePrompt("review the auth module", PRESETS, {
      queryFn: fakeQuery({ preset: "coder", reason: "x" }, () => {
        called = true;
      }),
    });
    expect(result.method).toBe("heuristic");
    expect(result.preset).toBe("reviewer");
    expect(called).toBe(false);
  });

  test("falls back to the LLM for an ambiguous prompt", async () => {
    const result = await routePrompt("review the test", PRESETS, {
      queryFn: fakeQuery({ preset: "tester", reason: "it's about tests" }),
    });
    expect(result.method).toBe("llm");
    expect(result.preset).toBe("tester");
    expect(result.reason).toBe("it's about tests");
  });

  test("falls back to coder when the LLM returns an unknown preset", async () => {
    const result = await routePrompt("ponder the ineffable", PRESETS, {
      queryFn: fakeQuery({ preset: "wizard", reason: "magic" }),
    });
    expect(result.method).toBe("fallback");
    expect(result.preset).toBe("coder");
  });

  test("falls back to coder when the query throws", async () => {
    const result = await routePrompt("ponder the ineffable", PRESETS, {
      queryFn: () => {
        throw new Error("transport down");
      },
    });
    expect(result.method).toBe("fallback");
    expect(result.preset).toBe("coder");
  });

  test("recovers the preset from result text when structured output is absent", async () => {
    const result = await routePrompt("ponder the ineffable", PRESETS, {
      queryFn: fakeQuery("I think the planner preset fits best."),
    });
    expect(result.method).toBe("llm");
    expect(result.preset).toBe("planner");
  });

  test("aborts the underlying query on timeout and falls back", async () => {
    let aborted = false;
    const queryFn = (params: { prompt: string; options?: Options }): Query => {
      params.options?.abortController?.signal.addEventListener("abort", () => {
        aborted = true;
      });
      async function* gen(): AsyncGenerator<SDKMessage, void> {
        await new Promise((r) => setTimeout(r, 1000)); // never resolves before timeout
      }
      return gen() as unknown as Query;
    };

    const result = await routePrompt("ponder the ineffable", PRESETS, { queryFn, timeoutMs: 10 });

    expect(result.method).toBe("fallback");
    expect(result.preset).toBe("coder");
    await new Promise((r) => setTimeout(r, 0));
    expect(aborted).toBe(true);
  });

  test("falls back when the query yields no result message", async () => {
    const queryFn = (): Query => {
      async function* gen(): AsyncGenerator<SDKMessage, void> {
        /* yields nothing */
      }
      return gen() as unknown as Query;
    };
    const result = await routePrompt("ponder the ineffable", PRESETS, { queryFn });
    expect(result.method).toBe("fallback");
    expect(result.preset).toBe("coder");
  });
});

describe("parse helpers", () => {
  test("parseDecision prefers valid structured output", () => {
    const d = parseDecision({ structuredOutput: { preset: "docs", reason: "r" }, text: "" }, [
      "docs",
      "coder",
    ]);
    expect(d).toEqual({ preset: "docs", reason: "r" });
  });

  test("pickFromText finds the first known name", () => {
    expect(pickFromText("use the reviewer or coder", ["coder", "reviewer"])).toBe("coder");
    expect(pickFromText("nothing here", ["coder"])).toBeNull();
  });
});
