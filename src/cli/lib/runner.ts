import { execa, type ResultPromise } from "execa";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { hostname } from "node:os";
import {
  type Workflow,
  type ResolvedPersona,
  type ExecutionResult,
  type ExecutionContext,
  createExecutionContext,
  processTemplate,
  expandVariables,
  getInputDefaults,
  createSession,
  finalizeSession,
  type Session,
} from "../../lib/index.js";

/**
 * Parse duration string to milliseconds
 * Supports: "30s", "5m", "1h"
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(s|m|h)$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const [, value, unit] = match;
  const num = parseInt(value, 10);

  switch (unit) {
    case "s":
      return num * 1000;
    case "m":
      return num * 60 * 1000;
    case "h":
      return num * 60 * 60 * 1000;
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}

/**
 * Options for running a workflow
 */
export interface RunOptions {
  /** Input values (override defaults) */
  inputs?: Record<string, string | number | boolean>;
  /** Working directory override */
  workingDir?: string;
  /** Environment variable overrides */
  env?: Record<string, string>;
  /** Timeout override */
  timeout?: string;
  /** Dry run - don't actually execute */
  dryRun?: boolean;
  /** Run in interactive mode (persona must support it) */
  interactive?: boolean;
  /** Sessions directory for creating session (optional - if provided, creates session) */
  sessionsDir?: string;
}

/**
 * Build the full prompt for the agent
 */
export function buildPrompt(
  workflow: Workflow,
  persona: ResolvedPersona,
  context: ExecutionContext,
  inputs: Record<string, unknown>
): string {
  const parts: string[] = [];

  // Add persona system prompt if present
  if (persona.prompt) {
    const expandedPrompt = processTemplate(
      persona.prompt,
      { ...context, ...inputs },
      persona.env
    );
    parts.push(expandedPrompt);
    parts.push("\n---\n");
  }

  // Add workflow task
  const expandedTask = processTemplate(
    workflow.task,
    { ...context, ...inputs },
    { ...persona.env, ...workflow.env }
  );
  parts.push(expandedTask);

  return parts.join("\n");
}

/**
 * Run a workflow with a resolved persona
 */
