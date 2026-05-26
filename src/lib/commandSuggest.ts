/**
 * Pure autocomplete logic for the input bar. Given the current line, decide
 * whether to show a filtered command menu (while typing the name), an argument
 * hint (once a command is chosen), or nothing.
 */
import { type CommandSpec, COMMAND_CATALOG, findCommand } from "./commandCatalog.ts";

export type SuggestResult =
  | { readonly mode: "list"; readonly matches: readonly CommandSpec[]; readonly query: string }
  | { readonly mode: "hint"; readonly spec: CommandSpec }
  | { readonly mode: "none" };

const TYPING_NAME = /^\/(\S*)$/; // "/", "/mo", "/model" — no space yet
const NAME_THEN_ARGS = /^\/(\S+)\s/; // "/mode " — command chosen, now in args

/** Interprets the current input line into a suggestion to render. */
export function suggestCommands(value: string): SuggestResult {
  const typing = TYPING_NAME.exec(value);
  if (typing) {
    const query = (typing[1] ?? "").toLowerCase();
    return { mode: "list", matches: rank(query), query };
  }

  const withArgs = NAME_THEN_ARGS.exec(value);
  if (withArgs) {
    const spec = findCommand((withArgs[1] ?? "").toLowerCase());
    return spec ? { mode: "hint", spec } : { mode: "none" };
  }

  return { mode: "none" };
}

/** The text that replaces the line when a command is accepted. */
export function completeWith(spec: CommandSpec): string {
  return `/${spec.name} `;
}

/**
 * Ranks commands for a query: exact-prefix matches (on name or alias) first,
 * then substring matches, each tier preserving catalog order. Empty query
 * returns the whole catalog.
 */
function rank(query: string): CommandSpec[] {
  if (query === "") return [...COMMAND_CATALOG];

  const prefix: CommandSpec[] = [];
  const substring: CommandSpec[] = [];
  for (const spec of COMMAND_CATALOG) {
    const tokens = [spec.name, ...(spec.aliases ?? [])];
    if (tokens.some((t) => t.startsWith(query))) prefix.push(spec);
    else if (tokens.some((t) => t.includes(query))) substring.push(spec);
  }
  return [...prefix, ...substring];
}
