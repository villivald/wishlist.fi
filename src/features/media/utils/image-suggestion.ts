export const suggestionUrl = (input: string) => {
  const value = input.trim();
  if (!value || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value))
    return "";
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port
    )
      return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
};

export const retryDelay = (input: unknown, fallback = 60_000) => {
  if (typeof input !== "string") return fallback;
  const value = input.trim();
  const delay = /^\d+$/.test(value)
    ? Number(value) * 1000
    : Date.parse(value) - Date.now();
  return Number.isFinite(delay)
    ? Math.min(Math.max(0, delay), 2_147_483_647)
    : fallback;
};
