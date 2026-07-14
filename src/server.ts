import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import reportedEligibility from "../fixtures/reported-eligibility.json" with { type: "json" };
import incident from "../fixtures/reported-policy.json" with { type: "json" };
import {
  determineEligibility,
  traceEligibility,
  traceEligibilityOrder,
  type EligibilityRuleId,
  type Policy,
} from "./eligibility.ts";

const rootDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicDirectory = resolve(rootDirectory, "public");
const loadedModernSourceSha256 = sha256(readFileSync(resolve(rootDirectory, "src/eligibility.ts"), "utf8"));

const staticAssets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
]);

const securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

const ruleDefinitions = {
  fraud: { label: "Cancelled for fraud?", shortLabel: "Fraud override" },
  grandfathering: { label: "Issued before 2010?", shortLabel: "Grandfathering" },
  standard: { label: "Active and within $50k?", shortLabel: "Standard eligibility" },
  manual: { label: "Otherwise route to review", shortLabel: "Manual review" },
} as const;

type RuleId = EligibilityRuleId;
type DecisionOrder = RuleId[];

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    ...securityHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function sourceOrder(source: string, implementation: "legacy" | "modern"): DecisionOrder {
  const patterns: Array<[RuleId, RegExp]> = implementation === "legacy"
    ? [
        ["fraud", /WS-CANCEL-REASON\s*=\s*"FRAUD"/],
        ["grandfathering", /WS-ISSUE-YEAR\s*<\s*2010/],
        ["standard", /WS-STATUS\s*=\s*"ACTIVE"/],
        ["manual", /MOVE\s+"MANUAL_REVIEW"/],
      ]
    : [
        ["fraud", /policy\.cancelReason\s*===\s*"FRAUD"/],
        ["grandfathering", /policy\.issueYear\s*<\s*2010/],
        ["standard", /policy\.status\s*===\s*"ACTIVE"/],
        ["manual", /code:\s*"MANUAL_REVIEW"/],
      ];

  return patterns
    .map(([ruleId, pattern]) => ({ ruleId, position: source.search(pattern) }))
    .filter(({ position }) => position >= 0)
    .sort((left, right) => left.position - right.position)
    .map(({ ruleId }) => ruleId);
}

function sourceLines(source: string, startIndex: number, count: number) {
  return source
    .split("\n")
    .slice(startIndex, startIndex + count)
    .map((text, offset) => ({ number: startIndex + offset + 1, text }));
}

function legacyPriorityExcerpt(source: string) {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line.includes('IF WS-CANCEL-REASON = "FRAUD"'));
  if (start < 0) throw new Error("COBOL priority excerpt could not be verified");
  return sourceLines(source, start, 5);
}

function currentOrderExcerpt(source: string) {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line.includes("const order: EligibilityRuleId[]"));
  if (start < 0) throw new Error("TypeScript order excerpt could not be verified");
  const end = lines.findIndex((line, index) => index >= start && line.trim() === "];");
  if (end < start + 3) throw new Error("TypeScript order excerpt is incomplete");
  return [
    ...sourceLines(source, start, 3),
    { number: null, text: "  // … standard and manual fallbacks unchanged" },
    ...sourceLines(source, end, 1),
  ];
}

