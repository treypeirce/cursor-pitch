import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const legacySource = await readFile(
  new URL("../legacy/POLICY-ELIGIBILITY.cbl", import.meta.url),
  "utf8",
);

describe("legacy reference contract", () => {
  it("checks the fraud override before grandfathering", () => {
    const fraudCheck = legacySource.indexOf('WS-CANCEL-REASON = "FRAUD"');
    const grandfatheringCheck = legacySource.indexOf("WS-ISSUE-YEAR < 2010");

    assert.ok(fraudCheck >= 0);
    assert.ok(grandfatheringCheck >= 0);
    assert.ok(fraudCheck < grandfatheringCheck);
  });

  it("uses the canonical external decision codes", () => {
    for (const code of [
      "DENIED_FRAUD",
      "ELIGIBLE_LEGACY",
      "ELIGIBLE_STANDARD",
      "MANUAL_REVIEW",
    ]) {
      assert.match(legacySource, new RegExp(`MOVE "${code}"`));
    }
  });
});
