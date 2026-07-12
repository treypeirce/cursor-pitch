# Meridian Policy Platform

A deliberately small insurance monolith for demonstrating safe legacy modernization with Cursor.

The repository contains a readable COBOL policy rule, a modern TypeScript implementation, fast tests, Cursor guidance, a reusable modernization skill, a deterministic safety hook, and CI. It is designed to power one clear demo:

**Slack discussion → Cursor Cloud Agent → mobile follow-up → tested pull request → Bugbot review → human merge decision**

## Scenario

Claims Operations reports that a pre-2010 policy cancelled for fraud was incorrectly marked eligible. The TypeScript service currently checks the grandfathering rule before the fraud override. The COBOL reference checks fraud first.

This is an intentional, contained regression for demonstration purposes.

## Repository map

- `legacy/POLICY-ELIGIBILITY.cbl` — authoritative legacy behavior
- `src/eligibility.ts` — modernization target with the intentional regression
- `fixtures/reported-policy.json` — sanitized incident example
- `test/eligibility.test.ts` — current regression suite
- `docs/business-rules.md` — plain-English decision order
- `AGENTS.md` — durable repository instructions for agents
- `.cursor/skills/modernize-policy-rule/SKILL.md` — reusable modernization workflow
- `.cursor/hooks.json` — project hook configuration
- `.cursor/hooks/` — tested guards for shell and file-tool changes against the legacy source
- `.cursor/environment.json` and `.cursor/Dockerfile` — pinned Node 24 Cloud Agent environment
- `.github/workflows/ci.yml` — pull-request verification

## Run locally

```bash
npm ci
npm run verify
```

The existing unit tests and syntax checks pass on the baseline. That is intentional: they demonstrate the current coverage gap. The project uses Node 24's built-in TypeScript support and test runner, so Cloud Agents do not need to download third-party packages.

To reproduce the reported incident:

```bash
npm run demo:incident
```

That command exits unsuccessfully until the missing parity test and implementation fix are added.

## Expected agent outcome

A successful agent should:

1. Read the Slack thread and sanitized incident fixture.
2. Compare the TypeScript decision order with the COBOL reference.
3. Explain the root cause before editing code.
4. Add a failing parity test for a pre-2010 policy cancelled for fraud.
5. Correct the TypeScript decision order without deleting grandfathering behavior.
6. Run `npm run verify` and `npm run demo:incident`.
7. Open a draft pull request with test evidence, risk notes, and a human merge recommendation.

## Safety

This repository is a fictional training fixture. It contains no customer data or production credentials. The legacy source is treated as evidence and must not be deleted or rewritten during the demonstration.

The project hooks and CODEOWNERS file demonstrate layered controls; they do not replace repository permissions, branch protection, required CI, or human review in a real deployment.
