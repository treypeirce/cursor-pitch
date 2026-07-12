let raw = "";

for await (const chunk of process.stdin) {
  raw += chunk;
}

function deny(message) {
  console.log(
    JSON.stringify({
      permission: "deny",
      user_message: message,
      agent_message:
        "Do not modify files under legacy/. Preserve the source and add parity tests against the modern implementation instead.",
    }),
  );
}

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  deny("The legacy-protection hook could not validate this file operation.");
  process.exit(0);
}

const toolName = String(payload?.tool_name ?? "");
const pathValues = [];

function collectPathValues(value, key = "") {
  if (typeof value === "string" && /path|file|target/i.test(key)) {
    pathValues.push(value.replaceAll("\\", "/"));
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectPathValues(item, key);
    return;
  }

  if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      collectPathValues(childValue, childKey);
    }
  }
}

collectPathValues(payload?.tool_input ?? {});

const protectedPath = pathValues.some((value) =>
  /(?:^|\/)legacy(?:\/|$)/i.test(value),
);

if (/^(Write|Edit|Delete)$/i.test(toolName) && protectedPath) {
  deny("Blocked: the legacy COBOL source is protected evidence for this modernization workflow.");
  process.exit(0);
}

console.log(JSON.stringify({ permission: "allow" }));
