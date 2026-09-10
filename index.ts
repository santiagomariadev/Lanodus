import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const ROOT_DIR = process.cwd();
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const RECEIVED_DIR = path.join(ROOT_DIR, "received");
const ALLOWED_USERS_FILE = path.join(ROOT_DIR, ".allowedusers");

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me";
const JWT_EXPIRES_IN_SECONDS = 60 * 60 * 12;

type JwtPayload = {
	sub: string;
	iat: number;
	exp: number;
};

type TextRow = {
	at: string;
	text: string;
};

function isValidUsername(username: string) {
	return /^[a-zA-Z0-9._-]{3,32}$/.test(username);
}

function sanitizeFileName(fileName: string) {
	const base = path.basename(fileName);
	return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function encodeBase64Url(value: string | Uint8Array) {
	const buffer = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
	return buffer
		.toString("base64")
		.replace(/=/g, "")
		.replace(/\+/g, "-")
		.replace(/\//g, "_");
}

function decodeBase64Url(value: string) {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
	return Buffer.from(padded, "base64");
}

async function signJwt(payload: JwtPayload) {
	const header = { alg: "HS256", typ: "JWT" };
	const headerPart = encodeBase64Url(JSON.stringify(header));
	const payloadPart = encodeBase64Url(JSON.stringify(payload));
	const message = `${headerPart}.${payloadPart}`;

	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(JWT_SECRET),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
	const signaturePart = encodeBase64Url(new Uint8Array(signature));

	return `${message}.${signaturePart}`;
}

async function verifyJwt(token: string): Promise<JwtPayload | null> {
	const parts = token.split(".");
	if (parts.length !== 3) {
		return null;
	}

	const [headerPart, payloadPart, signaturePart] = parts;
	if (!headerPart || !payloadPart || !signaturePart) {
		return null;
	}
	const message = `${headerPart}.${payloadPart}`;

	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(JWT_SECRET),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);

	const verified = await crypto.subtle.verify(
		"HMAC",
		key,
		decodeBase64Url(signaturePart),
		new TextEncoder().encode(message),
	);

	if (!verified) {
		return null;
	}

	try {
		const payload = JSON.parse(decodeBase64Url(payloadPart).toString("utf8")) as JwtPayload;
		if (!payload.sub || typeof payload.exp !== "number") {
			return null;
		}
		if (payload.exp <= Math.floor(Date.now() / 1000)) {
			return null;
		}
		return payload;
	} catch {
		return null;
	}
}

async function readAllowedUsers() {
	try {
		const file = await readFile(ALLOWED_USERS_FILE, "utf8");
		const users = new Map<string, string>();

		for (const line of file.split(/\r?\n/)) {
			const trimmed = line.trim();
			if (!trimmed) {
				continue;
			}

			const [username, hash] = trimmed.split(":::");
			if (!username || !hash) {
				continue;
			}
			users.set(username, hash);
		}

		return users;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return new Map<string, string>();
		}
		throw error;
	}
}

function jsonResponse(body: unknown, status = 200) {
	return Response.json(body, {
		status,
		headers: {
			"Cache-Control": "no-store",
		},
	});
}

function unauthorized() {
	return jsonResponse({ error: "Unauthorized" }, 401);
}

async function requireAuth(req: Request): Promise<JwtPayload | null> {
	const authorization = req.headers.get("authorization") || "";
	const [scheme, token] = authorization.split(" ");
	if (scheme?.toLowerCase() !== "bearer" || !token) {
		return null;
	}
	return verifyJwt(token);
}

async function ensureUserDir(username: string) {
	const userDir = path.join(RECEIVED_DIR, username);
	await mkdir(userDir, { recursive: true });
	return userDir;
}

async function readClipboardRows(username: string, limit = 40): Promise<TextRow[]> {
	const filePath = path.join(RECEIVED_DIR, username, ".clipboard");

	try {
		const raw = await readFile(filePath, "utf8");
		const rows = raw
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				try {
					const parsed = JSON.parse(line) as TextRow;
					if (!parsed.at || typeof parsed.text !== "string") {
						return null;
					}
					return parsed;
				} catch {
					return null;
				}
			})
			.filter((row): row is TextRow => row !== null);

		return rows.slice(-limit).reverse();
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

