import { readFileSync, writeFileSync } from "node:fs";
const platform = process.argv[2];
if (platform === "android") {
  const file = "apps/client/android/app/src/main/AndroidManifest.xml";
  let xml = readFileSync(file, "utf8");
  xml = xml.replace(
    "</activity>",
    `<intent-filter><action android:name="android.intent.action.VIEW"/><category android:name="android.intent.category.DEFAULT"/><category android:name="android.intent.category.BROWSABLE"/><data android:scheme="manutailor" android:host="open"/></intent-filter></activity>`,
  );
  writeFileSync(file, xml);
} else if (platform === "ios") {
  const file = "apps/client/ios/App/App/Info.plist";
  let xml = readFileSync(file, "utf8");
  xml = xml.replace(
    "<key>CFBundleDevelopmentRegion</key>",
    `<key>CFBundleURLTypes</key><array><dict><key>CFBundleURLSchemes</key><array><string>manutailor</string></array></dict></array><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict><key>NSLocalNetworkUsageDescription</key><string>同じネットワーク内のManu-Tailorサーバーに接続します。</string><key>CFBundleDevelopmentRegion</key>`,
  );
  writeFileSync(file, xml);
  const delegate = "apps/client/ios/App/App/AppDelegate.swift";
  let code = readFileSync(delegate, "utf8");
  code = code.replace(
    "    var window: UIWindow?",
    `    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
    var window: UIWindow?`,
  );
  writeFileSync(delegate, code);
}
