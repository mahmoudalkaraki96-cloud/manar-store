import test from "node:test";
import assert from "node:assert/strict";
import { isPreviewReadOnlySql, previewReadOnlyDatabase, previewReadOnlyResponse } from "../worker/preview-guard.ts";

test("preview allows read queries and safe metadata PRAGMAs", () => {
  assert.equal(isPreviewReadOnlySql("SELECT id FROM products"), true);
  assert.equal(isPreviewReadOnlySql("PRAGMA table_info(products)"), true);
  assert.equal(isPreviewReadOnlySql("PRAGMA foreign_key_list(products)"), true);
});

test("preview rejects SQL statements that can change data or schema", () => {
  for (const query of [
    "INSERT INTO products(id) VALUES(1)",
    "UPDATE products SET active = 0",
    "DELETE FROM products",
    "CREATE TABLE products_copy(id INTEGER)",
    "ALTER TABLE products ADD COLUMN preview TEXT",
    "WITH x AS (SELECT 1) DELETE FROM products",
    "PRAGMA foreign_keys=OFF",
  ]) assert.equal(isPreviewReadOnlySql(query), false, query);
});

test("database wrapper permits reads and rejects writes and batch operations", () => {
  const database = previewReadOnlyDatabase({
    prepare: (query) => query,
    batch: () => "unexpected",
  });
  assert.equal(database.prepare("SELECT 1"), "SELECT 1");
  assert.throws(() => database.prepare("UPDATE products SET active = 0"), /writes are disabled/);
  assert.throws(() => database.batch([]), /batches are disabled/);
});

test("preview allows read-only requests and rejects mutations", async () => {
  assert.equal(previewReadOnlyResponse("GET", true), null);
  assert.equal(previewReadOnlyResponse("HEAD", true), null);
  const response = previewReadOnlyResponse("POST", true);
  assert.equal(response?.status, 405);
  assert.equal(response?.headers.get("allow"), "GET, HEAD");
  assert.match(await response.text(), /read-only/);
  assert.equal(previewReadOnlyResponse("PUT", true)?.status, 405);
  assert.equal(previewReadOnlyResponse("DELETE", true)?.status, 405);
});

test("production requests are unaffected", () => {
  assert.equal(previewReadOnlyResponse("POST", false), null);
});
