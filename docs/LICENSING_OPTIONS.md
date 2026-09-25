# Licensing on GitHub — options (for sharing with friends later)

Today the licence check is **off** (`LICENSE_REQUIRED = false` in
`electron/main.js`). The old check called a FastAPI licence server on Railway
(`license-server/`), which is gone. App updates already come from GitHub
Releases; user data never leaves the Mac (phone ↔ Mac over Tailscale).

## Can GitHub host the licence admin?

| Option | Works? | Why |
|---|---|---|
| Run `license-server/` (FastAPI + admin page) on **GitHub Pages** | ❌ | Pages serves static files only — no Python, no database. |
| App calls the **GitHub API** to check licences | ❌ | The app would have to ship a GitHub token; anyone could extract it. |
| **Signed licence files + revocation list hosted on GitHub** | ✅ recommended | No server at all. Details below. |
| Keep the FastAPI server, host it elsewhere free (Cloudflare Workers, Fly.io) | ✅ | Works, but it's a server to maintain again. |

## Recommended: signed licences, GitHub as the admin

- **Key pair.** You create an Ed25519 key pair once. The private key stays on
  your Mac (or as an Actions secret); the public key is built into the app.
- **Issuing** = signing a tiny file: `{id, name, machine_id, expires?}` + signature.
  The friend's app shows its machine ID on the activation screen; you sign a
  licence for that ID and send it. A licence only works on that one Mac, so a
  forwarded file is useless.
- **Checking** happens offline inside the app — no server, works without internet.
- **Revoking**: a signed `licenses/revoked.json` (licence IDs only, no names)
  published on GitHub Pages or as a release asset. The app fetches it when it
  checks for updates, with a grace period when offline — same as today.
- **Admin panel** = GitHub itself: a *workflow_dispatch* action "Revoke licence"
  (or "Issue licence") run from the Actions tab, or a small local script.
  Friends' names never need to be public — only licence IDs.
- **Cost:** free.

## The catch: the repository is public

Anyone can read the source and build the app with the check removed, so a
licence only stops casual copying of the DMG. To make it meaningful, make the
repository **private** before sharing. On GitHub Free, private repos get 2,000
Actions minutes a month and macOS runners count ×10 — roughly 15–20 Mac builds
a month, which fits this release process. One trade-off: GitHub's
"required reviewers" approval gate is only available on public repositories
(on Free, Pro and Team plans — per GitHub's docs). On a private repo the
*Promote to production* workflow still works; since only you can run it,
starting it is the approval — the extra "Approve" click just goes away.

## Effort when you want it

About a day: key generation script, licence sign/verify in `electron/main.js`,
activation screen showing the machine ID, revocation fetch, and an Actions
workflow for revoking.
