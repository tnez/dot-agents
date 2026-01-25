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

/**
 * Circuit breaker for daemon-wide failure protection
 *
 * Tracks consecutive failures across all executions. When failures exceed
 * a threshold within a time window, the breaker "trips" and blocks new
 * executions until a cooldown period passes.
 *
 * This protects against cascading failures, external service outages,
 * and unforeseen doom loops that bypass other safeguards.
 */
export class CircuitBreaker {
  /** Timestamps of recent failures */
  private failures: number[] = [];
  /** Whether the breaker is currently tripped */
  private tripped: boolean = false;
  /** When the breaker was tripped (for cooldown calculation) */
  private trippedAt: number | null = null;

  /**
   * Create a new circuit breaker
   *
   * @param failureThreshold - Number of failures to trigger trip (default: 10)
   * @param windowMs - Time window for counting failures (default: 60000 = 1 minute)
   * @param cooldownMs - Time before auto-reset after trip (default: 300000 = 5 minutes)
   */
  constructor(
    private failureThreshold: number = 10,
    private windowMs: number = 60_000,
    private cooldownMs: number = 300_000
  ) {}

  /**
   * Record a failure
   *
   * Adds the failure to the tracking window and checks if the breaker should trip.
   */
  recordFailure(): void {
    const now = Date.now();
    this.failures.push(now);

    // Clean old failures outside the window
    const windowStart = now - this.windowMs;
    this.failures = this.failures.filter((ts) => ts > windowStart);

    // Check if we should trip
    if (!this.tripped && this.failures.length >= this.failureThreshold) {
      this.tripped = true;
      this.trippedAt = now;
      console.error(
        `[circuit-breaker] TRIPPED: ${this.failures.length} failures in ${this.windowMs / 1000}s. ` +
          `Blocking executions for ${this.cooldownMs / 1000}s.`
      );
    }
  }

  /**
   * Record a success
   *
   * Clears the failure count on success (indicates system is healthy).
   */
  recordSuccess(): void {
    this.failures = [];
  }

  /**
   * Check if the breaker is currently tripped
   *
   * Also handles auto-reset after cooldown period.
   *
   * @returns true if executions should be blocked
   */
  isTripped(): boolean {
    if (!this.tripped) {
      return false;
    }

    // Check if cooldown has passed
    const now = Date.now();
    if (this.trippedAt && now - this.trippedAt >= this.cooldownMs) {
      console.log(
        `[circuit-breaker] Auto-reset after ${this.cooldownMs / 1000}s cooldown. Allowing executions.`
      );
      this.reset();
      return false;
    }

    return true;
  }

  /**
   * Get time remaining until auto-reset (in seconds)
   *
   * @returns Seconds until reset, or 0 if not tripped
   */
  getTimeUntilReset(): number {
    if (!this.tripped || !this.trippedAt) {
      return 0;
    }
    const elapsed = Date.now() - this.trippedAt;
    const remaining = this.cooldownMs - elapsed;
    return Math.max(0, Math.ceil(remaining / 1000));
  }

  /**
   * Manually reset the breaker
   */
  reset(): void {
    this.tripped = false;
    this.trippedAt = null;
    this.failures = [];
  }

  /**
   * Get current state for status reporting
   */
  getState(): {
    tripped: boolean;
    failureCount: number;
    timeUntilReset: number;
  } {
    // Clean old failures for accurate count
    const now = Date.now();
    const windowStart = now - this.windowMs;
    this.failures = this.failures.filter((ts) => ts > windowStart);

    return {
      tripped: this.tripped,
      failureCount: this.failures.length,
      timeUntilReset: this.getTimeUntilReset(),
    };
  }
}
