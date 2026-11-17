// Test-process-only SDK transport. No application mock flag or paid requests.
import { readFileSync, appendFileSync } from "node:fs";
const nativeFetch = globalThis.fetch;
globalThis.fetch = async function (input, init) {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (!url.startsWith("https://api.openai.com/"))
    return nativeFetch(input, init);
  const body = JSON.parse(init?.body ?? "{}");
  if (body.text?.format?.name !== "world_decision")
    throw Error(
      "Unexpected AI route in post-combat test: " + body.text?.format?.name,
    );
  const { world } = JSON.parse(body.input),
    mode = JSON.parse(
      readFileSync(process.env.RAVENLAND_ROUTING_FIXTURE, "utf8"),
    ).mode;
  appendFileSync(
    process.env.RAVENLAND_ROUTING_LOG,
    JSON.stringify({
      sceneId: world.sceneId,
      mode,
      actors: world.actors.map((a) => a.id),
    }) + "\n",
  );
  const target = world.targets.find((a) => a.broken),
    actor = world.actors[0];
  const kind =
    mode === "transfer"
      ? "transfer"
      : world.recentEvents.some((e) => e.code === "observed")
        ? "search"
        : "observe";
  const output = {
    action: {
      kind,
      actorId: actor.id,
      targetId: target.id,
      itemRef: kind === "transfer" ? "gear:0" : null,
      destination: null,
      interaction: null,
      intent: "The established bandit pursues the recorded robbery objective.",
    },
    boundary: "",
  };
  return new Response(
    JSON.stringify({
      id: "controlled_world_decision",
      status: "completed",
      model: body.model,
      output: [
        {
          id: "controlled_message",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text:
                mode === "invalid"
                  ? "invalid controlled decision"
                  : JSON.stringify(output),
              annotations: [],
            },
          ],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 10 },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
