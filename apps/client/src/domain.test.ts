import { describe, it, expect } from "vitest";
import { session } from "./api";
import { manualPathFromUrl } from "./deep-link";
describe("session recovery", () => {
  it("recovers from unavailable storage without throwing", () => {
    expect(session()).toBeNull();
  });
});
describe("manual deep links", () => {
  it("opens the same route for web and native notifications", () => {
    expect(manualPathFromUrl("manutailor://open/app/manual/abc123")).toBe(
      "/app/manual/abc123",
    );
    expect(manualPathFromUrl("https://example.com/app/manual/abc123")).toBe(
      "/app/manual/abc123",
    );
  });
  it("rejects script URLs, wrong routes and traversal", () => {
    for (const value of [
      "javascript:alert(1)",
      "manutailor://wrong/app/manual/id",
      "/admin",
      "/app/manual/../admin",
      "/app/manual/%2e%2e",
    ])
      expect(manualPathFromUrl(value)).toBeNull();
  });
});
