/**
 * Pure parsing of the SDK `AskUserQuestion` tool input into a prompt + option
 * labels crew can render. The tool input is `{ questions: [{ question, header,
 * options: [{label, description}], multiSelect }] }`. v1 renders all questions'
 * text and offers the FIRST question's options as numbered quick-picks (the user
 * can always type a free-form answer instead).
 */

type RawOption = { label?: unknown; description?: unknown };
type RawQuestion = { question?: unknown; header?: unknown; options?: unknown };

export type FormattedQuestion = {
  readonly prompt: string;
  readonly options: readonly string[];
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Builds a renderable `{ prompt, options }` from an AskUserQuestion input. */
export function formatQuestion(input: Record<string, unknown>): FormattedQuestion {
  const questions = Array.isArray(input.questions) ? (input.questions as RawQuestion[]) : [];
  if (questions.length === 0) {
    return { prompt: "The agent asked a question.", options: [] };
  }

  const numbered = questions.length > 1;
  const prompt = questions
    .map((q, i) => {
      const header = str(q.header) ? `[${str(q.header)}] ` : "";
      const text = str(q.question);
      return `${numbered ? `${i + 1}. ` : ""}${header}${text}`.trim();
    })
    .filter((line) => line.length > 0)
    .join("\n");

  const firstOptions = Array.isArray(questions[0]?.options)
    ? (questions[0]?.options as RawOption[])
    : [];
  const options = firstOptions.map((o) => str(o.label)).filter((label) => label.length > 0);

  return { prompt: prompt || "The agent asked a question.", options };
}
