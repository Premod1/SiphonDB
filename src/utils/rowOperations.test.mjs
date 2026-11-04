import assert from "node:assert/strict";
import test from "node:test";
import { quote, buildDeleteRowQuery, buildUpdateRowQuery } from "./rowOperations.ts";

test("quote properly escapes identifiers for PostgreSQL, MySQL, and SQLite", () => {
  assert.equal(quote("Users", "postgres"), '"Users"');
  assert.equal(quote('user"table', "postgres"), '"user""table"');
  assert.equal(quote("users", "mysql"), "`users`");
  assert.equal(quote("user`table", "mysql"), "`user``table`");
  assert.equal(quote("users", "sqlite"), "`users`");
});

test("buildDeleteRowQuery generates standard DELETE when table has primary key", () => {
  const pgQuery = buildDeleteRowQuery("Users", "postgres", ['"id" = $1'], true);
  assert.equal(pgQuery, 'DELETE FROM "Users" WHERE "id" = $1');

  const myQuery = buildDeleteRowQuery("users", "mysql", ["`id` = ?"], true);
  assert.equal(myQuery, "DELETE FROM `users` WHERE `id` = ?");

  const sqliteQuery = buildDeleteRowQuery("users", "sqlite", ["`id` = ?"], true);
  assert.equal(sqliteQuery, "DELETE FROM `users` WHERE `id` = ?");
});

test("buildDeleteRowQuery limits to 1 row when table has no primary key (#18)", () => {
  // PostgreSQL: uses ctid subquery with LIMIT 1
  const pgQuery = buildDeleteRowQuery(
    "Users",
    "postgres",
    ['"name" = $1', '"email" = $2'],
    false
  );
  assert.equal(
    pgQuery,
    'DELETE FROM "Users" WHERE ctid = (SELECT ctid FROM "Users" WHERE "name" = $1 AND "email" = $2 LIMIT 1)'
  );

  // MySQL: appends LIMIT 1
  const myQuery = buildDeleteRowQuery(
    "users",
    "mysql",
    ["`name` = ?", "`email` = ?"],
    false
  );
  assert.equal(
    myQuery,
    "DELETE FROM `users` WHERE `name` = ? AND `email` = ? LIMIT 1"
  );

  // SQLite: uses rowid subquery with LIMIT 1
  const sqliteQuery = buildDeleteRowQuery(
    "users",
    "sqlite",
    ["`name` = ?", "`email` = ?"],
    false
  );
  assert.equal(
    sqliteQuery,
    "DELETE FROM `users` WHERE rowid = (SELECT rowid FROM `users` WHERE `name` = ? AND `email` = ? LIMIT 1)"
  );
});

test("buildUpdateRowQuery generates standard UPDATE when table has primary key", () => {
  const pgQuery = buildUpdateRowQuery(
    "Users",
    "postgres",
    ['"name" = $1'],
    ['"id" = $2'],
    true
  );
  assert.equal(pgQuery, 'UPDATE "Users" SET "name" = $1 WHERE "id" = $2');

  const myQuery = buildUpdateRowQuery(
    "users",
    "mysql",
    ["`name` = ?"],
    ["`id` = ?"],
    true
  );
  assert.equal(myQuery, "UPDATE `users` SET `name` = ? WHERE `id` = ?");
});

test("buildUpdateRowQuery limits to 1 row when table has no primary key (#18)", () => {
  // PostgreSQL: uses ctid subquery with LIMIT 1
  const pgQuery = buildUpdateRowQuery(
    "Users",
    "postgres",
    ['"name" = $1'],
    ['"name" = $2', '"email" = $3'],
    false
  );
  assert.equal(
    pgQuery,
    'UPDATE "Users" SET "name" = $1 WHERE ctid = (SELECT ctid FROM "Users" WHERE "name" = $2 AND "email" = $3 LIMIT 1)'
  );

  // MySQL: appends LIMIT 1
  const myQuery = buildUpdateRowQuery(
    "users",
    "mysql",
    ["`name` = ?"],
    ["`name` = ?", "`email` = ?"],
    false
  );
  assert.equal(
    myQuery,
    "UPDATE `users` SET `name` = ? WHERE `name` = ? AND `email` = ? LIMIT 1"
  );

  // SQLite: uses rowid subquery with LIMIT 1
  const sqliteQuery = buildUpdateRowQuery(
    "users",
    "sqlite",
    ["`name` = ?"],
    ["`name` = ?", "`email` = ?"],
    false
  );
  assert.equal(
    sqliteQuery,
    "UPDATE `users` SET `name` = ? WHERE rowid = (SELECT rowid FROM `users` WHERE `name` = ? AND `email` = ? LIMIT 1)"
  );
});
