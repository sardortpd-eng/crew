/**
 * Returns `process.env` with `ANTHROPIC_API_KEY` stripped, so every query runs
 * on the subscription OAuth (the CLI's logged-in account) and can never fall
 * back to metered API billing.
 */
export function subscriptionEnv(): Record<string, string | undefined> {
  const { ANTHROPIC_API_KEY: _omit, ...rest } = process.env;
  return rest;
}
