import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { App } from "@capacitor/app";
import { api } from "./api";
import { manualPathFromUrl } from "./deep-link";
export interface NotificationProvider {
  register(): Promise<string>;
}
export class MockNotificationProvider implements NotificationProvider {
  async register() {
    await api("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        provider: "mock",
        payload: { device: "browser-demo" },
      }),
    });
    return "デモ通知を有効にしました。";
  }
}
export class WebNotificationProvider implements NotificationProvider {
  async register() {
    if (!("Notification" in window) || !("serviceWorker" in navigator))
      return new MockNotificationProvider().register();
    const permission = await Notification.requestPermission();
    if (permission !== "granted")
      return "通知はアプリ内の「通知」で確認できます。";
    const config = await api<{ vapid_public_key: string }>(
      "/notification-config",
    );
    if (!config.vapid_public_key)
      return new MockNotificationProvider().register();
    const registration = await navigator.serviceWorker.ready;
    const raw = atob(
      config.vapid_public_key.replace(/-/g, "+").replace(/_/g, "/"),
    );
    const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    const sub =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      }));
    await api("/subscriptions", {
      method: "POST",
      body: JSON.stringify({ provider: "web", payload: sub.toJSON() }),
    });
    return "ブラウザ通知を有効にしました。";
  }
}
export class NativeNotificationProvider implements NotificationProvider {
  async register() {
    const config = await api<Record<string, boolean>>("/notification-config");
    if (!config[Capacitor.getPlatform()])
      return new MockNotificationProvider().register();
    await PushNotifications.addListener("registration", (token) => {
      void api("/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          provider: Capacitor.getPlatform(),
          payload: { token: token.value },
        }),
      });
    });
    await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action) => {
        const id = action.notification.data?.generation_id;
        if (typeof id === "string")
          location.href = "/app/manual/" + encodeURIComponent(id);
      },
    );
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive === "granted") await PushNotifications.register();
    return "通知登録をリクエストしました。";
  }
}
export function notificationProvider(): NotificationProvider {
  return Capacitor.isNativePlatform()
    ? new NativeNotificationProvider()
    : new WebNotificationProvider();
}
if (Capacitor.isNativePlatform()) {
  const open = (url: string) => {
    const path = manualPathFromUrl(url);
    if (path && location.pathname !== path) location.href = path;
  };
  void App.addListener("appUrlOpen", ({ url }) => open(url));
  void App.getLaunchUrl().then((value) => {
    if (value?.url) open(value.url);
  });
}
