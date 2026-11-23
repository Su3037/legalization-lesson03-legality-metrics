"""Write build/downloads/module03-python-exercise.zip (deterministic: fixed timestamps, sorted)."""
import zipfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
src = ROOT / "python" / "exercise"
out = ROOT / "build" / "downloads" / "module03-python-exercise.zip"
out.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(p for p in src.rglob("*") if p.is_file() and "__pycache__" not in p.parts):
        info = zipfile.ZipInfo(str(Path("exercise") / f.relative_to(src)), date_time=(2026, 11, 23, 0, 0, 0))
        info.external_attr = 0o644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, f.read_bytes())
print(out)