async function serveStatic(pathname: string) {
	const filePath =
		pathname === "/"
			? path.join(PUBLIC_DIR, "index.html")
			: path.join(PUBLIC_DIR, pathname.replace(/^\//, ""));

	if (!filePath.startsWith(PUBLIC_DIR)) {
		return null;
	}

	try {
		const fileStat = await stat(filePath);
		if (!fileStat.isFile()) {
			return null;
		}
		return new Response(Bun.file(filePath));
	} catch {
		return null;
	}
}

await mkdir(RECEIVED_DIR, { recursive: true });

const server = Bun.serve({
	port: Number(process.env.PORT || 3000),
	async fetch(req) {
		const url = new URL(req.url);
		const { pathname } = url;

		if (req.method === "POST" && pathname === "/api/login") {
			let body: { username?: string; password?: string };
			try {
				body = (await req.json()) as { username?: string; password?: string };
			} catch {
				return jsonResponse({ error: "Invalid JSON body" }, 400);
			}

			const username = (body.username || "").trim();
			const password = body.password || "";

			if (!isValidUsername(username) || !password) {
				return jsonResponse({ error: "Invalid credentials" }, 400);
			}

			const users = await readAllowedUsers();
			const storedHash = users.get(username);
			if (!storedHash) {
				return unauthorized();
			}

			const validPassword = await Bun.password.verify(password, storedHash);
			if (!validPassword) {
				return unauthorized();
			}

			const now = Math.floor(Date.now() / 1000);
			const payload: JwtPayload = {
				sub: username,
				iat: now,
				exp: now + JWT_EXPIRES_IN_SECONDS,
			};

			const token = await signJwt(payload);
			return jsonResponse({ token, username });
		}

		if (req.method === "POST" && pathname === "/api/upload-file") {
			const session = await requireAuth(req);
			if (!session) {
				return unauthorized();
			}

			let formData;
			try {
				formData = await req.formData();
			} catch {
				return jsonResponse({ error: "Invalid multipart form" }, 400);
			}

			const fileField = formData.get("file");
			if (!(fileField instanceof File)) {
				return jsonResponse({ error: "Missing file field" }, 400);
			}

			const userDir = await ensureUserDir(session.sub);
			const safeName = sanitizeFileName(fileField.name || "upload.bin");
			const targetPath = path.join(userDir, `${Date.now()}-${safeName}`);

			await Bun.write(targetPath, fileField);

			return jsonResponse({
				ok: true,
				storedAs: path.basename(targetPath),
			});
		}

		if (req.method === "POST" && pathname === "/api/upload-text") {
			const session = await requireAuth(req);
			if (!session) {
				return unauthorized();
			}

			let body: { text?: string };
			try {
				body = (await req.json()) as { text?: string };
			} catch {
				return jsonResponse({ error: "Invalid JSON body" }, 400);
			}

			const text = (body.text || "").trim();
			if (!text) {
				return jsonResponse({ error: "Text cannot be empty" }, 400);
			}

			const userDir = await ensureUserDir(session.sub);
			const clipboardPath = path.join(userDir, ".clipboard");
			const row: TextRow = {
				at: new Date().toISOString(),
				text,
			};

			await appendFile(clipboardPath, `${JSON.stringify(row)}\n`, "utf8");

			return jsonResponse({ ok: true, item: row });
		}

		if (req.method === "GET" && pathname === "/api/texts") {
			const session = await requireAuth(req);
			if (!session) {
				return unauthorized();
			}

			const requestedLimit = Number(url.searchParams.get("limit") || "40");
			const limit = Number.isFinite(requestedLimit)
				? Math.min(Math.max(requestedLimit, 1), 100)
				: 40;

			const items = await readClipboardRows(session.sub, limit);
			return jsonResponse({ items });
		}

		const staticResponse = await serveStatic(pathname);
		if (staticResponse) {
			return staticResponse;
		}

		return jsonResponse({ error: "Not Found" }, 404);
	},
});

console.log(`Local Share server listening on http://localhost:${server.port}`);