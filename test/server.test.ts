import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { createAppServer } from "../src/server.ts";

const server = createAppServer();
const legacySourceUrl = new URL("../legacy/POLICY-ELIGIBILITY.cbl", import.meta.url);
const modernSourceUrl = new URL("../src/eligibility.ts", import.meta.url);
const reportedSourceUrl = new URL("../fixtures/reported-eligibility.ts", import.meta.url);
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

function postInChunks(chunks: Buffer[]): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL("/api/evaluate", baseUrl);
    const request = httpRequest({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }, (response) => {
      const responseChunks: Buffer[] = [];
      response.on("data", (chunk) => responseChunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({
        status: response.statusCode ?? 0,
        body: Buffer.concat(responseChunks).toString("utf8"),
      }));
    });
    request.on("error", reject);
    for (const chunk of chunks) request.write(chunk);
    request.end();
  });
}

describe("Policy Eligibility Console", () => {
  it("serves the visual console", async () => {
    const response = await fetch(baseUrl);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /source comparison/i);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'self'/);
  });

  it("preserves the reported snapshot while evaluating the current branch", async () => {
    const response = await fetch(`${baseUrl}/api/incident`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.reference.decision, "DENIED_FRAUD");
    assert.equal(body.reported.decision, "ELIGIBLE_LEGACY");
    assert.deepEqual(body.reference.order.slice(0, 2), ["fraud", "grandfathering"]);
    assert.deepEqual(body.reported.order.slice(0, 2), ["grandfathering", "fraud"]);
    assert.equal(body.parity.actual, body.current.decision);
    assert.equal(body.parity.matchesExpected, body.current.decision === body.reference.decision);
    assert.deepEqual(body.current.order, body.current.trace.map((step: { ruleId: string }) => step.ruleId));
    assert.ok(body.reference.code.some((line: { text: string }) => line.text.includes('WS-CANCEL-REASON = "FRAUD"')));
    assert.ok(body.reported.code.some((line: { text: string }) => line.text.includes("policy.issueYear < 2010")));
    assert.ok(body.current.code.some((line: { text: string }) => line.text.includes(body.current.order[0])));
    assert.equal(body.reported.sourceCommit, "314b8fc5333bc44eb8149bf955469fc4f66022a9");
    assert.equal(body.reported.sourceSha256, "498224a66ad533258f71795f0437c980b1d36c363791c8c84239fd7af1d34979");
    assert.equal(body.controls.productionStatus, "Demo policy · no merge or deployment performed here");
    assert.equal(body.controls.legacySourceChanged, false);
    assert.equal(body.reference.sha256, "3b3a2f4f6a485e2297755bb6185c860396015073cec0cc65e03e71b28aa04b84");
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

  it("rejects invalid JSON without exposing an internal error", async () => {
    const response = await fetch(`${baseUrl}/api/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, "Request body must be valid JSON");
  });

  it("rejects a null request envelope as a client error", async () => {
    const response = await fetch(`${baseUrl}/api/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "null",
    });
    assert.equal(response.status, 400);
  });

  it("returns 413 for request bodies over the byte limit", async () => {
    const response = await fetch(`${baseUrl}/api/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(100_001) }),
    });
    assert.equal(response.status, 413);
  });

  it("decodes a multi-byte policy ID split across request chunks", async () => {
    const payload = Buffer.from(JSON.stringify({
      policy: {
        policyId: "POL-😀-2026",
        issueYear: 2026,
        status: "ACTIVE",
        cancelReason: null,
        claimAmount: 25_000,
      },
    }));
    const emoji = Buffer.from("😀");
    const emojiStart = payload.indexOf(emoji);
    assert.ok(emojiStart > 0);
    const result = await postInChunks([
      payload.subarray(0, emojiStart + 1),
      payload.subarray(emojiStart + 1),
    ]);

    assert.equal(result.status, 200);
    assert.equal(JSON.parse(result.body).decision.code, "ELIGIBLE_STANDARD");
  });

  it("rejects inconsistent or out-of-range policy input", async () => {
    const response = await fetch(`${baseUrl}/api/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policy: {
          policyId: "POL-INVALID",
          issueYear: 2026,
          status: "ACTIVE",
          cancelReason: "FRAUD",
          claimAmount: -1,
        },
      }),
    });

    assert.equal(response.status, 400);
  });

  it("fails incident verification closed when the pinned TypeScript snapshot changes", async () => {
    const original = await readFile(reportedSourceUrl, "utf8");
    try {
      await writeFile(reportedSourceUrl, original.replace("policy.issueYear < 2010", "policy.issueYear < 2009"));
      const response = await fetch(`${baseUrl}/api/incident`);
      assert.equal(response.status, 500);
    } finally {
      await writeFile(reportedSourceUrl, original);
    }
    assert.equal((await fetch(`${baseUrl}/api/incident`)).status, 200);
  });

  it("fails incident verification closed when the COBOL reference digest changes", async () => {
    const original = await readFile(legacySourceUrl, "utf8");
    try {
      await writeFile(legacySourceUrl, `${original}\n      * temporary drift`);
      const response = await fetch(`${baseUrl}/api/incident`);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: "Unexpected server error" });
    } finally {
      await writeFile(legacySourceUrl, original);
    }
    assert.equal((await fetch(`${baseUrl}/api/incident`)).status, 200);
  });

  it("requires a restart when the loaded TypeScript source changes", async () => {
    const original = await readFile(modernSourceUrl, "utf8");
    try {
      await writeFile(modernSourceUrl, `${original}\n// temporary drift`);
      const response = await fetch(`${baseUrl}/api/incident`);
      assert.equal(response.status, 500);
    } finally {
      await writeFile(modernSourceUrl, original);
    }
    assert.equal((await fetch(`${baseUrl}/api/incident`)).status, 200);
  });

  it("serves only the explicit public asset allowlist", async () => {
    const response = await fetch(`${baseUrl}/package.json`);
    assert.equal(response.status, 404);
  });
});
