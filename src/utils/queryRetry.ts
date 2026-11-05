/**
 * Strips leading SQL comments (-- line comments and /* block comments *\/) and whitespace.
 */
export function stripLeadingComments(sql: string): string {
  let s = sql.trim();
  while (true) {
    if (s.startsWith("--")) {
      const newlineIndex = s.indexOf("\n");
      if (newlineIndex === -1) {
        return "";
      }
      s = s.slice(newlineIndex + 1).trim();
    } else if (s.startsWith("/*")) {
      const endCommentIndex = s.indexOf("*/");
      if (endCommentIndex === -1) {
        return "";
      }
      s = s.slice(endCommentIndex + 2).trim();
    } else {
      break;
    }
  }
  return s;
}

/**
 * Returns true if the SQL string contains multiple executable statements
 * separated by semicolons (ignoring semicolons inside strings, backticks, comments,
 * and trailing semicolons).
 */
export function hasMultipleStatements(sql: string): boolean {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inSingleQuote) {
      if (ch === "\\" && next) {
        i++;
      } else if (ch === "'" && next === "'") {
        i++;
      } else if (ch === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      if (ch === "\\" && next) {
        i++;
      } else if (ch === '"' && next === '"') {
        i++;
      } else if (ch === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (inBacktick) {
      if (ch === "`" && next === "`") {
        i++;
      } else if (ch === "`") {
        inBacktick = false;
      }
      continue;
    }

    // Check comment starters
    if (ch === "-" && next === "-") {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }

    // Check quotes starters
    if (ch === "'") {
      inSingleQuote = true;
      continue;
    }
    if (ch === '"') {
      inDoubleQuote = true;
      continue;
    }
    if (ch === "`") {
      inBacktick = true;
      continue;
    }

    if (ch === ";") {
      const rest = stripLeadingComments(sql.slice(i + 1)).replace(/;/g, "").trim();
      if (rest.length > 0) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Returns true if the query is a single-statement read-only / SELECT query
 * (such as SELECT, PRAGMA, SHOW, EXPLAIN, DESC, DESCRIBE).
 * Multi-statement queries or queries starting with INSERT/UPDATE/DELETE/CREATE/etc.
 * return false (#16).
 */
export function isSelectQuery(sql: string): boolean {
  if (!sql || !sql.trim()) return false;
  if (hasMultipleStatements(sql)) return false;

  const clean = stripLeadingComments(sql).replace(/^\(+/, "").trim();
  const firstWord = clean.split(/[\s(;]+/)[0].toLowerCase();

  return ["select", "pragma", "show", "explain", "desc", "describe"].includes(firstWord);
}

/**
 * Checks whether an error is a connection-level failure (closed, broken pipe, reset, timeout, etc.)
 * as opposed to a query-level or syntax error (#16).
 */
export function isConnectionError(err: unknown): boolean {
  if (!err) return false;

  const msg = (
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
      ? String((err as any).message)
      : String(err)
  ).toLowerCase();

  // Negative patterns: syntax, schema, constraint, data errors are NOT connection errors.
  const nonConnectionPatterns = [
    "syntax error",
    "sql syntax",
    "unrecognized token",
    "does not exist",
    "doesn't exist",
    "no such table",
    "no such column",
    "unknown column",
    "unknown table",
    "unique constraint",
    "foreign key",
    "not null",
    "check constraint",
    "duplicate entry",
    "duplicate key",
    "division by zero",
    "invalid input syntax",
    "data truncated",
    "permission denied",
    "access denied",
  ];

  if (nonConnectionPatterns.some((pattern) => msg.includes(pattern))) {
    return false;
  }

  // Positive patterns: closed socket/pool, broken pipe, connection reset, timeout, refused, EOF.
  const connectionErrorPatterns = [
    "closed",
    "broken pipe",
    "pipe broken",
    "epipe",
    "connection reset",
    "reset by peer",
    "econnreset",
    "timeout",
    "timed out",
    "etimedout",
    "connection refused",
    "econnrefused",
    "connection lost",
    "connection aborted",
    "not connected",
    "no connection",
    "failed to connect",
    "cannot connect",
    "unexpected eof",
    "unexpected end of file",
    "end of file",
    "ssh tunnel failed",
    "server closed the connection",
    "error communicating with the database",
    "not loaded",
    "network unreachable",
    "host unreachable",
  ];

  return connectionErrorPatterns.some((pattern) => msg.includes(pattern)) || /\breset\b/.test(msg);
}
