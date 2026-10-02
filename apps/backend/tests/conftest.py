"""Keep test databases and uploads isolated from the user's local PoC data."""

import os
import tempfile
from pathlib import Path

test_root = Path(__file__).resolve().parents[3] / "temp"
test_root.mkdir(parents=True, exist_ok=True)
tempfile.tempdir = str(test_root)
os.environ["MANU_ROOT"] = tempfile.mkdtemp(prefix="backend-test-", dir=test_root)
