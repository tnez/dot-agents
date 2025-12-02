import { Command } from "commander";
import chalk from "chalk";
import {
  requireConfig,
  findWorkflow,
  resolvePersona,
  validateInputs,
} from "../../lib/index.js";
import { runWorkflow, writeExecutionLog } from "../lib/runner.js";

export const runCommand = new Command("run")
  .description("Run a workflow")
  .argument("<name>", "Workflow name to run")
  .option("-i, --input <key=value...>", "Input values")
  .option("-p, --persona <path>", "Override persona")
  .option("-d, --dry-run", "Show prompt without executing")
  .option("-t, --timeout <duration>", "Timeout (e.g., 5m, 1h)")
  .option("-w, --working-dir <path>", "Working directory")
  .option("-v, --verbose", "Verbose output")
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
      });

      if (options.dryRun) {
        console.log(result.stdout);
        return;
      }

      // Write log
      const logPath = await writeExecutionLog(
        config.sessionsDir,
        { workflowName: workflow.name, personaName: persona.name },
        result
      );

      if (result.success) {
        console.log(chalk.green(`\n✓ Workflow completed successfully`));
        console.log(chalk.dim(`  Run ID: ${result.runId}`));
        console.log(chalk.dim(`  Duration: ${result.duration}ms`));
        console.log(chalk.dim(`  Log: ${logPath}`));

        if (options.verbose && result.stdout) {
          console.log(chalk.dim("\n--- Output ---"));
          console.log(result.stdout);
        }
      } else {
        console.error(chalk.red(`\n✗ Workflow failed`));
        console.error(chalk.dim(`  Run ID: ${result.runId}`));
        console.error(chalk.dim(`  Exit code: ${result.exitCode}`));
        console.error(chalk.dim(`  Log: ${logPath}`));

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
