import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { determineEligibility, traceEligibility, type Policy } from "../src/eligibility.ts";

function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    policyId: "POL-DEFAULT",
    issueYear: 2024,
    status: "ACTIVE",
    cancelReason: null,
    claimAmount: 10_000,
    ...overrides,
  };
}

describe("determineEligibility", () => {
  it("grandfathers an active policy issued before 2010", () => {
    const result = determineEligibility(policy({ issueYear: 2008 }));

    assert.equal(result.code, "ELIGIBLE_LEGACY");
  });

  it("emits a coherent executable trace for the competing-rule incident", () => {
    const incident = policy({ issueYear: 2008, status: "CANCELLED", cancelReason: "FRAUD" });
    const result = traceEligibility(incident);
    const terminalIndex = result.trace.findIndex((step) => step.terminal);

    assert.equal(result.decision.code, determineEligibility(incident).code);
    assert.ok(terminalIndex >= 0);
    assert.equal(result.trace.filter((step) => step.terminal).length, 1);
    assert.ok(result.trace.slice(terminalIndex + 1).every((step) => !step.reached && !step.matched));
    assert.equal(new Set(result.trace.map((step) => step.ruleId)).size, 4);
  });

  it("approves a current active policy within the standard limit", () => {
    const result = determineEligibility(policy({ claimAmount: 49_999 }));

    assert.equal(result.code, "ELIGIBLE_STANDARD");
  });

  it("sends a high-value claim to manual review", () => {
    const result = determineEligibility(policy({ claimAmount: 75_000 }));

    assert.equal(result.code, "MANUAL_REVIEW");
  });

  it("denies a current policy cancelled for fraud", () => {
    const result = determineEligibility(
      policy({ status: "CANCELLED", cancelReason: "FRAUD" }),
    );

    assert.equal(result.code, "DENIED_FRAUD");
  });

  it("sends a customer-cancelled current policy to manual review", () => {
    const result = determineEligibility(
      policy({ status: "CANCELLED", cancelReason: "CUSTOMER_REQUEST" }),
    );

    assert.equal(result.code, "MANUAL_REVIEW");
  });

  it("treats 2010 as the first year outside grandfathering", () => {
    const result = determineEligibility(policy({ issueYear: 2010 }));

    assert.equal(result.code, "ELIGIBLE_STANDARD");
  });

  it("includes a claim of exactly $50,000 in standard processing", () => {
    const result = determineEligibility(policy({ claimAmount: 50_000 }));

    assert.equal(result.code, "ELIGIBLE_STANDARD");
  });

  it("preserves grandfathering for a pre-2010 non-fraud cancellation", () => {
    const result = determineEligibility(
      policy({
        issueYear: 2008,
        status: "CANCELLED",
        cancelReason: "CUSTOMER_REQUEST",
      }),
    );

    assert.equal(result.code, "ELIGIBLE_LEGACY");
  });
});
