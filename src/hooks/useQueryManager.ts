import { useState, useEffect, useCallback } from "react";
import Database from "@tauri-apps/plugin-sql";

export interface HistoryItem {
  id: number;
  connection_id?: number;
  database_name?: string;
  query_text: string;
  executed_at: string;
}

export interface SavedQueryItem {
  id: number;
  connection_id?: number;
  database_name?: string;
  query_name: string;
  query_text: string;
  created_at: string;
}

let dbInstance: Database | null = null;

async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;
  dbInstance = await Database.load("sqlite:connections.db");
  return dbInstance;
}

export function useQueryManager(connectionId?: number, databaseName?: string) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [savedQueries, setSavedQueries] = useState<SavedQueryItem[]>([]);

  // Load history and saved queries
  const loadData = useCallback(async () => {
    try {
      const db = await getDb();
      
      // Ensure tables exist
      await db.execute(`
        CREATE TABLE IF NOT EXISTS query_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          connection_id INTEGER,
          database_name TEXT,
          query_text TEXT NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS saved_queries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          connection_id INTEGER,
          database_name TEXT,
          query_name TEXT NOT NULL,
          query_text TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Load matching connection & database history
      let historyResults: HistoryItem[] = [];
      let savedResults: SavedQueryItem[] = [];

      if (connectionId) {
        historyResults = await db.select<HistoryItem[]>(
          "SELECT * FROM query_history WHERE connection_id = ? AND database_name = ? ORDER BY executed_at DESC LIMIT 100",
          [connectionId, databaseName || null]
        );
        savedResults = await db.select<SavedQueryItem[]>(
          "SELECT * FROM saved_queries WHERE connection_id = ? AND database_name = ? ORDER BY created_at DESC",
          [connectionId, databaseName || null]
        );
      } else {
        historyResults = await db.select<HistoryItem[]>(
          "SELECT * FROM query_history ORDER BY executed_at DESC LIMIT 100"
        );
        savedResults = await db.select<SavedQueryItem[]>(
          "SELECT * FROM saved_queries ORDER BY created_at DESC"
        );
      }

      setHistory(historyResults);
      setSavedQueries(savedResults);
    } catch (e) {
      console.error("Failed to load query history/saved queries:", e);
    }
  }, [connectionId, databaseName]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Add item to history
  const addHistoryItem = async (queryText: string) => {
    if (!queryText.trim()) return;
    try {
      const db = await getDb();
      await db.execute(
        "INSERT INTO query_history (connection_id, database_name, query_text) VALUES (?, ?, ?)",
        [connectionId || null, databaseName || null, queryText]
      );
      loadData();
    } catch (e) {
      console.error("Failed to add query history item:", e);
    }
  };

  // Delete history item
  const deleteHistoryItem = async (id: number) => {
    try {
      const db = await getDb();
      await db.execute("DELETE FROM query_history WHERE id = ?", [id]);
      loadData();
    } catch (e) {
      console.error("Failed to delete history item:", e);
    }
  };

  // Clear all history
  const clearHistory = async () => {
    try {
      const db = await getDb();
      if (connectionId) {
        await db.execute("DELETE FROM query_history WHERE connection_id = ? AND database_name = ?", [
          connectionId,
          databaseName || null,
        ]);
      } else {
        await db.execute("DELETE FROM query_history");
      }
      loadData();
    } catch (e) {
      console.error("Failed to clear history:", e);
    }
  };

  // Save query
  const saveQueryItem = async (name: string, queryText: string) => {
    if (!name.trim() || !queryText.trim()) return;
    try {
      const db = await getDb();
      await db.execute(
        "INSERT INTO saved_queries (connection_id, database_name, query_name, query_text) VALUES (?, ?, ?, ?)",
        [connectionId || null, databaseName || null, name, queryText]
      );
      loadData();
    } catch (e) {
      console.error("Failed to save query:", e);
    }
  };

  // Delete saved query
  const deleteSavedQueryItem = async (id: number) => {
    try {
      const db = await getDb();
      await db.execute("DELETE FROM saved_queries WHERE id = ?", [id]);
      loadData();
    } catch (e) {
      console.error("Failed to delete saved query:", e);
    }
  };

  return {
    history,
    savedQueries,
    addHistoryItem,
    deleteHistoryItem,
    clearHistory,
    saveQueryItem,
    deleteSavedQueryItem,
    refreshQueries: loadData,
  };
}
