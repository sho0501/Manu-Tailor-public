export function manualPathFromUrl(raw: string): string | null {
  try {
    const url = new URL(raw, "https://manu.local");
    if (!["https:", "http:", "manutailor:"].includes(url.protocol)) return null;
    if (url.protocol === "manutailor:" && url.hostname !== "open") return null;
    return /^\/app\/manual\/[a-zA-Z0-9-]+$/.test(url.pathname)
      ? url.pathname
      : null;
  } catch {
    return null;
  }
}