export async function runWorkflow(
  workflow: Workflow,
  persona: ResolvedPersona,
  options: RunOptions = {}
): Promise<ExecutionResult> {
  const startedAt = new Date();
  const interactive = options.interactive ?? false;

  // Determine working directory early (needed for session creation)
  let workingDir = options.workingDir ?? workflow.working_dir ?? process.cwd();

  // Create session if sessionsDir provided
  let session: Session | undefined;
  if (options.sessionsDir) {
    session = await createSession({
      sessionsDir: options.sessionsDir,
      runtime: {
        hostname: hostname(),
        executionMode: interactive ? "interactive" : "headless",
        triggerType: "manual",
        workingDir,
      },
      goal: `Run workflow: ${workflow.name}`,
      persona: {
        name: persona.name,
        inheritanceChain: persona.inheritanceChain,
      },
      workflow: {
        name: workflow.name,
        path: workflow.path,
        inputs: options.inputs,
      },
    });
  }

  const context = createExecutionContext({
    WORKFLOW_NAME: workflow.name,
    WORKFLOW_DIR: workflow.path,
    PERSONA_NAME: persona.name,
    PERSONA_DIR: persona.path,
    // Add session directory if available
    ...(session ? { SESSION_DIR: session.path } : {}),
  });

  // Merge inputs: defaults < workflow inputs < options.inputs
  const inputs: Record<string, unknown> = {
    ...getInputDefaults(workflow),
    ...options.inputs,
  };

  // Merge environment
  const env: Record<string, string> = {
    ...process.env,
    ...persona.env,
    ...workflow.env,
    ...options.env,
  } as Record<string, string>;

  // Expand environment variable values
  for (const [key, value] of Object.entries(env)) {
    if (value) {
      env[key] = expandVariables(value, context as Record<string, string>, env);
    }
  }

  // Expand working directory variables
  workingDir = expandVariables(
    workingDir,
    { ...context, ...(inputs as Record<string, string>) },
    env
  );

  // Build the prompt
  const prompt = buildPrompt(workflow, persona, context, inputs);

  // Determine timeout
  // Interactive mode: no timeout (user controls session)
  // Headless mode: use explicit timeout or default to 10 minutes
  const timeoutMs = interactive
    ? undefined // No timeout for interactive sessions
    : options.timeout
      ? parseDuration(options.timeout)
      : workflow.timeout
        ? parseDuration(workflow.timeout)
        : 10 * 60 * 1000; // Default 10 minutes for headless

  // Dry run - just return the prompt (no session finalization needed)
  if (options.dryRun) {
    const result: ExecutionResult = {
      success: true,
      exitCode: 0,
      stdout: prompt,
      stderr: "",
      duration: 0,
      runId: context.RUN_ID,
      startedAt,
      endedAt: new Date(),
    };
    // Finalize session for dry run
    if (session) {
      await finalizeSession(session, {
        success: result.success,
        exitCode: result.exitCode,
        duration: result.duration,
        stdout: `[Dry run - prompt only]\n${result.stdout}`,
      });
    }
    return result;
  }

  // Select commands based on execution mode (interactive already defined above for timeout)
  const cmds = interactive
    ? persona.commands.interactive
    : persona.commands.headless;

  if (!cmds) {
    const endedAt = new Date();
    const result: ExecutionResult = {
      success: false,
      exitCode: 1,
      stdout: "",
      stderr: `Persona '${persona.name}' does not support ${interactive ? "interactive" : "headless"} mode`,
      duration: endedAt.getTime() - startedAt.getTime(),
      runId: context.RUN_ID,
      startedAt,
      endedAt,
      error: `Unsupported execution mode: ${interactive ? "interactive" : "headless"}`,
    };
    // Finalize session for error
    if (session) {
      await finalizeSession(session, {
        success: result.success,
        exitCode: result.exitCode,
        duration: result.duration,
        error: result.error,
        stderr: result.stderr,
      });
    }
    return result;
  }

  // Try each command in order
  let lastError: Error | null = null;
  let result: ExecutionResult | null = null;

  for (const cmd of cmds) {
    try {
      const expandedCmd = expandVariables(cmd, context as Record<string, string>, env);

      // Check if command uses {PROMPT} placeholder for argument-based prompt passing
      // This supports agents like OpenCode that take the message as an argument
      const usesPromptPlaceholder = expandedCmd.includes("{PROMPT}");

      let execResult;
      if (usesPromptPlaceholder) {
        // Replace {PROMPT} with the actual prompt as a separate argument
        const parts = expandedCmd.split(/\s+/);
        const finalArgs: string[] = [];
        let command = "";

        for (let i = 0; i < parts.length; i++) {
          if (i === 0) {
            command = parts[i];
          } else if (parts[i] === "{PROMPT}") {
            finalArgs.push(prompt);
          } else {
            finalArgs.push(parts[i]);
          }
        }

        if (interactive) {
          execResult = await execa(command, finalArgs, {
            cwd: workingDir,
            env,
            timeout: timeoutMs,
            stdio: "inherit",
            reject: false,
          });
        } else {
          execResult = await execa(command, finalArgs, {
            cwd: workingDir,
            env,
            timeout: timeoutMs,
            reject: false,
          });
        }
      } else {
        const [command, ...args] = expandedCmd.split(/\s+/);

        if (interactive) {
          // Interactive mode: pass prompt as CLI argument, inherit stdio for terminal interaction
          execResult = await execa(command, [...args, prompt], {
            cwd: workingDir,
            env,
            timeout: timeoutMs,
            stdio: "inherit",
            reject: false,
          });
        } else {
          // Headless mode: pipe prompt via stdin, capture output
          execResult = await execa(command, args, {
            input: prompt,
            cwd: workingDir,
            env,
            timeout: timeoutMs,
            reject: false,
          });
        }
      }

      const endedAt = new Date();

      result = {
        success: execResult.exitCode === 0,
        exitCode: execResult.exitCode ?? 1,
        // Interactive mode doesn't capture stdout/stderr (inherited to terminal)
        stdout: execResult.stdout ?? "",
        stderr: execResult.stderr ?? "",
        duration: endedAt.getTime() - startedAt.getTime(),
        runId: context.RUN_ID,
        startedAt,
        endedAt,
      };

      if (result.success) {
        break; // Success, no need to try fallback commands
      }

      lastError = new Error(
        `Command failed with exit code ${result.exitCode}: ${execResult.stderr ?? "unknown error"}`
      );
    } catch (error) {
      lastError = error as Error;
      // Continue to next fallback command
    }
  }

  if (!result) {
    const endedAt = new Date();
    result = {
      success: false,
      exitCode: 1,
      stdout: "",
      stderr: lastError?.message ?? "All commands failed",
      duration: endedAt.getTime() - startedAt.getTime(),
      runId: context.RUN_ID,
      startedAt,
      endedAt,
      error: lastError?.message,
    };
  }

  // Finalize session if created
  if (session) {
    await finalizeSession(session, {
      success: result.success,
      exitCode: result.exitCode,
      duration: result.duration,
      error: result.error,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }

  return result;
}

/**
 * Session log metadata
 */
export interface SessionMetadata {
  workflowName: string;
  personaName: string;
}

/**
 * Ensure log directory exists and write execution log
 */
export async function writeExecutionLog(
  sessionsDir: string,
  metadata: SessionMetadata,
  result: ExecutionResult
): Promise<string> {
  await mkdir(sessionsDir, { recursive: true });

  // Format: YYYYMMDD-HHMMSS.log
  const timestamp = result.startedAt
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .split(".")[0];

  const filename = `${timestamp}.log`;
  const logPath = join(sessionsDir, filename);

  const logContent = `Run ID: ${result.runId}
Workflow: ${metadata.workflowName}
Persona: ${metadata.personaName}
Started: ${result.startedAt.toISOString()}
Ended: ${result.endedAt.toISOString()}
Duration: ${result.duration}ms
Exit Code: ${result.exitCode}
Success: ${result.success}
${result.error ? `Error: ${result.error}\n` : ""}
--- STDOUT ---
${result.stdout}

--- STDERR ---
${result.stderr}
`;

  await writeFile(logPath, logContent, "utf-8");
  return logPath;
}
