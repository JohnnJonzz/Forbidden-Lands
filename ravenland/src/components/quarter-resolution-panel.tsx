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
    [recoveryAssignment, setRecoveryAssignment] = useState(""),
    [existingInjury, setExistingInjury] = useState(""),
    retry = useRef<{ key: string; id: string } | null>(null);
  const notifiedRevision = useRef(0),
    loadingRef = useRef(false);
  const readSequence = useRef(0),
    [loading, setLoading] = useState(false);
  async function load() {
    const sequence = ++readSequence.current;
    loadingRef.current = true;
    setLoading(true);
    try {
      const response = await fetch(
          "/api/quarter-resolution?" +
            new URLSearchParams({ campaignId: record.id, entryId, actorId }),
          { cache: "no-store" },
        ),
        value = await response.json();
      if (sequence === readSequence.current) {
        setV(value);
        if (
          value.campaignRevision > record.revision &&
          value.campaignRevision > notifiedRevision.current
        ) {
          notifiedRevision.current = value.campaignRevision;
          window.dispatchEvent(new Event("ravenland:campaign-refresh"));
        }
      }
    } catch {
    } finally {
      if (sequence === readSequence.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }
  useEffect(() => {
    load();
    const refresh = () => {
      if (document.visibilityState === "visible" && !loadingRef.current)
        void load();
    };
    const timer = window.setInterval(refresh, 3000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      readSequence.current++;
      loadingRef.current = false;
    };
  }, [record.id, record.revision, entryId, actorId]);
  async function run(operation: string, extra: object = {}) {
    const key = JSON.stringify({ operation, extra });
    if (retry.current?.key !== key)
      retry.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      let reviewed = extra as Record<string, unknown>;
      if (operation === "review-mishap") {
        const check = await fetch(
            "/api/quarter-resolution?" +
              new URLSearchParams({ campaignId: record.id, entryId, actorId }),
            { cache: "no-store" },
          ),
          fresh = await check.json();
        if (!check.ok) throw Error(fresh.error);
        if (fresh.recovery?.previewHash !== reviewed.previewHash) {
          setV(fresh);
          throw Error(
            "The saved mechanical requirements changed. Review the refreshed recovery preview before confirming.",
          );
        }
        reviewed = { ...reviewed, revision: fresh.recovery.revision };
      }
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
            ...reviewed,
          }),
        }),
        value = await response.json();
      if (!response.ok) throw Error(value.error);
      retry.current = null;
      if (operation === "review-mishap") {
        setRecoveryAssignment("");
        setExistingInjury("");
      }
      readSequence.current++;
      loadingRef.current = false;
      setLoading(false);
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
      {v?.isTableGM && v.recovery && (
        <details className="quarter-recovery">
          <summary>Inspect and recover current quarter</summary>
          <p>
            This read-only preview lists saved evidence and exact obligations. A
            correction requires a fresh confirmed Table GM review.
          </p>
          <button className="quiet-button" onClick={() => load()}>
            {loading
              ? "Refreshing recovery inspection…"
              : "Refresh recovery inspection"}
          </button>
          <p>
            {v.recovery.clock.quarter} · {v.recovery.clock.hex} ·{" "}
            {v.recovery.clock.weather}
          </p>
          {v.recovery.obligations.map((item: string, i: number) => (
            <p key={i}>{item}</p>
          ))}
          {v.recovery.foraging.map((a: any) => (
            <div key={a.assignmentId}>
              <p>
                Saved Foraging mishap: {a.mishap ?? "Unverified"} ·{" "}
                {a.mishapRollId ?? "No bound D6"}
              </p>
              {a.moves.map((d: any) => (
                <p key={d.id}>
                  Move {d.id}: {d.successes} successes ·{" "}
                  {d.pushed ? "Pushed" : "Not pushed"} · saved attribute damage{" "}
                  {d.attributeDamage} · saved WP {d.willpower}. {d.assessment}
                </p>
              ))}
              {a.correctionRequired && (
                <button
                  className="quiet-button"
                  onClick={() => {
                    setRecoveryAssignment(a.assignmentId);
                    setExistingInjury("");
                  }}
                >
                  Review sprained-ankle correction
                </button>
              )}
            </div>
          ))}
          {v.recovery.scouting.map((d: any) => (
            <p key={d.id}>
              Saved Scouting {d.id}: {d.successes} successes · {d.status}
            </p>
          ))}
          {recoveryAssignment && (
            <div role="group" aria-label="Reviewed Foraging correction">
              <p>
                The original Handbook result 3 requires the fixed blunt 25–26
                critical: RUN becomes a slow action during healing. Move is not
                its defense. Original dice, Push effects and previous narration
                remain preserved. A new injury needs its own D6 healing
                duration.
              </p>
              <label>
                Existing injury to link (optional)
                <select
                  value={existingInjury}
                  onChange={(e) => setExistingInjury(e.target.value)}
                >
                  <option value="">Record the source-backed injury</option>
                  {record.session.characters
                    .find(
                      (c) =>
                        c.id ===
                        v.recovery.foraging.find(
                          (a: any) => a.assignmentId === recoveryAssignment,
                        )?.characterId,
                    )
                    ?.sheet?.injuries?.filter((i) => i.status === "active")
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Correction review reason
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={1600}
                />
              </label>
              <button
                className="gold-button"
                disabled={loading || busy || !reason.trim()}
                onClick={() =>
                  run("review-mishap", {
                    assignmentId: recoveryAssignment,
                    previewHash: v.recovery.previewHash,
                    revision: v.recovery.revision,
                    confirmed: true,
                    reason,
                    ...(existingInjury ? { injuryId: existingInjury } : {}),
                  })
                }
              >
                Confirm reviewed mishap correction
              </button>
            </div>
          )}
        </details>
      )}
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
                {v.encounter?.status === "scene" && v.encounter?.canLetPass && (
                  <button
                    className="quiet-button"
                    onClick={() => run("avoid", { choice: "let-pass" })}
                  >
                    Let the distant procession pass without contact
                  </button>
                )}
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
