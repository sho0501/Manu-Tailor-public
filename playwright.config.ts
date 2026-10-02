import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    channel: "chromium",
    locale: "ja-JP",
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command:
        process.platform === "win32"
          ? ".venv\\Scripts\\python.exe -m uvicorn app.main:app --app-dir apps/backend --port 8000"
          : "python -m uvicorn app.main:app --app-dir apps/backend --port 8000",
      url: "http://127.0.0.1:8000/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: "pnpm --filter @manu/client preview",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
});
