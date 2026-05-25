#!/usr/bin/env bun
import { render } from "ink";
import { App } from "./components/App.tsx";
import { LEAVE_ALT_SCREEN } from "./hooks/useAltScreen.ts";

/**
 * crew — a TUI for orchestrating multiple Claude agents on your subscription.
 *
 * Auth: the Agent SDK spawns the logged-in `claude` binary, which carries your
 * subscription OAuth. As long as ANTHROPIC_API_KEY is absent, billing stays on
 * the plan. The orchestrator strips the key per-query defensively; we also warn
 * here so the situation is visible.
 */
async function main(): Promise<void> {
  if (process.env.ANTHROPIC_API_KEY) {
    process.stderr.write(
      "⚠ ANTHROPIC_API_KEY is set. crew strips it per-query so runs bill to your " +
        "Claude subscription, not metered API credits.\n",
    );
  }

  // Crash safety: a React crash can't run the alt-screen restore effect, so
  // guarantee the normal screen is restored on any fatal exit.
  installAltScreenSafetyNet();

  const { waitUntilExit } = render(<App cwd={process.cwd()} />);
  try {
    await waitUntilExit();
  } finally {
    process.stdout.write(LEAVE_ALT_SCREEN);
  }
}

function installAltScreenSafetyNet(): void {
  const restore = () => process.stdout.write(LEAVE_ALT_SCREEN);
  process.once("uncaughtException", (error) => {
    restore();
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exit(1);
  });
  process.once("unhandledRejection", (reason) => {
    restore();
    process.stderr.write(`${String(reason)}\n`);
    process.exit(1);
  });
}

void main();
