import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const shellHook = fileURLToPath(
  new URL("../.cursor/hooks/protect-legacy.mjs", import.meta.url),
);
const toolHook = fileURLToPath(
  new URL("../.cursor/hooks/protect-legacy-tool.mjs", import.meta.url),
);

function runHook(script, payload) {
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

describe("legacy protection hooks", () => {
  it("allows normal verification commands", () => {
    const result = runHook(shellHook, { command: "npm run verify" });

    assert.equal(result.permission, "allow");
  });

  it("blocks destructive shell commands against legacy files", () => {
    const result = runHook(shellHook, { command: "rm -rf ./legacy" });

    assert.equal(result.permission, "deny");
  });

  it("blocks shell redirection into legacy files", () => {
    const result = runHook(shellHook, {
      command: "printf changed | tee ./legacy/POLICY-ELIGIBILITY.cbl",
    });

    assert.equal(result.permission, "deny");
  });

  it("does not confuse a similarly named directory with legacy", () => {
    const result = runHook(shellHook, { command: "rm -rf legacy-copy" });

    assert.equal(result.permission, "allow");
  });

  it("fails closed when the shell command is missing", () => {
    const result = runHook(shellHook, {});

    assert.equal(result.permission, "deny");
  });

  it("blocks a Write tool targeting legacy", () => {
    const result = runHook(toolHook, {
      tool_name: "Write",
      tool_input: { file_path: "/workspace/legacy/POLICY-ELIGIBILITY.cbl" },
    });

    assert.equal(result.permission, "deny");
  });

  it("allows a Write tool targeting the modern implementation", () => {
    const result = runHook(toolHook, {
      tool_name: "Write",
      tool_input: { file_path: "/workspace/src/eligibility.ts" },
    });

    assert.equal(result.permission, "allow");
  });
});
