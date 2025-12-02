import { Command } from "commander";
import chalk from "chalk";
import { Daemon } from "@dot-agents/daemon";
import { requireConfig } from "@dot-agents/core";

export const daemonCommand = new Command("daemon").description(
  "Manage the workflow scheduler daemon"
);

daemonCommand
  .command("run")
  .description("Run the daemon in foreground (for containers)")
  .option("-p, --port <port>", "HTTP API port", "3141")
  .option("--no-watch", "Disable file watching")
  .action(async (options) => {
    try {
      const config = await requireConfig();
      const daemon = new Daemon({
        port: parseInt(options.port, 10),
        watch: options.watch,
        config,
      });

      // Handle shutdown signals
      const shutdown = async () => {
        console.log("\nShutting down...");
        await daemon.stop();
        process.exit(0);
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      await daemon.start();

      // Keep process running
      console.log(chalk.green("\nDaemon running. Press Ctrl+C to stop.\n"));
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

daemonCommand
  .command("status")
  .description("Check daemon status")
  .option("-p, --port <port>", "HTTP API port", "3141")
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const response = await fetch(`http://localhost:${port}/status`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const status = await response.json();

      console.log(chalk.blue("Daemon Status\n"));
      console.log(chalk.white("Status:"), status.status);
      console.log(chalk.white("Uptime:"), formatUptime(status.uptime));
      console.log(chalk.white("Scheduled Jobs:"), status.jobs);
      console.log(chalk.white("Version:"), status.version);
    } catch (error) {
      if ((error as Error).message.includes("ECONNREFUSED")) {
        console.log(chalk.yellow("Daemon is not running"));
      } else {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
      process.exit(1);
    }
  });

daemonCommand
  .command("jobs")
  .description("List scheduled jobs")
  .option("-p, --port <port>", "HTTP API port", "3141")
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const response = await fetch(`http://localhost:${port}/jobs`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const { jobs } = await response.json();

      if (jobs.length === 0) {
        console.log(chalk.yellow("No scheduled jobs"));
        return;
      }

      console.log(chalk.blue(`Scheduled Jobs (${jobs.length})\n`));

      for (const job of jobs) {
        console.log(chalk.white(`  ${job.workflowName}`));
        console.log(chalk.dim(`    Cron: ${job.cron}`));
        if (job.nextRun) {
          console.log(chalk.dim(`    Next: ${new Date(job.nextRun).toLocaleString()}`));
        }
        if (job.lastRun) {
          const status = job.lastStatus === "success" ? chalk.green("✓") : chalk.red("✗");
          console.log(chalk.dim(`    Last: ${new Date(job.lastRun).toLocaleString()} ${status}`));
        }
        console.log();
      }
    } catch (error) {
      if ((error as Error).message.includes("ECONNREFUSED")) {
        console.log(chalk.yellow("Daemon is not running"));
      } else {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
      process.exit(1);
    }
  });

daemonCommand
  .command("trigger")
  .description("Manually trigger a workflow")
  .argument("<workflow>", "Workflow name")
  .option("-p, --port <port>", "HTTP API port", "3141")
  .action(async (workflow, options) => {
    try {
      const port = parseInt(options.port, 10);
      const response = await fetch(`http://localhost:${port}/trigger/${workflow}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const result = await response.json();

      if (result.success) {
        console.log(chalk.green(`✓ ${result.message}`));
        if (result.runId) {
          console.log(chalk.dim(`  Run ID: ${result.runId}`));
        }
      } else {
        console.error(chalk.red(`✗ ${result.message}`));
        process.exit(1);
      }
    } catch (error) {
      if ((error as Error).message.includes("ECONNREFUSED")) {
        console.log(chalk.yellow("Daemon is not running"));
      } else {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
      process.exit(1);
    }
  });

daemonCommand
  .command("reload")
  .description("Reload workflows from disk")
  .option("-p, --port <port>", "HTTP API port", "3141")
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const response = await fetch(`http://localhost:${port}/reload`, {
        method: "POST",
      });

      const result = await response.json();

      if (result.success) {
        console.log(chalk.green(`✓ ${result.message}`));
      } else {
        console.error(chalk.red(`✗ ${result.error}`));
        process.exit(1);
      }
    } catch (error) {
      if ((error as Error).message.includes("ECONNREFUSED")) {
        console.log(chalk.yellow("Daemon is not running"));
      } else {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
      process.exit(1);
    }
  });

/**
 * Format uptime in human-readable form
 */
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}
