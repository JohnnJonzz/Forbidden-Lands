"use client";
import { useEffect, useRef, useState } from "react";
import type { rollQueueView } from "@/server/gameplay/roll-engine";
import type { DiceSpec, RollRequest } from "@/lib/gameplay-rolls";
import type { GameplayState } from "@/lib/gameplay";
import styles from "./gameplay-app.module.css";
type Queue = NonNullable<ReturnType<typeof rollQueueView>>;
export function GameplayRolls({
  campaignId,
  activity,
  party,
  actorId,
  isTableGM,
  initial,
  characterId,
  compact = false,
  onChanged,
}: {
  campaignId: string;
  activity: GameplayState;
  party: { id: string; name: string; mayAct: boolean }[];
  actorId: string;
  isTableGM: boolean;
  initial: Queue;
  characterId?: string;
  compact?: boolean;
  onChanged?: () => void;
}) {
  const [queue, setQueue] = useState(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [expression, setExpression] = useState("D6"),
    [miscActor, setMiscActor] = useState(characterId ?? actorId),
    [reason, setReason] = useState(""),
    [reviewed, setReviewed] = useState<string | null>(null),
    [selected, setSelected] = useState("");
  const retry = useRef<{ key: string; body: unknown } | null>(null);
  useEffect(() => {
    setQueue(initial);
  }, [initial]);
  useEffect(() => {
    let live = true;
    const refresh = async () => {
      try {
        const r = await fetch(
          "/api/gameplay/rolls?" +
            new URLSearchParams({
              campaignId,
              actorId: characterId ?? actorId,
            }),
          { cache: "no-store" },
        );
        if (r.ok) {
          const q = await r.json();
          if (live && q) setQueue(q);
        }
      } catch {}
    };
    const timer = setInterval(() => void refresh(), 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [campaignId, characterId, actorId]);
  async function command(
    r: RollRequest | null,
    operation: string,
    extra: object = {},
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    const body = {
        campaignId,
        runId: queue.runId ?? undefined,
        activityId: activity.id,
        actorId: ["correct", "review"].includes(operation)
          ? actorId
          : (r?.characterId ?? miscActor),
        requestId: r?.id ?? null,
        revision: r?.revision ?? null,
        operation,
        ...extra,
      },
      key = JSON.stringify({ ...body, revision: undefined });
    if (retry.current?.key !== key)
      retry.current = {
        key,
        body: { ...body, operationId: crypto.randomUUID() },
      };
    try {
      const response = await fetch("/api/gameplay/rolls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(retry.current.body),
        }),
        result = await response.json();
      if (!response.ok) {
        retry.current = null;
        throw Error(result.error);
      }
      setQueue(result.queue);
      retry.current = null;
      onChanged?.();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Connection interrupted. Retry the same operation safely.",
      );
    } finally {
      setBusy(false);
    }
  }
  const pending = queue.requests.filter(
    (r) =>
      r.status !== "superseded" &&
      (!compact || r.status !== "resolved") &&
      (!characterId || r.characterId === characterId),
  );
  function faces(r: RollRequest) {
    const card = queue.savedRolls.find((c) => c.id === r.savedRollId);
    if (!card) return "";
    const u = card.metadata.utility;
    return u?.kind === "Custom"
      ? u.faces.join(", ") + " → " + u.total
      : "Original: " +
          card.original.attribute.join(", ") +
          " | " +
          card.original.skillDice.join(", ") +
          "; " +
          card.original.successes +
          " successes" +
          (card.result.pushed
            ? " · Pushed: " +
              card.result.attribute.join(", ") +
              " | " +
              card.result.skillDice.join(", ") +
              "; " +
              card.result.successes +
              " successes"
            : "");
  }
  return (
    <section className={styles.panel} aria-label="Pending Rolls">
      <h2>Pending Rolls</h2>
      <p>
        Quarter-Day completion is not enabled until 7.0C. Determined activity
        consequences remain unapplied.
      </p>
      {error && <p role="alert">{error}</p>}
      {compact && queue.requests.some((r) => r.status === "resolved") && (
        <details>
          <summary>Resolved rolls</summary>
          {queue.requests
            .filter((r) => r.status === "resolved")
            .map((r) => (
              <p key={r.id}>
                {party.find((p) => p.id === r.characterId)?.name} — {r.activity}
                : {r.final?.summary}. {faces(r)}
              </p>
            ))}
        </details>
      )}
      {pending.map((r) => {
        const owned = party.find((p) => p.id === r.characterId)?.mayAct;
        return (
          <article
            className={styles.rollRow}
            key={r.id}
            data-procedure={r.procedure}
          >
            <h3>
              {party.find((p) => p.id === r.characterId)?.name} — {r.activity}
              {r.procedure === "forage-mishap"
                ? " Mishap"
                : r.procedure === "forage-duration"
                  ? " Healing Duration"
                  : ""}
            </h3>
            <p>
              {r.expression?.kind === "pool"
                ? r.expression.skill +
                  " · " +
                  r.expression.base +
                  " Base / " +
                  r.expression.skillDice +
                  " Skill / " +
                  r.expression.gear +
                  " Gear"
                : (r.expression?.expression ?? "Source review required")}{" "}
              · <strong>{r.status.replaceAll("_", " ")}</strong>
            </p>
            {r.modifiers.map((m, i) => (
              <small key={i}>
                {m.name}: {m.value >= 0 ? "+" : ""}
                {m.value}{" "}
              </small>
            ))}
            {r.review && <p>{r.review}</p>}
            {r.savedRollId && (
              <p data-testid={"result-" + r.procedure}>{faces(r)}</p>
            )}
            {r.final && <p>{r.final.summary}</p>}
            {owned &&
              r.procedure === "forage" &&
              r.status === "awaiting_roll" && (
                <label>
                  Forage target (default: food)
                  <select
                    value={r.forageTarget ?? "food"}
                    onChange={(e) =>
                      void command(r, "target", { target: e.target.value })
                    }
                    disabled={busy}
                  >
                    <option value="food">Food</option>
                    <option value="water">Water</option>
                  </select>
                </label>
              )}
            {owned &&
              r.status === "awaiting_roll" &&
              (characterId ? (
                <button disabled={busy} onClick={() => void command(r, "roll")}>
                  Roll{" "}
                  {r.expression?.kind === "pool"
                    ? r.expression.skill
                    : r.expression?.expression}
                </button>
              ) : (
                <a
                  href={`/campaigns/${campaignId}/characters/${r.characterId}?request=${r.id}`}
                >
                  Open character sheet to roll
                </a>
              ))}
            {owned && r.status === "awaiting_push_decision" && (
              <>
                <button disabled={busy} onClick={() => void command(r, "push")}>
                  Push
                </button>{" "}
                <button disabled={busy} onClick={() => void command(r, "keep")}>
                  Keep result
                </button>
              </>
            )}
            {owned &&
              ["awaiting_push_decision", "awaiting_talent_decision"].includes(
                r.status,
              ) &&
              r.talents.includes("Path of the Forest") && (
                <button
                  disabled={busy || r.availableWillpower < 1}
                  onClick={() => void command(r, "talent")}
                >
                  Authorize Path of the Forest · spend 1 WP
                </button>
              )}
            {owned && r.status === "awaiting_talent_decision" && (
              <button
                disabled={busy}
                onClick={() => void command(r, "decline")}
              >
                Decline talent
              </button>
            )}
            {owned &&
              r.artifactAllowed &&
              r.status === "awaiting_roll" &&
              r.expression?.kind === "pool" &&
              !r.expression.artifacts.length && (
                <button
                  disabled={busy}
                  onClick={() => void command(r, "artifact")}
                >
                  Use Quartermaster D8
                </button>
              )}
            {owned && !r.savedRollId && (
              <button
                disabled={busy}
                onClick={() => void command(r, "recheck")}
              >
                Recheck sheet and sources
              </button>
            )}
            <details>
              <summary>Advanced Diagnostics · binding and sources</summary>
              <p>
                Request {r.id} · revision {r.revision}; saved roll{" "}
                {r.savedRollId ?? "none"} · revision{" "}
                {r.savedRollRevision ?? "none"}
              </p>
              <ul>
                {r.sources.map((s, i) => (
                  <li key={i}>
                    {s.title} · physical page {s.page} · {s.chunkId}
                  </li>
                ))}
              </ul>
              <pre className={styles.packet}>
                {JSON.stringify(r.audit, null, 2)}
              </pre>
              {isTableGM && (
                <>
                  <label>
                    Table GM review reason
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      minLength={12}
                    />
                  </label>
                  <button
                    disabled={busy || reason.trim().length < 12}
                    onClick={() => void command(r, "review", { reason })}
                  >
                    Record mechanical review
                  </button>
                  {r.savedRollId && (
                    <>
                      <p>{r.correction.warning}</p>
                      <p>
                        Affected requests: {r.correction.affectedIds.join(", ")}
                      </p>
                      <label>
                        <input
                          type="checkbox"
                          checked={reviewed === r.id}
                          onChange={(e) =>
                            setReviewed(e.target.checked ? r.id : null)
                          }
                        />{" "}
                        I reviewed these bindings and retained Push costs.
                      </label>
                      <button
                        disabled={
                          busy || reviewed !== r.id || reason.trim().length < 12
                        }
                        onClick={() =>
                          void command(r, "correct", {
                            reason,
                            previewHash: r.correction.hash,
                          })
                        }
                      >
                        Supersede reviewed binding
                      </button>
                    </>
                  )}
                </>
              )}
            </details>
          </article>
        );
      })}
      {characterId && (
        <details open>
          <summary>Universal Dice Tray · miscellaneous rolls</summary>
          <p>
            Unlinked rolls stay separate. Link a saved result explicitly to a
            compatible current request.
          </p>
          <label>
            Dice expression
            <select
              value={
                ["D6", "D8", "D10", "D12", "D20", "D66"].includes(expression)
                  ? expression
                  : "Custom"
              }
              onChange={(e) =>
                setExpression(
                  e.target.value === "Custom" ? "2D6+1" : e.target.value,
                )
              }
            >
              {["D6", "D8", "D10", "D12", "D20", "D66", "Custom"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <input
            aria-label="Custom dice expression"
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            maxLength={100}
          />
          <button
            disabled={busy}
            onClick={() =>
              void command(null, "roll", {
                expression: { kind: "dice", expression } satisfies DiceSpec,
              })
            }
          >
            Roll miscellaneous dice
          </button>
          <label>
            Link destination
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Choose a pending request</option>
              {pending
                .filter((r) => r.status === "awaiting_roll")
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.procedure} ·{" "}
                    {r.expression?.kind === "dice"
                      ? r.expression.expression
                      : r.expression?.skill}
                  </option>
                ))}
            </select>
          </label>
          {queue.savedRolls
            .filter(
              (c) => c.characterId === characterId && !c.phase7?.requestId,
            )
            .map((c) => (
              <p key={c.id}>
                {c.metadata.utility?.kind === "Custom"
                  ? c.metadata.utility.expression +
                    ": " +
                    c.metadata.utility.faces.join(", ") +
                    " → " +
                    c.metadata.utility.total
                  : c.original.skill +
                    ": " +
                    c.original.successes +
                    " successes"}{" "}
                · {c.id}{" "}
                <button
                  disabled={busy || !selected}
                  onClick={() =>
                    void command(
                      pending.find((r) => r.id === selected)!,
                      "link",
                      { rollId: c.id, rollRevision: c.phase7!.revision },
                    )
                  }
                >
                  Link this saved roll
                </button>
              </p>
            ))}
        </details>
      )}
      <details>
        <summary>Advanced Diagnostics · mechanical packet</summary>
        <p>
          {queue.packet.fullyResolved
            ? "All supported procedures mechanically determined."
            : "Required rolls, decisions or mechanical reviews remain."}{" "}
          No Quarter-Day transition has occurred.
        </p>
        <pre className={styles.packet} data-testid="resolution-packet">
          {JSON.stringify(queue.packet, null, 2)}
        </pre>
      </details>
    </section>
  );
}
