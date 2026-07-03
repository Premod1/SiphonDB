import { useState, useEffect, useCallback } from "react";
import Database from "@tauri-apps/plugin-sql";

import { DbConnection } from "../types/connection";

let dbInstance: Database | null = null;

async function getDb(forceRefresh = false): Promise<Database> {
  if (dbInstance && !forceRefresh) return dbInstance;
  
  // Close old instance if force refreshing
  if (dbInstance) {
    try {
      await dbInstance.close(dbInstance.path);
    } catch (e) {
      console.error("Error closing connections.db before reconnect:", e);
    }
    dbInstance = null;
  }

  // Load the connection.db file.
  dbInstance = await Database.load("sqlite:connections.db");
  
  // Run migration / table creation
  await dbInstance.execute(`
    CREATE TABLE IF NOT EXISTS db_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      connection_name TEXT NOT NULL,
      db_type TEXT NOT NULL,
      host TEXT,
      port INTEGER,
      username TEXT,
      password TEXT,
      database_name TEXT
    );
  `);

  // Gracefully run migrations for SSH columns if they do not exist
  try {
    await dbInstance.execute("ALTER TABLE db_connections ADD COLUMN use_ssh INTEGER DEFAULT 0");
  } catch (_) {}
  try {
    await dbInstance.execute("ALTER TABLE db_connections ADD COLUMN ssh_host TEXT");
  } catch (_) {}
  try {
    await dbInstance.execute("ALTER TABLE db_connections ADD COLUMN ssh_port INTEGER DEFAULT 22");
  } catch (_) {}
  try {
    await dbInstance.execute("ALTER TABLE db_connections ADD COLUMN ssh_username TEXT");
  } catch (_) {}
  try {
    await dbInstance.execute("ALTER TABLE db_connections ADD COLUMN ssh_password TEXT");
  } catch (_) {}
  try {
    await dbInstance.execute("ALTER TABLE db_connections ADD COLUMN ssh_key_path TEXT");
  } catch (_) {}
  
  return dbInstance;
}

export function useConnectionManager() {
  const [connections, setConnections] = useState<DbConnection[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConnections = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let db = await getDb();
      let result;
      try {
        result = await db.select<any[]>(
          "SELECT * FROM db_connections ORDER BY id DESC"
        );
      } catch (err) {
        console.warn("Retrying fetchConnections due to query error:", err);
        db = await getDb(true);
        result = await db.select<any[]>(
          "SELECT * FROM db_connections ORDER BY id DESC"
        );
      }

      // Normalize fields
      const normalized = result.map((conn) => ({
        ...conn,
        use_ssh: Number(conn.use_ssh) === 1,
        ssh_port: conn.ssh_port ? Number(conn.ssh_port) : 22
      }));

      setConnections(normalized);
    } catch (err: any) {
      console.error("Error fetching connections:", err);
      dbInstance = null;
      setError(err?.message || String(err) || "Failed to load database connections");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveConnection = useCallback(async (profile: Omit<DbConnection, "id"> & { id?: number }) => {
    setError(null);
    try {
      let db = await getDb();
      
      const runQuery = async (activeDb: Database) => {
        if (profile.id) {
          // Update existing connection
          await activeDb.execute(
            `UPDATE db_connections 
             SET connection_name = ?, db_type = ?, host = ?, port = ?, username = ?, password = ?, database_name = ?,
                 use_ssh = ?, ssh_host = ?, ssh_port = ?, ssh_username = ?, ssh_password = ?, ssh_key_path = ?
             WHERE id = ?`,
            [
              profile.connection_name,
              profile.db_type,
              profile.host || null,
              profile.port ? Number(profile.port) : null,
              profile.username || null,
              profile.password || null,
              profile.database_name || null,
              profile.use_ssh ? 1 : 0,
              profile.ssh_host || null,
              profile.ssh_port ? Number(profile.ssh_port) : 22,
              profile.ssh_username || null,
              profile.ssh_password || null,
              profile.ssh_key_path || null,
              profile.id
            ]
          );
        } else {
          // Insert new connection
          await activeDb.execute(
            `INSERT INTO db_connections (
              connection_name, db_type, host, port, username, password, database_name,
              use_ssh, ssh_host, ssh_port, ssh_username, ssh_password, ssh_key_path
             ) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              profile.connection_name,
              profile.db_type,
              profile.host || null,
              profile.port ? Number(profile.port) : null,
              profile.username || null,
              profile.password || null,
              profile.database_name || null,
              profile.use_ssh ? 1 : 0,
              profile.ssh_host || null,
              profile.ssh_port ? Number(profile.ssh_port) : 22,
              profile.ssh_username || null,
              profile.ssh_password || null,
              profile.ssh_key_path || null
            ]
          );
        }
      };

      try {
        await runQuery(db);
      } catch (err) {
        console.warn("Retrying saveConnection due to query error:", err);
        db = await getDb(true);
        await runQuery(db);
      }
      
      await fetchConnections();
      return true;
    } catch (err: any) {
      console.error("Error saving connection:", err);
      dbInstance = null;
      setError(err?.message || String(err) || "Failed to save connection profile");
      return false;
    }
  }, [fetchConnections]);

  const deleteConnection = useCallback(async (id: number) => {
    setError(null);
    try {
      let db = await getDb();
      try {
        await db.execute("DELETE FROM db_connections WHERE id = ?", [id]);
      } catch (err) {
        console.warn("Retrying deleteConnection due to query error:", err);
        db = await getDb(true);
        await db.execute("DELETE FROM db_connections WHERE id = ?", [id]);
      }
      await fetchConnections();
      return true;
    } catch (err: any) {
      console.error("Error deleting connection:", err);
      dbInstance = null;
      setError(err?.message || String(err) || "Failed to delete connection profile");
      return false;
    }
  }, [fetchConnections]);

  // Initial load
  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  return {
    connections,
    isLoading,
    error,
    saveConnection,
    deleteConnection,
    refreshConnections: fetchConnections
  };
}
