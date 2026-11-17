"use client";
import { useEffect, useState } from "react";
import type { WorldContext } from "@/server/world/context";
export function WorldActionPanel({
  campaignId,
  characterId,
  revision,
}: {
  campaignId: string;
  characterId: string;
  revision: number;
}) {
  const [context, setContext] = useState<WorldContext | null>(null),
    [local, setLocal] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function refresh() {
    try {
      const r = await fetch(
          "/api/world-actions?" +
            new URLSearchParams({ campaignId, characterId }),
          { cache: "no-store" },
        ),
        v = await r.json();
      if (!r.ok) throw Error(v.error);
      setContext(v.context);
      setLocal(v.localController);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
    const listener = () => void refresh();
    window.addEventListener("ravenland:ai-refresh", listener);
    window.addEventListener("ravenland:campaign-refresh", listener);
    return () => {
      window.removeEventListener("ravenland:ai-refresh", listener);
      window.removeEventListener("ravenland:campaign-refresh", listener);
    };
  }, [campaignId, characterId, revision]);
  async function run(body: Record<string, unknown>) {
    if (!context) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/world-actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId,
            characterId,
            requestId: crypto.randomUUID(),
            expectedState: context.state,
            confirmed: true,
            ...body,
          }),
        }),
        v = await r.json();
      if (!r.ok) throw Error(v.error);
      await refresh();
      window.dispatchEvent(new Event("ravenland:ai-refresh"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!context) return error ? <p role="alert">{error}</p> : null;
  return (
    <section aria-label="World actions">
      <h4>World actions</h4>
      {error && <p role="alert">{error}</p>}
      {context.reconciliationRequired && (
        <>
          <p>
            Historical NPC narration is unverified. Review it before the next
            action. Reconciliation preserves saved elapsed time and possessions.
          </p>
          {local ? (
            <button
              disabled={busy}
              onClick={() => {
                const reason = prompt(
                  "Confirm that historical NPC prose remains unverified. This does not replay a search, transfer possessions or advance time. Record the basis for continuing from saved state.",
                );
                if (reason?.trim())
                  void run({
                    type: "reconcile",
                    sceneId: context.sceneId,
                    reason,
                  });
              }}
            >
              Reconcile historical NPC narration
            </button>
          ) : (
            <p>
              A trusted local controller must reconcile the historical scene.
            </p>
          )}
        </>
      )}
      {context.pending && (
        <>
          <p role="status">{context.pending.summary}</p>
          {local && (
            <>
              <button
                disabled={busy}
                onClick={() => {
                  if (!context.pending) return;
                  const unit = prompt(
                    "Elapsed time unit: rounds, minutes, hours or days. No conversion is inferred. Quarter-day and journey progression use their existing workflows.",
                    "rounds",
                  );
                  if (
                    !unit ||
                    !["rounds", "minutes", "hours", "days"].includes(unit)
                  )
                    return;
                  const amountText = prompt(
                    "Actual elapsed " +
                      unit +
                      ". Enter 0 only for an explicit ruling that no verified clock time passes. Reaching a lethal deadline can establish death.",
                  );
                  if (amountText === null || !amountText.trim()) return;
                  const amount = Number(amountText);
                  if (!Number.isInteger(amount) || amount < 0) return;
                  const reason = prompt(
                    "Confirm the exact proposed action, access, resolved uncertainty and duration ruling. Unsupported transfer mechanics remain blocked. This commits the action and elapsed time together.",
                  );
                  if (reason?.trim())
                    void run({
                      type: "adjudicate",
                      pendingId: context.pending.requestId,
                      decision: "approve",
                      duration: { unit, amount },
                      reason,
                    });
                }}
              >
                Adjudicate proposed NPC action and duration
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  const reason = prompt(
                    "Why is this proposal declined? No action or time will be recorded.",
                  );
                  if (reason?.trim())
                    void run({
                      type: "adjudicate",
                      pendingId: context.pending!.requestId,
                      decision: "decline",
                      duration: null,
                      reason,
                    });
                }}
              >
                Decline proposed NPC action
              </button>
            </>
          )}
        </>
      )}
      {context.recentEvents.map((e) => (
        <p key={e.requestId}>
          {e.status.replaceAll("_", " ")} · {e.summary}
        </p>
      ))}
    </section>
  );
}
