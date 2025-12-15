import { execa } from "execa";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Workflow,
  type ResolvedPersona,
  type ExecutionResult,
  type DotAgentsConfig,
  type ResolvedCommands,
  resolvePersona,
  createExecutionContext,
  processTemplate,
  expandVariables,
  getInputDefaults,
} from "../../lib/index.js";

/**
 * Parse duration string to milliseconds
 */
function parseDuration(duration: string): number {
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
 * Build the full prompt for the agent
 */
function buildPrompt(
  workflow: Workflow,
  persona: ResolvedPersona,
  context: Record<string, string>,
  inputs: Record<string, unknown>
): string {
  const parts: string[] = [];

  if (persona.prompt) {
    const expandedPrompt = processTemplate(
      persona.prompt,
      { ...context, ...inputs },
      persona.env
    );
    parts.push(expandedPrompt);
    parts.push("\n---\n");
  }

  const expandedTask = processTemplate(
    workflow.task,
    { ...context, ...inputs },
    { ...persona.env, ...workflow.env }
  );
  parts.push(expandedTask);

  return parts.join("\n");
}

/**
 * Options for workflow execution
 */
export interface ExecutionOptions {
  /** Input overrides */
  inputs?: Record<string, unknown>;
  /** Run in interactive mode (requires persona to support it) */
  interactive?: boolean;
}

/**
 * Options for direct persona invocation
 */
export interface InvokeOptions {
  /** Optional context to include in the prompt */
  context?: Record<string, string>;
  /** Source of the invocation (e.g., DM channel name) */
  source?: string;
}

/**
 * Executor for running workflows
 */
export class Executor {
  constructor(private config: DotAgentsConfig) {}

  /**
   * Execute a workflow
   */
  async run(
    workflow: Workflow,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const { inputs: inputOverrides, interactive = false } = options;
    const startedAt = new Date();

    // Resolve persona
    const persona = await resolvePersona(
      join(this.config.personasDir, workflow.persona),
      this.config.personasDir
    );

    const context = createExecutionContext({
      WORKFLOW_NAME: workflow.name,
      WORKFLOW_DIR: workflow.path,
      PERSONA_NAME: persona.name,
      PERSONA_DIR: persona.path,
      AGENTS_DIR: this.config.agentsDir,
    });

    // Merge inputs
    const inputs: Record<string, unknown> = {
      ...getInputDefaults(workflow),
      ...inputOverrides,
    };

    // Merge environment
    const env: Record<string, string> = {
      ...process.env,
      ...persona.env,
      ...workflow.env,
      DOT_AGENTS_PERSONA: persona.name,
    } as Record<string, string>;

    for (const [key, value] of Object.entries(env)) {
      if (value) {
        env[key] = expandVariables(
          value,
          context as Record<string, string>,
          env
        );
      }
    }

    // Working directory
    let workingDir = workflow.working_dir ?? process.cwd();
    workingDir = expandVariables(
      workingDir,
      { ...context, ...(inputs as Record<string, string>) },
      env
    );

    // Build prompt
    const prompt = buildPrompt(
      workflow,
      persona,
      context as Record<string, string>,
      inputs
    );

    // Timeout
    const timeoutMs = workflow.timeout
      ? parseDuration(workflow.timeout)
      : 10 * 60 * 1000;

    // Select commands based on execution mode
    const cmds = interactive
      ? persona.commands.interactive
      : persona.commands.headless;

    if (!cmds) {
      const endedAt = new Date();
      return {
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
    }

    // Try each command
    let lastError: Error | null = null;
    let result: ExecutionResult | null = null;

    for (const cmd of cmds) {
      try {
        const expandedCmd = expandVariables(
          cmd,
          context as Record<string, string>,
          env
        );
        const [command, ...args] = expandedCmd.split(/\s+/);

        const execResult = await execa(command, args, {
          input: prompt,
          cwd: workingDir,
          env,
          timeout: timeoutMs,
          reject: false,
        });

        const endedAt = new Date();

        result = {
          success: execResult.exitCode === 0,
          exitCode: execResult.exitCode ?? 1,
          stdout: execResult.stdout,
          stderr: execResult.stderr,
          duration: endedAt.getTime() - startedAt.getTime(),
          runId: context.RUN_ID,
          startedAt,
          endedAt,
        };

        if (result.success) break;

        lastError = new Error(
          `Command failed with exit code ${result.exitCode}: ${execResult.stderr}`
        );
      } catch (error) {
        lastError = error as Error;
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

    // Write session log
    await this.writeSessionLog(workflow.name, persona.name, result);

    return result;
  }

  /**
   * Invoke a persona directly with a message (no workflow required)
   * Used for DM-triggered invocations
   */
  async invokePersona(
    personaName: string,
    message: string,
    options: InvokeOptions = {}
  ): Promise<ExecutionResult> {
    const startedAt = new Date();

    // Resolve persona
    const persona = await resolvePersona(
      join(this.config.personasDir, personaName),
      this.config.personasDir
    );

    const context = createExecutionContext({
      PERSONA_NAME: persona.name,
      PERSONA_DIR: persona.path,
      AGENTS_DIR: this.config.agentsDir,
      INVOCATION_SOURCE: options.source ?? "dm",
      ...options.context,
    });

    // Merge environment
    const env: Record<string, string> = {
      ...process.env,
      ...persona.env,
      DOT_AGENTS_PERSONA: persona.name,
      DOT_AGENTS_INVOCATION: "dm",
    } as Record<string, string>;

    for (const [key, value] of Object.entries(env)) {
      if (value) {
        env[key] = expandVariables(
          value,
          context as Record<string, string>,
          env
        );
      }
    }

    // Build prompt: persona prompt + message
    const parts: string[] = [];
    if (persona.prompt) {
      const expandedPrompt = processTemplate(persona.prompt, context, persona.env);
      parts.push(expandedPrompt);
      parts.push("\n---\n");
    }
    parts.push(`You received a direct message:\n\n${message}`);
    const prompt = parts.join("\n");

    // Timeout (default 10 minutes for DM invocations)
    const timeoutMs = 10 * 60 * 1000;

    // Use headless commands for DM-triggered invocations
    const cmds = persona.commands.headless;

    if (!cmds) {
      const endedAt = new Date();
      return {
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: `Persona '${persona.name}' does not support headless mode`,
        duration: endedAt.getTime() - startedAt.getTime(),
        runId: context.RUN_ID,
        startedAt,
        endedAt,
        error: "Persona does not support headless mode",
      };
    }

    // Try each command
    let lastError: Error | null = null;
    let result: ExecutionResult | null = null;

    for (const cmd of cmds) {
      try {
        const expandedCmd = expandVariables(
          cmd,
          context as Record<string, string>,
          env
        );
        const [command, ...args] = expandedCmd.split(/\s+/);

        const execResult = await execa(command, args, {
          input: prompt,
          cwd: this.config.agentsDir,
          env,
          timeout: timeoutMs,
          reject: false,
        });

        const endedAt = new Date();

        result = {
          success: execResult.exitCode === 0,
          exitCode: execResult.exitCode ?? 1,
          stdout: execResult.stdout,
          stderr: execResult.stderr,
          duration: endedAt.getTime() - startedAt.getTime(),
          runId: context.RUN_ID,
          startedAt,
          endedAt,
        };

        if (result.success) break;

        lastError = new Error(
          `Command failed with exit code ${result.exitCode}: ${execResult.stderr}`
        );
      } catch (error) {
        lastError = error as Error;
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

    // Write session log
    await this.writeSessionLog(`dm:${options.source ?? personaName}`, persona.name, result);

    return result;
  }

  /**
   * Write execution log to sessions directory
   */
  private async writeSessionLog(
    workflowName: string,
    personaName: string,
    result: ExecutionResult
  ): Promise<string> {
    await mkdir(this.config.sessionsDir, { recursive: true });

    const timestamp = result.startedAt
      .toISOString()
      .replace(/[-:]/g, "")
      .replace("T", "-")
      .split(".")[0];

    const filename = `${timestamp}.log`;
    const logPath = join(this.config.sessionsDir, filename);

    const logContent = `Run ID: ${result.runId}
Workflow: ${workflowName}
Persona: ${personaName}
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
}
