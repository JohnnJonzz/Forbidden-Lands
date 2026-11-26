// Isolated browser-test SDK transport. Production never imports this module.
const realFetch = globalThis.fetch;
globalThis.fetch = async function (input, options) {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (!url.startsWith("https://api.openai.com/"))
    return realFetch(input, options);
  const body = JSON.parse(String(options?.body ?? "{}"));
  if (!body.stream)
    return new Response(
      JSON.stringify({
        id: "resp_test",
        status: "completed",
        model: "controlled-browser",
        output_text: JSON.stringify({ choice: 0 }),
        output: [
          {
            type: "message",
            content: [
              { type: "output_text", text: JSON.stringify({ choice: 0 }) },
            ],
          },
        ],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  const output = {
    narration:
      "The snake was avoided. The orcs were avoided. Evening has ended. Night has begun.",
    memoryProposals: [],
    actions: [],
    selectedImageId: null,
  };
  const events = [
    { type: "response.output_text.delta", delta: JSON.stringify(output) },
    {
      type: "response.completed",
      response: {
        id: "resp_test",
        status: "completed",
        model: "controlled-browser",
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    },
  ];
  return new Response(
    events.map((e) => "data: " + JSON.stringify(e) + "\n\n").join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );
};
