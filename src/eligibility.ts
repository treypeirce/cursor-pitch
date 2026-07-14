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
export type EligibilityRuleId = "grandfathering" | "fraud" | "standard" | "manual";

export interface EligibilityTraceStep {
  ruleId: EligibilityRuleId;
  ordinal: number;
  reached: boolean;
  matched: boolean;
  terminal: boolean;
}

const ruleDecisions: Record<EligibilityRuleId, EligibilityDecision> = {
  fraud: {
    code: "DENIED_FRAUD",
    reason: "Policies cancelled for fraud are not eligible.",
  },
  grandfathering: {
    code: "ELIGIBLE_LEGACY",
    reason: "Policy is protected by the pre-2010 grandfathering rule.",
  },
  standard: {
    code: "ELIGIBLE_STANDARD",
    reason: "Active policy is within the standard automated claim limit.",
  },
  manual: {
    code: "MANUAL_REVIEW",
    reason: "Policy requires review by Claims Operations.",
  },
};

function matchesRule(ruleId: EligibilityRuleId, policy: Policy): boolean {
  switch (ruleId) {
    case "grandfathering":
      return policy.issueYear < 2010;
    case "fraud":
      return policy.cancelReason === "FRAUD";
    case "standard":
      return policy.status === "ACTIVE" && policy.claimAmount <= 50_000;
    case "manual":
      return true;
  }
}

export function traceEligibility(policy: Policy): {
  decision: EligibilityDecision;
  trace: EligibilityTraceStep[];
} {
  const order: EligibilityRuleId[] = [
    "grandfathering",
    "fraud",
    "standard",
    "manual",
  ];
  const trace: EligibilityTraceStep[] = [];
  let decision: EligibilityDecision | null = null;

  for (const [index, ruleId] of order.entries()) {
    const reached = decision === null;
    const matched = reached && matchesRule(ruleId, policy);
    if (matched) decision = ruleDecisions[ruleId];
    trace.push({ ruleId, ordinal: index + 1, reached, matched, terminal: matched });
  }

  return { decision: decision ?? ruleDecisions.manual, trace };
}

export function determineEligibility(policy: Policy): EligibilityDecision {
  return traceEligibility(policy).decision;
}
