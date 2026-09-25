"""Stamp one version into every app: desktop shell, backend and phone.

    python3 scripts/set_version.py 1.7.0-uat.2     # a UAT build
    python3 scripts/set_version.py 1.7.0           # the production release

With --github, also writes `version`, `name` (x.y.z) and `code` (Android
versionCode) to $GITHUB_OUTPUT for later workflow steps.

Android versionCode = x*1,000,000 + y*10,000 + z*100 + n, where n is the UAT
build number, or 99 for production — so a release always outranks the UAT
builds of the same version, and codes only ever grow.
"""
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def parse(version: str) -> tuple[str, int]:
    m = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)(?:-uat\.(\d+))?", version)
    if not m:
        sys.exit(f"Bad version {version!r} — expected x.y.z or x.y.z-uat.N")
    x, y, z, n = m.groups()
    if int(y) > 99 or int(z) > 99 or (n and int(n) > 98):
        sys.exit("minor/patch must be ≤ 99 and the UAT number ≤ 98")
    code = int(x) * 1_000_000 + int(y) * 10_000 + int(z) * 100 + (int(n) if n else 99)
    return f"{x}.{y}.{z}", code


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        sys.exit(__doc__)
    version = args[0].removeprefix("v")
    name, code = parse(version)

    pkg = ROOT / "electron" / "package.json"
    data = json.loads(pkg.read_text())
    data["version"] = version
    pkg.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")

    cfg = ROOT / "backend" / "app" / "config.py"
    cfg.write_text(re.sub(r'app_version: str = "[^"]*"', f'app_version: str = "{version}"', cfg.read_text(), count=1))

    pub = ROOT / "mobile" / "pubspec.yaml"
    pub.write_text(re.sub(r"(?m)^version: .*$", f"version: {version}+{code}", pub.read_text(), count=1))

    print(f"version {version}  (android {name} / {code})")
    if "--github" in sys.argv and os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as out:
            out.write(f"version={version}\nname={name}\ncode={code}\n")


if __name__ == "__main__":
    main()
