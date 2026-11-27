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
import { CampaignHeader } from "./campaign-header";
import { Sidebar } from "./sidebar";
import { HexMap } from "./hex-map";
import { GameplayTesting } from "./gameplay-testing";
import {
  Feather,
  Send,
  MessageSquare,
  Compass,
  Map as MapIcon,
  BookOpen,
  Users,
  Settings,
} from "lucide-react";
import type { CampaignRecord } from "@/lib/types";
type View = ReturnType<typeof gameplayView>;
const tools = [
  { name: "Conversation", icon: MessageSquare },
  { name: "Journey Settings", icon: Compass },
  { name: "Map", icon: MapIcon },
  { name: "Journal", icon: BookOpen },
  { name: "Characters", icon: Users },
  { name: "Rules Library", icon: BookOpen },
  { name: "Campaign Settings", icon: Settings },
];
const example =
  "Edrus makes camp, Grogahx forages, Rose keeps watch, and Elyanna rests.";
export function GameplayApp({ campaignId }: { campaignId: string }) {
  const [view, setView] = useState<View | null>(null),
    [record, setRecord] = useState<CampaignRecord | null>(null),
    [mobile, setMobile] = useState(false),
    [panel, setPanel] = useState("Conversation"),
    [revising, setRevising] = useState(false),
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
      const presentation = await fetch(
          "/api/gameplay/presentation?" +
            new URLSearchParams({ campaignId, actorId: v.actorId }),
          { cache: "no-store" },
        ),
        record = await presentation.json();
      if (!presentation.ok) throw Error(record.error);
      setRecord(record);
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
      | { type: "plan" | "revise"; assignments: Assignment[] },
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
          runId: view.run?.id,
        },
      };
    try {
      const r = await fetch(
          input.type === "declare"
            ? "/api/gameplay/conversation"
            : "/api/gameplay",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(retry.current.body),
          },
        ),
        v = await r.json();
      if (!r.ok) {
        retry.current = null;
        throw Error(v.error);
      }
      apply(v.view);
      setRevising(false);
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
  if (!view || !record)
    return (
      <main className="loading-screen">
        <h1>Ravenland Chronicles</h1>
        <p role="status">Loading the saved campaign…</p>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  const openSheet = (id: string) => {
    window.open(
      `/campaigns/${campaignId}/characters/${id}`,
      "ravenland-character-" + id,
      "width=1200,height=900",
    );
    setMobile(false);
  };
  return (
    <div className="app-shell">
      <CampaignHeader
        session={record.session}
        campaignId={campaignId}
        mobile={mobile}
        onMenu={() => setMobile(!mobile)}
        aiProvider="phase7"
      />
      <div className="workspace">
        <div className={mobile ? "sidebar-wrap open" : "sidebar-wrap"}>
          <Sidebar
            session={record.session}
            campaignId={campaignId}
            phase7
            onCharacter={openSheet}
          />
        </div>
        {mobile && (
          <button
            className="mobile-scrim"
            aria-label="Close sidebar"
            onClick={() => setMobile(false)}
          />
        )}
        <main className="main-column phase7-main">
          <nav className="nav-tabs" aria-label="Campaign tools">
            <div className="story-tab">
              <Feather size={16} />
              <div className="story-heading">
                <span className="story-chapter">THE RAVENLAND CHRONICLES</span>
                <h1>{view.clock.location}</h1>
              </div>
            </div>
            <div className="tool-tabs">
              {tools.map((t) => (
                <button
                  key={t.name}
                  aria-label={t.name}
                  title={t.name}
                  onClick={() => setPanel(t.name)}
                >
                  <t.icon size={16} />
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          </nav>
          <div className="phase7-content">
            {error && (
              <div role="alert" className="storage-error">
                {error}{" "}
                <button onClick={() => void load()}>
                  Refresh saved activity
                </button>
              </div>
            )}
            {panel === "Map" ? (
              <section>
                <h2>Map</h2>
                <p>
                  Inspect the map; the party remains at {view.clock.hex}. Travel
                  becomes available in Phase 7.0E.
                </p>
                <HexMap
                  record={record}
                  readOnly
                  onPlanJourney={() => setError(phase7Capability)}
                  onOpenJournal={() => setPanel("Journal")}
                />
              </section>
            ) : panel === "Journal" ? (
              <section>
                <h2>Journal & history</h2>
                {record.session.journal.map((e) => (
                  <article key={e.id}>
                    <h3>{e.title}</h3>
                    <p>{e.text}</p>
                  </article>
                ))}
                {record.session.messages.map((e) => (
                  <article key={e.id}>
                    <b>{e.author}</b>
                    <p>{e.text}</p>
                  </article>
                ))}
                {view.events.map((e) => (
                  <article key={e.id}>
                    <b>{e.kind.replaceAll("_", " ")}</b>
                    <p>{e.input}</p>
                    <p>{e.text}</p>
                  </article>
                ))}
              </section>
            ) : panel === "Characters" ? (
              <section>
                <h2>The party</h2>
                {view.party.map((c) => (
                  <article key={c.id}>
                    <h3>{c.name}</h3>
                    <p>{c.profession}</p>
                    <button
                      className="quiet-button"
                      onClick={() => openSheet(c.id)}
                    >
                      Open {c.name} character sheet
                    </button>
                  </article>
                ))}
              </section>
            ) : panel === "Rules Library" ? (
              <section>
                <h2>Rules Library</h2>
                {view.isTableGM ? (
                  <SourcebookLibraryPanel campaignId={campaignId} />
                ) : (
                  <p>Private source administration requires Table GM access.</p>
                )}
              </section>
            ) : panel === "Campaign Settings" ? (
              <section>
                <h2>Campaign Settings</h2>
                <p>{record.session.campaign.description}</p>
                <p>Tone: {record.session.campaign.settings.tone}</p>
                <p>
                  House rules:{" "}
                  {record.session.campaign.settings.houseRules ||
                    "None recorded"}
                </p>
                <p>
                  The existing server-side AI configuration, Table GM
                  assignment, sourcebook administrator token and player grants
                  remain in this profile. Current state corrections and gameplay
                  transitions require their Phase 7 operations.
                </p>
                <p>Current campaign: {view.campaignName}</p>
              </section>
            ) : panel === "Journey Settings" ? (
              <section aria-label="Authoritative campaign state">
                <h2>Journey Settings</h2>
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
                <p>{phase7Capability}</p>
              </section>
            ) : (
              <>
                <section className="phase7-quarter" aria-label="Saved activity">
                  <div>
                    <span className="eyebrow">QUARTER-DAY ACTIVITIES</span>
                    <h2>
                      <span data-testid="current-quarter">
                        {view.clock.quarter}
                      </span>{" "}
                      · {view.clock.displayDate}
                    </h2>
                    <p data-testid="activity-status">
                      {view.activity?.status ?? "Awaiting declaration"}
                    </p>
                  </div>
                  {view.activity && (
                    <ul>
                      {view.activity.assignments.map((a) => (
                        <li key={a.characterId}>
                          {view.party.find((c) => c.id === a.characterId)?.name}
                          : {a.activity}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p>
                    Time has not advanced. Activity consequences remain
                    unapplied.
                  </p>
                </section>
                <section
                  className="conversation phase7-conversation"
                  aria-label="Saved planning conversation"
                  role="log"
                >
                  <div className="session-divider">
                    <span />A NEW PATH UNFOLDS
                    <span />
                  </div>
                  {!view.events.length && (
                    <article className="message">
                      <div className="message-text">
                        <b>Game Master</b>
                        <p>
                          The party is at {view.clock.location}, in the{" "}
                          {view.clock.terrain}. It is {view.clock.quarter}. What
                          does the party do?
                        </p>
                        <p>
                          Declare one stationary activity per character.
                          Example: {example}
                        </p>
                      </div>
                    </article>
                  )}
                  {view.events.map((e) => (
                    <article className="message" key={e.id}>
                      <div className="message-text">
                        {e.input && (
                          <p>
                            <b>Party:</b> {e.input}
                          </p>
                        )}
                        <p>
                          <b>Game Master:</b> {e.text}
                        </p>
                      </div>
                    </article>
                  ))}
                  {answer && !view.events.some((e) => e.text === answer) && (
                    <p role="status">{answer}</p>
                  )}
                </section>
                {view.activity && view.rolls && (
                  <GameplayRolls
                    compact
                    key={view.run?.id ?? view.activity.id}
                    campaignId={campaignId}
                    activity={view.activity}
                    party={view.party}
                    actorId={view.actorId}
                    isTableGM={view.isTableGM}
                    initial={view.rolls}
                    onChanged={() => void load()}
                  />
                )}
                <div className="composer-area">
                  <div className="composer">
                    <div className="composer-header">
                      <span>YOUR NEXT MOVE</span>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void submit({ type: "declare", text });
                      }}
                    >
                      <label className="sr-only" htmlFor="party-declaration">
                        Party declaration
                      </label>
                      <textarea
                        id="party-declaration"
                        aria-label="Party declaration"
                        value={text}
                        maxLength={3000}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="What do you do?"
                        required
                      />
                      <div className="composer-bottom">
                        <button
                          className="send-button"
                          aria-label="Tell the GM"
                          disabled={busy || view.stale || !text.trim()}
                        >
                          {busy ? "…" : <Send size={17} />}
                        </button>
                      </div>
                    </form>
                  </div>
                  <p className="composer-footnote">{phase7Capability}</p>
                </div>
                <details open={revising || undefined} id="phase7-planner">
                  <summary>
                    Optional activity planner
                    {revising ? " · Revise Activity Plan" : ""}
                  </summary>
                  <p>
                    {revising
                      ? "Review every assignment. Revision is allowed only before saved dice."
                      : "This saves the same activity as conversation."}
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submit({
                        type: revising ? "revise" : "plan",
                        assignments,
                      });
                    }}
                  >
                    {assignments.map((a, i) => (
                      <label key={a.characterId}>
                        {view.party.find((c) => c.id === a.characterId)?.name}
                        <select
                          aria-label={
                            view.party.find((c) => c.id === a.characterId)?.name
                          }
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
                            aria-label="Other activity description"
                            value={a.description}
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
                      </label>
                    ))}
                    <button className="quiet-button" disabled={busy}>
                      {revising
                        ? "Confirm revised activity plan"
                        : "Save party plan"}
                    </button>
                    {revising && (
                      <button
                        type="button"
                        className="quiet-button"
                        onClick={() => setRevising(false)}
                      >
                        Cancel revision
                      </button>
                    )}
                  </form>
                </details>
                <GameplayTesting
                  view={view}
                  onChanged={() => {
                    retry.current = null;
                    setRevising(false);
                    void load();
                  }}
                  onRevise={() => {
                    setRevising(true);
                    document
                      .getElementById("phase7-planner")
                      ?.scrollIntoView({ block: "center" });
                  }}
                />
                <details>
                  <summary>Advanced Diagnostics</summary>
                  <p>
                    Phase {view.milestone} · activity{" "}
                    <span data-testid="activity-id">
                      {view.activity?.id ?? "none"}
                    </span>{" "}
                    · revision {view.activity?.revision ?? 0}
                  </p>
                  <pre>
                    {JSON.stringify(
                      {
                        run: view.run,
                        blockers: view.blockers,
                        capabilities: view.capabilities,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
