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
   * Control inheritance chain
   * - undefined: implicit inheritance from _base (default)
   * - "none": opt out of all inheritance
   * - string: name of parent persona to extend (e.g., "odin-base")
   */
  extends?: string;
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
 * MCP server configuration (matches Claude's mcp.json format)
 */
export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * MCP configuration (matches Claude's mcp.json format)
 */
export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

/**
 * Hook command configuration (matches Claude Code's settings format)
 */
export interface HookCommand {
  type: "command" | "prompt";
  command?: string;
  prompt?: string;
  timeout?: number;
}

/**
 * Hook configuration for a specific event
 */
export interface HookEventConfig {
  matcher?: string;
  hooks: HookCommand[];
}

/**
 * Claude Code hooks configuration (matches Claude Code's settings format)
 */
export interface HooksConfig {
  Stop?: HookEventConfig[];
  SessionEnd?: HookEventConfig[];
  SessionStart?: HookEventConfig[];
  PreToolUse?: HookEventConfig[];
  PostToolUse?: HookEventConfig[];
  UserPromptSubmit?: HookEventConfig[];
  Notification?: HookEventConfig[];
  SubagentStop?: HookEventConfig[];
  PreCompact?: HookEventConfig[];
  PermissionRequest?: HookEventConfig[];
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
  /** Merged MCP configuration (from mcp.json files in inheritance chain) */
  mcpConfig?: McpConfig;
  /** Merged hooks configuration (from hooks.json files in inheritance chain) */
  hooksConfig?: HooksConfig;
}
