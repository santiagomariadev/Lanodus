# local-share-system

A Bun-based local share app with:

- login with predefined users from `.allowedusers`
- JWT session auth
- file upload storage under `received/<username>/`
- text upload storage in `received/<username>/.clipboard`
- responsive frontend with Files/Text tabs

## Requirements

- Bun 1.3+

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

## Run

```bash
bun run dev
```

Open `http://localhost:3000`.

Optional environment variables:

- `PORT` (default: `3000`)
- `JWT_SECRET` (default: `dev-only-change-me`, override in real usage)

## API summary

- `POST /api/login` body: `{ "username": "...", "password": "..." }`
- `POST /api/upload-file` multipart form field: `file` (Bearer token required)
- `POST /api/upload-text` body: `{ "text": "..." }` (Bearer token required)
- `GET /api/texts?limit=40` returns latest uploaded text rows for current user

No file retrieval endpoint is included.
