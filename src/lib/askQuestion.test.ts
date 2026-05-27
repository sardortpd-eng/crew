import { describe, expect, test } from "bun:test";
import { formatQuestion } from "./askQuestion.ts";

describe("formatQuestion", () => {
  test("a single question yields its text + option labels", () => {
    const out = formatQuestion({
      questions: [
        {
          question: "Which database?",
          header: "DB",
          options: [
            { label: "Postgres", description: "relational" },
            { label: "SQLite", description: "embedded" },
          ],
          multiSelect: false,
        },
      ],
    });
    expect(out.prompt).toContain("Which database?");
    expect(out.prompt).toContain("[DB]");
    expect(out.options).toEqual(["Postgres", "SQLite"]);
  });

  test("multiple questions are numbered; first question's options are offered", () => {
    const out = formatQuestion({
      questions: [
        { question: "Pick a runtime", options: [{ label: "Bun" }, { label: "Node" }] },
        { question: "Pick a framework", options: [{ label: "Next" }] },
      ],
    });
    expect(out.prompt).toContain("1. Pick a runtime");
    expect(out.prompt).toContain("2. Pick a framework");
    expect(out.options).toEqual(["Bun", "Node"]); // first question's options
  });

  test("no options → empty list (user types a free-form answer)", () => {
    const out = formatQuestion({ questions: [{ question: "Describe the bug" }] });
    expect(out.prompt).toContain("Describe the bug");
    expect(out.options).toEqual([]);
  });

  test("malformed input falls back gracefully", () => {
    expect(formatQuestion({}).options).toEqual([]);
    expect(formatQuestion({ questions: "nope" as unknown }).prompt.length).toBeGreaterThan(0);
  });
});
