export type PolicyStatus = "ACTIVE" | "CANCELLED";
export type CancelReason = "FRAUD" | "CUSTOMER_REQUEST" | null;

export interface Policy {
  policyId: string;
  issueYear: number;
  status: PolicyStatus;
  cancelReason: CancelReason;
  claimAmount: number;
}

export type EligibilityCode =
  | "ELIGIBLE_LEGACY"
  | "ELIGIBLE_STANDARD"
  | "DENIED_FRAUD"
  | "MANUAL_REVIEW";

export interface EligibilityDecision {
  code: EligibilityCode;
  reason: string;
}

/**
 * Modern TypeScript implementation of Meridian's policy eligibility rules.
 *
 * The COBOL program in legacy/POLICY-ELIGIBILITY.cbl remains the source of
 * truth while this modernization is under evaluation.
 */
export function determineEligibility(policy: Policy): EligibilityDecision {
  // Grandfather policies issued before the 2010 contract change.
  if (policy.issueYear < 2010) {
    return {
      code: "ELIGIBLE_LEGACY",
      reason: "Policy is protected by the pre-2010 grandfathering rule.",
    };
  }

  if (policy.cancelReason === "FRAUD") {
    return {
      code: "DENIED_FRAUD",
      reason: "Policies cancelled for fraud are not eligible.",
    };
  }

  if (policy.status === "ACTIVE" && policy.claimAmount <= 50_000) {
    return {
      code: "ELIGIBLE_STANDARD",
      reason: "Active policy is within the standard automated claim limit.",
    };
  }

  return {
    code: "MANUAL_REVIEW",
    reason: "Policy requires review by Claims Operations.",
  };
}
