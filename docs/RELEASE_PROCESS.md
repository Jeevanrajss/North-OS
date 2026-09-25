# Release process — UAT, then production

Nothing reaches the production apps until a build has been tested in UAT and
**you approve it on GitHub**.

```
develop ──push──▶ Checks (all tests)
   │
   └─ tag v1.7.0-uat.1 ──▶ Checks ──▶ build "North OS UAT" (Mac + Android) ──▶ GitHub pre-release
                                                     │
                                         you test the UAT apps
                                                     │
      Actions → "Promote to production" (uat_tag = v1.7.0-uat.1)
                                                     │
                                   ⏸  waits for your approval
                                                     │
                     build production apps from the SAME commit ──▶ release v1.7.0
                                                     │                     │
                                              main = that commit    production apps
                                                                     auto-update
```

## UAT and production are separate apps

|                  | Production            | UAT                              |
|------------------|-----------------------|----------------------------------|
| Mac app          | Personal OS           | North OS UAT                     |
| Mac data folder  | `…/Personal OS/`      | `…/North OS UAT/`                |
| Desktop port     | 9847                  | 9848                             |
| Android app      | North OS              | North OS UAT (`…north_os.uat`)   |
| Updates from     | latest release        | newest `-uat.N` pre-release      |
| Badge            | —                     | amber **UAT** in the top bar / Home |

Both can be installed at once. UAT never reads or writes production data, and
a UAT phone app pairs only with the UAT Mac app (its own port).

## Everyday flow

1. Work on `develop`. Every push runs **Checks** (backend tests, desktop UI
   tests incl. light/dark readability, phone app tests).
2. Ready to test? Tag it:
   ```bash
   git tag v1.7.0-uat.1 && git push origin v1.7.0-uat.1
   ```
   Fix something and re-test → `v1.7.0-uat.2`, and so on.
3. Install the UAT apps from the pre-release (or let the UAT Mac app update
   itself) and test.
4. Happy? GitHub → Actions → **Promote to production** → *Run workflow* →
   `uat_tag: v1.7.0-uat.2`. Approve when GitHub asks. The production release
   `v1.7.0` is built from exactly the commit you tested.

Versions: `x.y.z-uat.N` for UAT, `x.y.z` for production. `scripts/set_version.py`
stamps a version into the Mac app, backend and phone app (CI does this for you).

## One-time setup (GitHub settings — not done yet)

1. **Create `develop`**: `git switch -c develop && git push -u origin develop`,
   then make it the default branch (Settings → General).
2. **Approval gate**: Settings → Environments → *New environment* `production`
   → *Required reviewers* → add yourself. (Available for public repositories;
   on a private repo, GitHub Free/Pro/Team don't offer required reviewers — the
   workflow still runs, and only people with write access can start it.)
3. **Protect `main`** (optional): Settings → Branches → rule for `main` →
   restrict pushes; allow *GitHub Actions* to push so promotion can move it.
4. **Android signing key** (so each APK updates the installed app): create one
   once and keep it safe — losing it means reinstalling the app.
   ```bash
   keytool -genkey -v -keystore northos-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias northos
   base64 -i northos-release.jks | pbcopy   # → secret ANDROID_KEYSTORE_BASE64
   ```
   Secrets (Settings → Secrets and variables → Actions): `ANDROID_KEYSTORE_BASE64`,
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (= `northos`),
   `ANDROID_KEY_PASSWORD`. Apps built before this used a different key, so
   uninstall them once before installing the first CI-built APK.
5. **Optional variable** `MAC_TAILSCALE_IP` (your Mac's Tailscale IP, `100.x.y.z`) pre-fills
   the Mac address on the phone's pairing screen.

## Building locally (still works)

```bash
cd electron && npm run dist:mac        # production DMG
cd electron && npm run dist:mac:uat    # UAT DMG
cd mobile && flutter build apk --flavor prod --dart-define=CHANNEL=prod
cd mobile && flutter build apk --flavor uat  --dart-define=CHANNEL=uat
```
Note: with flavors, Android `flutter run` needs `--flavor prod` (or `uat`).
