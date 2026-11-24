"use client";
import { useEffect, useRef, useState } from "react";
import type { CampaignRecord } from "@/lib/types";
export function QuarterResolutionPanel({
  record,
  entryId,
  actorId,
  children,
  activityContent,
}: {
  record: CampaignRecord;
  entryId: string;
  actorId: string;
  children: React.ReactNode;
  activityContent?: React.ReactNode;
}) {
  const [v, setV] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [confirm, setConfirm] = useState(""),
    retry = useRef<{ key: string; id: string } | null>(null);
  const load = () =>
    fetch(
      "/api/quarter-resolution?" +
        new URLSearchParams({ campaignId: record.id, entryId, actorId }),
      { cache: "no-store" },
    )
      .then((r) => r.json())
      .then(setV)
      .catch(() => {});
  useEffect(() => {
    load();
  }, [record.id, record.revision, entryId, actorId]);
  async function run(operation: string, extra: object = {}) {
    const key = JSON.stringify({ operation, extra });
    if (retry.current?.key !== key)
      retry.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/quarter-resolution", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId: record.id,
            entryId,
            actorId,
            revision: record.revision,
            requestId: retry.current.id,
            operation,
            ...extra,
          }),
        }),
        value = await response.json();
      if (!response.ok) throw Error(value.error);
      retry.current = null;
      setV(value);
      setConfirm("");
      window.dispatchEvent(new Event("ravenland:campaign-refresh"));
      window.dispatchEvent(new Event("ravenland:ai-refresh"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const flow = v?.flow,
    entry = record.session.dayTracker?.find((e) => e.id === entryId),
    route = record.session.chatJourney?.updates
      .filter((u) => u.entryId === entryId && u.entryReceipt)
      .at(-1),
    roll =
      (v?.flow?.prompt.startsWith("Keep Watch failed")
        ? record.session.dice?.find((d) => d.id === v.flow.selected.watch)
        : null) ??
      record.session.dice?.find(
        (d) =>
          (record.session.activityState?.entries
            .find((e) => e.entryId === entryId)
            ?.activities.some(
              (a) =>
                a.status === "Awaiting Push/keep decision" &&
                ["Forage", "Hunt"].includes(a.activity) &&
                a.request?.rollId === d.id,
            ) ||
            d.journeyContext?.entryId === entryId) &&
          !record.session.chatJourney?.updates.some(
            (u) => u.entryReceipt?.navigationRollId === d.id,
          ),
      );
  const roller = record.session.characters.find(
      (ch) => ch.id === roll?.characterId,
    ),
    canForest =
      roller?.profession.toLowerCase() === "druid" &&
      roller.sheet?.talents?.some(
        (t) =>
          t.name?.toLowerCase() === "path of the forest" && Number(t.rank) >= 1,
      ) &&
      Number(roller.sheet?.willpower) >= 1;
  if (!v) return <p role="status">Loading saved quarter-day status…</p>;
  return (
    <section aria-label="Quarter-day resolution">
      <fieldset disabled={busy}>
        {flow ? (
          <>
            <strong>{flow.status}</strong>
            <p role="status">{flow.prompt}</p>
            <p>
              {entry?.date} · {entry?.quarter} · {entry?.from} →{" "}
              {route?.entryReceipt?.hex ?? record.session.campaign.hex}
            </p>
            {v.encounter && (
              <p>
                Encounter procedure:{" "}
                {v.encounter.status === "skipped"
                  ? "Skipped — Table GM Testing Override"
                  : v.encounter.status === "waived"
                    ? "Check waived — Table GM Testing Override"
                    : v.encounter.status}
              </p>
            )}
            {v.outcomes?.map((o: any) => (
              <p key={o.id}>
                Original successes: {o.rawSuccesses ?? "No roll"} · Final
                successes: {o.finalSuccesses} ·{" "}
                {o.source === "talent"
                  ? "Path of the Forest"
                  : "Table GM ruling"}{" "}
                · WP spent: {o.wpCost}
              </p>
            ))}
            {flow.status !== "Quarter completed" && (
              <>
                {flow.status === "Awaiting player decision" &&
                  flow.prompt.includes("Multiple") && (
                    <div>
                      {record.session.dice
                        ?.filter(
                          (d) =>
                            d.status === "Pending" &&
                            ["Survival", "Scouting"].includes(d.result.skill),
                        )
                        .map((d) => (
                          <p key={d.id}>
                            {
                              record.session.characters.find(
                                (ch) => ch.id === d.characterId,
                              )?.name
                            }{" "}
                            · {d.result.skill} · {d.result.successes} successes
                            · {new Date(d.createdAt).toLocaleTimeString()}{" "}
                            <button
                              onClick={() => run("select", { rollId: d.id })}
                            >
                              Use this saved card
                            </button>
                          </p>
                        ))}
                    </div>
                  )}
                <button
                  className="quiet-button"
                  onClick={() => run("continue")}
                >
                  Continue saved resolution
                </button>
                {flow.status === "Mechanically complete" && (
                  <button
                    className="gold-button"
                    onClick={() => run("complete")}
                  >
                    Complete quarter-day
                  </button>
                )}
                {roll && roll.result.successes === 0 && (
                  <>
                    <p>
                      Original roll: {roll.original.successes} successes ·
                      Current saved roll: {roll.result.successes} ·{" "}
                      {roll.result.pushed ? "Pushed" : "Not pushed"}. A Push is
                      chosen on the saved dice card.
                    </p>
                    <button
                      className="quiet-button"
                      onClick={() => run("keep", { rollId: roll.id })}
                    >
                      Keep failed activity
                    </button>
                    <button
                      className="quiet-button"
                      disabled={!canForest}
                      onClick={() => setConfirm("forest")}
                    >
                      Use Path of the Forest (1 WP)
                    </button>
                  </>
                )}
                {v.isTableGM && (
                  <details>
                    <summary>Specific encounter or outcome review</summary>
                    {v.encounter?.status === "pending" && (
                      <button onClick={() => setConfirm("waive")}>
                        Waive this encounter check for testing
                      </button>
                    )}
                    {["scene", "review"].includes(v.encounter?.status) && (
                      <button onClick={() => setConfirm("skip")}>
                        Skip this encounter for testing
                      </button>
                    )}
                    {v.encounter?.status === "scene" && (
                      <button onClick={() => setConfirm("resolve-scene")}>
                        Record scene resolved without automatic rewards
                      </button>
                    )}
                    {v.encounter?.status === "review" && (
                      <button onClick={() => setConfirm("introduce")}>
                        Introduce reviewed source-backed scene
                      </button>
                    )}
                    {roll && (
                      <button onClick={() => setConfirm("ruling")}>
                        Establish scoped final success by Table GM ruling
                      </button>
                    )}
                  </details>
                )}
                {confirm && (
                  <div role="group" aria-label="Confirm specific correction">
                    <p>
                      {confirm === "forest"
                        ? "Spend exactly 1 WP for this current unresolved navigation check."
                        : confirm === "waive"
                          ? "Waive only this unrolled check. No dice or no-encounter result will be invented."
                          : confirm === "skip"
                            ? "Skip only this saved encounter for testing. Its original dice, entry and consequences remain saved."
                            : "Record this exact reviewed decision. Existing dice and history remain unchanged."}
                    </p>
                    <label>
                      {confirm === "introduce"
                        ? "Verified player-visible scene introduction"
                        : "Reason"}
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        maxLength={1600}
                      />
                    </label>
                    <button
                      className="gold-button"
                      disabled={!reason.trim()}
                      onClick={() =>
                        run(confirm, {
                          confirmed: true,
                          reason,
                          ...(confirm === "forest" || confirm === "ruling"
                            ? { rollId: roll?.id, success: true }
                            : {}),
                        })
                      }
                    >
                      Confirm {confirm}
                    </button>
                    <button
                      className="quiet-button"
                      onClick={() => setConfirm("")}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <p>
              Existing quarter-day controls are preserved until assisted
              resolution is explicitly selected.
            </p>
            <button
              className="quiet-button"
              onClick={() =>
                run("start", {
                  confirmed: true,
                  options: {
                    autoComplete: false,
                    encounterHandling: "AI GM Assisted",
                    mode: "On foot",
                  },
                })
              }
            >
              Review and start assisted resolution for this pending quarter
            </button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </fieldset>
      {flow &&
        activityContent &&
        flow.status !== "Quarter completed" &&
        record.session.activityState?.entries
          .find((e) => e.entryId === entryId)
          ?.activities.some((a) => a.status !== "Resolved") &&
        activityContent}
      {flow ? (
        <details>
          <summary>Advanced Table GM Review</summary>
          {children}
        </details>
      ) : (
        children
      )}
    </section>
  );
}
