import { DbConnection } from "../types/connection";

export const getConnectionUri = (conn: DbConnection, dbName: string, localSshPort: number | null): string => {
  if (conn.db_type === "sqlite") {
    return `sqlite:${conn.database_name}`;
  }
  const host = conn.use_ssh && localSshPort ? "127.0.0.1" : (conn.host || "127.0.0.1");
  const port = conn.use_ssh && localSshPort ? localSshPort : conn.port;
  const user = encodeURIComponent(conn.username || "");
  const pass = encodeURIComponent(conn.password || "");
  return `${conn.db_type}://${user}:${pass}@${host}:${port}/${dbName}?connect_timeout=5`;
};

export const quote = (name: string, dbType: string): string => {
  return dbType === "postgres" ? `"${name}"` : `\`${name}\``;
};
