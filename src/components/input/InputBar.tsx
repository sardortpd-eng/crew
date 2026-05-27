import { TextInput } from "@inkjs/ui";
import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
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
  onEscape,
  active = true,
}: {
  onSubmit: (raw: string) => void;
  /** Called when Esc is pressed on an already-empty line (e.g. to interrupt). */
  onEscape?: () => void;
  active?: boolean;
}) {
  const [resetKey, setResetKey] = useState(0);
  const [value, setValue] = useState("");
  const [seed, setSeed] = useState("");
  const [selected, setSelected] = useState(0);
  const pending = useStore((s) => s.permissionRequests[0]);
  const resolvePermission = useStore((s) => s.resolvePermission);
  const pendingConfirm = useStore((s) => s.confirmations[0]);
  const resolveConfirmation = useStore((s) => s.resolveConfirmation);
  // A pending prompt (permission or confirmation) takes over the input.
  const prompting = Boolean(pending || pendingConfirm);

  const suggestion = active && !prompting ? suggestCommands(value) : { mode: "none" as const };
  const menuOpen = suggestion.mode === "list";
  const matches = suggestion.mode === "list" ? suggestion.matches : [];
  const query = suggestion.mode === "list" ? suggestion.query : null;
  // Keep the highlight in range; navigating never changes `query`, so it sticks.
  const selectedIndex = matches.length > 0 ? Math.min(selected, matches.length - 1) : 0;

  // Reset the highlight to the top only when the filter text actually changes.
  // Navigating with ↑/↓ leaves `query` untouched, so the selection sticks.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — reset on query only
  useEffect(() => {
    setSelected(0);
  }, [query]);

  // y/n for whichever prompt is up. A permission takes priority over a
  // confirmation; Esc declines a confirmation (permissions stay y/n-only).
  useInput(
    (input, key) => {
      const yes = input.toLowerCase() === "y";
      const no = input.toLowerCase() === "n";
      if (pending) {
        if (yes) resolvePermission(pending.id, true);
        else if (no) resolvePermission(pending.id, false);
      } else if (pendingConfirm) {
        if (yes) resolveConfirmation(pendingConfirm.id, true);
        else if (no || key.escape) resolveConfirmation(pendingConfirm.id, false);
      }
    },
    { isActive: prompting },
  );

  // Esc clears the whole line (and closes the menu) in one press; on an empty
  // line it defers to the caller (interrupt / leave typing mode). Menu nav uses
  // up/down/tab, which TextInput ignores — so there's no conflict.
  useInput(
    (_input, key) => {
      if (key.escape) {
        if (value.length > 0) replaceValue("");
        else onEscape?.();
        return;
      }
      if (!menuOpen || matches.length === 0) return;
      if (key.downArrow) setSelected((i) => Math.min(matches.length - 1, i + 1));
      else if (key.upArrow) setSelected((i) => Math.max(0, i - 1));
      else if (key.tab) {
        const spec = matches[selectedIndex];
        if (spec) replaceValue(completeWith(spec));
      }
    },
    { isActive: active && !prompting },
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
  }

  function handleSubmit(submitted: string): void {
    // Enter on an incomplete command name (e.g. "/mod") completes the highlighted
    // match instead of running an unknown command. A fully-typed command runs.
    const partial = /^\/(\S*)$/.exec(submitted.trim());
    if (partial && !findCommand((partial[1] ?? "").toLowerCase())) {
      const spec = matches[selectedIndex];
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

  if (pendingConfirm) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={ACCENT} paddingX={1}>
        <Text color={ACCENT} bold>
          {pendingConfirm.title}
        </Text>
        {pendingConfirm.detail && <Text dimColor>{pendingConfirm.detail}</Text>}
        <Text>
          <Text color="green">y</Text>
          <Text dimColor> yes </Text>
          <Text color="red">n</Text>
          <Text dimColor> no · Esc skip</Text>
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
      {menuOpen && <CommandMenu matches={matches} selected={selectedIndex} />}
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
