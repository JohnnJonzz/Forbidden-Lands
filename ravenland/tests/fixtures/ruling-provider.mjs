// Process-scoped transport for isolated browser verification. Never forwards OpenAI requests.
import { readFileSync, appendFileSync } from "node:fs";
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
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
    throw Error("Unexpected paid-model route blocked by test transport");
  const value = JSON.parse(body.input),
    world = value.world;
  appendFileSync(
    process.env.RAVENLAND_RULING_CALLS,
    JSON.stringify({ sceneId: world.sceneId }) + "\n",
  );
  const spoken = world.recentEvents.some((v) => v.code === "interacted"),
    action = spoken
      ? null
      : {
          kind: "interact",
          actorId: world.actors[0].id,
          targetId: world.targets.find((v) => v.broken).id,
          itemRef: null,
          destination: null,
          interaction: "speak",
          intent:
            "The established bandit changes his conversational approach while pursuing robbery.",
        };
  return new Response(
    JSON.stringify({
      id: "resp_ruling",
      status: "completed",
      model: body.model,
      output: [
        {
          id: "msg_ruling",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                action,
                boundary: "A meaningful scene beat has completed.",
              }),
              annotations: [],
            },
          ],
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
