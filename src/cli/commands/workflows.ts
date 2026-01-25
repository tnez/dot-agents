import { Command } from "commander";
import chalk from "chalk";
import { relative } from "node:path";
import {
  requireConfig,
  findWorkflow,
  listWorkflows,
  loadWorkflow,
  resolvePersona,
  validateInputs,
  createExecutionContext,
  getInputDefaults,
} from "../../lib/index.js";
import { buildPrompt, runWorkflow } from "../lib/runner.js";

export const workflowsCommand = new Command("workflows")
  .description("Manage and run workflows")
  .action(() => {
    workflowsCommand.help();
  });

/**
 * workflows run <name> - Run a workflow
 */
workflowsCommand
  .command("run")
  .description("Run a workflow")
  .argument("<name>", "Workflow name to run")
  .option("-i, --input <key=value...>", "Input values")
  .option("-p, --persona <path>", "Override persona")
  .option("-d, --dry-run", "Show prompt without executing")
  .option("-t, --timeout <duration>", "Timeout (e.g., 5m, 1h)")
  .option("-w, --working-dir <path>", "Working directory")
  .option("-v, --verbose", "Verbose output")
  .option("--interactive", "Run in interactive mode (requires TTY)")
  .option("--batch", "Force headless/batch mode (no TTY interaction)")
  .action(async (name, options) => {
    try {
      const config = await requireConfig();

      // Find workflow
      const workflow = await findWorkflow(name, config.workflowsDir);
      if (!workflow) {
        console.error(chalk.red(`Workflow not found: ${name}`));
        process.exit(1);
      }

      if (options.verbose) {
        console.log(chalk.dim(`Found workflow: ${workflow.path}`));
      }

      // Parse inputs from CLI
      const inputs: Record<string, string | number | boolean> = {};
      if (options.input) {
        for (const input of options.input) {
          const [key, ...valueParts] = input.split("=");
          const value = valueParts.join("=");

          // Try to parse as number or boolean
          if (value === "true") {
            inputs[key] = true;
          } else if (value === "false") {
            inputs[key] = false;
          } else if (!isNaN(Number(value))) {
            inputs[key] = Number(value);
          } else {
            inputs[key] = value;
          }
        }
      }

      // Validate inputs
      const validation = validateInputs(workflow, inputs);
      if (!validation.valid) {
        console.error(chalk.red("Invalid inputs:"));
        for (const error of validation.errors) {
          console.error(chalk.red(`  - ${error}`));
        }
        process.exit(1);
      }

      // Resolve persona
      const personaPath = options.persona ?? workflow.persona;
      const persona = await resolvePersona(
        `${config.personasDir}/${personaPath}`,
        config.personasDir
      );

      if (options.verbose) {
        console.log(chalk.dim(`Using persona: ${persona.name}`));
        console.log(
          chalk.dim(`Inheritance chain: ${persona.inheritanceChain.join(" → ")}`)
        );
      }

      // Determine execution mode
      let interactive = false;
      if (options.interactive && options.batch) {
        console.error(chalk.red("Cannot specify both --interactive and --batch"));
        process.exit(1);
      } else if (options.interactive) {
        if (!persona.commands.interactive) {
          console.error(chalk.red(`Persona '${persona.name}' does not support interactive mode`));
          process.exit(1);
        }
        interactive = true;
      } else if (options.batch) {
        interactive = false;
      } else {
        // Auto-detect: use interactive if TTY available and persona supports it
        interactive = process.stdout.isTTY && !!persona.commands.interactive;
      }

      if (options.verbose) {
        console.log(chalk.dim(`Execution mode: ${interactive ? "interactive" : "headless"}`));
      }

      // Run workflow
      console.log(
        chalk.blue(`Running workflow: ${workflow.name}`)
      );

      if (options.dryRun) {
        console.log(chalk.yellow("\n--- DRY RUN (prompt only) ---\n"));
      }

      const result = await runWorkflow(workflow, persona, {
        inputs,
        workingDir: options.workingDir,
        timeout: options.timeout,
        dryRun: options.dryRun,
        interactive,
        sessionsDir: config.sessionsDir,
      });

      if (options.dryRun) {
        console.log(result.stdout);
        return;
      }

      if (result.success) {
        console.log(chalk.green(`\n✓ Workflow completed successfully`));
        console.log(chalk.dim(`  Run ID: ${result.runId}`));
        console.log(chalk.dim(`  Duration: ${result.duration}ms`));
        console.log(chalk.dim(`  Session: ${config.sessionsDir}`));

        if (options.verbose && result.stdout) {
          console.log(chalk.dim("\n--- Output ---"));
          console.log(result.stdout);
        }
      } else {
        console.error(chalk.red(`\n✗ Workflow failed`));
        console.error(chalk.dim(`  Run ID: ${result.runId}`));
        console.error(chalk.dim(`  Exit code: ${result.exitCode}`));
        console.error(chalk.dim(`  Session: ${config.sessionsDir}`));

        if (result.stderr) {
          console.error(chalk.red("\n--- Error ---"));
          console.error(result.stderr);
        }

        process.exit(result.exitCode);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

/**
 * workflows list - List all workflows
 */
workflowsCommand
  .command("list")
  .description("List available workflows")
  .option("-v, --verbose", "Show detailed information")
  .action(async (options) => {
    try {
      const config = await requireConfig();
      const workflowPaths = await listWorkflows(config.workflowsDir);

      if (workflowPaths.length === 0) {
        console.log(chalk.yellow("No workflows found"));
        return;
      }

      console.log(chalk.blue(`Workflows (${workflowPaths.length}):\n`));

      for (const workflowPath of workflowPaths) {
        try {
          const workflow = await loadWorkflow(workflowPath);
          const relPath = relative(config.workflowsDir, workflowPath);

          console.log(chalk.white(`  ${workflow.name}`));
          console.log(chalk.dim(`    ${workflow.description}`));

          // Always show triggers
          const triggers: string[] = [];
          if (workflow.on?.manual) {
            triggers.push("manual");
          }
          if (workflow.on?.schedule && workflow.on.schedule.length > 0) {
            const crons = workflow.on.schedule.map((s: { cron: string }) => s.cron);
            triggers.push(...crons.map((c) => `cron(${c})`));
          }
          if (workflow.on?.file_change) {
            triggers.push("file_change");
          }
          if (workflow.on?.webhook) {
            triggers.push("webhook");
          }
          if (triggers.length > 0) {
            console.log(chalk.cyan(`    triggers: ${triggers.join(", ")}`));
          } else {
            console.log(chalk.yellow(`    triggers: none`));
          }

          if (options.verbose) {
            console.log(chalk.dim(`    Path: ${relPath}`));
            console.log(chalk.dim(`    Persona: ${workflow.persona}`));

            if (workflow.inputs && workflow.inputs.length > 0) {
              const inputNames = workflow.inputs.map((i: { name: string }) => i.name).join(", ");
              console.log(chalk.dim(`    Inputs: ${inputNames}`));
            }
          }

          console.log();
        } catch (error) {
          console.log(chalk.red(`  ${workflowPath} (invalid)`));
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

/**
 * workflows show <name> - Show workflow details
 */
workflowsCommand
  .command("show")
  .description("Show workflow details")
  .argument("<name>", "Workflow name")
  .option("--prompt", "Show the full resolved prompt")
  .action(async (name, options) => {
    try {
      const config = await requireConfig();
      const workflow = await findWorkflow(name, config.workflowsDir);

      if (!workflow) {
        console.error(chalk.red(`Workflow not found: ${name}`));
        process.exit(1);
      }

      console.log(chalk.blue(`Workflow: ${workflow.name}\n`));
      console.log(chalk.white("Description:"), workflow.description);
      console.log(chalk.white("Path:"), workflow.path);
      console.log(chalk.white("Persona:"), workflow.persona);

      if (workflow.timeout) {
        console.log(chalk.white("Timeout:"), workflow.timeout);
      }

      if (workflow.working_dir) {
        console.log(chalk.white("Working Dir:"), workflow.working_dir);
      }

      if (workflow.on) {
        console.log(chalk.white("\nTriggers:"));
        if (workflow.on.schedule) {
          for (const schedule of workflow.on.schedule) {
            console.log(chalk.dim(`  - schedule: ${schedule.cron}`));
          }
        }
        if (workflow.on.manual) {
          console.log(chalk.dim(`  - manual: enabled`));
        }
        if (workflow.on.file_change) {
          console.log(
            chalk.dim(`  - file_change: ${workflow.on.file_change.paths.join(", ")}`)
          );
        }
      }

      if (workflow.inputs && workflow.inputs.length > 0) {
        console.log(chalk.white("\nInputs:"));
        for (const input of workflow.inputs) {
          const required = input.required ? " (required)" : "";
          const defaultVal =
            input.default !== undefined ? ` [default: ${input.default}]` : "";
          console.log(chalk.dim(`  - ${input.name}${required}${defaultVal}`));
          if (input.description) {
            console.log(chalk.dim(`    ${input.description}`));
          }
        }
      }

      if (workflow.outputs && workflow.outputs.length > 0) {
        console.log(chalk.white("\nOutputs:"));
        for (const output of workflow.outputs) {
          console.log(chalk.dim(`  - ${output.path}`));
        }
      }

      if (options.prompt) {
        const persona = await resolvePersona(
          `${config.personasDir}/${workflow.persona}`,
          config.personasDir
        );

        const context = createExecutionContext({
          WORKFLOW_NAME: workflow.name,
          WORKFLOW_DIR: workflow.path,
          PERSONA_NAME: persona.name,
          PERSONA_DIR: persona.path,
        });

        const inputs = getInputDefaults(workflow);
        const prompt = buildPrompt(workflow, persona, context, inputs);

        console.log(chalk.white("\n--- Resolved Prompt ---\n"));
        console.log(prompt);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });
