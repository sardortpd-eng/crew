import { Box, Text } from "ink";
import { useStore, type Task } from "../state/store.ts";
import { ACCENT } from "./theme.ts";

const GLYPH: Record<Task["status"], string> = {
  todo: "☐",
  active: "▶",
  done: "✓",
  failed: "✗",
};

function color(status: Task["status"]): string | undefined {
  if (status === "done") return "green";
  if (status === "failed") return "red";
  if (status === "active") return ACCENT;
  return "gray";
}

/** The `/plan` task board: a checklist with live per-task status. */
export function TaskBoard() {
  const tasks = useStore((s) => s.tasks);
  if (tasks.length === 0) return null;

  const done = tasks.filter((t) => t.status === "done").length;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginTop={1}>
      <Text>
        <Text bold color={ACCENT}>
          tasks
        </Text>
        <Text dimColor>
          {"  "}
          {done}/{tasks.length} done
        </Text>
      </Text>
      {tasks.map((t) => (
        <Box key={t.id}>
          <Text color={color(t.status)}>{GLYPH[t.status]} </Text>
          <Text dimColor wrap="truncate-end">
            [{t.preset}] {t.title}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
