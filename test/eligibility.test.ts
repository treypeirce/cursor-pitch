import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { determineEligibility, type Policy } from "../src/eligibility.ts";

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

  it("denies a pre-2010 policy cancelled for fraud before grandfathering applies", () => {
    const result = determineEligibility(
      policy({
        issueYear: 2008,
        status: "CANCELLED",
        cancelReason: "FRAUD",
      }),
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
