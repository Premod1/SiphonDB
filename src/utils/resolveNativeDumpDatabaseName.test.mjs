/**
 * Node built-in tests for resolveNativeDumpDatabaseName (#23).
 * Run: node --experimental-strip-types --test src/utils/resolveNativeDumpDatabaseName.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { resolveNativeDumpDatabaseName } from "./resolveNativeDumpDatabaseName.ts";

test("prefers activeDbName over the connection profile database", () => {
  assert.equal(resolveNativeDumpDatabaseName("selected_db", "profile_db"), "selected_db");
});

test("falls back to connection database_name when nothing is selected", () => {
  assert.equal(resolveNativeDumpDatabaseName("", "profile_db"), "profile_db");
});

test("returns empty string when both are missing", () => {
  assert.equal(resolveNativeDumpDatabaseName("", null), "");
  assert.equal(resolveNativeDumpDatabaseName("", undefined), "");
});
