import type { SqliteCampaignRepository } from "../sqlite";
import { activeChatForm } from "../../lib/journey/chat-engine";
import { currentRoutine } from "../../lib/activities";
import { checkFor } from "./director";
import { mishapBlockers } from "./recovery";
import { readFlow } from "./store";
export function guardQuarterNarration(
  repo: SqliteCampaignRepository,
  id: string,
  text: string,
) {
  const s = repo.get(id)?.session;
  if (!s) return text;
  const entryId = activeChatForm(s)?.entryId ?? currentRoutine(s)?.entryId;
  if (!entryId) return text;
  const entry = s.dayTracker?.find((e) => e.id === entryId);
  if (!entry) return text;
  const next = {
    Morning: "Day",
    Day: "Evening",
    Evening: "Night",
    Night: "Morning",
  }[s.campaign.quarter];
  const falseTime = new RegExp(
    `\\b(?:${next} (?:has (?:now )?begun|begins|began|starts|started|falls|fell|settles|is here)|(?:it is|it's|welcome to|we (?:have )?advance(?:d)? to|you enter) (?:now )?${next}|${entry.quarter}(?: quarter[- ]?day)? (?:(?:has|had) (?:now )?)?(?:ended|ends|finished|concluded|is (?:over|complete))|quarter[- ]?day (?:has (?:been )?)?(?:completed|advanced|ended))\\b`,
    "i",
  ).test(text);
  const check = checkFor(repo, id, s, entryId),
    unclosed = check && ["scene", "review", "pending"].includes(check.status),
    falseAvoid =
      unclosed &&
      /\b(?:(?:you|we|the party) (?:have |has )?(?:successfully )?(?:avoided|escaped|evaded)|(?:orcs?|encounter|procession) (?:(?:has|have) (?:been )?|was |were |is )?(?:successfully )?(?:avoided|escaped|resolved)|procession (?:passes|passed) (?:by )?(?:unseen|without incident))\b/i.test(
        text,
      );
  const falseEscape =
    check?.resolutionKind === "declined_contact" &&
    /\b(?:escaped|evaded|fled|out(?:ran|run))\b/i.test(text);
  const corrections = mishapBlockers(s, entryId),
    falseMishap =
      corrections.length &&
      /\b(?:snake|serpent|bite)\b[^.!?]{0,100}\b(?:avoided|dodged|evaded|missed)\b|\b(?:avoided|dodged|evaded)\b[^.!?]{0,100}\b(?:snake|serpent|bite)\b/i.test(
        text,
      );
  if (!falseTime && !falseAvoid && !falseMishap && !falseEscape) return text;
  const blockers = [
    ...(falseEscape
      ? [
          "The recorded outcome is declining distant contact; no combat or pursuit escape was established.",
        ]
      : []),
    ...corrections,
    ...(unclosed
      ? [
          `The saved encounter remains ${check.status}; choose its supported avoidance procedure or reviewed Table GM outcome.`,
        ]
      : []),
  ];
  return `The authoritative clock remains ${s.campaign.quarter} at ${s.campaign.hex}. ${blockers.join(" ") || readFlow(repo, id, entryId)?.prompt || "Resolve the current activity requirements, then use Complete quarter-day."}`;
}
