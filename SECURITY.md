# Security

How Astra Isle protects the accounts and data it touches, and what a maintainer must set up.

## Signed updates (required before the next release)

The app installs updates by itself, so every installer is signed, and the app refuses to run one
whose signature doesn't match the public key built into it (`install_update` in `src-tauri/src/lib.rs`).
It also refuses a release that isn't newer than the running version, so an old installer can't be
used to bring back an old bug.

One-time setup:

1. Make a key pair (choose a strong password when asked):

   ```sh
   npx tauri signer generate -w "$HOME/.tauri/astra-isle.key"   # PowerShell or bash; a bare ~ is not expanded in PowerShell
   ```

2. Copy the contents of `$HOME/.tauri/astra-isle.key.pub` into `src-tauri/updater.pub`, replacing the
   placeholder, and commit it.
3. In GitHub → Settings → Secrets and variables → Actions, add:
   - `TAURI_SIGNING_PRIVATE_KEY`: the contents of `$HOME/.tauri/astra-isle.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: its password
4. Keep `$HOME/.tauri/astra-isle.key` and its password offline (for example in a password manager).
   Never commit the key. If it is lost, installed copies can't be updated automatically any more;
   if it leaks, anyone can sign updates, so make a new key and ship it in a release signed by hand.

CI refuses to build without the key, signs each installer (`npx tauri signer sign`) and uploads the
`.sig` beside it. Releases made before this have no `.sig`; the updater won't install them.

Also turn on two-factor authentication for every account with write access to this repository: the
signing key protects users even if a release is tampered with, but not if the key itself is in CI and
CI is taken over.

## Passwords and accounts

| What | Where it goes | Kept? |
|---|---|---|
| SSO UI password, "Verify Student" | typed in the system browser on sso.ui.ac.id; the island never sees it | no |
| SSO UI password, SCELE | Rust → `scele.cs.ui.ac.id/login/token.php` over HTTPS, then wiped from memory | no |
| SSO UI password, SLCM | Rust → typed into `login.ui.ac.id` in the island's SLCM window, then wiped | no |
| SCELE token | the system credential store (Windows Credential Manager / macOS Keychain) | until Disconnect |
| Name, NPM, timetable | `sso.json`, `scele.json`, `slcm.json`, encrypted with the Windows account (DPAPI) | until Disconnect |

- The SSO UI callback carries a one-time random code that SSO UI checks again, so another person's
  sign-in can't be passed off as yours.
- The SCELE token only ever goes to SCELE: requests that carry it follow no redirects, only allowlisted
  read-only functions can be called, and file downloads are limited to SCELE's file endpoint.
- The password is filled in on the SLCM login only if the page is still `https://login.ui.ac.id` when
  the script runs, and only if its form sends the password back there.
- Disconnecting deletes the token locally and opens SCELE's *Security keys* page
  (`/user/managetoken.php`). Moodle has no way for a token to revoke itself, so delete the
  "Moodle mobile web service" key there as well.
- The clipboard shelf doesn't read anything a password manager marks as private (Windows).

## The webview

- A strict Content-Security-Policy (`tauri.conf.json`) lets only the app's own scripts run and lists
  the only servers the webview may contact. The ONNX runtime for the local models ships with the app
  (`vite.config.ts`) and is not loaded from a CDN. Adding a new online service means adding its
  origin to `connect-src`. Supabase is allowed as `*.supabase.co`; a custom Supabase domain must be
  added too.
- The asset protocol (image thumbnails) reads nothing by default. Rust allows only images the user
  dropped onto the island (`src-tauri/src/grants.rs`).
- Opening a file or program that the user didn't drop onto the island needs a "Yes" in the system's
  own dialog, which the webview can't click. Network-share paths are refused, because Windows would
  sign in to the share with the user's account.

## Limits worth knowing

- On Windows, any program running as the same user can read Credential Manager entries and call
  DPAPI. No app can protect secrets from malware already running on the account. Revoke the SCELE
  token on SCELE if the computer may have been compromised.
- A JavaScript string can't be wiped, so the password typed into the island stays in the webview's
  memory until it is garbage-collected. The HTTP library's own buffers aren't wiped either.
- The installers aren't code-signed with an Authenticode/Apple Developer certificate yet, so
  SmartScreen and Gatekeeper warn on first install. Users should download only from this
  repository's Releases page.

## Reporting a problem

Report vulnerabilities privately through GitHub's "Report a vulnerability" (Security tab), not in a
public issue.
