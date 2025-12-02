export * from "./persona.js";
export * from "./workflow.js";
export * from "./triggers.js";

/**
 * Execution context for variable expansion
 */
export interface ExecutionContext {
  /** Current date (YYYY-MM-DD) */
  DATE: string;
  /** Current datetime (ISO 8601) */
  DATETIME: string;
  /** Current time (HH:MM:SS) */
  TIME: string;
  /** Unique run identifier */
  RUN_ID: string;
  /** Workflow name (if running a workflow) */
  WORKFLOW_NAME?: string;
  /** Path to workflow directory */
  WORKFLOW_DIR?: string;
  /** Resolved persona name */
  PERSONA_NAME?: string;
  /** Path to persona directory */
  PERSONA_DIR?: string;
  /** Path to .agents root */
  AGENTS_DIR?: string;
  /** Additional context variables */
  [key: string]: string | undefined;
}

/**
 * Result of a workflow execution
 */
export interface ExecutionResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Exit code from agent process */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Execution duration in milliseconds */
  duration: number;
  /** Unique run identifier */
  runId: string;
  /** Start timestamp */
  startedAt: Date;
  /** End timestamp */
  endedAt: Date;
  /** Output files that were created */
  outputs?: string[];
  /** Error message if failed */
  error?: string;
}

/**
 * Configuration for the dot-agents framework
 */
export interface DotAgentsConfig {
  /** Root directory for .agents */
  agentsDir: string;
  /** Directory for personas */
  personasDir: string;
  /** Directory for workflows */
  workflowsDir: string;
  /** Directory for skills */
  skillsDir: string;
  /** Directory for session logs and runtime state */
  sessionsDir: string;
}
