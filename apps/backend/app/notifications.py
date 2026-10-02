import json
import logging
import os
import time
from pathlib import Path
from typing import Protocol

import httpx
import jwt
from google.auth.transport.requests import Request
from google.oauth2 import service_account
from pywebpush import webpush


class NotificationProvider(Protocol):
    def send(self, subscription: dict, payload: dict) -> None: ...


class MockNotificationProvider:
    def send(self, subscription: dict, payload: dict) -> None:
        # Durable inbox is consumed by the client and forwarded to its Service Worker.
        return None


class WebPushNotificationProvider:
    def send(self, subscription: dict, payload: dict) -> None:
        webpush(
            subscription_info=subscription,
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=os.environ["VAPID_PRIVATE_KEY"],
            vapid_claims={"sub": os.environ["VAPID_SUBJECT"]},
            timeout=10,
        )


class FCMNotificationProvider:
    def send(self, subscription: dict, payload: dict) -> None:
        credentials = service_account.Credentials.from_service_account_file(
            os.environ["FCM_SERVICE_ACCOUNT_FILE"],
            scopes=["https://www.googleapis.com/auth/firebase.messaging"],
        )
        credentials.refresh(Request())
        with httpx.Client(timeout=15) as client:
            response = client.post(
                f"https://fcm.googleapis.com/v1/projects/{credentials.project_id}/messages:send",
                headers={"Authorization": f"Bearer {credentials.token}"},
                json={
                    "message": {
                        "token": subscription["token"],
                        "notification": {"title": payload["title"], "body": payload.get("body", "")},
                        "data": {"generation_id": payload["url"].rsplit("/", 1)[-1], "url": payload["url"]},
                    }
                },
            )
            response.raise_for_status()


class APNsNotificationProvider:
    def send(self, subscription: dict, payload: dict) -> None:
        token = jwt.encode(
            {"iss": os.environ["APNS_TEAM_ID"], "iat": int(time.time())},
            Path(os.environ["APNS_KEY_FILE"]).read_text(),
            algorithm="ES256",
            headers={"kid": os.environ["APNS_KEY_ID"]},
        )
        host = "api.sandbox.push.apple.com" if os.getenv("APNS_SANDBOX") == "true" else "api.push.apple.com"
        with httpx.Client(http2=True, timeout=15) as client:
            response = client.post(
                f"https://{host}/3/device/{subscription['token']}",
                headers={
                    "authorization": f"bearer {token}",
                    "apns-topic": os.environ["APNS_BUNDLE_ID"],
                    "apns-push-type": "alert",
                },
                json={
                    "aps": {
                        "alert": {"title": payload["title"], "body": payload.get("body", "")},
                        "sound": "default",
                    },
                    "generation_id": payload["url"].rsplit("/", 1)[-1],
                },
            )
            response.raise_for_status()


def deliver(subscriptions: list, payload: dict):
    for subscription in subscriptions:
        try:
            provider: NotificationProvider = MockNotificationProvider()
            if subscription["provider"] == "web" and os.getenv("VAPID_PRIVATE_KEY"):
                provider = WebPushNotificationProvider()
            elif subscription["provider"] == "android" and os.getenv("FCM_SERVICE_ACCOUNT_FILE"):
                provider = FCMNotificationProvider()
            elif subscription["provider"] == "ios" and os.getenv("APNS_KEY_FILE"):
                provider = APNsNotificationProvider()
            provider.send(json.loads(subscription["payload"]), payload)
        except Exception:
            # Do not log endpoint credentials or keys. Inbox remains available for retries.
            logging.getLogger("app").warning("push_delivery_failed provider=%s", subscription["provider"])
