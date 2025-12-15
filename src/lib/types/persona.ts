/**
 * Command specification - single command or array of fallbacks
 */
export type CommandSpec = string | string[];

/**
 * Command modes for headless vs interactive execution
 */
export interface CommandModes {
  /** Command for scheduled/automated execution (no human present) */
  headless?: CommandSpec;
  /** Command for manual/attended execution (human can interact) */
  interactive?: CommandSpec;
}

/**
 * Persona configuration - defines how to invoke an agent
 */
export interface PersonaFrontmatter {
  /** Unique identifier for this persona */
  name: string;
  /** Human-readable description */
  description?: string;
  /**
   * Agent invocation command(s)
   * - Array/string: legacy format, used for headless execution only
   * - Object: { headless, interactive } for mode-specific commands
   */
  cmd?: CommandSpec | CommandModes;
  /** Environment variables (supports ${VAR} expansion) */
  env?: Record<string, string>;
  /** Enabled skills - glob patterns, use ! for negation */
  skills?: string[];
  /**
   * Control inheritance from internal _base persona
   * - undefined: implicit inheritance from _base (default)
   * - "none": opt out of _base inheritance
   */
  extends?: "none";
}

/**
 * Parsed persona including frontmatter and body content
 */
export interface Persona extends PersonaFrontmatter {
  /** Path to the persona directory */
  path: string;
  /** System prompt from markdown body (supports ${VAR} expansion) */
  prompt?: string;
  /** Parent persona path if this is a child (for tracking) */
  parent?: string;
  /** Whether this is an internal (bundled) persona */
  internal?: boolean;
}

/**
 * Resolved commands for each execution mode
 */
export interface ResolvedCommands {
  /** Command for headless/scheduled execution */
  headless: string[];
  /** Command for interactive/manual execution (undefined = not supported) */
  interactive?: string[];
}

/**
 * Resolved persona with all inheritance applied and arrays merged
 */
export interface ResolvedPersona {
  name: string;
  description?: string;
  /** Resolved commands for each mode */
  commands: ResolvedCommands;
  /** Merged environment variables */
  env: Record<string, string>;
  /** Merged and filtered skills (negations applied) */
  skills: string[];
  /** Combined system prompt */
  prompt?: string;
  /** Full path to persona */
  path: string;
  /** Inheritance chain (root to leaf) */
  inheritanceChain: string[];
}
