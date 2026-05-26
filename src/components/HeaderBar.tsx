import { Badge } from "@inkjs/ui";
import { Box, Text } from "ink";
import { aggregateTotals, formatCost, formatTokens } from "../lib/headerStats.ts";
import { useStore } from "../state/store.ts";
import { ACCENT, safetyColor, safetyLabel } from "./theme.ts";

/** Persistent top bar: title + subscription badge + safety mode + global totals. */
export function HeaderBar() {
  const agents = useStore((s) => s.agents);
  const stats = useStore((s) => s.stats);
  const account = useStore((s) => s.account);
  const viewMode = useStore((s) => s.viewMode);
  const safetyMode = useStore((s) => s.safetyMode);
  const modelOverride = useStore((s) => s.modelOverride);
  const branch = useStore((s) => s.checkpointBranch);
  const checkpointCount = useStore((s) => s.checkpoints.length);
  const budget = useStore((s) => s.perTurnBudgetUsd);
  const sessionBudget = useStore((s) => s.sessionBudgetUsd);
  const worktreesOn = useStore((s) => s.worktreesOn);

  const totals = aggregateTotals(stats);

  return (
    <Box justifyContent="space-between" marginBottom={1}>
      <Box>
        <Text color={ACCENT} bold>
          crew
        </Text>
        {account?.subscriptionType && (
          <Box marginLeft={1}>
            <Badge color="green">{account.subscriptionType}</Badge>
          </Box>
        )}
        <Text dimColor> · {viewMode} · </Text>
        <Text color={safetyColor(safetyMode)} bold={safetyMode === "bypassPermissions"}>
          {safetyLabel(safetyMode)}
        </Text>
        {modelOverride && <Text dimColor> · ◆ {modelOverride}</Text>}
        {budget !== null && <Text dimColor> · ${budget.toFixed(2)}/turn</Text>}
        {sessionBudget !== null && <Text dimColor> · ${sessionBudget.toFixed(2)} cap</Text>}
        {worktreesOn && <Text dimColor> · ⑃ wt</Text>}
      </Box>
      <Box>
        {branch && (
          <Text dimColor>
            ⎇ {branch} · {checkpointCount} ckpt
            {agents.length > 0 ? " · " : ""}
          </Text>
        )}
        {agents.length > 0 && (
          <Text dimColor>
            {agents.length} agent{agents.length === 1 ? "" : "s"} · {formatCost(totals.cost)} ·{" "}
            {formatTokens(totals.tokens)} tok
          </Text>
        )}
      </Box>
    </Box>
  );
}
