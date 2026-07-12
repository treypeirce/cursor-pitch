import incident from "../fixtures/reported-policy.json" with { type: "json" };
import { determineEligibility, type Policy } from "./eligibility.ts";

const decision = determineEligibility(incident.policy as Policy);

console.log(
  JSON.stringify(
    {
      incidentId: incident.incidentId,
      policyId: incident.policy.policyId,
      expected: incident.expectedDecision,
      actual: decision.code,
      matchesExpected: decision.code === incident.expectedDecision,
      reason: decision.reason,
    },
    null,
    2,
  ),
);

if (decision.code !== incident.expectedDecision) {
  process.exitCode = 1;
}
