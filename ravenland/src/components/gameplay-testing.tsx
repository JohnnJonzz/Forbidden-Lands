"use client";
import { useState } from "react";
import type { gameplayView } from "@/server/gameplay/service";
import type { resetPreview } from "@/server/gameplay/test-runs";
type View = ReturnType<typeof gameplayView>;
export function GameplayTesting({
  view,
  onChanged,
  onRevise,
}: {
  view: View;
  onChanged: () => void;
  onRevise: () => void;
}) {
  const [preview, setPreview] = useState<ReturnType<
      typeof resetPreview
    > | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!view.isTableGM || !view.run) return null;
  async function review() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
          "/api/gameplay/testing?" +
            new URLSearchParams({
              campaignId: view.campaignId,
              actorId: view.actorId,
            }),
          { cache: "no-store" },
        ),
        v = await r.json();
      if (!r.ok) throw Error(v.error);
      setPreview(v);
      setConfirmed(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    if (!preview || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/gameplay/testing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId: view.campaignId,
            actorId: view.actorId,
            operationId: crypto.randomUUID(),
            runId: preview.run.id,
            previewHash: preview.hash,
            confirmation: preview.target,
          }),
        }),
        v = await r.json();
      if (!r.ok) throw Error(v.error);
      setPreview(null);
      onChanged();
    } catch (e) {
      setError(
        (e as Error).message +
          " Refresh and inspect the current test run before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="phase7-development">
      <summary>Development Testing</summary>
      <p>Table GM · synthetic campaign only</p>
      <button
        className="quiet-button"
        disabled={busy}
        onClick={() => void review()}
      >
        {view.run.hasCheckpoint
          ? "Reset Test Quarter"
          : "Create Fresh Synthetic Test Baseline"}
      </button>
      {view.activity && (
        <button className="quiet-button" onClick={onRevise}>
          Revise Activity Plan
        </button>
      )}
      {view.activity && !view.canRevise && (
        <p>
          Saved rolls exist. Retain this plan, review a binding correction, or
          explicitly reset this test.
        </p>
      )}
      <details>
        <summary>View Current Test Run</summary>
        <p>
          Started {view.run.createdAt}.{" "}
          {view.run.hasCheckpoint
            ? "Reviewed fixture checkpoint available."
            : "No initialization checkpoint has been proven; the saved state is preserved."}
        </p>
        <details>
          <summary>Advanced Diagnostics · test run</summary>
          <code>{view.run.id}</code>
        </details>
      </details>
      {error && <p role="alert">{error}</p>}
      {preview && (
        <section aria-label="Reset preview">
          <h3>{preview.target} — review before confirming</h3>
          <p>
            Campaign: {preview.campaignName}. Checkpoint:{" "}
            {preview.checkpoint.label}.
          </p>
          <p>{preview.warning}</p>
          <p>
            Current: {preview.current.date} · {preview.current.quarter} ·{" "}
            {preview.current.dice} saved rolls.
          </p>
          <p>
            Restore: {preview.baseline.date} · {preview.baseline.quarter} ·{" "}
            {preview.baseline.hex} · {preview.baseline.terrain} ·{" "}
            {preview.baseline.weather}. Original synthetic party; attributes 3,
            Willpower 3, Survival and Scouting 1, Food and Water D8. No test
            dice, plans, injuries or camp.
          </p>
          <p>{preview.preserved}</p>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{" "}
            I reviewed the replacement fixture and authorize archiving this test
            and restoring it.
          </label>
          <button
            className="quiet-button"
            disabled={!confirmed || busy}
            onClick={() => void reset()}
          >
            Confirm {preview.target}
          </button>
          <button className="quiet-button" onClick={() => setPreview(null)}>
            Cancel
          </button>
        </section>
      )}
    </details>
  );
}
