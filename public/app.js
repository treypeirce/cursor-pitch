const decisionLabels = {
  DENIED_FRAUD: "Denied · Fraud",
  ELIGIBLE_LEGACY: "Eligible · Legacy",
  ELIGIBLE_STANDARD: "Eligible · Standard",
  MANUAL_REVIEW: "Manual review",
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function text(id, value) {
  document.getElementById(id).textContent = value;
}

function renderOrder(id, values) {
  const list = document.getElementById(id);
  list.replaceChildren(
    ...values.map((value) => {
      const item = document.createElement("li");
      item.textContent = value;
      return item;
    }),
  );
}

function renderParity(data) {
  const { incident, parity, decisionOrder, sources } = data;
  text("incident-label", `INCIDENT ${incident.id} · ${incident.reportedBy}`);
  text("expected-decision", decisionLabels[parity.expected] ?? parity.expected);
  text("actual-decision", decisionLabels[parity.actual] ?? parity.actual);
  text("actual-reason", parity.reason);
  text("policy-id", incident.policy.policyId);
  text("issue-year", String(incident.policy.issueYear));
  text("policy-status", incident.policy.status);
  text("cancel-reason", incident.policy.cancelReason ?? "None");
  text("claim-amount", money.format(incident.policy.claimAmount));
  text("customer-impact", incident.customerImpact);
  text("legacy-source", sources.legacy);
  text("modern-source", sources.modern);
  renderOrder("legacy-order", decisionOrder.legacy);
  renderOrder("modern-order", decisionOrder.modern);

  const panel = document.getElementById("parity-panel");
  const chip = document.getElementById("parity-chip");
  const callout = document.getElementById("parity-callout");
  const icon = callout.querySelector(".callout-icon");
  const heading = callout.querySelector("strong");
  const copy = callout.querySelector("p");
  const versus = document.querySelector(".versus span");

  panel.classList.toggle("match", parity.matchesExpected);
  panel.classList.toggle("mismatch", !parity.matchesExpected);
  chip.textContent = parity.matchesExpected ? "Parity restored" : "Mismatch detected";
  icon.textContent = parity.matchesExpected ? "✓" : "!";
  heading.textContent = parity.matchesExpected ? "Decision parity restored" : "Decision mismatch";
  copy.textContent = parity.matchesExpected
    ? "The modern service now preserves the fraud override and the legitimate grandfathering rule. Human review is still required before merge."
    : "The modern service evaluates grandfathering before the fraud override. Existing tests do not cover this interaction."
  versus.textContent = parity.matchesExpected ? "=" : "≠";
  text("api-state", "Policy service connected");
}

async function loadIncident() {
  const button = document.getElementById("rerun-button");
  button.disabled = true;
  button.textContent = "Checking…";
  try {
    const response = await fetch("/api/incident", { cache: "no-store" });
    if (!response.ok) throw new Error("Incident API unavailable");
    renderParity(await response.json());
  } catch (error) {
    text("api-state", "Policy service unavailable");
    text("parity-chip", "Connection failed");
    console.error(error);
  } finally {
    button.disabled = false;
    button.textContent = "Re-run case";
  }
}

async function evaluatePolicy(event) {
  event.preventDefault();
  const reason = document.getElementById("form-reason").value;
  const result = document.getElementById("simulator-result");
  result.querySelector("span").textContent = "Evaluating";
  result.querySelector("strong").textContent = "Running policy rules…";
  result.querySelector("p").textContent = "Using the live TypeScript service.";

  const policy = {
    policyId: "SIMULATED-POLICY",
    issueYear: Number(document.getElementById("form-year").value),
    status: document.getElementById("form-status").value,
    cancelReason: reason || null,
    claimAmount: Number(document.getElementById("form-amount").value),
  };

  try {
    const response = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Evaluation failed");
    result.querySelector("span").textContent = "Live decision";
    result.querySelector("strong").textContent =
      decisionLabels[body.decision.code] ?? body.decision.code;
    result.querySelector("p").textContent = body.decision.reason;
  } catch (error) {
    result.querySelector("span").textContent = "Error";
    result.querySelector("strong").textContent = "Unable to evaluate policy";
    result.querySelector("p").textContent = error.message;
  }
}

document.getElementById("rerun-button").addEventListener("click", loadIncident);
document.getElementById("policy-form").addEventListener("submit", evaluatePolicy);
loadIncident();
