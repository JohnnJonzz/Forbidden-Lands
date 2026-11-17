"use client";
import { useEffect, useState } from "react";
interface RulingView {
  id: string;
  domain: string;
  question: string;
  status: string;
  authority: string;
  blockingReason: string;
  resolutionTypes: string[];
  revision: number;
  expectedScope: string;
  resolutionInput?: {
    consequenceId: string | null;
    pendingId: string;
    unit: string;
    rules: {
      id: string;
      revision: number;
      title: string;
      override_scope: string;
    }[];
    healers: { id: string; name: string }[];
  };
}
export function RulingPanel({
  campaignId,
  characterId,
  revision,
}: {
  campaignId: string;
  characterId: string;
  revision: number;
}) {
  const [rows, setRows] = useState<RulingView[]>([]),
    [local, setLocal] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [healer, setHealer] = useState(characterId);
  async function refresh() {
    try {
      const response = await fetch(
          "/api/rulings?" + new URLSearchParams({ campaignId, characterId }),
          { cache: "no-store" },
        ),
        v = await response.json();
      if (!response.ok) throw Error(v.error);
      setRows(v.rulings);
      setLocal(v.localController);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
    const f = () => void refresh();
    window.addEventListener("ravenland:ai-refresh", f);
    window.addEventListener("ravenland:campaign-refresh", f);
    return () => {
      window.removeEventListener("ravenland:ai-refresh", f);
      window.removeEventListener("ravenland:campaign-refresh", f);
    };
  }, [campaignId, characterId, revision]);
  async function decide(r: RulingView, reject = false) {
    const d = r.resolutionInput;
    let effect: Record<string, unknown> | null = null;
    if (!reject) {
      if (!d) return;
      if (r.domain === "duration" || r.domain === "time_conversion") {
        const unit =
          r.domain === "time_conversion"
            ? d.unit
            : prompt(
                "Actual elapsed time unit: rounds, minutes, hours or days.",
                "rounds",
              );
        if (!unit || !["rounds", "minutes", "hours", "days"].includes(unit))
          return;
        const input = prompt(
          "Actual elapsed " +
            unit +
            ". A zero amount requires an explicit ruling. Reaching a lethal deadline can establish death.",
        );
        if (
          input === null ||
          !input.trim() ||
          !Number.isInteger(Number(input)) ||
          Number(input) < 0
        )
          return;
        effect =
          r.domain === "duration"
            ? {
                type: "duration",
                pendingId: d.pendingId,
                unit,
                amount: Number(input),
              }
            : {
                type: "time_conversion",
                timeEventId: d.pendingId,
                consequenceId: d.consequenceId,
                unit,
                amount: Number(input),
              };
      } else if (r.domain === "healing_rule") {
        if (
          !confirm(
            "For only this injury, explicitly override the listed house-rule interpretation and use the verified official Healing procedure? This does not change the rule document, saved critical, deadline or dice.",
          )
        )
          return;
        effect = {
          type: "healing_rule",
          consequenceId: d.consequenceId,
          rules: d.rules.map((v) => ({ id: v.id, revision: v.revision })),
          interpretation: "official_in_this_scope",
        };
      } else if (r.domain === "scene_access")
        effect = {
          type: "scene_access",
          consequenceId: d.consequenceId,
          healerId: healer,
          safe: true,
        };
      else if (r.domain === "consequence_review")
        effect = {
          type: "consequence_review",
          consequenceId: d.consequenceId,
          decision: "retain_mechanics",
        };
      else return;
    }
    const reason = prompt(
      reject
        ? "Why is this question rejected or superseded? No mechanical outcome will be invented."
        : "Record the verified facts and reasoning for this exact decision.",
    );
    if (!reason?.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/rulings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId,
            characterId,
            requestId: crypto.randomUUID(),
            rulingId: r.id,
            revision: r.revision,
            expectedScope: r.expectedScope,
            decision: reject ? "reject" : "apply",
            effect,
            reason,
            confirmed: true,
          }),
        }),
        v = await response.json();
      if (!response.ok) throw Error(v.error);
      await refresh();
      window.dispatchEvent(new Event("ravenland:ai-refresh"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!rows.length && !error) return null;
  return (
    <section aria-label="GM rulings">
      <h4>GM rulings</h4>
      {error && <p role="alert">{error}</p>}
      {rows
        .filter((r) =>
          ["awaiting_review", "accepted", "proposed"].includes(r.status),
        )
        .map((r) => (
          <div key={r.id}>
            <strong>
              {r.authority === "C"
                ? "Protected review"
                : r.authority === "B"
                  ? "Bounded ruling"
                  : "Routine discretion"}
            </strong>
            <p>{r.question}</p>
            <p>{r.blockingReason}</p>
            {r.resolutionInput?.rules.map((rule) => (
              <p key={rule.id}>
                {rule.title} · {rule.override_scope} · revision {rule.revision}
              </p>
            ))}
            {r.domain === "scene_access" && local && (
              <label>
                Confirmed present healer
                <select
                  value={healer}
                  onChange={(e) => setHealer(e.target.value)}
                >
                  {r.resolutionInput?.healers.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!r.resolutionTypes.length ? (
              <p>
                No safe resolution adapter is available. Restore the specified
                evidence or keep this hold for review.
              </p>
            ) : local ? (
              <button disabled={busy} onClick={() => void decide(r)}>
                Resolve {r.domain.replaceAll("_", " ")} ruling
              </button>
            ) : (
              <p>
                This ruling requires trusted local GM review. Player access does
                not grant that authority.
              </p>
            )}
            {local && (
              <button disabled={busy} onClick={() => void decide(r, true)}>
                Reject ruling question
              </button>
            )}
          </div>
        ))}
      {rows
        .filter((r) => r.status === "applied")
        .slice(-4)
        .map((r) => (
          <p key={r.id}>
            Recorded{" "}
            {r.authority === "A"
              ? "routine AI"
              : r.authority === "B"
                ? "bounded"
                : "protected"}{" "}
            ruling · {r.domain.replaceAll("_", " ")} · applied
          </p>
        ))}
    </section>
  );
}
