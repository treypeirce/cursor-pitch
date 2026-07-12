# Slack demo scenario

Use a private demonstration channel containing only fictional information.

## Seed conversation

**Claims Operations**

> We found policy POL-2008-0042 in the overnight exception report. It was cancelled for fraud but the new service marked it eligible under the legacy rule. Can engineering confirm whether the modernization changed the decision order?

**Product Manager**

> The original contract says fraud should override grandfathering. Please preserve the pre-2010 rule for legitimate policies and return test evidence before anyone merges a fix.

**Platform Engineer**

> Use the sanitized incident fixture already in the repository. Open a draft PR only; production deployment still requires review.

## Cursor invocation

```text
@Cursor repo=treypeirce/meridian-policy-platform investigate this thread, compare the modern TypeScript behavior with the COBOL source of truth, add a failing parity test, implement the smallest safe fix, run all verification commands, and open a draft PR. Do not modify the legacy source or merge anything.
```

## Mobile follow-up

```text
Before finalizing the PR, confirm that a legitimate active pre-2010 policy remains eligible and include both test results in the review evidence.
```

## Expected result

- Root cause identifies the incorrect condition order.
- A new test covers pre-2010 plus fraud.
- Existing grandfathering behavior remains intact.
- `npm run verify` and `npm run demo:incident` pass.
- The agent opens a draft pull request and leaves merge ownership with a human.
