import { TextInput } from "@inkjs/ui";
import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { commandUsage, findCommand } from "../../lib/commandCatalog.ts";
import { completeWith, suggestCommands } from "../../lib/commandSuggest.ts";
import { useStore } from "../../state/store.ts";
import { ACCENT } from "../theme.ts";
import { CommandMenu } from "./CommandMenu.tsx";

/**
 * Prompt input plus the inline tool-approval prompt when one is pending.
 * When `active` is false (grid nav mode) the field is disabled so digits/arrows
 * reach pane navigation instead of being typed.
 *
 * While a slash command is being typed, a live autocomplete menu describes the
 * matching commands; ↑/↓ move the selection and Tab fills it in. `TextInput`
 * ignores those keys, so there's no conflict with text editing.
 */
export function InputBar({
  onSubmit,
  active = true,
}: {
  onSubmit: (raw: string) => void;
  active?: boolean;
}) {
  const [resetKey, setResetKey] = useState(0);
  const [value, setValue] = useState("");
  const [seed, setSeed] = useState("");
  const [selected, setSelected] = useState(0);
  const pending = useStore((s) => s.permissionRequests[0]);
  const resolvePermission = useStore((s) => s.resolvePermission);

  const suggestion = active && !pending ? suggestCommands(value) : { mode: "none" as const };
  const menuOpen = suggestion.mode === "list";
  const matches = suggestion.mode === "list" ? suggestion.matches : [];

  useInput(
    (input) => {
      if (!pending) return;
      const key = input.toLowerCase();
      if (key === "y") resolvePermission(pending.id, true);
      else if (key === "n") resolvePermission(pending.id, false);
    },
    { isActive: Boolean(pending) },
  );

  // Menu navigation. TextInput ignores up/down/tab, so these are ours to use.
  useInput(
    (_input, key) => {
      if (key.downArrow) setSelected((i) => Math.min(matches.length - 1, i + 1));
      else if (key.upArrow) setSelected((i) => Math.max(0, i - 1));
      else if (key.tab) {
        const spec = matches[selected];
        if (spec) replaceValue(completeWith(spec));
      }
    },
    { isActive: menuOpen && matches.length > 0 },
  );

  /** Replaces the field contents by remounting TextInput with a new default. */
  function replaceValue(next: string): void {
    setValue(next);
    setSeed(next);
    setSelected(0);
    setResetKey((k) => k + 1);
  }

  function handleChange(next: string): void {
    setValue(next);
    setSelected(0);
  }

  function handleSubmit(submitted: string): void {
    // Enter on an incomplete command name (e.g. "/mod") completes the highlighted
    // match instead of running an unknown command. A fully-typed command runs.
    const partial = /^\/(\S*)$/.exec(submitted.trim());
    if (partial && !findCommand((partial[1] ?? "").toLowerCase())) {
      const spec = matches[selected];
      if (spec) {
        replaceValue(completeWith(spec));
        return;
      }
    }
    onSubmit(submitted);
    replaceValue("");
  }

  if (pending) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={ACCENT} paddingX={1}>
        <Text>
          <Text color={ACCENT} bold>
            {pending.toolName}
          </Text>
          <Text dimColor> requested by {pending.agentId}</Text>
        </Text>
        <Text dimColor>{summarizeInput(pending.input)}</Text>
        <Text>
          <Text color="green">y</Text>
          <Text dimColor> allow </Text>
          <Text color="red">n</Text>
          <Text dimColor> deny</Text>
        </Text>
      </Box>
    );
  }

  if (!active) {
    return (
      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <Text dimColor>{"> press "}</Text>
        <Text color={ACCENT}>i</Text>
        <Text dimColor> to type · 1–9 switch · Tab/arrows move · PgUp/PgDn scroll</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {menuOpen && <CommandMenu matches={matches} selected={selected} />}
      {suggestion.mode === "hint" && (
        <Box paddingX={1}>
          <Text color={ACCENT}>{commandUsage(suggestion.spec)}</Text>
          <Text dimColor> — {suggestion.spec.summary}</Text>
        </Box>
      )}
      <Box borderStyle="round" borderColor={ACCENT} paddingX={1}>
        <Text color={ACCENT}>{"> "}</Text>
        <TextInput
          key={resetKey}
          defaultValue={seed}
          placeholder="Ask, or type / for commands"
          onChange={handleChange}
          onSubmit={handleSubmit}
        />
      </Box>
    </Box>
  );
}

function summarizeInput(input: Record<string, unknown>): string {
  const json = JSON.stringify(input);
  return json.length > 120 ? `${json.slice(0, 120)}…` : json;
}
