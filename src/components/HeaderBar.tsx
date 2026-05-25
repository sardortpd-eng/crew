import { Badge } from "@inkjs/ui";
import { Box, Text } from "ink";
import { aggregateTotals, formatCost, formatTokens } from "../lib/headerStats.ts";
import { useStore } from "../state/store.ts";
import { ACCENT } from "./theme.ts";

/** Persistent top bar: title + subscription badge + global agent/cost/token totals. */
export function HeaderBar() {
  const agents = useStore((s) => s.agents);
  const stats = useStore((s) => s.stats);
  const account = useStore((s) => s.account);
  const viewMode = useStore((s) => s.viewMode);

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
        <Text dimColor> · {viewMode}</Text>
      </Box>
      {agents.length > 0 && (
        <Text dimColor>
          {agents.length} agent{agents.length === 1 ? "" : "s"} · {formatCost(totals.cost)} ·{" "}
          {formatTokens(totals.tokens)} tok
        </Text>
      )}
    </Box>
  );
}
