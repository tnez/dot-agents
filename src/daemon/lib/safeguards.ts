import { hasFrontmatter, parseFrontmatter } from "../../lib/frontmatter.js";

/**
 * Message frontmatter fields relevant to safeguards
 */
interface MessageFrontmatter {
  from?: string;
  [key: string]: unknown;
}

/**
 * Check if a message is a self-reply (from the same persona)
 *
 * Parses the from: field from message frontmatter and compares it
 * against the target persona name. Returns true if the message
 * should be skipped (i.e., it's from the same persona).
 *
 * Fails open: if the from field can't be parsed or is missing,
 * the message is NOT skipped to avoid dropping legitimate messages.
 *
 * @param messageContent - The raw message content (may include frontmatter)
 * @param personaName - The name of the target persona (without @ prefix)
 * @returns true if the message should be skipped (self-reply)
 */
export function isSelfReply(
  messageContent: string,
  personaName: string
): boolean {
  // Can't parse frontmatter -> fail open (don't skip)
  if (!hasFrontmatter(messageContent)) {
    return false;
  }

  try {
    const { frontmatter } = parseFrontmatter<MessageFrontmatter>(messageContent);

    // Missing from field -> fail open (don't skip)
    if (!frontmatter.from) {
      return false;
    }

    const from = frontmatter.from;

    // The from field can be in various formats:
    // - "agent:persona-name" (agent sender)
    // - "@persona-name" (DM address format)
    // - "human:username" (human sender)
    // - Just "persona-name" (simple format)

    // Normalize the from field - extract the persona name
    let senderName = from;

    // Strip agent: prefix
    if (senderName.startsWith("agent:")) {
      senderName = senderName.slice(6);
    }

    // Strip @ prefix
    if (senderName.startsWith("@")) {
      senderName = senderName.slice(1);
    }

    // Compare normalized sender to target persona
    return senderName === personaName;
  } catch {
    // Parse error -> fail open (don't skip)
    return false;
  }
}

/**
 * Rate limiter for persona invocations
 *
 * Tracks invocations per persona with a sliding window.
 * In-memory state - resets on daemon restart.
 */
export class RateLimiter {
  /** Map of persona name -> list of invocation timestamps */
  private invocations: Map<string, number[]> = new Map();

  /**
   * Create a new rate limiter
   *
   * @param maxInvocations - Maximum invocations per window (default: 5)
   * @param windowMs - Time window in milliseconds (default: 60000 = 1 minute)
   */
  constructor(
    private maxInvocations: number = 5,
    private windowMs: number = 60_000
  ) {}

  /**
   * Check if an invocation should be allowed for a persona
   *
   * @param personaName - The persona to check
   * @returns true if the invocation should be allowed, false if rate limited
   */
  isAllowed(personaName: string): boolean {
    const now = Date.now();
    const timestamps = this.invocations.get(personaName) ?? [];

    // Filter to only timestamps within the window
    const windowStart = now - this.windowMs;
    const recentTimestamps = timestamps.filter((ts) => ts > windowStart);

    // Check if under limit
    return recentTimestamps.length < this.maxInvocations;
  }

  /**
   * Record an invocation for a persona
   *
   * Should be called when an invocation is actually made (after isAllowed check passes).
   *
   * @param personaName - The persona being invoked
   */
  recordInvocation(personaName: string): void {
    const now = Date.now();
    const timestamps = this.invocations.get(personaName) ?? [];

    // Clean up old timestamps and add new one
    const windowStart = now - this.windowMs;
    const recentTimestamps = timestamps.filter((ts) => ts > windowStart);
    recentTimestamps.push(now);

    this.invocations.set(personaName, recentTimestamps);
  }

  /**
   * Check if allowed and record in one operation
   *
   * @param personaName - The persona to check
   * @returns true if the invocation was allowed and recorded, false if rate limited
   */
  tryInvoke(personaName: string): boolean {
    if (!this.isAllowed(personaName)) {
      return false;
    }
    this.recordInvocation(personaName);
    return true;
  }

  /**
   * Get current invocation count for a persona within the window
   *
   * @param personaName - The persona to check
   * @returns Number of recent invocations
   */
  getInvocationCount(personaName: string): number {
    const now = Date.now();
    const timestamps = this.invocations.get(personaName) ?? [];
    const windowStart = now - this.windowMs;
    return timestamps.filter((ts) => ts > windowStart).length;
  }

  /**
   * Reset all rate limiting state (for testing)
   */
  reset(): void {
    this.invocations.clear();
  }
}
