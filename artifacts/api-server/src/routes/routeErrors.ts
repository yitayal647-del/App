type ErrorLike = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  cause?: unknown;
};

export function safeErrorDetails(error: unknown) {
  let current: unknown = error;
  const seen = new Set<unknown>();
  let deepest: ErrorLike | null = null;

  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    const candidate = current as ErrorLike;
    deepest = candidate;
    if (!candidate.cause) break;
    current = candidate.cause;
  }

  const message =
    typeof deepest?.message === "string"
      ? deepest.message
      : typeof error === "object" && error !== null && "message" in error &&
          typeof error.message === "string"
        ? error.message
        : "Unknown error";
  const code =
    typeof deepest?.code === "string" || typeof deepest?.code === "number"
      ? deepest.code
      : undefined;

  return {
    name: typeof deepest?.name === "string" ? deepest.name : "Error",
    ...(code !== undefined ? { code } : {}),
    message: message
      .split("\n")[0]
      .replace(/https?:\/\/\S+/g, "[url]")
      .slice(0, 240),
  };
}
