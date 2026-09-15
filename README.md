# Lanodus

A zero-config way to move files and text between devices on the same LAN.
It runs as a small [Bun](https://bun.sh) web server on its own, or as a
self-contained Electron desktop app that finds other instances on your
network automatically over mDNS — no typing IP addresses.

## Features

- **LAN discovery, not manual IPs.** The Electron app can run in *Host
  mode* (advertises itself on the network via Bonjour/mDNS as
  `_lanodus._tcp`) or *Client mode* (browses the LAN for other Lanodus
  hosts and lets you open them with one click).
- **Per-user storage.** Each account gets its own file directory
  (`received/<username>/`) and its own text history
  (`received/<username>/.clipboard`) — accounts don't see each other's data.
- **Files and text**, both with search and pagination, drag-and-drop
  upload, and one-click copy/delete.
- **Auth built from primitives, not a library.** Sessions are JWTs signed
  and verified by hand with the Web Crypto `HMAC-SHA256` API; passwords are
  hashed with `Bun.password` (bcrypt), with a PBKDF2 + `timingSafeEqual`
  fallback for non-Bun runtimes.
- **Security headers on every response** (CSP, `X-Frame-Options`,
  `Referrer-Policy`, etc.) and path-traversal-guarded file access.
- **Works from any browser**, too — the Electron shell is optional. Point
  a phone or laptop's browser at the host URL and it just works.
- Packaged as a Linux AppImage via `electron-builder`.

## How it works

- `src/index.ts` — a single-file `Bun.serve` HTTP server. No framework:
  routing, auth, uploads, and static file serving are all handled directly
  against Bun's native APIs.
- `public/` — a plain HTML/CSS/JS frontend. No build step, no framework.
- `src/electron/` — an Electron shell that spawns the Bun server as a
  child process and wraps it in a desktop window.
  - **Host mode** advertises the server on the LAN via Bonjour so other
    instances can find it, and shows every local network URL you can
    reach it from.
  - **Client mode** discovers other Lanodus hosts on the network and
    opens them in an external browser.
  - The renderer never touches Node or the filesystem directly: it only
    talks to the main process through a narrow API
    (`window.lanodusApi`) exposed via `contextBridge`, with
    `contextIsolation` on and `nodeIntegration` off.

## Requirements

- Bun 1.3+ (for development, browser mode, and building releases)
- For desktop mode: Electron and `electron-builder` (already listed in
  `devDependencies`, installed via `bun install`)

Published Linux AppImages bundle a Bun runtime internally, so end users
do not need to install Bun separately to run the desktop executable.

## Install

```bash
bun install
```

## Add allowed users

Use the admin script to create or update users in `.allowedusers`:

```bash
bun run add-user -- alice super-secret-password
```

Each `.allowedusers` line is stored as:

```text
username:::passwordHash
```

## Run as a web server

```bash
bun run dev
```

Open `http://localhost:3000`.

Optional environment variables:

- `PORT` (default: `3000`)
- `JWT_SECRET` (default: `dev-only-change-me` — **override this**, see
  [Security notes](#security-notes--trade-offs))

## Run as a desktop app (Electron)

```bash
bun run electron
```

This builds the server, then launches it inside an Electron window. From
the login screen you can switch between **Host mode** (start broadcasting
this machine on the LAN, manage allowed users) and **Client mode**
(discover other hosts nearby and open them).

### Build a Linux AppImage

```bash
bun run release:appimage
```

Output lands in `release/`.

The release script copies your local Bun binary into `bundled/bin/bun`
before packaging, and `electron-builder` includes it in the AppImage.

## API summary

- `POST /api/login` — body `{ "username": "...", "password": "..." }`
- `POST /api/upload-file` — multipart form field `file` (Bearer token required)
- `POST /api/upload-text` — body `{ "text": "..." }` (Bearer token required)
- `GET /api/texts?limit=40&search=` — latest text entries for the current user
- `DELETE /api/texts` — body `{ "at": "...", "text": "..." }`
- `GET /api/files?page=1&limit=8&search=` — paginated file listing for the current user
- `GET /api/files/:storedName` — download a file
- `DELETE /api/files/:storedName` — delete a file

## Testing

```bash
bun run test
```

Builds the project, then runs the full suite in `tests/` with Node's
built-in test runner: the mDNS host-discovery helpers
(`network-discovery.test.js`) and the search/pagination utilities shared
with the frontend (`listing-utils.test.js`).

CI runs the same type-check (`bun run check`) and test suite on every push
and pull request — see `.github/workflows/ci.yml`.

## Security notes & trade-offs

This is built for a **trusted local network**, not the public internet.
That scope shapes a few deliberate trade-offs:

- **No TLS.** Traffic — including the login request — is plain HTTP.
  Only run this on networks you trust.
- **No rate limiting or upload size limits.** An authenticated user could
  fill up disk space. Fine for a handful of trusted LAN users; add limits
  or a reverse proxy before exposing this any wider.
- **`JWT_SECRET` defaults to `dev-only-change-me`.** Always set a real
  secret via the environment variable for anything beyond local testing.
- **Users live in a flat `.allowedusers` file**, not a database. Simple
  and auditable for a small group, not meant to scale past that.

What *is* covered, so it's not accidental:

- Path-traversal checks on every file read and delete (resolved paths are
  verified to stay inside the per-user directory).
- Filenames are sanitized before being written to disk.
- Password comparison uses `timingSafeEqual` on the PBKDF2 fallback path
  to avoid timing attacks.
- A locked-down CSP and standard security headers are set on every
  response.

## License

MIT — see [LICENSE](./LICENSE).
