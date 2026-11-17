// Recognize the requested workflow, never an NPC command or completed outcome.
// NPC intentions still come exclusively from the typed world decision provider.
export function worldContinuationRequested(text: string) {
  const message = text.trim();
  return (
    /^(?:please\s+)?(?:continue|resume|proceed with|carry on with)\s+(?:(?:the|this|our|current|same|concluded|post-combat)\s+)*(?:scene|aftermath)\b/i.test(
      message,
    ) ||
    /^(?:(?:as (?:the )?(?:game master|gm)|(?:game master|gm))[,.:]?\s+)(?:please\s+)?(?:choose|decide|determine)\b/i.test(
      message,
    )
  );
}
