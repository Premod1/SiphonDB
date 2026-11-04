export const quote = (name: string, dbType: string): string => {
  if (dbType === "postgres") {
    return `"${name.replace(/"/g, '""')}"`;
  }
  return `\`${name.replace(/`/g, "``")}\``;
};

export const getColumnCastType = (dbType: string): string => {
  // In PostgreSQL, CHAR means char(1) which truncates numbers/strings to 1 char.
  // Use TEXT for PostgreSQL (#15).
  return dbType === "postgres" ? "TEXT" : "CHAR";
};

export const buildColumnProjection = (
  colName: string,
  colType: string,
  dbType: string
): string => {
  const type = colType.toLowerCase();
  const needsCast =
    type.includes("decimal") ||
    type.includes("numeric") ||
    type.includes("binary") ||
    type.includes("bytea") ||
    type.includes("blob") ||
    type.includes("bit") ||
    type.includes("geometry");

  const quotedCol = quote(colName, dbType);
  if (needsCast) {
    const castType = getColumnCastType(dbType);
    return `CAST(${quotedCol} AS ${castType}) AS ${quotedCol}`;
  }
  return quotedCol;
};

export const buildDeleteRowQuery = (
  tableName: string,
  dbType: string,
  conditions: string[],
  hasPrimaryKey: boolean
): string => {
  const quotedTable = quote(tableName, dbType);
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  if (hasPrimaryKey || !whereClause) {
    return `DELETE FROM ${quotedTable} ${whereClause}`.trim();
  }

  // When no primary key exists, limit to 1 row to prevent deleting identical/duplicate rows (#18)
  if (dbType === "postgres") {
    return `DELETE FROM ${quotedTable} WHERE ctid = (SELECT ctid FROM ${quotedTable} ${whereClause} LIMIT 1)`;
  } else if (dbType === "mysql") {
    return `DELETE FROM ${quotedTable} ${whereClause} LIMIT 1`;
  } else {
    // sqlite
    return `DELETE FROM ${quotedTable} WHERE rowid = (SELECT rowid FROM ${quotedTable} ${whereClause} LIMIT 1)`;
  }
};

export const buildUpdateRowQuery = (
  tableName: string,
  dbType: string,
  setStatements: string[],
  whereConditions: string[],
  hasPrimaryKey: boolean
): string => {
  const quotedTable = quote(tableName, dbType);
  const setClause = setStatements.join(", ");
  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  if (hasPrimaryKey || !whereClause) {
    return `UPDATE ${quotedTable} SET ${setClause} ${whereClause}`.trim();
  }

  // When no primary key exists, limit to 1 row to prevent mutating duplicate rows (#18)
  if (dbType === "postgres") {
    return `UPDATE ${quotedTable} SET ${setClause} WHERE ctid = (SELECT ctid FROM ${quotedTable} ${whereClause} LIMIT 1)`;
  } else if (dbType === "mysql") {
    return `UPDATE ${quotedTable} SET ${setClause} ${whereClause} LIMIT 1`;
  } else {
    // sqlite
    return `UPDATE ${quotedTable} SET ${setClause} WHERE rowid = (SELECT rowid FROM ${quotedTable} ${whereClause} LIMIT 1)`;
  }
};
