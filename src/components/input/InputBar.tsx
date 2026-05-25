import { TextInput } from "@inkjs/ui";
import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { useStore } from "../../state/store.ts";
import { ACCENT } from "../theme.ts";

/**
 * Prompt input plus the inline tool-approval prompt when one is pending.
 * When `active` is false (grid nav mode) the field is disabled so digits/arrows
 * reach pane navigation instead of being typed.
 */
export function InputBar({
  onSubmit,
  active = true,
}: {
  onSubmit: (raw: string) => void;
  active?: boolean;
}) {
  const [resetKey, setResetKey] = useState(0);
  const pending = useStore((s) => s.permissionRequests[0]);
  const resolvePermission = useStore((s) => s.resolvePermission);

  useInput(
    (input) => {
      if (!pending) return;
      const key = input.toLowerCase();
      if (key === "y") resolvePermission(pending.id, true);
      else if (key === "n") resolvePermission(pending.id, false);
    },
    { isActive: Boolean(pending) },
  );

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
    <Box borderStyle="round" borderColor={ACCENT} paddingX={1}>
      <Text color={ACCENT}>{"> "}</Text>
      <TextInput
        key={resetKey}
        placeholder="Ask, or /spawn  /broadcast  /focus  /view  /help"
        onSubmit={(value) => {
          onSubmit(value);
          setResetKey((k) => k + 1);
        }}
      />
    </Box>
  );
}

function summarizeInput(input: Record<string, unknown>): string {
  const json = JSON.stringify(input);
  return json.length > 120 ? `${json.slice(0, 120)}…` : json;
}