function decorateTrace(trace: ReturnType<typeof traceEligibility>["trace"]) {
  return trace.map((step) => ({
    ...step,
    label: ruleDefinitions[step.ruleId].label,
    shortLabel: ruleDefinitions[step.ruleId].shortLabel,
  }));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertCompleteOrder(label: string, order: DecisionOrder): void {
  const required: RuleId[] = ["fraud", "grandfathering", "standard", "manual"];
  if (order.length !== required.length || new Set(order).size !== required.length || required.some((ruleId) => !order.includes(ruleId))) {
    throw new Error(`${label} rule order could not be verified`);
  }
}

async function incidentPayload() {
  const [legacySource, modernSource, reportedSource] = await Promise.all([
    readFile(resolve(rootDirectory, "legacy/POLICY-ELIGIBILITY.cbl"), "utf8"),
    readFile(resolve(rootDirectory, "src/eligibility.ts"), "utf8"),
    readFile(resolve(rootDirectory, "fixtures/reported-eligibility.ts"), "utf8"),
  ]);

  const policy = incident.policy as Policy;
  const currentEvaluation = traceEligibility(policy);
  const decision = currentEvaluation.decision;
  const referenceOrder = sourceOrder(legacySource, "legacy");
  const currentOrder = currentEvaluation.trace.map((step) => step.ruleId) as DecisionOrder;
  const reportedOrder = incident.observedDecisionOrder as DecisionOrder;
  const reportedCode = sourceLines(reportedSource, 28, 15);
  if (reportedEligibility.sourceCommit !== incident.sourceCommit || sha256(reportedSource) !== reportedEligibility.sha256) {
    throw new Error("Reported TypeScript snapshot provenance could not be verified");
  }
  if (JSON.stringify(reportedCode) !== JSON.stringify(reportedEligibility.lines)) {
    throw new Error("Reported TypeScript excerpt does not match its pinned source artifact");
  }
  assertCompleteOrder("COBOL reference", referenceOrder);
  assertCompleteOrder("Current TypeScript execution", currentOrder);
  assertCompleteOrder("Reported incident", reportedOrder);
  if (sha256(modernSource) !== loadedModernSourceSha256) {
    throw new Error("Current TypeScript source changed after server startup; restart before verifying");
  }
  const legacyReferenceSha256 = sha256(legacySource);
  if (legacyReferenceSha256 !== incident.legacyReferenceSha256) {
    throw new Error("COBOL reference digest changed; incident verification is unavailable");
  }
  const matchesExpected = decision.code === incident.expectedDecision;

  return {
    incident: {
      id: incident.incidentId,
      reportedBy: incident.reportedBy,
      customerImpact: incident.customerImpact,
      policy,
    },
    finding: {
      headline: matchesExpected
        ? "The modern service now preserves the fraud override."
        : "TypeScript approved a fraud-cancelled policy because it checked grandfathering first.",
      rootCause: matchesExpected
        ? "Fraud now appears before grandfathering in both reviewed rule orders."
        : "The same rules appear in both systems, but their priority is inverted.",
      requiredCorrection: "Restore fraud as the first override and preserve legitimate grandfathering.",
    },
    reference: {
      label: "Expected behavior",
      qualifier: "Inferred from reviewed COBOL source",
      file: "legacy/POLICY-ELIGIBILITY.cbl",
      decision: incident.expectedDecision,
      order: referenceOrder,
      trace: decorateTrace(traceEligibilityOrder(referenceOrder, policy).trace),
      code: legacyPriorityExcerpt(legacySource),
      sha256: legacyReferenceSha256,
    },
    reported: {
      label: "Incident snapshot",
      qualifier: "Reconstructed at the baseline commit",
      decision: incident.observedDecision,
      order: reportedOrder,
      trace: decorateTrace(traceEligibilityOrder(reportedOrder, policy).trace),
      code: reportedCode,
      file: reportedEligibility.file,
      sourceCommit: reportedEligibility.sourceCommit,
      sourceSha256: reportedEligibility.sha256,
      basis: "Exact excerpt captured from the baseline commit",
    },
    current: {
      label: "Current branch execution",
      qualifier: "Executed in this server process",
      file: "src/eligibility.ts",
      decision: decision.code,
      reason: decision.reason,
      order: currentOrder,
      trace: decorateTrace(currentEvaluation.trace),
      code: currentOrderExcerpt(modernSource),
      verifiedAt: new Date().toISOString(),
    },
    parity: {
      expected: incident.expectedDecision,
      actual: decision.code,
      matchesExpected,
      reason: decision.reason,
    },
    decisionOrder: {
      legacy: referenceOrder.map((ruleId) => ruleDefinitions[ruleId].shortLabel),
      modern: currentOrder.map((ruleId) => ruleDefinitions[ruleId].shortLabel),
    },
    controls: {
      legacySourceChanged: legacyReferenceSha256 !== incident.legacyReferenceSha256,
      legacyReferenceSha256,
      mergeOwner: "Human reviewer",
      productionStatus: "Demo policy · no merge or deployment performed here",
    },
  };
}

function isPolicy(value: unknown): value is Policy {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.policyId === "string" &&
    candidate.policyId.length > 0 &&
    candidate.policyId.length <= 100 &&
    typeof candidate.issueYear === "number" &&
    Number.isInteger(candidate.issueYear) &&
    candidate.issueYear >= 1900 &&
    candidate.issueYear <= 2100 &&
    (candidate.status === "ACTIVE" || candidate.status === "CANCELLED") &&
    (candidate.cancelReason === null ||
      candidate.cancelReason === "FRAUD" ||
      candidate.cancelReason === "CUSTOMER_REQUEST") &&
    typeof candidate.claimAmount === "number" &&
    Number.isFinite(candidate.claimAmount) &&
    candidate.claimAmount >= 0 &&
    candidate.claimAmount <= 100_000_000 &&
    !(candidate.status === "ACTIVE" && candidate.cancelReason !== null)
  );
}

async function readRequestBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > 100_000) {
      const error = new Error("Request body is too large");
      (error as Error & { status?: number }).status = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    const error = new Error("Request body must be valid JSON");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
}

async function serveStatic(pathname: string, response: ServerResponse) {
  const asset = staticAssets.get(pathname);
  if (!asset) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  try {
    const [filename, contentType] = asset;
    const contents = await readFile(resolve(publicDirectory, filename));
    response.writeHead(200, {
      ...securityHeaders,
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    });
    response.end(contents);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

export function createAppServer() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");

      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { status: "ok", service: "meridian-policy-platform" });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/incident") {
        sendJson(response, 200, await incidentPayload());
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/evaluate") {
        const body = await readRequestBody(request);
        const envelope = body && typeof body === "object" && !Array.isArray(body)
          ? body as Record<string, unknown>
          : null;
        if (!envelope || !Object.hasOwn(envelope, "policy") || !isPolicy(envelope.policy)) {
          sendJson(response, 400, { error: "A valid, internally consistent policy is required" });
          return;
        }
        sendJson(response, 200, { decision: determineEligibility(envelope.policy) });
        return;
      }

      if (request.method === "GET") {
        await serveStatic(url.pathname, response);
        return;
      }

      sendJson(response, 405, { error: "Method not allowed" });
    } catch (error) {
      const status = typeof (error as { status?: unknown })?.status === "number"
        ? (error as { status: number }).status
        : 500;
      sendJson(response, status, {
        error: status >= 500 ? "Unexpected server error" : (error as Error).message,
      });
    }
  });
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entrypoint) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "127.0.0.1";
  const server = createAppServer();
  server.listen(port, host, () => {
    console.log(`Meridian Policy Console running at http://${host}:${port}`);
  });
}
