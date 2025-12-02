import { Command } from "commander";
import chalk from "chalk";
import { requireConfig, getScheduledWorkflows } from "@dot-agents/core";
import { relative } from "node:path";

export const scheduleCommand = new Command("schedule")
  .description("Manage workflow schedules");

scheduleCommand
  .command("list")
  .description("List all scheduled workflows")
  .action(async () => {
    try {
      const config = await requireConfig();
      const workflows = await getScheduledWorkflows(config.workflowsDir);

      if (workflows.length === 0) {
        console.log(chalk.yellow("No scheduled workflows found"));
        return;
      }

      console.log(chalk.blue(`Scheduled Workflows (${workflows.length}):\n`));

      for (const workflow of workflows) {
        console.log(chalk.white(`  ${workflow.name}`));
        console.log(chalk.dim(`    ${workflow.description}`));

        for (const schedule of workflow.on!.schedule!) {
          console.log(chalk.cyan(`    ⏰ ${schedule.cron}`));
        }

        console.log();
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

scheduleCommand
  .command("sync")
  .description("Generate crontab entries for scheduled workflows")
  .option("-o, --output <file>", "Output file (default: stdout)")
  .option("--install", "Install to user crontab")
  .action(async (options) => {
    try {
      const config = await requireConfig();
      const workflows = await getScheduledWorkflows(config.workflowsDir);

      if (workflows.length === 0) {
        console.log(chalk.yellow("No scheduled workflows to sync"));
        return;
      }

      // Determine the CLI path
      const cliPath = process.argv[1];

      const lines: string[] = [
        "# dot-agents scheduled workflows",
        `# Generated: ${new Date().toISOString()}`,
        "#",
      ];

      for (const workflow of workflows) {
        lines.push(`# Workflow: ${workflow.name}`);
        lines.push(`# ${workflow.description}`);

        for (const schedule of workflow.on!.schedule!) {
          const logPath = `${config.sessionsDir}/${workflow.name}/cron.log`;
          const cronLine = `${schedule.cron} ${cliPath} run ${workflow.name} >> ${logPath} 2>&1`;
          lines.push(cronLine);
        }

        lines.push("");
      }

      const crontab = lines.join("\n");

      if (options.output) {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(options.output, crontab, "utf-8");
        console.log(chalk.green(`Crontab written to: ${options.output}`));
      } else if (options.install) {
        // Install to user crontab
        const { execa } = await import("execa");

        // Get existing crontab
        let existingCrontab = "";
        try {
          const { stdout } = await execa("crontab", ["-l"]);
          existingCrontab = stdout;
        } catch {
          // No existing crontab
        }

        // Remove old dot-agents entries
        const filteredLines = existingCrontab
          .split("\n")
          .filter(
            (line) =>
              !line.includes("# dot-agents") &&
              !line.includes("# Workflow:") &&
              !line.includes("dot-agents run")
          );

        // Combine with new entries
        const newCrontab = [...filteredLines, "", crontab].join("\n");

        // Install via stdin
        await execa("crontab", ["-"], { input: newCrontab });

        console.log(
          chalk.green(`✓ Installed ${workflows.length} workflow schedules to crontab`)
        );
      } else {
        console.log(crontab);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

scheduleCommand
  .command("show")
  .description("Show cron schedule details for a workflow")
  .argument("<name>", "Workflow name")
  .action(async (name) => {
    try {
      const config = await requireConfig();
      const workflows = await getScheduledWorkflows(config.workflowsDir);
      const workflow = workflows.find((w: { name: string }) => w.name === name);

      if (!workflow) {
        console.error(chalk.red(`Scheduled workflow not found: ${name}`));
        console.error(
          chalk.dim("Use 'dag schedule list' to see all scheduled workflows")
        );
        process.exit(1);
      }

      console.log(chalk.blue(`Schedule for: ${workflow.name}\n`));

      for (const schedule of workflow.on!.schedule!) {
        console.log(chalk.white(`Cron: ${schedule.cron}`));
        console.log(chalk.dim(`  ${describeCron(schedule.cron)}`));

        if (schedule.inputs) {
          console.log(chalk.dim(`  Inputs: ${JSON.stringify(schedule.inputs)}`));
        }

        console.log();
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

/**
 * Simple cron expression description
 */
function describeCron(cron: string): string {
  const parts = cron.split(" ");
  if (parts.length !== 5) return "Invalid cron expression";

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  const descriptions: string[] = [];

  // Time
  if (minute !== "*" && hour !== "*") {
    descriptions.push(`at ${hour}:${minute.padStart(2, "0")}`);
  } else if (hour !== "*") {
    descriptions.push(`at ${hour}:00`);
  }

  // Day of week
  if (dayOfWeek !== "*") {
    const days: Record<string, string> = {
      "0": "Sunday",
      "1": "Monday",
      "2": "Tuesday",
      "3": "Wednesday",
      "4": "Thursday",
      "5": "Friday",
      "6": "Saturday",
      "7": "Sunday",
      "1-5": "Monday-Friday",
      "0,6": "weekends",
    };
    descriptions.push(`on ${days[dayOfWeek] ?? dayOfWeek}`);
  }

  // Day of month
  if (dayOfMonth !== "*") {
    descriptions.push(`on day ${dayOfMonth}`);
  }

  // Month
  if (month !== "*") {
    descriptions.push(`in month ${month}`);
  }

  return descriptions.join(" ") || "every minute";
}
