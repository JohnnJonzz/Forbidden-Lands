// Never expose an HTML proxy error as a JSON parser exception in the library UI.
export function sourcebookResponse(text: string, status: number) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw Error(
      `Sourcebook request failed (HTTP ${status}). The server or proxy returned an invalid response. Retry the original file after checking the server upload limit and connection.`,
    );
  }
  if (status < 200 || status >= 300)
    throw Error(
      typeof value?.error === "string"
        ? value.error
        : `Sourcebook request failed (HTTP ${status}). Retry the original file.`,
    );
  return value;
}
