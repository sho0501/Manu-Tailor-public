import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(os.getenv("MANU_ROOT", Path(__file__).resolve().parents[3]))
load_dotenv(ROOT / ".env")
for name in ("database", "uploads", "logs", "output", "temp", "cache"):
    (ROOT / name).mkdir(parents=True, exist_ok=True)
DB = ROOT / "database" / "manu-tailor.sqlite3"
MAX_UPLOAD = 20 * 1024 * 1024
