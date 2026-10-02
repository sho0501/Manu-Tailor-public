import { afterEach, describe, expect, it } from "vitest";
import {
  activeServer,
  removeServer,
  savedServers,
  saveServer,
  selectServer,
} from "./servers";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
});

describe("saved servers", () => {
  it("starts with a default and supports multiple selectable servers", () => {
    Object.assign(globalThis, { localStorage: new MemoryStorage() });
    const initial = "http://10.12.24.147:8000";
    expect(activeServer(initial)?.url).toBe(initial);
    expect(savedServers(initial)[0]).toMatchObject({ id: "test", name: "Test" });
    saveServer(
      { id: "office", name: "Office", url: "https://office.example.com/" },
      initial,
    );
    expect(savedServers(initial)).toHaveLength(2);
    selectServer("office", initial);
    expect(activeServer(initial)?.url).toBe("https://office.example.com");
    removeServer("office", initial);
    expect(activeServer(initial)?.url).toBe(initial);
    expect(() => removeServer("test", initial)).toThrow("少なくとも1つのサーバーを残してください。");
  });

  it("migrates the former single-server setting", () => {
    Object.assign(globalThis, { localStorage: new MemoryStorage() });
    localStorage.setItem("manu-api-base", "http://192.168.1.8:8000");
    expect(activeServer("http://10.12.24.147:8000")?.url).toBe("http://10.12.24.147:8000");
    expect(savedServers("http://10.12.24.147:8000")).toHaveLength(2);
  });

  it("migrates the former initial server into the personal tab", () => {
    Object.assign(globalThis, { localStorage: new MemoryStorage() });
    localStorage.setItem("manu-servers", JSON.stringify([
      { id: "office", name: "Office", url: "https://office.example.com" },
      { id: "initial", name: "初期サーバー", url: "http://10.12.24.147:8000" },
    ]));
    localStorage.setItem("manu-active-server", "initial");
    expect(savedServers("http://10.12.24.147:8000").map((server) => server.id)).toEqual(["test", "office"]);
    expect(activeServer("http://10.12.24.147:8000")?.id).toBe("test");
  });

  it("renames the saved personal connection without changing its URL", () => {
    Object.assign(globalThis, { localStorage: new MemoryStorage() });
    localStorage.setItem("manu-servers", JSON.stringify([
      { id: "personal", name: "個人サーバー", url: "http://192.168.1.9:8000" },
      { id: "office", name: "Office", url: "https://office.example.com" },
    ]));
    localStorage.setItem("manu-active-server", "personal");
    expect(activeServer("http://10.12.24.147:8000")).toMatchObject({
      id: "test", name: "Test", url: "http://192.168.1.9:8000",
    });
    expect(savedServers("http://10.12.24.147:8000")).toHaveLength(2);
  });

  it("keeps an edited Test connection and removes leftover legacy entries", () => {
    Object.assign(globalThis, { localStorage: new MemoryStorage() });
    localStorage.setItem("manu-servers", JSON.stringify([
      { id: "test", name: "My Test", url: "http://192.168.1.10:8000" },
      { id: "personal", name: "個人サーバー", url: "http://192.168.1.9:8000" },
    ]));
    localStorage.setItem("manu-active-server", "personal");
    expect(savedServers("http://10.12.24.147:8000")).toEqual([
      { id: "test", name: "My Test", url: "http://192.168.1.10:8000" },
    ]);
    expect(activeServer("http://10.12.24.147:8000")?.id).toBe("test");
  });
});
