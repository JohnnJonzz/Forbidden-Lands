import { initialSession } from "../../lib/mock";
export function syntheticSession() {
  const s = structuredClone(initialSession);
  s.messages = [];
  s.journal = [];
  delete s.chatJourney;
  delete s.quarterDays;
  delete s.dayTracker;
  delete s.journey;
  delete s.activityState;
  delete s.activityOutcomes;
  delete s.campsites;
  delete s.environment;
  delete s.calendarState;
  Object.assign(s.campaign, {
    name: "Phase 7 isolated V09 planning",
    date: "13th Springrise, 1165",
    quarter: "Evening",
    hex: "V09",
    location: "V09",
    terrain: "Dark Forest",
    weather: "Clear — synthetic starting condition",
  });
  s.characters.forEach((c, i) => {
    c.name = ["Grogahx", "Edrus", "Elyanna", "Rose Underbough"][i] ?? c.name;
    c.sheet = {
      name: c.name,
      kin: c.kin,
      profession: c.profession,
      ...Object.fromEntries(
        ["strength", "agility", "wits", "empathy"].flatMap((a) => [
          [`attr-${a}`, "3"],
          [`attr-${a}-regular`, "3"],
        ]),
      ),
      talents: [],
      gear: [],
      weapons: [],
      willpower: "3",
      "skill-survival": "1",
      "skill-scouting": "1",
      "res-food": "D8",
      "res-water": "D8",
    };
  });

  return s;
}
