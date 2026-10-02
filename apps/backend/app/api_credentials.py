"""Local, admin-managed backup API credentials and quota notices."""

import logging
import os
import sqlite3
from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet

from .config import ROOT
from .db import connect, now, uid
from .notifications import deliver


KEY_FILE = ROOT / "database" / "api-credentials.key"


def _cipher() -> Fernet:
    try:
        with KEY_FILE.open("xb") as file:
            file.write(Fernet.generate_key())
        os.chmod(KEY_FILE, 0o600)
    except FileExistsError:
        pass
    return Fernet(KEY_FILE.read_bytes())


def save_primary_api_key(purpose: str, provider: str, api_key: str) -> None:
    encrypted = _cipher().encrypt(api_key.encode()).decode()
    with connect() as db:
        db.execute(
            "INSERT INTO primary_api_credentials VALUES(?,?,?,?) "
            "ON CONFLICT(purpose) DO UPDATE SET provider=excluded.provider,"
            "encrypted_key=excluded.encrypted_key,updated_at=excluded.updated_at",
            (purpose, provider, encrypted, now()),
        )


def primary_api_key(purpose: str, provider: str) -> str | None:
    try:
        with connect() as db:
            row = db.execute(
                "SELECT encrypted_key FROM primary_api_credentials WHERE purpose=? AND provider=?",
                (purpose, provider),
            ).fetchone()
    except sqlite3.OperationalError as error:
        if "no such table: primary_api_credentials" not in str(error):
            raise
        return None
    return _cipher().decrypt(row["encrypted_key"].encode()).decode() if row else None


def save_backup(purpose: str, name: str, provider: str, base_url: str,
                model: str, api_key: str) -> str:
    credential_id = uid()
    encrypted = _cipher().encrypt(api_key.encode()).decode()
    with connect() as db:
        priority = db.execute(
            "SELECT COALESCE(MAX(priority),0)+1 FROM api_credentials WHERE purpose=?", (purpose,)
        ).fetchone()[0]
        db.execute(
            "INSERT INTO api_credentials VALUES(?,?,?,?,?,?,?,?,?)",
            (credential_id, purpose, name, provider, base_url, model, encrypted, priority, now()),
        )
    return credential_id


def backup_credentials(purpose: str | None = None, *, with_keys: bool = False) -> list[dict]:
    try:
        with connect() as db:
            query = "SELECT id,purpose,name,provider,base_url,model,encrypted_key,priority FROM api_credentials"
            params: tuple = ()
            if purpose:
                query += " WHERE purpose=?"
                params = (purpose,)
            rows = [dict(row) for row in db.execute(query + " ORDER BY purpose,priority", params)]
    except sqlite3.OperationalError as error:
        if "no such table: api_credentials" not in str(error):
            raise
        return []
    if with_keys:
        cipher = _cipher()
        for row in rows:
            row["api_key"] = cipher.decrypt(row.pop("encrypted_key").encode()).decode()
    else:
        for row in rows:
            row.pop("encrypted_key")
    return rows


def remove_backup(credential_id: str) -> bool:
    with connect() as db:
        removed = db.execute("DELETE FROM api_credentials WHERE id=?", (credential_id,)).rowcount
        db.execute("DELETE FROM api_limit_events WHERE credential_id=?", (credential_id,))
    return bool(removed)


def limit_status() -> list[dict]:
    with connect() as db:
        return [dict(row) for row in db.execute(
            "SELECT credential_id,purpose,name,limited_at FROM api_limit_events "
            "ORDER BY limited_at DESC LIMIT 30"
        )]


def record_api_limit(credential_id: str, purpose: str, name: str) -> None:
    """Notify admins at most once per credential per hour; never include keys."""
    current = datetime.now(timezone.utc)
    with connect() as db:
        existing = db.execute(
            "SELECT notified_at FROM api_limit_events WHERE credential_id=?", (credential_id,)
        ).fetchone()
        notify = not existing or current - datetime.fromisoformat(existing["notified_at"]) >= timedelta(hours=1)
        timestamp = current.isoformat()
        db.execute(
            "INSERT OR REPLACE INTO api_limit_events VALUES(?,?,?,?,?)",
            (credential_id, purpose, name, timestamp, timestamp if notify else existing["notified_at"]),
        )
        if not notify:
            return
        title = f"API利用制限: {name}。AI設定を確認してください。"
        admins = db.execute("SELECT id FROM users WHERE role='admin'").fetchall()
        for admin in admins:
            db.execute(
                "INSERT INTO notifications VALUES(?,?,?,?,?,?,0)",
                (uid(), admin["id"], None, title, "api_limit", now()),
            )
            subscriptions = db.execute(
                "SELECT * FROM subscriptions WHERE user_id=?", (admin["id"],)
            ).fetchall()
            deliver(subscriptions, {"title": title, "body": "AI設定で利用状況を確認してください。",
                                    "url": "/admin/settings"})
    logging.getLogger("app").warning("api_rate_limited purpose=%s credential=%s", purpose, credential_id)
