import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import incident from "../fixtures/reported-policy.json" with { type: "json" };
import { determineEligibility, type Policy } from "./eligibility.ts";

const rootDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicDirectory = resolve(rootDirectory, "public");

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function numberedExcerpt(source: string, start: number, end: number) {
  return source
    .split("\n")
    .slice(start - 1, end)
    .map((line, index) => `${String(start + index).padStart(3, " ")}  ${line}`)
    .join("\n");
}

function decisionOrder(source: string, implementation: "legacy" | "modern") {
  const patterns =
    implementation === "legacy"
      ? [
          ["Fraud cancellation override", /WS-CANCEL-REASON\s*=\s*"FRAUD"/],
          ["Pre-2010 grandfathering", /WS-ISSUE-YEAR\s*<\s*2010/],
          ["Standard active-policy eligibility", /WS-STATUS\s*=\s*"ACTIVE"/],
          ["Manual review", /MOVE\s+"MANUAL_REVIEW"/],
        ]
      : [
          ["Fraud cancellation override", /policy\.cancelReason\s*===\s*"FRAUD"/],
          ["Pre-2010 grandfathering", /policy\.issueYear\s*<\s*2010/],
          ["Standard active-policy eligibility", /policy\.status\s*===\s*"ACTIVE"/],
          ["Manual review", /code:\s*"MANUAL_REVIEW"/],
        ];

  return patterns
    .map(([label, pattern]) => ({
      label: label as string,
      position: source.search(pattern as RegExp),
    }))
    .filter(({ position }) => position >= 0)
    .sort((left, right) => left.position - right.position)
    .map(({ label }) => label);
}

async function incidentPayload() {
  const [legacySource, modernSource] = await Promise.all([
    readFile(resolve(rootDirectory, "legacy/POLICY-ELIGIBILITY.cbl"), "utf8"),
    readFile(resolve(rootDirectory, "src/eligibility.ts"), "utf8"),
  ]);

  const decision = determineEligibility(incident.policy as Policy);

  return {
    incident: {
      id: incident.incidentId,
      reportedBy: incident.reportedBy,
      customerImpact: incident.customerImpact,
      policy: incident.policy,
    },
    parity: {
      expected: incident.expectedDecision,
      actual: decision.code,
      matchesExpected: decision.code === incident.expectedDecision,
      reason: decision.reason,
    },
    decisionOrder: {
      legacy: decisionOrder(legacySource, "legacy"),
      modern: decisionOrder(modernSource, "modern"),
    },
    sources: {
      legacy: numberedExcerpt(legacySource, 13, 29),
      modern: numberedExcerpt(modernSource, 29, 55),
    },
  };
}

function isPolicy(value: unknown): value is Policy {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.policyId === "string" &&
    typeof candidate.issueYear === "number" &&
    (candidate.status === "ACTIVE" || candidate.status === "CANCELLED") &&
    (candidate.cancelReason === null ||
      candidate.cancelReason === "FRAUD" ||
      candidate.cancelReason === "CUSTOMER_REQUEST") &&
    typeof candidate.claimAmount === "number"
  );
}

async function readRequestBody(request: IncomingMessage) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 100_000) throw new Error("Request body is too large");
  }
  return JSON.parse(body || "{}");
}

async function serveStatic(pathname: string, response: ServerResponse) {
  const staticPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(publicDirectory, `.${staticPath}`);

  const relativePath = relative(publicDirectory, filePath);
  const escapesPublicDirectory =
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath);

  if (escapesPublicDirectory) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  try {
    const contents = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
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
        if (!isPolicy(body.policy)) {
          sendJson(response, 400, { error: "A valid policy is required" });
          return;
        }
        sendJson(response, 200, { decision: determineEligibility(body.policy) });
        return;
      }

      if (request.method === "GET") {
        await serveStatic(url.pathname, response);
        return;
      }

      sendJson(response, 405, { error: "Method not allowed" });
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Unexpected server error",
      });
    }
  });
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entrypoint) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  const server = createAppServer();
  server.listen(port, host, () => {
    console.log(`Meridian Policy Console running at http://localhost:${port}`);
  });
}
