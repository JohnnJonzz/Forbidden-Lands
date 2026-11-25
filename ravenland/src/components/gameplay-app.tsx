"use client";
import { GameplayRolls } from "./gameplay-rolls";
import { SourcebookLibraryPanel } from "./sourcebook-library";
import { useEffect, useState, useRef } from "react";
import {
  stationaryActivities,
  phase7Capability,
  type Assignment,
} from "@/lib/gameplay";
import type { gameplayView } from "@/server/gameplay/service";
import styles from "./gameplay-app.module.css";
type View = ReturnType<typeof gameplayView>;
const example =
  "Edrus makes camp, Grogahx forages, Rose keeps watch, and Elyanna rests.";
export function GameplayApp({ campaignId }: { campaignId: string }) {
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [answer, setAnswer] = useState(""),
    [assignments, setAssignments] = useState<Assignment[]>([]);
  const retry = useRef<{ key: string; body: unknown } | null>(null);
  function apply(v: View) {
    setView(v);
    setAssignments(
      v.party.map(
        (c) =>
          v.activity?.assignments.find((a) => a.characterId === c.id) ?? {
            characterId: c.id,
            activity: "Rest",
            description: "",
          },
      ),
    );
  }
  async function load() {
    try {
      const r = await fetch(
          `/api/gameplay?campaignId=${encodeURIComponent(campaignId)}`,
          { cache: "no-store" },
        ),
        v = await r.json();
      if (!r.ok) throw Error(v.error);
      apply(v);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load saved activity",
      );
    }
  }
  useEffect(() => {
    void load();
  }, [campaignId]); // The page reads Phase 7 only; it never creates a legacy activity form.
  async function submit(
    input:
      | { type: "declare"; text: string }
      | { type: "plan"; assignments: Assignment[] },
  ) {
    if (!view || busy) return;
    setBusy(true);
    setError("");
    const key = JSON.stringify(input);
    if (retry.current?.key !== key)
      retry.current = {
        key,
        body: {
          ...input,
          campaignId,
          actorId: view.actorId,
          operationId: crypto.randomUUID(),
          campaignRevision: view.campaignRevision,
          activityRevision: view.activity?.revision ?? null,
        },
      };
    try {
      const r = await fetch("/api/gameplay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(retry.current.body),
        }),
        v = await r.json();
      if (!r.ok) {
        retry.current = null;
        throw Error(v.error);
      }
      apply(v.view);
      setAnswer(v.text);
      retry.current = null;
      if (input.type === "declare") setText("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Request interrupted. Retry the same declaration safely.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={styles.shell}>
      <header>
        <p className={styles.eyebrow}>
          Ravenland Chronicles · Isolated Phase 7 development
        </p>
        <h1>The party’s next quarter</h1>
        <p>
          {view?.milestone ?? "Phase 7"} · Stationary activities.{" "}
          {phase7Capability}
        </p>
        <a href="/">Reload saved campaign</a>
      </header>
      {error && (
        <div role="alert" className={styles.error}>
          {error}{" "}
          <button onClick={() => void load()}>Refresh saved activity</button>
        </div>
      )}
      {!view ? (
        <p>Loading the saved campaign…</p>
      ) : (
        <div className={styles.columns}>
          <section className={styles.panel} aria-label="Conversation">
            <h2>What does the party do?</h2>
            <p>
              Declare one stationary activity for each character. Rest and Sleep
              are separate choices.
            </p>
            <p className={styles.example}>Example: {example}</p>
            <div
              className={styles.history}
              aria-label="Saved planning conversation"
            >
              {view.events.length ? (
                view.events.map((e) => (
                  <article key={e.id}>
                    <p>
                      <b>Party:</b> {e.input}
                    </p>
                    <p>
                      <b>Game Master:</b> {e.text}
                    </p>
                  </article>
                ))
              ) : (
                <p>
                  No plan has been declared. The campaign remains at{" "}
                  {view.clock.quarter}.
                </p>
              )}
            </div>
            {answer && !view.events.some((e) => e.text === answer) && (
              <p role="status">{answer}</p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit({ type: "declare", text });
              }}
            >
              <label htmlFor="party-declaration">Party declaration</label>
              <textarea
                id="party-declaration"
                value={text}
                maxLength={3000}
                onChange={(e) => setText(e.target.value)}
                placeholder={example}
                required
              />
              <button disabled={busy || view.stale || !text.trim()}>
                {busy ? "Saving…" : "Tell the GM"}
              </button>
            </form>
            <details>
              <summary>Optional activity planner</summary>
              <p>
                This saves the same activity as conversation. Review every
                selection before saving.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit({ type: "plan", assignments });
                }}
              >
                {assignments.map((a, i) => (
                  <div className={styles.assignment} key={a.characterId}>
                    <label htmlFor={"activity-" + a.characterId}>
                      {view.party.find((c) => c.id === a.characterId)?.name}
                    </label>
                    <select
                      id={"activity-" + a.characterId}
                      value={a.activity}
                      onChange={(e) =>
                        setAssignments((old) =>
                          old.map((v, j) =>
                            j === i
                              ? {
                                  ...v,
                                  activity: e.target
                                    .value as Assignment["activity"],
                                }
                              : v,
                          ),
                        )
                      }
                    >
                      {stationaryActivities.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                    {a.activity === "Other" && (
                      <input
                        aria-label={
                          "Describe " +
                          view.party.find((c) => c.id === a.characterId)?.name +
                          " activity"
                        }
                        value={a.description}
                        required
                        maxLength={500}
                        onChange={(e) =>
                          setAssignments((old) =>
                            old.map((v, j) =>
                              j === i
                                ? { ...v, description: e.target.value }
                                : v,
                            ),
                          )
                        }
                      />
                    )}
                  </div>
                ))}
                <button disabled={busy || view.stale}>Save party plan</button>
              </form>
            </details>
          </section>
          {view.rolls && view.activity && (
            <GameplayRolls
              campaignId={campaignId}
              activity={view.activity}
              party={view.party}
              actorId={view.actorId}
              isTableGM={view.isTableGM}
              initial={view.rolls}
              onChanged={() => void load()}
            />
          )}
          <aside>
            <section
              className={styles.panel}
              aria-label="Authoritative campaign state"
            >
              <h2>Current campaign</h2>
              <dl>
                <dt>Date</dt>
                <dd>{view.clock.displayDate}</dd>
                <dt>Quarter</dt>
                <dd data-testid="current-quarter">{view.clock.quarter}</dd>
                <dt>Location</dt>
                <dd>
                  {view.clock.location} · {view.clock.hex}
                </dd>
                <dt>Terrain</dt>
                <dd>{view.clock.terrain}</dd>
                <dt>Weather</dt>
                <dd>{view.clock.weather}</dd>
                <dt>Campsite</dt>
                <dd>{view.clock.campsite ?? "None established"}</dd>
              </dl>
            </section>
            <section className={styles.panel} aria-label="Saved activity">
              <h2>Saved activity</h2>
              <p data-testid="activity-status">
                {view.activity?.status ?? "Awaiting declaration"}
              </p>
              {view.activity && (
                <>
                  <small>
                    Activity{" "}
                    <span data-testid="activity-id">{view.activity.id}</span> ·
                    revision {view.activity.revision}
                  </small>
                  <ul>
                    {view.activity.assignments.map((a) => (
                      <li key={a.characterId}>
                        {view.party.find((c) => c.id === a.characterId)?.name}:{" "}
                        {a.activity}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {view.blockers.map((b, i) => (
                <p key={i}>{b}</p>
              ))}
              <p>
                {view.rolls
                  ? "Rolls and decisions appear in Pending Rolls. Activity consequences remain unapplied; time has not advanced."
                  : "No roll has been requested. No activity is mechanically resolved. Time has not advanced."}
              </p>
            </section>
          </aside>
        </div>
      )}
      {view?.rolls && view.isTableGM && (
        <details className={styles.panel}>
          <summary>Existing Rules Library administration</summary>
          <p>
            Use the existing private Handbook already indexed for this profile.
            This panel retains the application’s separate GM administration
            token. Upgrading never uploads, moves or copies sourcebook files.
          </p>
          <SourcebookLibraryPanel campaignId={campaignId} />
        </details>
      )}
    </main>
  );
}
