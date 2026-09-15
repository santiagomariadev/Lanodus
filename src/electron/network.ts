import * as os from "node:os";

export function getLocalAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  const interfaceEntries = Object.values(interfaces ?? {}) as Array<
    Array<{ internal?: boolean; family?: string; address: string }>
  >;

  for (const entries of interfaceEntries) {
    for (const entry of entries) {
      if (!entry.internal && entry.family === "IPv4") {
        addresses.push(entry.address);
      }
    }
  }

  return [...new Set(addresses)].sort();
}

export function buildHostUrls(
  hostname: string,
  addresses: string[] = getLocalAddresses(),
  port = 3000,
): string[] {
  const urls = new Set<string>();

  for (const address of addresses) {
    urls.add(`http://${address}:${port}`);
  }

  urls.add(`http://${hostname}.local:${port}`);
  urls.add(`http://${hostname}:${port}`);
  urls.add(`http://localhost:${port}`);

  return [...urls];
}

export function buildAdvertisedService({
  hostname,
  preferredUrl,
  port = 3000,
}: {
  hostname: string;
  preferredUrl?: string | null;
  port?: number;
}) {
  return {
    name: `${hostname} Lanodus`,
    type: "_lanodus._tcp",
    port,
    txt: {
      path: "/",
      host: hostname,
      preferredUrl: preferredUrl || "",
    },
  };
}
