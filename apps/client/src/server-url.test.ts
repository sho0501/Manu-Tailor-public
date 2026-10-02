import { describe, expect, it } from "vitest";
import { allowedServerUrl } from "./server-url";

describe("native server URL", () => {
  it("accepts HTTPS and private LAN HTTP, but rejects public HTTP", () => {
    expect(allowedServerUrl("https://manual.example.com")).toBe(true);
    expect(allowedServerUrl("http://10.12.24.147:8000")).toBe(true);
    expect(allowedServerUrl("http://192.168.1.4:8000")).toBe(true);
    expect(allowedServerUrl("http://172.20.1.4:8000")).toBe(true);
    expect(allowedServerUrl("http://manual.local:8000")).toBe(true);
    expect(allowedServerUrl("http://example.com:8000")).toBe(false);
    expect(allowedServerUrl("http://8.8.8.8:8000")).toBe(false);
    expect(allowedServerUrl("http://127.0.0.1:8000")).toBe(false);
    expect(allowedServerUrl("http://192.168.1.4:8000/api")).toBe(false);
  });
});
