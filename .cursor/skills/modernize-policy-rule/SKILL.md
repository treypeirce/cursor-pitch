---
name: modernize-policy-rule
description: Preserve and modernize legacy insurance policy rules using source comparison, characterization tests, minimal implementation changes, and explicit human review. Use for eligibility incidents, COBOL-to-TypeScript work, or suspected parity gaps.
---

# Modernize a policy rule safely

Treat modernization as knowledge recovery before code generation.

## Workflow

1. Read the reported business impact and identify the smallest affected rule.
2. Inspect the relevant COBOL paragraph and the modern implementation.
3. Translate both behaviors into a short decision table.
4. Identify any difference in condition order, data meaning, or edge-case handling.
5. Propose a concise plan and name the human decision that remains.
6. Add a characterization test that fails before the fix.
7. Make the smallest change required to restore parity.
8. Run the full verification commands.
9. Produce a review package containing:
   - root cause
   - business behavior preserved
   - files changed
   - failing-then-passing test evidence
   - residual risks or unknowns
   - explicit recommendation for human review

## Quality bar

- Never infer a legacy rule from variable names alone.
- Cite the source lines or paragraph that supports the conclusion.
- Fraud, compliance, and cancellation overrides must be tested independently from grandfathering rules.
- Do not delete the legacy source or bypass the verification suite.
- Stop and escalate when source evidence conflicts.
