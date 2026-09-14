import test from "node:test";
import assert from "node:assert/strict";

import { filterItems, paginateItems } from "../public/listing-utils.js";

test("filterItems matches both text and names case-insensitively", () => {
  const items = [
    { name: "Alpha.pdf", text: "hello world" },
    { name: "beta.txt", text: "notes about teams" },
    { name: "gamma.png", text: "project image" },
  ];

  const filtered = filterItems(items, "beta");
  assert.deepEqual(filtered, [{ name: "beta.txt", text: "notes about teams" }]);
});

test("paginateItems clamps to valid page ranges", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  const page = paginateItems(items, 2, 3);

  assert.equal(page.page, 2);
  assert.equal(page.totalPages, 3);
  assert.deepEqual(page.items, [4, 5, 6]);
});
