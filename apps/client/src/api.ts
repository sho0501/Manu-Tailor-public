import { get, set, clear, keys } from "idb-keyval";
import type { Generation, User } from "./types";
import { activeServer } from "./servers";
export const BASE = import.meta.env.VITE_API_BASE_URL || "";
export function apiBase() {
  return activeServer(BASE)?.url || BASE;
}
export function session(): { token: string; user: User } | null {
  try {
    return JSON.parse(localStorage.getItem("manu-session") || "null");
  } catch {
    return null;
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const token = session()?.token;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(apiBase() + "/api" + path, { ...options, headers });
  } catch (error) {
    if (
      path === "/generations" &&
      !options.method &&
      session()?.user.role === "user"
    ) {
      const prefix = `manual:${session()?.user.id}:`;
      const savedKeys = (await keys()).filter((k) =>
        String(k).startsWith(prefix),
      );
      return (await Promise.all(savedKeys.map((k) => get(k)))) as T;
    }
    throw error;
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : `通信エラー (${response.status})`,
    );
  }
  return response.json();
}
export async function fileBlob(filename: string): Promise<Blob> {
  const response = await fetch(
    apiBase() + "/api/files/" + encodeURIComponent(filename),
    { headers: { Authorization: `Bearer ${session()?.token}` } },
  );
  if (!response.ok) throw new Error("原文ファイルを取得できません。");
  return response.blob();
}
function key(id: string) {
  return `manual:${session()?.user.id}:${id}`;
}
export async function cachedManual(
  id: string,
): Promise<{ manual: Generation; offline: boolean }> {
  try {
    const manual = await api<Generation>("/generations/" + id);
    await set(key(id), manual);
    return { manual, offline: false };
  } catch (error) {
    if (navigator.onLine) throw error;
    const manual = await get<Generation>(key(id));
    if (!manual)
      throw new Error("このマニュアルはまだ端末に保存されていません。");
    return { manual, offline: true };
  }
}
export async function cacheFile(filename: string) {
  const cacheKey = `file:${session()?.user.id}:${filename}`;
  try {
    const blob = await fileBlob(filename);
    await set(cacheKey, blob);
    return blob;
  } catch (error) {
    const blob = await get<Blob>(cacheKey);
    if (blob) return blob;
    throw error;
  }
}
export async function clearPrivateCache() {
  await clear();
  localStorage.removeItem("manu-session");
  Object.keys(localStorage)
    .filter((k) => k.startsWith("progress:"))
    .forEach((k) => localStorage.removeItem(k));
}
