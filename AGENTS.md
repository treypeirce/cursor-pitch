# Meridian Policy Platform agent guidance

## Mission

Preserve Meridian's insurance contract behavior while modernizing it into maintainable TypeScript. Optimize for correct, reviewable outcomes rather than large code changes.

## Source of truth

- `legacy/POLICY-ELIGIBILITY.cbl` is the authoritative reference implementation and business-rule source.
- `docs/business-rules.md` is the plain-English explanation.
- `fixtures/reported-policy.json` is a sanitized incident report, not a complete specification.
- Existing TypeScript behavior may be incomplete or wrong.

## Required decision order

1. Fraud cancellation overrides every eligibility rule.
2. If fraud does not apply, policies issued before 2010 are grandfathered.
3. Other active policies at or below $50,000 use standard processing.
4. Remaining cases require manual review.

## Required workflow

1. Explain the relevant business rule and cite the COBOL lines before editing.
2. State the suspected parity gap and propose a short plan.
3. Add or update a characterization test that fails on the current implementation.
4. Make the smallest implementation change that restores parity.
5. Run `npm run verify` and `npm run demo:incident`.
6. Summarize the changed behavior, evidence, residual risk, and required human decision.

Use the `modernize-policy-rule` skill for legacy-rule incidents or modernization work.

## Guardrails

- Do not delete or rewrite files under `legacy/`.
- Do not weaken existing tests to make a change pass.
- Do not add production credentials, customer data, or external network dependencies.
- Do not merge pull requests. Open a draft PR and leave the merge decision to a human.
- If the COBOL and written documentation disagree, stop and ask for human clarification.

## Verification commands

```bash
npm run verify
npm run demo:incident
```

## Cursor Cloud-specific instructions

- Install dependencies with `npm ci`.
- Work on a separate branch.
- Include test output and the incident reproduction result in the pull-request description.
- Start the console with `npm start`; when browser tools are available, attach a screenshot showing the parity state.
- Use the repository's project hooks once the writable environment is active.
nment is active.
