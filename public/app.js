const decisionLabels = {
  DENIED_FRAUD: "Denied · Fraud",
  ELIGIBLE_LEGACY: "Approved · Grandfathered",
  ELIGIBLE_STANDARD: "Approved · Standard",
  MANUAL_REVIEW: "Manual review",
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

let incidentData = null;
let activeView = "live";

function element(id) {
  return document.getElementById(id);
}

function text(id, value) {
  element(id).textContent = value;
}

function labelDecision(code) {
  return decisionLabels[code] ?? code ?? "Unavailable";
}

function codeRule(textValue) {
  const trimmed = textValue.trim();
  if (/WS-CANCEL-REASON|policy\.cancelReason/.test(textValue) || /^"fraud",?$/.test(trimmed)) {
    return { className: "fraud-line", label: "Fraud override" };
  }
  if (/WS-ISSUE-YEAR|policy\.issueYear/.test(textValue) || /^"grandfathering",?$/.test(trimmed)) {
    return { className: "year-line", label: "Grandfathering" };
  }
  return null;
}

function renderCode(containerId, lines) {
  const container = element(containerId);
  let priority = 0;
  container.replaceChildren(...lines.map((line) => {
    const row = document.createElement("span");
    row.className = "code-line";

    const number = document.createElement("span");
    number.className = "line-number";
    number.textContent = line.number == null ? "" : String(line.number).padStart(2, "0");

    const source = document.createElement("code");
    source.textContent = line.text;

    row.append(number, source);
    const rule = codeRule(line.text);
    if (rule) {
      priority += 1;
      row.classList.add(rule.className);
      row.style.viewTransitionName = `${containerId}-${rule.className}`;
      const tag = document.createElement("span");
      tag.className = "rule-tag";
      tag.textContent = `${priority}${priority === 1 ? "st" : "nd"} · ${rule.label}`;
      row.append(tag);
    }
    return row;
  }));
}

function selectedComparison() {
  return activeView === "snapshot" ? incidentData.reported : incidentData.current;
}

function render() {
  if (!incidentData) return;
  const { incident, reference, controls } = incidentData;
  const comparison = selectedComparison();
  const isSnapshot = activeView === "snapshot";
  const matches = comparison.decision === reference.decision;
  const canvas = element("decision-canvas");
  const chip = element("status-chip");

  canvas.classList.remove("loading", "match", "mismatch");
  canvas.classList.add(matches ? "match" : "mismatch");
  canvas.setAttribute("aria-busy", "false");
  chip.className = `status-chip ${matches ? "match" : "mismatch"}`;
  chip.textContent = isSnapshot ? "Incident snapshot" : (matches ? "Parity restored" : "Mismatch detected");

  text("incident-label", `${incident.id} · ${incident.reportedBy}`);
  text(
    "finding-title",
    isSnapshot
      ? "Baseline incident: two checks were reversed."
      : matches
        ? "The two checks now run in the same order."
        : "Two checks are reversed in the current TypeScript branch.",
  );
  text(
    "finding-summary",
    isSnapshot
      ? "This pinned snapshot preserves the original failure for before-and-after comparison."
      : matches
        ? "Fraud is evaluated before grandfathering, so the current branch returns the expected decision."
        : "Both conditions are true for this policy. The first matching check wins.",
  );

  text("policy-id", incident.policy.policyId);
  text("issue-year", String(incident.policy.issueYear));
  text("policy-status", incident.policy.status.charAt(0) + incident.policy.status.slice(1).toLowerCase());
  text("cancel-reason", incident.policy.cancelReason ?? "None");
  text("claim-amount", money.format(incident.policy.claimAmount));

  text("reference-label", reference.label);
  text("reference-qualifier", reference.qualifier);
  text("comparison-label", comparison.label);
  text("comparison-qualifier", comparison.qualifier);
  text("reference-decision", labelDecision(reference.decision));
  text("comparison-decision", labelDecision(comparison.decision));
  text("comparison-outcome-label", activeView === "snapshot" ? "Reported outcome" : "Current outcome");
  text("comparison-mark", matches ? "=" : "≠");
  text("parity-symbol", matches ? "=" : "≠");

  renderCode("reference-code", reference.code);
  renderCode("comparison-code", comparison.code);
  text(
    "change-summary",
    isSnapshot
      ? "Historical baseline: fraud was below grandfathering. Switch to Verified current to inspect the active branch."
      : matches
        ? "Verified: TypeScript now checks fraud first. The COBOL reference remains unchanged; a human still owns merge."
        : "Required change: move the fraud override above grandfathering in TypeScript. Do not change the COBOL reference.",
  );

  text("legacy-control", controls.legacySourceChanged ? "Legacy source changed" : "Legacy source unchanged");
  text("merge-owner", `Demo policy · ${controls.mergeOwner} owns merge`);

  text(
    "verification-time",
    activeView === "snapshot"
      ? "Incident snapshot · baseline commit"
      : `Current branch verified ${new Date(incidentData.current.verifiedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`,
  );

  element("snapshot-button").disabled = false;
  element("live-button").disabled = false;
  element("snapshot-button").setAttribute("aria-pressed", String(activeView === "snapshot"));
  element("live-button").setAttribute("aria-pressed", String(activeView === "live"));
  text(
    "screen-reader-status",
    `${activeView === "snapshot" ? "Incident snapshot" : "Verified current branch"}. ${matches ? "Parity restored; fraud is checked first in both code paths" : "Mismatch detected; the comparison checks grandfathering before fraud"}. Reference outcome ${labelDecision(reference.decision)}. Comparison outcome ${labelDecision(comparison.decision)}.`,
  );
}

function commitWithTransition(update) {
  if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.startViewTransition(update);
  } else {
    update();
  }
}

