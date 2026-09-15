# Electron + Bonjour setup

This project now includes an Electron shell that starts the existing Bun HTTP server and advertises the app over mDNS/Bonjour using the `bonjour` package.

## Features

- Desktop devices can open the Electron app in either Host or Client mode
- Host mode publishes a `_lanodus._tcp` service over Bonjour
- Client mode can discover available shared hosts on the LAN
- Mobile devices still connect by IP in the browser on the same LAN

## Install

```bash
bun install
```

## Run Electron app

```bash
bun run electron
```

## Browser mode

```bash
bun run dev
```

## Notes

- The app still serves the same upload UI on `http://localhost:3000` when running in browser mode.
- In desktop mode, the Electron app loads the same UI via the app's bundled local server.
- Linux AppImage releases bundle a Bun binary, so end users do not need a system Bun install.
- Bonjour discovery works on supported LAN environments such as macOS, Linux, and local network segments with mDNS enabled.
