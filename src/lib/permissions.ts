import type { CanUseTool, PermissionResult } from "@anthropic-ai/claude-agent-sdk";

const DEFAULT_TIMEOUT_MS = 60_000;

export type ApprovalRequest = {
  readonly toolName: string;
  readonly input: Record<string, unknown>;
};

/**
 * Asks the UI to approve a tool call. Resolves true to allow, false to deny.
 */
export type RequestApproval = (request: ApprovalRequest) => Promise<boolean>;

/** Presents an agent's `AskUserQuestion` and returns the answer (null = dismissed). */
export type RequestQuestion = (input: Record<string, unknown>) => Promise<string | null>;

/** Presents an `ExitPlanMode` plan for approval (true = exit plan mode & proceed). */
export type RequestPlanApproval = (input: Record<string, unknown>) => Promise<boolean>;

export type PermissionHandlerConfig = {
  /** Tools that never need approval (the preset allowlist). */
  readonly allowedTools: readonly string[];
  readonly requestApproval: RequestApproval;
  /** Handles the `AskUserQuestion` tool (shown as a real question, not allow/deny). */
  readonly requestQuestion?: RequestQuestion;
  /** Handles the `ExitPlanMode` tool (shown as a plan to approve). */
  readonly requestPlanApproval?: RequestPlanApproval;
  /** Auto-deny after this long with no decision. Defaults to 60s. */
  readonly timeoutMs?: number;
};

const ASK_QUESTION_TOOL = "AskUserQuestion";
const EXIT_PLAN_TOOL = "ExitPlanMode";

/**
 * Builds a `canUseTool` callback. Allowlisted tools pass immediately; anything
 * else is routed to the UI for an inline allow/deny. Denies on timeout so a
 * forgotten prompt never blocks an agent forever.
 */
export function createPermissionHandler(config: PermissionHandlerConfig): CanUseTool {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const allowed = new Set(config.allowedTools);

  return async (toolName, input, { signal }): Promise<PermissionResult> => {
    // Interactive tools get a real prompt, not a generic allow/deny. The answer
    // is fed back as a deny message (interrupt:false) the agent reads and
    // continues from — reliable without depending on headless tool execution.
    if (toolName === ASK_QUESTION_TOOL && config.requestQuestion) {
      const answer = await config.requestQuestion(input);
      return answer === null
        ? { behavior: "deny", message: "User dismissed the question.", interrupt: false }
        : { behavior: "deny", message: `The user answered: ${answer}`, interrupt: false };
    }
    if (toolName === EXIT_PLAN_TOOL && config.requestPlanApproval) {
      const ok = await config.requestPlanApproval(input);
      return ok
        ? { behavior: "allow", updatedInput: input }
        : {
            behavior: "deny",
            message: "Plan not approved — keep refining or ask a clarifying question.",
            interrupt: false,
          };
    }

    if (allowed.has(toolName)) {
      return { behavior: "allow", updatedInput: input };
    }

    const approved = await withTimeout(
      config.requestApproval({ toolName, input }),
      timeoutMs,
      signal,
    );

    return approved
      ? { behavior: "allow", updatedInput: input }
      : { behavior: "deny", message: `User denied use of ${toolName}.` };
  };
}

/** Resolves false if the promise doesn't settle within `ms`, or if aborted. */
function withTimeout(promise: Promise<boolean>, ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    };

    const timer = setTimeout(() => finish(false), ms);
    const onAbort = () => finish(false);
    signal.addEventListener("abort", onAbort);

    promise.then((v) => finish(v)).catch(() => finish(false));
  });
}
