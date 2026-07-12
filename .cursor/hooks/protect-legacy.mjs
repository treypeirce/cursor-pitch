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
const destructiveVerb =
  /(?:^|[;&|]\s*|\s)(?:rm|mv|cp|truncate|tee|install)\b|\bgit\s+(?:rm|checkout|restore)\b|\bsed\s+-i\b|\bperl\s+-pi\b/i.test(
    command,
  );
const findDelete = /\bfind\b[^;&|]*\s-delete\b/i.test(command);
const scriptWrite =
  /\b(?:python3?|node|ruby|php)\b/i.test(command) &&
  /\b(?:write|unlink|remove|rename|truncate)\b/i.test(command);
const redirectsToLegacy =
  />{1,2}\s*["']?(?:\.\/)?legacy(?:\/|["']|$)/i.test(command);

if (
  (referencesLegacy && (destructiveVerb || findDelete || scriptWrite)) ||
  redirectsToLegacy
) {
  deny("Blocked: the legacy COBOL source is protected evidence for this modernization workflow.");
  process.exit(0);
}

console.log(JSON.stringify({ permission: "allow" }));
