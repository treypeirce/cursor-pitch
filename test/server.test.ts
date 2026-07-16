import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { createAppServer } from "../src/server.ts";

const server = createAppServer();
let baseUrl = "";

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe("Policy Eligibility Console", () => {
  it("serves the visual console", async () => {
    const response = await fetch(baseUrl);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /Policy Eligibility Console/);
  });

  it("reports restored parity for the seeded incident", async () => {
    const response = await fetch(`${baseUrl}/api/incident`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.parity.expected, "DENIED_FRAUD");
    assert.equal(body.parity.actual, "DENIED_FRAUD");
    assert.equal(body.parity.matchesExpected, true);
    assert.deepEqual(body.decisionOrder.legacy.slice(0, 2), [
      "Fraud cancellation override",
      "Pre-2010 grandfathering",
    ]);
    assert.deepEqual(body.decisionOrder.modern.slice(0, 2), [
      "Fraud cancellation override",
      "Pre-2010 grandfathering",
    ]);
  });

  it("evaluates an ad hoc policy using the real TypeScript function", async () => {
    const response = await fetch(`${baseUrl}/api/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policy: {
          policyId: "POL-2026-0091",
          issueYear: 2026,
          status: "ACTIVE",
          cancelReason: null,
          claimAmount: 25_000,
        },
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.decision.code, "ELIGIBLE_STANDARD");
  });

  it("rejects malformed policy input", async () => {
    const response = await fetch(`${baseUrl}/api/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy: { policyId: "incomplete" } }),
    });

    assert.equal(response.status, 400);
  });
});


