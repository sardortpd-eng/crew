import { TextInput } from "@inkjs/ui";
import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { commandUsage, findCommand } from "../../lib/commandCatalog.ts";
import { completeWith, suggestCommands } from "../../lib/commandSuggest.ts";
import { deleteLastWord } from "../../lib/textFormat.ts";
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
  const pendingQuestion = useStore((s) => s.questionRequests[0]);
  const resolveQuestion = useStore((s) => s.resolveQuestion);
  // A permission/confirmation takes over the input entirely (y/n only). A
  // question keeps the field live so the user can also type a custom answer.
  const hardPrompt = Boolean(pending || pendingConfirm);
  const questionMode = Boolean(pendingQuestion) && !hardPrompt;
  const showInput = (active || questionMode) && !hardPrompt;

  const suggestion =
    active && !hardPrompt && !questionMode ? suggestCommands(value) : { mode: "none" as const };
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
    { isActive: hardPrompt },
  );

  // Answering an AskUserQuestion: a digit picks an option (when the line is
  // empty), Esc dismisses; typing + Enter sends a custom answer (handleSubmit).
  useInput(
    (input, key) => {
      if (!pendingQuestion) return;
      if (key.escape) {
        resolveQuestion(pendingQuestion.id, null);
        replaceValue("");
        return;
      }
      if (value.length === 0 && /^[1-9]$/.test(input)) {
        const option = pendingQuestion.options[Number(input) - 1];
        if (option) {
          resolveQuestion(pendingQuestion.id, option);
          replaceValue("");
        }
      }
    },
    { isActive: questionMode },
  );

  // Esc clears the line / scroll keys / menu nav. Scroll (PgUp/PgDn, Shift+↑/↓)
  // works in focus view too. Up/down/tab are TextInput-ignored, so no conflict.
  useInput(
    (_input, key) => {
      if (key.escape) {
        if (value.length > 0) replaceValue("");
        else onEscape?.();
        return;
      }
      // Ctrl/Option+Backspace deletes the last word (TextInput only does 1 char).
      if (key.backspace && (key.ctrl || key.meta) && value.length > 0) {
        replaceValue(deleteLastWord(value));
        return;
      }
      // Scroll the focused transcript (works while typing; TextInput ignores these).
      const { focusedAgentId, scrollPane } = useStore.getState();
      if (focusedAgentId) {
        if (key.pageUp) return scrollPane(focusedAgentId, SCROLL_PAGE);
        if (key.pageDown) return scrollPane(focusedAgentId, -SCROLL_PAGE);
        if (key.shift && key.upArrow) return scrollPane(focusedAgentId, 1);
        if (key.shift && key.downArrow) return scrollPane(focusedAgentId, -1);
      }
      if (!menuOpen || matches.length === 0) return;
      if (key.downArrow) setSelected((i) => Math.min(matches.length - 1, i + 1));
      else if (key.upArrow) setSelected((i) => Math.max(0, i - 1));
      else if (key.tab) {
        const spec = matches[selectedIndex];
        if (spec) replaceValue(completeWith(spec));
      }
    },
    { isActive: active && !hardPrompt && !questionMode },
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
    // While answering a question, Enter sends a typed custom answer.
    if (questionMode && pendingQuestion) {
      const answer = submitted.trim();
      if (answer.length > 0) resolveQuestion(pendingQuestion.id, answer);
      replaceValue("");
      return;
    }
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

  if (!showInput) {
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
      {questionMode && pendingQuestion && (
        <Box flexDirection="column" borderStyle="round" borderColor={ACCENT} paddingX={1}>
          <Text color={ACCENT} bold>
            {pendingQuestion.agentId} asks
          </Text>
          {pendingQuestion.prompt.split("\n").map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
          {pendingQuestion.options.map((opt, i) => (
            <Text key={opt}>
              <Text color={ACCENT}>{`  ${i + 1}`}</Text>
              <Text> {opt}</Text>
            </Text>
          ))}
          <Text dimColor>
            {pendingQuestion.options.length > 0 ? "press a number, " : ""}
            type an answer + Enter · Esc skip
          </Text>
        </Box>
      )}
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
          placeholder={
            questionMode ? "Type an answer, or press a number" : "Ask, or type / for commands"
          }
          onChange={handleChange}
          onSubmit={handleSubmit}
        />
      </Box>
    </Box>
  );
}

const SCROLL_PAGE = 8;

function summarizeInput(input: Record<string, unknown>): string {
  const json = JSON.stringify(input);
  return json.length > 120 ? `${json.slice(0, 120)}…` : json;
}
