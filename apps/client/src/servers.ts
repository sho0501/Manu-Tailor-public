import { allowedServerUrl } from "./server-url";

export interface SavedServer {
  id: string;
  name: string;
  url: string;
}

const listKey = "manu-servers";
const activeKey = "manu-active-server";
const testServerId = "test";
const changedEvent = "manu-servers-changed";

function notifyChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(changedEvent));
}

export function watchServers(listener: () => void) {
  window.addEventListener(changedEvent, listener);
  return () => window.removeEventListener(changedEvent, listener);
}

export function savedServers(defaultUrl: string): SavedServer[] {
  const stored = localStorage.getItem(listKey);
  if (stored) {
    try {
      const servers = JSON.parse(stored);
      if (Array.isArray(servers)) {
        const valid = servers.filter(
          (server): server is SavedServer =>
            typeof server.id === "string" &&
            typeof server.name === "string" &&
            typeof server.url === "string" &&
            (allowedServerUrl(server.url) ||
              ((server.id === "personal" || server.id === testServerId) && !server.url)),
        );
        const existingTest = valid.find((server) => server.id === testServerId);
        const former = existingTest || valid.find((server) => server.id === "personal" || server.id === "initial");
        const migrated = former
          ? [{ ...former, id: testServerId,
               name: former.id === testServerId ? former.name : "Test", url: former.url || defaultUrl },
             ...valid.filter((server) => ![testServerId, "personal", "initial"].includes(server.id))]
          : valid;
        if (former && ["personal", "initial"].includes(localStorage.getItem(activeKey) || ""))
          localStorage.setItem(activeKey, testServerId);
        if (former && (former.id !== testServerId || migrated.length !== valid.length))
          localStorage.setItem(listKey, JSON.stringify(migrated));
        if (migrated.length) return migrated;
      }
    } catch {
      // Recover below from the previous single-server setting.
    }
  }
  const previous = localStorage.getItem("manu-api-base");
  const servers: SavedServer[] = [
    { id: testServerId, name: "Test", url: defaultUrl },
  ];
  if (previous && allowedServerUrl(previous))
    servers.push({ id: "previous", name: "以前のサーバー", url: previous });
  localStorage.setItem(listKey, JSON.stringify(servers));
  localStorage.setItem(activeKey, testServerId);
  return servers;
}

export function activeServer(defaultUrl: string): SavedServer | undefined {
  const servers = savedServers(defaultUrl);
  return (
    servers.find((server) => server.id === localStorage.getItem(activeKey)) ||
    servers[0]
  );
}

export function saveServer(server: SavedServer, defaultUrl: string) {
  const name = server.name.trim();
  const url = server.url.trim().replace(/\/$/, "");
  if (!name || name.length > 80 || !(allowedServerUrl(url) || (server.id === testServerId && !url)))
    throw new Error("名前と有効なサーバーURLを入力してください。");
  const servers = savedServers(defaultUrl).filter(
    (item) => item.id !== server.id,
  );
  if (servers.some((item) => item.url === url))
    throw new Error("同じURLのサーバーは登録済みです。");
  localStorage.setItem(listKey, JSON.stringify([...servers, { ...server, name, url }]));
  notifyChanged();
}

export function removeServer(id: string, defaultUrl: string) {
  const servers = savedServers(defaultUrl).filter((server) => server.id !== id);
  if (!servers.length)
    throw new Error("少なくとも1つのサーバーを残してください。");
  localStorage.setItem(listKey, JSON.stringify(servers));
  if (localStorage.getItem(activeKey) === id)
    localStorage.setItem(activeKey, servers[0].id);
  notifyChanged();
}

export function selectServer(id: string, defaultUrl: string) {
  if (!savedServers(defaultUrl).some((server) => server.id === id))
    throw new Error("サーバーが見つかりません。");
  localStorage.setItem(activeKey, id);
  localStorage.removeItem("manu-api-base");
  notifyChanged();
}
