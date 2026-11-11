export const sanitizeTrackingEvent = <T extends { url: string }>(event: T) => {
  try {
    const url = new URL(event.url);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.search = "";
    url.hash = "";
    return { ...event, url: url.toString() };
  } catch {
    return null;
  }
};
