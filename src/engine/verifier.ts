import type { Gate } from "../lib/projectGates.ts";
import type { GateResult } from "../lib/verifyDecision.ts";

const MAX_CAPTURE = 3000;
/** Backstop so a hung gate (watch mode, stdin prompt) can't block forever. */
const GATE_TIMEOUT_MS = 120_000;

/** Runs a shell command in `cwd`, returning exit code + captured output. */
export type SpawnFn = (
  command: string,
  cwd: string,
  signal: AbortSignal,
) => Promise<{ exitCode: number; output: string }>;

/** Runs one gate via the (injectable) spawner and maps it to a {@link GateResult}. */
export async function runGate(
  gate: Gate,
  cwd: string,
  signal: AbortSignal,
  spawn: SpawnFn = bunSpawn,
): Promise<GateResult> {
  try {
    const { exitCode, output } = await spawn(gate.command, cwd, signal);
    return { name: gate.name, passed: exitCode === 0, exitCode, output: truncate(output) };
  } catch (error) {
    return {
      name: gate.name,
      passed: false,
      exitCode: -1,
      output: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Default spawner: runs the command through the shell via Bun, merging stdout+stderr. */
const bunSpawn: SpawnFn = async (command, cwd, signal) => {
  const proc = Bun.spawn(["sh", "-c", command], {
    cwd,
    signal,
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => proc.kill(), GATE_TIMEOUT_MS);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { exitCode, output: `${stdout}${stderr}` };
  } finally {
    clearTimeout(timer);
  }
};

function truncate(output: string): string {
  return output.length > MAX_CAPTURE ? output.slice(-MAX_CAPTURE) : output;
}
