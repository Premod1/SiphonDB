export const quote = (name: string, dbType: string): string => {
  if (dbType === "postgres") {
    return `"${name.replace(/"/g, '""')}"`;
  }
  return `\`${name.replace(/`/g, "``")}\``;
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
