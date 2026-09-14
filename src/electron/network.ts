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

  urls.add(`http://localhost:${port}`);
  urls.add(`http://${hostname}.local:${port}`);
  urls.add(`http://${hostname}:${port}`);

  for (const address of addresses) {
    urls.add(`http://${address}:${port}`);
  }

  return [...urls];
}

export function buildAdvertisedService({
  hostname,
  port = 3000,
}: {
  hostname: string;
  port?: number;
}) {
  return {
    name: `${hostname} Local Share`,
    type: "_localshare._tcp",
    port,
    txt: {
      path: "/",
      host: hostname,
    },
  };
}
