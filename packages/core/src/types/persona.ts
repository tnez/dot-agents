/**
 * Persona configuration - defines how to invoke an agent
 */
export interface PersonaFrontmatter {
  /** Unique identifier for this persona */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Agent invocation command(s) - tried in order as fallbacks */
  cmd: string | string[];
  /** Environment variables (supports ${VAR} expansion) */
  env?: Record<string, string>;
  /** Enabled skills - glob patterns, use ! for negation */
  skills?: string[];
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
}

/**
 * Resolved persona with all inheritance applied and arrays merged
 */
export interface ResolvedPersona {
  name: string;
  description?: string;
  /** Resolved command list */
  cmd: string[];
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
