import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: process.env.APPLE_BUNDLE_ID || "jp.manutailor.app",
  appName: "Manu-Tailor",
  webDir: "dist",
};
export default config;
