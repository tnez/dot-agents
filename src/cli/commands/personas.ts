import { Command } from "commander";
import chalk from "chalk";
import { execa } from "execa";
import { relative } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import {
  requireConfig,
  listPersonas,
  loadPersona,
  resolvePersona,
  expandVariables,
  createExecutionContext,
  createSession,
  readSession,
  finalizeSession,
  type Session,
} from "../../lib/index.js";
import type { McpConfig } from "../../lib/types/persona.js";

export const personasCommand = new Command("personas")
  .description("Manage and run personas")
  .action(() => {
    personasCommand.help();
  });

personasCommand
  .command("list")
  .description("List available personas")
  .option("-v, --verbose", "Show detailed information")
  .action(async (options) => {
    try {
      const config = await requireConfig();
      const personaPaths = await listPersonas(config.personasDir);

      if (personaPaths.length === 0) {
        console.log(chalk.yellow("No personas found"));
        return;
      }

      console.log(chalk.blue(`Personas (${personaPaths.length}):\n`));

      for (const personaPath of personaPaths) {
        try {
          const persona = await loadPersona(personaPath);
          const relPath = relative(config.personasDir, personaPath);

          console.log(chalk.white(`  ${relPath}`));
          if (persona.description) {
            console.log(chalk.dim(`    ${persona.description}`));
          }

          if (options.verbose) {
            const cmd = Array.isArray(persona.cmd)
              ? persona.cmd[0]
              : typeof persona.cmd === "object" && persona.cmd !== null
                ? persona.cmd.interactive?.[0] || persona.cmd.headless?.[0]
                : persona.cmd;
            if (cmd) {
              console.log(chalk.dim(`    Command: ${cmd}`));
            }

            if (persona.skills && persona.skills.length > 0) {
              console.log(chalk.dim(`    Skills: ${persona.skills.join(", ")}`));
            }

            if (persona.env && Object.keys(persona.env).length > 0) {
              console.log(
                chalk.dim(`    Env: ${Object.keys(persona.env).join(", ")}`)
              );
            }
          }

          console.log();
        } catch (error) {
          console.log(chalk.red(`  ${personaPath} (invalid)`));
          if (options.verbose) {
            console.log(chalk.red(`    Error: ${(error as Error).message}`));
          }
          console.log();
        }
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

personasCommand
  .command("run")
  .description("Run a persona directly")
  .argument("<name>", "Persona name/path (e.g., developer, claude/autonomous)")
  .option("-p, --prompt <text>", "Prompt to pass to the persona")
  .option("--interactive", "Run in interactive mode (default)")
  .option("--headless", "Run in headless/print mode")
  .option("-w, --working-dir <path>", "Working directory")
  .option("-s, --session-id <id>", "Resume an existing session")
  .option("--upstream <address>", "Upstream return address (e.g., @odin:dottie --session-id abc)")
  .option("-v, --verbose", "Verbose output")
  .action(async (name, options) => {
    const startedAt = new Date();

    try {
      const config = await requireConfig();

      // Resolve persona path
      const personaPath = name.startsWith("/")
        ? name
        : `${config.personasDir}/${name}`;

      if (options.verbose) {
        console.log(chalk.dim(`Resolving persona: ${personaPath}`));
      }

      // Resolve persona with inheritance
      const persona = await resolvePersona(personaPath, config.personasDir);

      if (options.verbose) {
        console.log(chalk.dim(`Found persona: ${persona.name}`));
        console.log(
          chalk.dim(`Inheritance chain: ${persona.inheritanceChain.join(" → ")}`)
        );
      }

      // Determine execution mode
      let interactive = true; // Default to interactive
      if (options.interactive && options.headless) {
        console.error(chalk.red("Cannot specify both --interactive and --headless"));
        process.exit(1);
      } else if (options.headless) {
        interactive = false;
      } else if (options.interactive) {
        interactive = true;
      }

      // Validate mode support
      if (interactive && !persona.commands.interactive) {
        console.error(chalk.red(`Persona '${persona.name}' does not support interactive mode`));
        process.exit(1);
      }
      if (!interactive && !persona.commands.headless) {
        console.error(chalk.red(`Persona '${persona.name}' does not support headless mode`));
        process.exit(1);
      }

      // Select command
      const cmds = interactive
        ? persona.commands.interactive
        : persona.commands.headless;

      if (!cmds || cmds.length === 0) {
        console.error(chalk.red(`No commands configured for ${interactive ? "interactive" : "headless"} mode`));
        process.exit(1);
      }

      // Determine working directory
      const workingDir = options.workingDir ?? process.cwd();

      // Handle session: resume existing or create new
      let session: Session;
      if (options.sessionId) {
        // Resume existing session
        const existing = await readSession(config.sessionsDir, options.sessionId);
        if (!existing) {
          console.error(chalk.red(`Session not found: ${options.sessionId}`));
          process.exit(1);
        }
        session = existing;
        if (options.verbose) {
          console.log(chalk.dim(`Resuming session: ${session.id}`));
        }
      } else {
        // Create new session
        session = await createSession({
          sessionsDir: config.sessionsDir,
          runtime: {
            hostname: hostname(),
            executionMode: interactive ? "interactive" : "headless",
            triggerType: "manual",
            workingDir,
          },
          upstream: options.upstream,
          goal: options.prompt ? `Run ${persona.name}: ${options.prompt.substring(0, 50)}...` : `Run ${persona.name}`,
          persona: {
            name: persona.name,
            inheritanceChain: persona.inheritanceChain,
          },
        });
        if (options.verbose) {
          console.log(chalk.dim(`Created session: ${session.id}`));
        }
      }

      // Create execution context with session
      const context = createExecutionContext({
        PERSONA_NAME: persona.name,
        PERSONA_DIR: persona.path,
        SESSION_DIR: session.path,
        SESSION_ID: session.id,
      });

      // Build environment
      const env: Record<string, string> = {
        ...process.env,
        ...persona.env,
        DOT_AGENTS_PERSONA: persona.path,
        DOT_AGENTS_SESSION_DIR: session.path,
        DOT_AGENTS_SESSION_ID: session.id,
      } as Record<string, string>;

      // Expand environment variable values
      for (const [key, value] of Object.entries(env)) {
        if (value) {
          env[key] = expandVariables(value, context as Record<string, string>, env);
        }
      }

      // Write MCP config to temp file if present
      let mcpConfigPath: string | undefined;
      if (persona.mcpConfig) {
        const mcpDir = join(tmpdir(), "dot-agents-mcp");
        await mkdir(mcpDir, { recursive: true });
        mcpConfigPath = join(mcpDir, `${persona.name}-${Date.now()}.json`);
        await writeFile(mcpConfigPath, JSON.stringify(persona.mcpConfig, null, 2));

        if (options.verbose) {
          console.log(chalk.dim(`MCP config: ${mcpConfigPath}`));
        }
      }

      // Build the full prompt (system prompt + user prompt)
      const promptParts: string[] = [];
      if (persona.prompt) {
        promptParts.push(persona.prompt);
      }
      if (options.prompt) {
        if (promptParts.length > 0) {
          promptParts.push("\n---\n");
        }
        promptParts.push(options.prompt);
      }
      const fullPrompt = promptParts.join("\n");

      if (options.verbose) {
        console.log(chalk.dim(`Execution mode: ${interactive ? "interactive" : "headless"}`));
        console.log(chalk.dim(`Working dir: ${workingDir}`));
        console.log(chalk.dim(`Command: ${cmds[0]}`));
        if (persona.prompt) {
          console.log(chalk.dim(`System prompt: ${persona.prompt.substring(0, 100)}...`));
        }
      }

      // Try each command in order
      let lastError: Error | null = null;
      let success = false;
      let stdout = "";
      let stderr = "";
      let exitCode = 1;

      for (const cmd of cmds) {
        try {
          const expandedCmd = expandVariables(cmd, context as Record<string, string>, env);
          let [command, ...args] = expandedCmd.split(/\s+/);

          // Inject MCP config if present (Claude-specific for now)
          if (mcpConfigPath && command === "claude") {
            args = ["--mcp-config", mcpConfigPath, ...args];
          }

          if (options.verbose) {
            console.log(chalk.dim(`Executing: ${command} ${args.join(" ")}`));
          }

          if (interactive) {
            // Interactive mode: pass full prompt as CLI argument, inherit stdio
            // Show session info before starting
            console.log(chalk.dim(`Session: ${session.id}`));
            console.log(chalk.dim(`Session dir: ${session.path}`));
            console.log();

            const execArgs = fullPrompt ? [...args, fullPrompt] : args;

            const result = await execa(command, execArgs, {
              cwd: workingDir,
              env,
              stdio: "inherit",
              reject: false,
            });

            exitCode = result.exitCode ?? 1;
            if (exitCode === 0) {
              success = true;
              break;
            }

            lastError = new Error(`Command exited with code ${exitCode}`);
          } else {
            // Headless mode: pass full prompt via stdin
            if (fullPrompt) {
              const result = await execa(command, args, {
                input: fullPrompt,
                cwd: workingDir,
                env,
                reject: false,
              });

              stdout = result.stdout ?? "";
              stderr = result.stderr ?? "";
              exitCode = result.exitCode ?? 1;

              if (stdout) {
                console.log(stdout);
              }

              if (exitCode === 0) {
                success = true;
                break;
              }

              if (stderr) {
                console.error(stderr);
              }

              lastError = new Error(`Command exited with code ${exitCode}`);
            } else {
              console.error(chalk.red("Headless mode requires --prompt or a persona with a system prompt"));
              process.exit(1);
            }
          }
        } catch (error) {
          lastError = error as Error;
        }
      }

      const endedAt = new Date();
      const duration = endedAt.getTime() - startedAt.getTime();

      // Finalize session for headless mode (interactive sessions are managed by the user)
      if (!interactive) {
        await finalizeSession(session, {
          success,
          exitCode,
          duration,
          error: lastError?.message,
          stdout,
          stderr,
        });
      }

      if (!success) {
        console.error(chalk.red(`Failed to run persona: ${lastError?.message ?? "unknown error"}`));
        process.exit(exitCode);
      }

      // Show session info after interactive session ends
      if (interactive) {
        console.log();
        console.log(chalk.dim(`Session ended: ${session.id}`));
        console.log(chalk.dim(`To resume: npx dot-agents personas run ${name} --session-id ${session.id}`));
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });
