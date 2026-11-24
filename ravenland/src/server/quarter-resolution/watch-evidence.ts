import type { Session } from "../../lib/types";
import { mechanicalCharacter } from "../mechanical-character";
import { stableId, type Flow } from "./store";
export function eligibleWatchCards(s: Session, entryId: string, f: Flow) {
  const entry = s.dayTracker?.find((e) => e.id === entryId),
    watch = entry?.assignments.find((a) => a.activity === "Keep Watch");
  if (!watch) return [];
  const mechanics = mechanicalCharacter(
    s.characters.find((c) => c.id === watch.characterId)!,
  );
  return (s.dice ?? []).filter((d) => {
    const native =
        d.activityContext?.entryId === entryId &&
        d.activityContext.assignmentId === watch.id &&
        d.activityContext.step === "watch",
      bound = d.quarterRequestId === stableId(entryId, "watch") || native;
    return (
      d.characterId === watch.characterId &&
      (!f.selected.watch || d.id === f.selected.watch) &&
      d.result.skill === "Scouting" &&
      d.metadata.attribute === "wits" &&
      !d.metadata.utility &&
      !d.metadata.isArmor &&
      !d.journeyContext &&
      !d.combatContext &&
      !d.procedureContext &&
      !d.narrativeRequestId &&
      (!d.activityContext || native) &&
      !d.original.gear.length &&
      !d.original.artifacts.length &&
      (bound ||
        ((d.id === watch.rollId ||
          d.id === f.selected.watch ||
          (d.status === "Pending" &&
            d.createdAt >=
              (s.chatJourney?.forms.find((f) => f.entryId === entryId)
                ?.requestedAt ?? entry!.submittedAt))) &&
          d.original.attribute.length === mechanics.attributes.wits.current &&
          d.original.skillDice.length === mechanics.skills["skill-scouting"] &&
          !d.original.negativeSkill))
    );
  });
}
