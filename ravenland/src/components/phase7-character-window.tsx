"use client";
import { useEffect, useState, useRef } from "react";
import { useCampaign } from "@/hooks/use-campaign";
import { SheetEmbed } from "./sheet-embed";
import { GameplayRolls } from "./gameplay-rolls";
import type { gameplayView } from "@/server/gameplay/service";
import type { DiceInput } from "@/lib/dice/schema";
import type { DiceSpec } from "@/lib/gameplay-rolls";
import styles from "./gameplay-app.module.css";
export function Phase7CharacterWindow({
  campaignId,
  characterId,
}: {
  campaignId: string;
  characterId: string;
}) {
  const storage = useCampaign(campaignId),
    [view, setView] = useState<ReturnType<typeof gameplayView> | null>(null),
    [error, setError] = useState("");
  const pending = useRef(new Map<string, unknown>());
  const character = storage.record?.session.characters.find(
    (c) => c.id === characterId,
  );
  async function refresh() {
    try {
      const response = await fetch(
          "/api/gameplay?" +
            new URLSearchParams({ campaignId, actorId: characterId }),
          { cache: "no-store" },
        ),
        data = await response.json();
      if (!response.ok) throw Error(data.error);
      setView(data);
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    void refresh();
  }, [campaignId, characterId]);
  async function onDice(
    input: DiceInput | { type: "phase7"; expression: DiceSpec; rollId: string },
    operationId: string,
  ) {
    await storage.waitForSaves();
    if (pending.current.has(operationId))
      return send(pending.current.get(operationId), operationId);
    const response = await fetch(
        "/api/gameplay?" +
          new URLSearchParams({ campaignId, actorId: characterId }),
        { cache: "no-store" },
      ),
      v = (await response.json()) as ReturnType<typeof gameplayView>;
    if (view?.run?.id !== v.run?.id)
      throw Error(
        "This test run changed. Reload this character window before rolling or editing the new run.",
      );
    if (!v.activity || !v.rolls)
      throw Error("Save the current Phase 7 activity first.");
    let request = null,
      expression: DiceSpec | undefined,
      rollId: string | undefined,
      operation = "roll";
    if (input.type === "create" || input.type === "phase7") {
      if (input.type === "phase7") {
        expression = input.expression;
        rollId = input.rollId;
      } else {
        rollId = input.roll.id;
        const utility = input.metadata.utility;
        if (utility) {
          if (utility.kind === "Resource")
            throw Error(
              "Resource consumption is not connected to the 7.0B tray; miscellaneous dice never spend resources.",
            );
          expression = {
            kind: "dice",
            expression:
              utility.kind === "D66"
                ? "D66"
                : utility.kind === "Custom"
                  ? utility.expression
                  : utility.faces.length === 1
                    ? "D6"
                    : utility.faces.length + "D6",
          };
        } else
          expression = {
            kind: "pool",
            attribute: input.metadata.attribute ?? "wits",
            skill: input.roll.skill,
            base: input.roll.attribute.length,
            skillDice:
              input.roll.skillDice.length * (input.roll.negativeSkill ? -1 : 1),
            gear: input.roll.gear.length,
            artifacts: input.roll.artifacts.map((d) => d.sides),
          };
      }
      const matches = v.rolls.requests.filter(
        (r) =>
          r.characterId === characterId &&
          r.status === "awaiting_roll" &&
          JSON.stringify(r.expression) === JSON.stringify(expression),
      );
      if (matches.length > 1)
        throw Error(
          "Several requests match. Select the intended request in Pending Rolls.",
        );
      request = matches[0] ?? null;
    } else if (input.type === "push") {
      operation = "push";
      request =
        v.rolls.requests.find(
          (r) => r.savedRollId === input.rollId && r.status !== "superseded",
        ) ?? null;
      if (!request)
        throw Error(
          "Link this miscellaneous roll to its verified procedure before an authoritative Push.",
        );
    } else
      throw Error(
        "Use the Phase 7 queue to keep or review this result. Legacy submission is disabled.",
      );
    const body = {
      campaignId,
      activityId: v.activity.id,
      actorId: characterId,
      operationId,
      runId: v.run?.id,
      requestId: request?.id ?? null,
      revision: request?.revision ?? null,
      operation,
      ...(operation === "roll" ? { expression, rollId } : {}),
    };
    pending.current.set(operationId, body);
    return send(body, operationId);
  }
  async function send(body: unknown, operationId: string) {
    const result = await fetch("/api/gameplay/rolls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      value = await result.json();
    if (!result.ok) {
      pending.current.delete(operationId);
      throw Error(value.error);
    }
    await storage.reload(false);
    await refresh();
    const current = await (
      await fetch("/api/campaigns?id=" + campaignId, { cache: "no-store" })
    ).json();
    pending.current.delete(operationId);
    return current;
  }
  return (
    <main className={styles.shell}>
      <h1>{character?.name ?? "Character sheet"}</h1>
      <a href={`/campaigns/${campaignId}/play`}>Return to campaign</a>
      <p>
        Use Pending Rolls below for the verified pool and linked procedural
        dice. The sheet’s existing skill controls also save server-generated
        results; an exact single compatible request can bind automatically.
        Resource consumption and combat preparation are outside 7.0B.
      </p>
      {error && <p role="alert">{error}</p>}
      {view?.activity && view.rolls && (
        <GameplayRolls
          campaignId={campaignId}
          activity={view.activity}
          party={view.party}
          actorId={characterId}
          isTableGM={view.isTableGM}
          initial={view.rolls}
          characterId={characterId}
          onChanged={() => {
            void storage.reload(false);
            void refresh();
          }}
        />
      )}
      {character ? (
        <SheetEmbed
          character={character}
          campaignId={campaignId}
          mode="sheet"
          onChange={(id, sheet, before) =>
            storage.saveSheet(id, sheet, before, view?.run?.id)
          }
          dice={storage.record?.session.dice ?? []}
          onDice={onDice}
          onPhase7Roll={(expression, rollId, operationId) =>
            onDice({ type: "phase7", expression, rollId }, operationId)
          }
          legacyGameplay={false}
        />
      ) : (
        <p>{storage.error || "Loading character…"}</p>
      )}
    </main>
  );
}
