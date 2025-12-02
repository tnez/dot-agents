import type { WorkflowTriggers } from "./triggers.js";

/**
 * Workflow input parameter definition
 */
export interface WorkflowInput {
  /** Parameter name (used as ${name} in templates) */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Default value if not provided */
  default?: string | number | boolean;
  /** Whether this input is required */
  required?: boolean;
  /** Type hint for validation */
  type?: "string" | "number" | "boolean" | "path";
  /** Allowed values (for enum-like inputs) */
  enum?: (string | number)[];
}

/**
 * Workflow output artifact definition
 */
export interface WorkflowOutput {
  /** Output file path (supports ${VAR} expansion) */
  path: string;
  /** Description of this output */
  description?: string;
  /** Whether to fail if this output is not created */
  required?: boolean;
}

/**
 * Retry policy for failed workflow executions
 */
export interface RetryPolicy {
  /** Total number of attempts (including first) */
  attempts: number;
  /** Delay between attempts (e.g., "30s", "1m") */
  delay: string;
  /** Multiplier for exponential backoff */
  backoff?: number;
}

/**
 * Workflow frontmatter configuration
 */
export interface WorkflowFrontmatter {
  /** Unique workflow identifier */
  name: string;
  /** Human-readable description */
  description: string;
  /** Persona path to use for execution (e.g., "claude/autonomous") */
  persona: string;
  /** Trigger configuration */
  on?: WorkflowTriggers;
  /** Input parameters */
  inputs?: WorkflowInput[];
  /** Expected output artifacts */
  outputs?: WorkflowOutput[];
  /** Workflow-specific environment variables */
  env?: Record<string, string>;
  /** Maximum execution time (e.g., "5m", "1h") */
  timeout?: string;
  /** Retry policy on failure */
  retry?: RetryPolicy;
  /** Working directory for execution */
  working_dir?: string;
}

/**
 * Parsed workflow including frontmatter and body content
 */
export interface Workflow extends WorkflowFrontmatter {
  /** Path to the workflow directory */
  path: string;
  /** Task/prompt content from markdown body */
  task: string;
}
