const test = require("node:test");
const assert = require("node:assert/strict");

const { buildHostUrls, buildAdvertisedService } = require("../dist/electron/network.js");

test("buildHostUrls includes localhost and network addresses", () => {
  const urls = buildHostUrls("testhost", ["192.168.0.42", "10.0.0.7"]);
  assert.ok(urls.includes("http://testhost.local:3000"));
  assert.ok(urls.includes("http://192.168.0.42:3000"));
  assert.ok(urls.includes("http://localhost:3000"));
});

test("buildAdvertisedService creates bonjour metadata for host mode", () => {
  const service = buildAdvertisedService({
    hostname: "testhost",
    port: 3000,
  });

  assert.equal(service.type, "_lanodus._tcp");
  assert.equal(service.port, 3000);
  assert.equal(service.name, "testhost Lanodus");
  assert.equal(service.txt.host, "testhost");
});
