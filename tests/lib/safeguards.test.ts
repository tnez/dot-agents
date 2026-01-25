import { describe, it, beforeEach } from "vitest";
import assert from "node:assert";
import { isSelfReply, RateLimiter, CircuitBreaker } from "../../src/daemon/lib/safeguards.js";

describe("isSelfReply", () => {
  describe("self-reply detection", () => {
    it("returns true when from field matches persona (agent: prefix)", () => {
      const message = `---
from: agent:test-persona
---

Hello world`;

      const result = isSelfReply(message, "test-persona");
      assert.strictEqual(result, true);
    });

    it("returns true when from field matches persona (@ prefix)", () => {
      const message = `---
from: "@test-persona"
---

Hello world`;

      const result = isSelfReply(message, "test-persona");
      assert.strictEqual(result, true);
    });

    it("returns true when from field matches persona (simple name)", () => {
      const message = `---
from: test-persona
---

Hello world`;

      const result = isSelfReply(message, "test-persona");
      assert.strictEqual(result, true);
    });
  });

  describe("non-matching from field", () => {
    it("returns false when from field is different persona", () => {
      const message = `---
from: agent:other-persona
---

Hello world`;

      const result = isSelfReply(message, "test-persona");
      assert.strictEqual(result, false);
    });

    it("returns false when from field is human sender", () => {
      const message = `---
from: human:alice
---

Hello world`;

      const result = isSelfReply(message, "test-persona");
      assert.strictEqual(result, false);
    });
  });

  describe("fail open behavior", () => {
    it("returns false when frontmatter is missing", () => {
      const message = "Just plain text without frontmatter";

      const result = isSelfReply(message, "test-persona");
      assert.strictEqual(result, false);
    });

    it("returns false when from field is missing", () => {
      const message = `---
timestamp: 2024-01-01
---

Hello world`;

      const result = isSelfReply(message, "test-persona");
      assert.strictEqual(result, false);
    });

    it("returns false when frontmatter is malformed", () => {
      const message = `---
title: Test
Missing closing delimiter`;

      const result = isSelfReply(message, "test-persona");
      assert.strictEqual(result, false);
    });

    it("returns false when from field is empty", () => {
      const message = `---
from:
---

Hello world`;

      const result = isSelfReply(message, "test-persona");
      assert.strictEqual(result, false);
    });
  });
});

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(5, 60_000);
  });

  describe("basic rate limiting", () => {
    it("allows invocations under the limit", () => {
      assert.strictEqual(limiter.isAllowed("persona-a"), true);
      limiter.recordInvocation("persona-a");

      assert.strictEqual(limiter.isAllowed("persona-a"), true);
      limiter.recordInvocation("persona-a");

      assert.strictEqual(limiter.getInvocationCount("persona-a"), 2);
    });

    it("blocks invocations at the limit", () => {
      // Record 5 invocations
      for (let i = 0; i < 5; i++) {
        assert.strictEqual(limiter.isAllowed("persona-a"), true);
        limiter.recordInvocation("persona-a");
      }

      // 6th should be blocked
      assert.strictEqual(limiter.isAllowed("persona-a"), false);
      assert.strictEqual(limiter.getInvocationCount("persona-a"), 5);
    });

    it("tracks personas independently", () => {
      // Fill up persona-a
      for (let i = 0; i < 5; i++) {
        limiter.recordInvocation("persona-a");
      }

      // persona-a should be blocked
      assert.strictEqual(limiter.isAllowed("persona-a"), false);

      // persona-b should still be allowed
      assert.strictEqual(limiter.isAllowed("persona-b"), true);
      assert.strictEqual(limiter.getInvocationCount("persona-b"), 0);
    });
  });

  describe("tryInvoke convenience method", () => {
    it("allows and records when under limit", () => {
      const result = limiter.tryInvoke("persona-a");

      assert.strictEqual(result, true);
      assert.strictEqual(limiter.getInvocationCount("persona-a"), 1);
    });

    it("returns false and does not record when at limit", () => {
      // Fill up the limit
      for (let i = 0; i < 5; i++) {
        limiter.recordInvocation("persona-a");
      }

      const result = limiter.tryInvoke("persona-a");

      assert.strictEqual(result, false);
      // Count should still be 5, not 6
      assert.strictEqual(limiter.getInvocationCount("persona-a"), 5);
    });
  });

  describe("sliding window", () => {
    it("expires old invocations outside the window", async () => {
      // Use a short window for testing
      const shortLimiter = new RateLimiter(2, 50);

      shortLimiter.recordInvocation("persona-a");
      shortLimiter.recordInvocation("persona-a");

      // At limit
      assert.strictEqual(shortLimiter.isAllowed("persona-a"), false);

      // Wait for window to pass
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Should be allowed again after window expires
      assert.strictEqual(shortLimiter.isAllowed("persona-a"), true);
      assert.strictEqual(shortLimiter.getInvocationCount("persona-a"), 0);
    });
  });

  describe("reset", () => {
    it("clears all rate limiting state", () => {
      limiter.recordInvocation("persona-a");
      limiter.recordInvocation("persona-b");

      assert.strictEqual(limiter.getInvocationCount("persona-a"), 1);
      assert.strictEqual(limiter.getInvocationCount("persona-b"), 1);

      limiter.reset();

      assert.strictEqual(limiter.getInvocationCount("persona-a"), 0);
      assert.strictEqual(limiter.getInvocationCount("persona-b"), 0);
    });
  });

  describe("edge cases", () => {
    it("returns 0 for unknown persona", () => {
      assert.strictEqual(limiter.getInvocationCount("unknown"), 0);
    });

    it("allows invocation for new persona", () => {
      assert.strictEqual(limiter.isAllowed("new-persona"), true);
    });
  });
});

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    // Low thresholds for testing: 3 failures in 1 second, 100ms cooldown
    breaker = new CircuitBreaker(3, 1000, 100);
  });

  describe("basic tripping", () => {
    it("starts in non-tripped state", () => {
      assert.strictEqual(breaker.isTripped(), false);
      assert.strictEqual(breaker.getState().tripped, false);
    });

    it("does not trip below threshold", () => {
      breaker.recordFailure();
      breaker.recordFailure();

      assert.strictEqual(breaker.isTripped(), false);
      assert.strictEqual(breaker.getState().failureCount, 2);
    });

    it("trips at threshold", () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      assert.strictEqual(breaker.isTripped(), true);
      assert.strictEqual(breaker.getState().tripped, true);
    });
  });

  describe("success clears failures", () => {
    it("clears failure count on success", () => {
      breaker.recordFailure();
      breaker.recordFailure();

      assert.strictEqual(breaker.getState().failureCount, 2);

      breaker.recordSuccess();

      assert.strictEqual(breaker.getState().failureCount, 0);
    });

    it("prevents tripping if success occurs before threshold", () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordSuccess(); // Reset
      breaker.recordFailure();
      breaker.recordFailure();

      // Should not be tripped - only 2 consecutive failures after success
      assert.strictEqual(breaker.isTripped(), false);
    });
  });

  describe("auto-reset after cooldown", () => {
    it("auto-resets after cooldown period", async () => {
      // Trip the breaker
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      assert.strictEqual(breaker.isTripped(), true);

      // Wait for cooldown (100ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should auto-reset on next check
      assert.strictEqual(breaker.isTripped(), false);
      assert.strictEqual(breaker.getState().tripped, false);
    });
  });

  describe("manual reset", () => {
    it("reset clears tripped state", () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      assert.strictEqual(breaker.isTripped(), true);

      breaker.reset();

      assert.strictEqual(breaker.isTripped(), false);
      assert.strictEqual(breaker.getState().failureCount, 0);
    });
  });

  describe("sliding window", () => {
    it("failures outside window are not counted", async () => {
      // Use breaker with 100ms window
      const shortBreaker = new CircuitBreaker(3, 100, 1000);

      shortBreaker.recordFailure();
      shortBreaker.recordFailure();

      // Wait for failures to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Add one more failure - should only have 1 failure now
      shortBreaker.recordFailure();

      assert.strictEqual(shortBreaker.isTripped(), false);
      assert.strictEqual(shortBreaker.getState().failureCount, 1);
    });
  });

  describe("getState", () => {
    it("returns complete state", () => {
      breaker.recordFailure();
      breaker.recordFailure();

      const state = breaker.getState();

      assert.strictEqual(state.tripped, false);
      assert.strictEqual(state.failureCount, 2);
      assert.strictEqual(state.timeUntilReset, 0);
    });

    it("includes timeUntilReset when tripped", () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      const state = breaker.getState();

      assert.strictEqual(state.tripped, true);
      assert.ok(state.timeUntilReset > 0);
    });
  });
});