function changeView(nextView) {
  if (!incidentData || activeView === nextView) return;
  commitWithTransition(() => {
    activeView = nextView;
    render();
  });
}

function renderConnectionError() {
  incidentData = null;
  const canvas = element("decision-canvas");
  canvas.classList.remove("loading", "match", "mismatch");
  canvas.setAttribute("aria-busy", "false");
  element("status-chip").className = "status-chip";
  text("status-chip", "Verification unavailable");
  text("incident-label", "INCIDENT STATUS UNAVAILABLE");
  text("finding-title", "Unable to verify the current policy decision.");
  text("finding-summary", "The prior result has been cleared. Retry before drawing a conclusion.");
  text("policy-id", "—");
  text("issue-year", "—");
  text("policy-status", "—");
  text("cancel-reason", "—");
  text("claim-amount", "—");
  text("reference-label", "Expected behavior");
  text("reference-qualifier", "Unavailable");
  text("comparison-label", "Current branch");
  text("comparison-qualifier", "Unavailable");
  text("reference-decision", "Unavailable");
  text("comparison-decision", "Unavailable");
  text("comparison-mark", "—");
  text("parity-symbol", "—");
  text("change-summary", "Retry verification before drawing a conclusion.");
  text("legacy-control", "Reference status unavailable");
  text("merge-owner", "No decision should be made");
  text("verification-time", "Policy service unavailable");
  text("screen-reader-status", "Verification unavailable. Previous decisions have been cleared.");
  element("snapshot-button").disabled = true;
  element("live-button").disabled = true;
  element("snapshot-button").setAttribute("aria-pressed", "false");
  element("live-button").setAttribute("aria-pressed", "false");
  element("reference-code").replaceChildren();
  element("comparison-code").replaceChildren();
}

async function loadIncident() {
  const button = element("verify-button");
  const canvas = element("decision-canvas");
  const restoreFocus = document.activeElement === button;
  button.disabled = true;
  button.textContent = "Verifying…";
  canvas.classList.add("loading");
  canvas.setAttribute("aria-busy", "true");
  text("screen-reader-status", "Verifying the current TypeScript branch against the source-backed incident reference.");

  try {
    const response = await fetch("/api/incident", { cache: "no-store" });
    if (!response.ok) throw new Error("Incident API unavailable");
    const nextData = await response.json();
    commitWithTransition(() => {
      incidentData = nextData;
      activeView = "live";
      render();
    });
  } catch (error) {
    renderConnectionError();
    console.error(error);
  } finally {
    button.disabled = false;
    button.textContent = "Verify current branch";
    if (restoreFocus) button.focus({ preventScroll: true });
  }
}

element("snapshot-button").addEventListener("click", () => changeView("snapshot"));
element("live-button").addEventListener("click", () => changeView("live"));
element("verify-button").addEventListener("click", loadIncident);
loadIncident();
