import assert from "node:assert/strict";
import test from "node:test";
import {
  isConnectionError,
  isSelectQuery,
  hasMultipleStatements,
  stripLeadingComments,
} from "./queryRetry.ts";

test("isConnectionError correctly identifies connection drop errors (#16)", () => {
  // Closed connection / pool
  assert.equal(isConnectionError(new Error("connection closed")), true);
  assert.equal(isConnectionError(new Error("the connection was closed")), true);
  assert.equal(isConnectionError(new Error("pool is closed")), true);
  assert.equal(isConnectionError(new Error("attempted to use a closed pool")), true);
  assert.equal(isConnectionError(new Error("socket closed")), true);
  assert.equal(isConnectionError("database sqlite:connections.db not loaded"), true);

  // Broken pipe
  assert.equal(isConnectionError(new Error("Broken pipe (os error 32)")), true);
  assert.equal(isConnectionError(new Error("write: broken pipe")), true);
  assert.equal(isConnectionError(new Error("epipe")), true);

  // Connection reset
  assert.equal(isConnectionError(new Error("Connection reset by peer (os error 104)")), true);
  assert.equal(isConnectionError(new Error("read: connection reset")), true);
  assert.equal(isConnectionError("econnreset"), true);

  // Timeout
  assert.equal(isConnectionError(new Error("timed out waiting for an open connection")), true);
  assert.equal(isConnectionError(new Error("Connection timed out (os error 110)")), true);
  assert.equal(isConnectionError(new Error("query timeout reached")), true);
  assert.equal(isConnectionError(new Error("connect_timeout exceeded")), true);

  // Refused / EOF / SSH tunnel
  assert.equal(isConnectionError(new Error("Connection refused (os error 111)")), true);
  assert.equal(isConnectionError(new Error("unexpected eof")), true);
  assert.equal(isConnectionError(new Error("SSH Tunnel failed: connection lost")), true);
  assert.equal(isConnectionError(new Error("server closed the connection unexpectedly")), true);
});

test("isConnectionError does NOT match SQL syntax, schema, constraint, or data errors (#16)", () => {
  // Syntax errors
  assert.equal(isConnectionError(new Error('syntax error at or near "FORM"')), false);
  assert.equal(
    isConnectionError(
      new Error("You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version")
    ),
    false
  );
  assert.equal(isConnectionError(new Error('unrecognized token: "foo"')), false);

  // Missing tables/columns with keyword names (e.g. closed, timeout)
  assert.equal(isConnectionError(new Error('column "is_closed" does not exist')), false);
  assert.equal(isConnectionError(new Error("Table 'mydb.closed_tickets' doesn't exist")), false);
  assert.equal(isConnectionError(new Error("Unknown column 'timeout' in 'field list'")), false);
  assert.equal(isConnectionError(new Error("no such table: closed_orders")), false);
  assert.equal(isConnectionError(new Error("no such column: timeout_seconds")), false);

  // Constraint and data errors
  assert.equal(isConnectionError(new Error("duplicate key value violates unique constraint")), false);
  assert.equal(isConnectionError(new Error("FOREIGN KEY constraint failed")), false);
  assert.equal(isConnectionError(new Error("null value in column id violates not-null constraint")), false);
  assert.equal(isConnectionError(new Error("division by zero")), false);
  assert.equal(isConnectionError(new Error("permission denied for table users")), false);

  // Empty/null
  assert.equal(isConnectionError(null), false);
  assert.equal(isConnectionError(undefined), false);
  assert.equal(isConnectionError(""), false);
});

test("stripLeadingComments removes single-line and multi-line comments", () => {
  assert.equal(stripLeadingComments("SELECT 1"), "SELECT 1");
  assert.equal(stripLeadingComments("-- single line comment\nSELECT 1"), "SELECT 1");
  assert.equal(stripLeadingComments("/* block comment */ SELECT 1"), "SELECT 1");
  assert.equal(
    stripLeadingComments(`-- comment 1\n-- comment 2\n/* block */\nSELECT 1`),
    "SELECT 1"
  );
  assert.equal(stripLeadingComments("-- only a comment with no query"), "");
});

test("hasMultipleStatements correctly detects scripts with multiple statements (#16)", () => {
  // Single statements
  assert.equal(hasMultipleStatements("SELECT * FROM users"), false);
  assert.equal(hasMultipleStatements("SELECT * FROM users;"), false);
  assert.equal(hasMultipleStatements("SELECT * FROM users;   \n\n"), false);
  assert.equal(hasMultipleStatements("SELECT * FROM users; -- trailing comment"), false);
  assert.equal(hasMultipleStatements("SELECT * FROM users; /* trailing block */"), false);
  assert.equal(hasMultipleStatements("SELECT ';' AS semicolon"), false);
  assert.equal(hasMultipleStatements('SELECT ";" AS semicolon'), false);

  // Multiple statements
  assert.equal(hasMultipleStatements("SELECT 1; SELECT 2"), true);
  assert.equal(hasMultipleStatements("CREATE TABLE a (id int); INSERT INTO a VALUES (1);"), true);
  assert.equal(hasMultipleStatements("INSERT INTO users VALUES (1); DELETE FROM users;"), true);
  assert.equal(hasMultipleStatements("SELECT 1; \n DROP TABLE users;"), true);
});

test("isSelectQuery identifies safe read-only queries and rejects writes or scripts (#16)", () => {
  // Read queries
  assert.equal(isSelectQuery("SELECT * FROM users"), true);
  assert.equal(isSelectQuery("select id from orders where active = 1;"), true);
  assert.equal(isSelectQuery("  SELECT 1;  "), true);
  assert.equal(isSelectQuery("-- comment\nSELECT * FROM users;"), true);
  assert.equal(isSelectQuery("/* comment */ SHOW TABLES;"), true);
  assert.equal(isSelectQuery("PRAGMA table_info('users')"), true);
  assert.equal(isSelectQuery("EXPLAIN SELECT 1"), true);
  assert.equal(isSelectQuery("DESCRIBE users"), true);
  assert.equal(isSelectQuery("DESC users"), true);
  assert.equal(isSelectQuery("(SELECT * FROM users)"), true);

  // Write queries (must NOT be treated as SELECT)
  assert.equal(isSelectQuery("INSERT INTO users (name) VALUES ('Alice')"), false);
  assert.equal(isSelectQuery("UPDATE users SET name = 'Bob' WHERE id = 1"), false);
  assert.equal(isSelectQuery("DELETE FROM users WHERE id = 1"), false);
  assert.equal(isSelectQuery("DROP TABLE users"), false);
  assert.equal(isSelectQuery("CREATE TABLE users (id int)"), false);
  assert.equal(isSelectQuery("ALTER TABLE users ADD COLUMN age int"), false);
  assert.equal(isSelectQuery("TRUNCATE TABLE users"), false);

  // Multi-statement scripts (must NEVER be treated as SELECT auto-retryable)
  assert.equal(isSelectQuery("SELECT 1; INSERT INTO users VALUES (1);"), false);
  assert.equal(isSelectQuery("CREATE TABLE t (id int); INSERT INTO t VALUES (1);"), false);
  assert.equal(isSelectQuery("SELECT 1; SELECT 2;"), false);

  // Empty / invalid
  assert.equal(isSelectQuery(""), false);
  assert.equal(isSelectQuery("   "), false);
});
