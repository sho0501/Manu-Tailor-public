export function allowedServerUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/")
    return false;
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  if (host.endsWith(".local")) return true;
  const octets = host.split(".").map(Number);
  if (
    octets.length !== 4 ||
    host.split(".").some((part) => !/^\d{1,3}$/.test(part)) ||
    octets.some((part) => part > 255)
  )
    return false;
  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}
