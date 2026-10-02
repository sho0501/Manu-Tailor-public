import hashlib
import json
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

from .config import DB


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def uid() -> str:
    return secrets.token_hex(12)


def encode(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


@contextmanager
def connect():
    connection = sqlite3.connect(DB, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def password_hash(password: str, salt: str) -> str:
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()


def init_db():
    with connect() as db:
        db.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT UNIQUE NOT NULL,
            role TEXT NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, profile TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS manuals (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, mode TEXT NOT NULL, current_version INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE);
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY, folder_id TEXT NOT NULL REFERENCES folders(id),
            name TEXT NOT NULL COLLATE NOCASE, UNIQUE(folder_id,name));
        CREATE TABLE IF NOT EXISTS manual_versions (
            id TEXT PRIMARY KEY, manual_id TEXT REFERENCES manuals(id), version INTEGER NOT NULL,
            document TEXT NOT NULL, source_file TEXT, created_at TEXT NOT NULL,
            UNIQUE(manual_id,version));
        CREATE TABLE IF NOT EXISTS generations (
            id TEXT PRIMARY KEY, version_id TEXT REFERENCES manual_versions(id),
            user_id TEXT REFERENCES users(id), profile TEXT NOT NULL, blocks TEXT NOT NULL,
            report TEXT NOT NULL, status TEXT NOT NULL, model TEXT NOT NULL,
            approved_by TEXT, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS generation_jobs (
            id TEXT PRIMARY KEY, generation_id TEXT, attempts INTEGER NOT NULL,
            status TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS generation_checkpoints (
            generation_id TEXT PRIMARY KEY REFERENCES generations(id),
            version_id TEXT NOT NULL, attempt INTEGER NOT NULL,
            completed_sources INTEGER NOT NULL, blocks TEXT NOT NULL,
            feedback TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), generation_id TEXT,
            title TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL, read INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS subscriptions (
            id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), provider TEXT NOT NULL,
            payload TEXT NOT NULL, UNIQUE(user_id,payload));
        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, target_id TEXT,
            details TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS api_credentials (
            id TEXT PRIMARY KEY, purpose TEXT NOT NULL, name TEXT NOT NULL,
            provider TEXT NOT NULL, base_url TEXT NOT NULL, model TEXT NOT NULL,
            encrypted_key TEXT NOT NULL, priority INTEGER NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS primary_api_credentials (
            purpose TEXT PRIMARY KEY, provider TEXT NOT NULL,
            encrypted_key TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS api_limit_events (
            credential_id TEXT PRIMARY KEY, purpose TEXT NOT NULL, name TEXT NOT NULL,
            limited_at TEXT NOT NULL, notified_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS operation_progress (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, stage TEXT NOT NULL,
            detail TEXT NOT NULL, percent INTEGER NOT NULL, updated_at TEXT NOT NULL);
        """)
        columns = {row[1] for row in db.execute("PRAGMA table_info(manuals)")}
        for name in ("folder_id", "category_id"):
            if name not in columns:
                db.execute(f"ALTER TABLE manuals ADD COLUMN {name} TEXT")
        folder_columns = {row[1] for row in db.execute("PRAGMA table_info(folders)")}
        if "parent_id" not in folder_columns:
            db.execute("ALTER TABLE folders ADD COLUMN parent_id TEXT REFERENCES folders(id)")
        db.executescript("""
        CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
        CREATE INDEX IF NOT EXISTS idx_categories_folder ON categories(folder_id);
        CREATE INDEX IF NOT EXISTS idx_manuals_folder ON manuals(folder_id);
        CREATE INDEX IF NOT EXISTS idx_manuals_category ON manuals(category_id);
        CREATE INDEX IF NOT EXISTS idx_generations_version ON generations(version_id);
        """)


def audit(db, actor: str, action: str, target: str, details: dict | None = None):
    db.execute(
        "INSERT INTO audit_logs VALUES(?,?,?,?,?,?)",
        (uid(), actor, action, target, encode(details or {}), now()),
    )
