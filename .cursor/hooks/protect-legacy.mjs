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
        "Do not delete or rewrite files under legacy/. Preserve them and add parity tests against the modern implementation instead.",
    }),
  );
}

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  deny("The legacy-protection hook could not validate this command.");
  process.exit(0);
}

if (typeof payload?.command !== "string" || payload.command.trim() === "") {
  deny("The legacy-protection hook received an invalid shell command.");
  process.exit(0);
}

const command = payload.command;
const referencesLegacy =
  /(?:^|[\/\s"'=:(])(?:\.\/)?legacy(?:\/|[\s"'$]|$)/i.test(command);
const compoundOrRedirected = /[;&|<>]/.test(command);
const safeReadOnlyCommand =
  !compoundOrRedirected &&
  (/^\s*(?:cat|head|tail|less|wc|file|stat|ls|rg|grep)\b/i.test(command) ||
    /^\s*sed\s+-n\b/i.test(command) ||
    /^\s*git\s+(?:diff|show|log|status)\b/i.test(command));

if (referencesLegacy && !safeReadOnlyCommand) {
  deny("Blocked: only read-only inspection commands may target the protected legacy COBOL source.");
  process.exit(0);
}

console.log(JSON.stringify({ permission: "allow" }));
