# Policy eligibility rules

Meridian's policy platform must preserve the following decision order:

1. A policy cancelled for fraud is never eligible for automated claims processing.
2. If the fraud rule does not apply, policies issued before 2010 are grandfathered and remain eligible under the legacy contract.
3. Other active policies with a claim amount of $50,000 or less are eligible for standard processing.
4. Remaining cases require manual review.

The order matters. Fraud is an explicit override and must be evaluated before grandfathering.

The COBOL module in `legacy/POLICY-ELIGIBILITY.cbl` is the authoritative executable specification for the legacy behavior. The TypeScript service in `src/eligibility.ts` is the modernization target.
