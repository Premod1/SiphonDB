import { useState, useEffect, useCallback, useRef } from "react";
import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { DbConnection } from "../../types/connection";
import { getConnectionUri, quote } from "../../utils/db";
import TableSidebar from "./TableSidebar";
import DataGrid from "./DataGrid";
import SqlEditorTab from "./SqlEditorTab";
import ErdTab from "./ErdTab";
import RowEditorModal from "./RowEditorModal";
import ExportModal from "./ExportModal";
import { ShieldCheck, ChevronLeft, ChevronRight, AlertCircle, RefreshCw } from "lucide-react";
import { useQueryManager } from "../../hooks/useQueryManager";

interface DbExplorerProps {
  connection: DbConnection;
}

export default function DbExplorer({ connection }: DbExplorerProps) {
  const [activeDb, setActiveDb] = useState<Database | null>(null);
  const dbRef = useRef<Database | null>(null);
  const sshLocalPortRef = useRef<number | null>(null);
  
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const [databases, setDatabases] = useState<string[]>([]);
  const [activeDbName, setActiveDbName] = useState<string>("");

  const [isTableSidebarOpen, setIsTableSidebarOpen] = useState(true);
  const [tables, setTables] = useState<string[]>([]);
  const [filteredTables, setFilteredTables] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [primaryKeys, setPrimaryKeys] = useState<string[]>([]);
  const [selectedRowIndexes, setSelectedRowIndexes] = useState<Set<number>>(new Set());
  
  // Data Filtering & Sorting
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"ASC" | "DESC" | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalRows, setTotalRows] = useState(0);
  const [pageInputVal, setPageInputVal] = useState("1");

  // Row Editor Modal
  const [isRowEditorOpen, setIsRowEditorOpen] = useState(false);
  const [rowEditorMode, setRowEditorMode] = useState<"insert" | "edit">("insert");
  const [rowEditorData, setRowEditorData] = useState<Record<string, string>>({});
  const [rowEditorNulls, setRowEditorNulls] = useState<Record<string, boolean>>({});

  const [activeTab, setActiveTab] = useState<"data" | "query" | "diagram">("data");
  
  // Custom Query
  const [sqlQuery, setSqlQuery] = useState("");
  const [queryResult, setQueryResult] = useState<any[] | null>(null);
  const [queryColumns, setQueryColumns] = useState<string[]>([]);
  const [schemaInfo, setSchemaInfo] = useState<Record<string, string[]>>({});
  
  // Load States
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [isQueryRunning, setIsQueryRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  // Query Manager for history and saved templates
  const {
    history,
    savedQueries,
    addHistoryItem,
    deleteHistoryItem,
    clearHistory,
    saveQueryItem,
    deleteSavedQueryItem,
  } = useQueryManager(connection.id, activeDbName);

  // Self-healing database connection manager
  const getOrLoadDb = useCallback(async (forceRefresh = false): Promise<Database> => {
    if (dbRef.current && !forceRefresh) return dbRef.current;
    
    if (dbRef.current) {
      try {
        await dbRef.current.close(dbRef.current.path);
      } catch (e) {
        console.error("Error closing old DB connection:", e);
      }
      dbRef.current = null;
    }

    let dbName = activeDbName;
    if (!dbName.trim()) {
      dbName = connection.database_name || "";
    }
    if (!dbName.trim()) {
      dbName = connection.db_type === "postgres" ? "postgres" : "mysql";
    }

    if (connection.use_ssh && connection.db_type !== "sqlite") {
      try {
        if (!sshLocalPortRef.current) {
          setStatusMessage("Establishing SSH Tunnel...");
          const localPort = await invoke<number>("start_ssh_tunnel", {
            id: connection.id || 9999,
            sshHost: connection.ssh_host || "",
            sshPort: connection.ssh_port || 22,
            sshUsername: connection.ssh_username || "",
            sshPassword: connection.ssh_password || null,
            sshKeyPath: connection.ssh_key_path || null,
            remoteDbHost: connection.host || "127.0.0.1",
            remoteDbPort: connection.port || (connection.db_type === "mysql" ? 3306 : 5432)
          });
          sshLocalPortRef.current = localPort;
        }
      } catch (err: any) {
        throw new Error(`SSH Tunnel failed: ${err?.message || String(err)}`);
      }
    }

    const uri = getConnectionUri(connection, dbName, sshLocalPortRef.current);
    const db = await Database.load(uri);
    dbRef.current = db;
    
    // ONLY update state if it is a fresh connection, not a silent retry!
    if (!forceRefresh) {
      setActiveDb(db);
    }
    
    return db;
  }, [
    connection.id,
    connection.db_type,
    connection.database_name,
    connection.use_ssh,
    connection.ssh_host,
    connection.ssh_port,
    connection.ssh_username,
    connection.ssh_password,
    connection.ssh_key_path,
    connection.host,
    connection.port,
    activeDbName,
    getConnectionUri
  ]);

  const fetchPrimaryKeys = async (tableName: string, db: Database) => {
    try {
      if (connection.db_type === "sqlite") {
        const pragma = await db.select<any[]>(`PRAGMA table_info(\`${tableName}\`)`);
        return pragma.filter(col => col.pk > 0).map(col => col.name);
      } else if (connection.db_type === "postgres") {
        const queryStr = `
          SELECT a.attname AS name
          FROM pg_index i
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
          WHERE i.indrelid = $1::regclass AND i.indisprimary
        `;
        const results = await db.select<{ name: string }[]>(queryStr, [tableName]);
        return results.map(r => r.name);
      } else {
        // mysql
        const queryStr = `
          SELECT COLUMN_NAME AS name 
          FROM information_schema.KEY_COLUMN_USAGE 
          WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = ? 
            AND CONSTRAINT_NAME = 'PRIMARY'
        `;
        const results = await db.select<{ name: string }[]>(queryStr, [tableName]);
        return results.map(r => r.name);
      }
    } catch (e) {
      console.error("Failed to query primary keys:", e);
      return [];
    }
  };

  const fetchColumnMetadata = async (tableName: string, db: Database): Promise<{ name: string; type: string }[]> => {
    try {
      if (connection.db_type === "sqlite") {
        const pragma = await db.select<any[]>(`PRAGMA table_info(\`${tableName}\`)`);
        return pragma.map(p => ({
          name: p.name,
          type: String(p.type).toLowerCase()
        }));
      } else if (connection.db_type === "postgres") {
        const queryStr = `
          SELECT column_name AS name, data_type AS type 
          FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = $1 
          ORDER BY ordinal_position
        `;
        const cols = await db.select<{ name: string; type: string }[]>(queryStr, [tableName]);
        return cols.map(c => ({
          name: c.name,
          type: String(c.type).toLowerCase()
        }));
      } else {
        // mysql
        const queryStr = `
          SELECT CAST(column_name AS CHAR) AS name, CAST(data_type AS CHAR) AS type 
          FROM information_schema.columns 
          WHERE table_schema = DATABASE() AND table_name = ? 
          ORDER BY ordinal_position
        `;
        const cols = await db.select<{ name: string; type: string }[]>(queryStr, [tableName]);
        return cols.map(c => ({
          name: c.name,
          type: String(c.type).toLowerCase()
        }));
      }
    } catch (e) {
      console.error("Failed to fetch column metadata:", e);
      return [];
    }
  };

  // Fetch data for the selected table with self-healing retry
  const fetchTableData = useCallback(async (
    tableName: string,
    targetPage: number,
    overrideFilters?: Record<string, string>,
    overrideSortCol?: string | null,
    overrideSortDir?: "ASC" | "DESC" | null
  ) => {
    setIsDataLoading(true);
    setError(null);
    try {
      let db = await getOrLoadDb();

      const filters = overrideFilters !== undefined ? overrideFilters : columnFilters;
      const sortCol = overrideSortCol !== undefined ? overrideSortCol : sortColumn;
      const sortDir = overrideSortDir !== undefined ? overrideSortDir : sortDirection;
      
      const runFetch = async (activeDbInstance: Database) => {
        // Build WHERE clause
        const whereClauses: string[] = [];
        Object.entries(filters).forEach(([col, val]) => {
          if (val.trim()) {
            const quotedCol = quote(col, connection.db_type);
            const safeVal = val.replace(/'/g, "''");
            if (connection.db_type === "postgres") {
              whereClauses.push(`CAST(${quotedCol} AS TEXT) ILIKE '%${safeVal}%'`);
            } else {
              // mysql/sqlite
              whereClauses.push(`CAST(${quotedCol} AS CHAR) LIKE '%${safeVal}%'`);
            }
          }
        });
        const whereString = whereClauses.length > 0 ? " WHERE " + whereClauses.join(" AND ") : "";

        // Build ORDER BY clause
        const orderString = sortCol ? ` ORDER BY ${quote(sortCol, connection.db_type)} ${sortDir || "ASC"}` : "";

        // 1. Fetch total rows count
        let countQuery = "";
        if (connection.db_type === "postgres") {
          countQuery = `SELECT COUNT(*) AS count FROM "${tableName}"${whereString}`;
        } else {
          countQuery = `SELECT COUNT(*) AS count FROM \`${tableName}\`${whereString}`;
        }
        const countResult = await activeDbInstance.select<{ count: any }[]>(countQuery);
        const total = Number(countResult[0]?.count || 0);
        setTotalRows(total);

        // 2. Fetch PK metadata
        const pks = await fetchPrimaryKeys(tableName, activeDbInstance);
        setPrimaryKeys(pks);

        // 3. Fetch column metadata for cast conversions
        const colMeta = await fetchColumnMetadata(tableName, activeDbInstance);
        const columnNamesList = colMeta.map(c => c.name);
        setColumns(columnNamesList);

        // Build the select projections
        const projections = colMeta.map(col => {
          const type = col.type;
          const needsCast = type.includes("decimal") || 
                            type.includes("numeric") || 
                            type.includes("binary") || 
                            type.includes("blob") || 
                            type.includes("bit") || 
                            type.includes("geometry");
          
          if (needsCast) {
            return `CAST(${quote(col.name, connection.db_type)} AS CHAR) AS ${quote(col.name, connection.db_type)}`;
          }
          return quote(col.name, connection.db_type);
        });

        const selectFields = projections.length > 0 ? projections.join(", ") : "*";

        // 4. Fetch rows
        let dataQuery = "";
        const offset = (targetPage - 1) * pageSize;
        if (connection.db_type === "postgres") {
          dataQuery = `SELECT ${selectFields} FROM "${tableName}"${whereString}${orderString} LIMIT ${pageSize} OFFSET ${offset}`;
        } else {
          dataQuery = `SELECT ${selectFields} FROM \`${tableName}\`${whereString}${orderString} LIMIT ${pageSize} OFFSET ${offset}`;
        }
        const data = await activeDbInstance.select<any[]>(dataQuery);
        setRows(data);
        setPage(targetPage);
      };

      try {
        await runFetch(db);
      } catch (err) {
        console.warn("Retrying fetchTableData due to query error:", err);
        db = await getOrLoadDb(true); // Force reload connection pool
        await runFetch(db);
      }
    } catch (err: any) {
      console.error("Failed to load table data:", err);
      const errMsg = err?.message || String(err) || "Unknown database error";
      setError(`Failed to read data from ${tableName}: ${errMsg}`);
    } finally {
      setIsDataLoading(false);
    }
  }, [connection.db_type, pageSize, getOrLoadDb, columnFilters, sortColumn, sortDirection]);

  // Connect & load databases and tables list
  const connectToDatabase = useCallback(async (targetDbName?: string) => {
    setIsConnecting(true);
    setError(null);
    setSelectedTable(null);
    setTables([]);
    setRows([]);
    setColumns([]);
    setQueryResult(null);
    setSelectedRowIndexes(new Set());
    setSchemaInfo({});
    
    // Close old database first if it exists
    if (dbRef.current) {
      try {
        await dbRef.current.close(dbRef.current.path);
      } catch (e) {
        console.error("Error closing old DB connection:", e);
      }
      dbRef.current = null;
    }

    // Stop old SSH tunnel if any
    if (sshLocalPortRef.current && connection.id) {
      try {
        await invoke("stop_ssh_tunnel", { id: connection.id });
      } catch (e) {
        console.error("Error stopping old SSH tunnel:", e);
      }
      sshLocalPortRef.current = null;
    }

    // Fallback if target db is empty
    let dbName = targetDbName || connection.database_name || "";
    if (!dbName.trim()) {
      dbName = connection.db_type === "postgres" ? "postgres" : "mysql";
    }

    try {
      // Establish SSH tunnel if needed
      if (connection.use_ssh && connection.db_type !== "sqlite") {
        setStatusMessage("Establishing SSH Tunnel...");
        const localPort = await invoke<number>("start_ssh_tunnel", {
          id: connection.id || 9999,
          sshHost: connection.ssh_host || "",
          sshPort: connection.ssh_port || 22,
          sshUsername: connection.ssh_username || "",
          sshPassword: connection.ssh_password || null,
          sshKeyPath: connection.ssh_key_path || null,
          remoteDbHost: connection.host || "127.0.0.1",
          remoteDbPort: connection.port || (connection.db_type === "mysql" ? 3306 : 5432)
        });
        sshLocalPortRef.current = localPort;
      }

      const uri = getConnectionUri(connection, dbName, sshLocalPortRef.current);
      setStatusMessage(`Connecting to database: ${dbName}...`);

      const db = await Database.load(uri);
      dbRef.current = db;
      setActiveDb(db);
      setActiveDbName(dbName);
      
      // 1. Fetch tables list
      setStatusMessage("Loading schema tables...");
      let schemaQuery = "";
      if (connection.db_type === "sqlite") {
        schemaQuery = "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC";
      } else if (connection.db_type === "postgres") {
        schemaQuery = "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name ASC";
      } else {
        // mysql - cast to CHAR to avoid VARBINARY type errors in SQLx
        schemaQuery = "SELECT CAST(table_name AS CHAR) AS name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name ASC";
      }

      const tableResults = await db.select<{ name: string }[]>(schemaQuery);
      const tableNames = tableResults.map(r => r.name);
      setTables(tableNames);
      setFilteredTables(tableNames);
      
      if (tableNames.length > 0) {
        setSelectedTable(tableNames[0]);
      }

      // 2. Fetch list of databases on the server (only for non-sqlite)
      if (connection.db_type !== "sqlite") {
        setStatusMessage("Fetching database catalog...");
        let dbListQuery = "";
        if (connection.db_type === "postgres") {
          dbListQuery = "SELECT datname AS name FROM pg_database WHERE datistemplate = false ORDER BY datname ASC";
        } else {
          // mysql - cast to CHAR to avoid VARBINARY type errors in SQLx
          dbListQuery = "SELECT CAST(schema_name AS CHAR) AS name FROM information_schema.schemata ORDER BY schema_name ASC";
        }
        
        try {
          const dbResults = await db.select<{ name: string }[]>(dbListQuery);
          setDatabases(dbResults.map(d => d.name));
        } catch (e) {
          console.error("Failed to query database list:", e);
          setDatabases([dbName]);
        }
      } else {
        setDatabases([dbName]);
      }

      // 3. Fetch autocomplete schema metadata (tables and columns)
      try {
        setStatusMessage("Fetching schema metadata for autocomplete...");
        let columnsQuery = "";
        if (connection.db_type === "sqlite") {
          columnsQuery = `
            SELECT m.name AS table_name, p.name AS column_name
            FROM sqlite_schema AS m
            JOIN pragma_table_info(m.name) AS p
            WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'
            ORDER BY m.name, p.cid
          `;
        } else if (connection.db_type === "postgres") {
          columnsQuery = `
            SELECT table_name, column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
          `;
        } else {
          // mysql - cast to CHAR to avoid VARBINARY type errors in SQLx
          columnsQuery = `
            SELECT CAST(table_name AS CHAR) AS table_name, CAST(column_name AS CHAR) AS column_name 
            FROM information_schema.columns 
            WHERE table_schema = DATABASE()
            ORDER BY table_name, ordinal_position
          `;
        }
        
        const colResults = await db.select<{ table_name: string; column_name: string }[]>(columnsQuery);
        const schema: Record<string, string[]> = {};
        colResults.forEach(row => {
          if (!schema[row.table_name]) {
            schema[row.table_name] = [];
          }
          schema[row.table_name].push(row.column_name);
        });
        setSchemaInfo(schema);
      } catch (e) {
        console.error("Failed to load schema autocomplete data:", e);
        // Fallback: populate schema with empty arrays for table names we know
        const schema: Record<string, string[]> = {};
        tableNames.forEach(t => {
          schema[t] = [];
        });
        setSchemaInfo(schema);
      }
    } catch (err: any) {
      console.error("Connection failed:", err);
      const errMsg = err?.message || String(err) || "Unknown connection error";
      setError(errMsg);
    } finally {
      setIsConnecting(false);
    }
  }, [
    connection.id,
    connection.db_type,
    connection.database_name,
    connection.use_ssh,
    connection.ssh_host,
    connection.ssh_port,
    connection.ssh_username,
    connection.ssh_password,
    connection.ssh_key_path,
    connection.host,
    connection.port,
    getConnectionUri
  ]);

  // Handle table search filter
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredTables(tables);
    } else {
      setFilteredTables(tables.filter(t => t.toLowerCase().includes(searchQuery.toLowerCase())));
    }
  }, [searchQuery, tables]);

  // Load database on connection change
  useEffect(() => {
    connectToDatabase();
    
    // Clean up connection on unmount
    return () => {
      if (dbRef.current) {
        dbRef.current.close(dbRef.current.path).catch(console.error);
        dbRef.current = null;
      }
      if (sshLocalPortRef.current && connection.id) {
        invoke("stop_ssh_tunnel", { id: connection.id }).catch(console.error);
        sshLocalPortRef.current = null;
      }
    };
  }, [connection.id, connectToDatabase]);

  // Fetch table data when selected table changes
  useEffect(() => {
    if (selectedTable && activeDb) {
      setColumnFilters({});
      setSortColumn(null);
      setSortDirection(null);
      setPage(1);
      setPageInputVal("1");
      
      fetchTableData(selectedTable, 1, {}, null, null);
      setSqlQuery(`SELECT * FROM ${quote(selectedTable, connection.db_type)} LIMIT 20;`);
    }
  }, [selectedTable, activeDb]);

  // Sync page state to input box value
  useEffect(() => {
    setPageInputVal(String(page));
  }, [page]);

  // Handle page change
  const handlePageChange = (targetPage: number) => {
    const maxPage = Math.ceil(totalRows / pageSize) || 1;
    if (targetPage < 1 || targetPage > maxPage) return;
    setSelectedRowIndexes(new Set());
    fetchTableData(selectedTable!, targetPage);
  };

  const handlePageInputSubmit = () => {
    const val = Number(pageInputVal);
    const maxPage = Math.ceil(totalRows / pageSize) || 1;
    if (!isNaN(val) && val >= 1 && val <= maxPage) {
      handlePageChange(val);
    } else {
      setPageInputVal(String(page)); // Reset
    }
  };

  // Sort Handler
  const handleSort = (columnName: string) => {
    let nextDir: "ASC" | "DESC" | null = "ASC";
    if (sortColumn === columnName) {
      if (sortDirection === "ASC") {
        nextDir = "DESC";
      } else if (sortDirection === "DESC") {
        nextDir = null;
      }
    }
    
    setSortColumn(nextDir ? columnName : null);
    setSortDirection(nextDir);
    setPage(1);
    setPageInputVal("1");
    setSelectedRowIndexes(new Set());
    
    fetchTableData(
      selectedTable!,
      1,
      columnFilters,
      nextDir ? columnName : null,
      nextDir
    );
  };

  // Filter Change Handler
  const handleFilterChange = (columnName: string, value: string) => {
    const nextFilters = { ...columnFilters };
    if (value.trim()) {
      nextFilters[columnName] = value;
    } else {
      delete nextFilters[columnName];
    }
    
    setColumnFilters(nextFilters);
    setPage(1);
    setPageInputVal("1");
    setSelectedRowIndexes(new Set());
    
    fetchTableData(
      selectedTable!,
      1,
      nextFilters,
      sortColumn,
      sortDirection
    );
  };

  // Clear Filters Handler
  const handleClearFilters = () => {
    setColumnFilters({});
    setPage(1);
    setPageInputVal("1");
    setSelectedRowIndexes(new Set());
    
    fetchTableData(
      selectedTable!,
      1,
      {},
      sortColumn,
      sortDirection
    );
  };

  // Checkbox Selection Helpers
  const handleToggleRowSelect = (index: number) => {
    setSelectedRowIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    setSelectedRowIndexes((prev) => {
      const next = new Set<number>();
      if (prev.size < rows.length) {
        rows.forEach((_, idx) => next.add(idx));
      }
      return next;
    });
  };

  // Click Handlers for Row Actions
  const handleInsertRowClick = () => {
    setRowEditorMode("insert");
    const initialData: Record<string, string> = {};
    const initialNulls: Record<string, boolean> = {};
    columns.forEach(col => {
      initialData[col] = "";
      initialNulls[col] = false;
    });
    setRowEditorData(initialData);
    setRowEditorNulls(initialNulls);
    setIsRowEditorOpen(true);
  };

  const handleEditRowClick = () => {
    if (selectedRowIndexes.size !== 1) return;
    const index = Array.from(selectedRowIndexes)[0];
    handleEditRowClickExplicit(index);
  };

  const handleEditRowClickExplicit = (index: number) => {
    setRowEditorMode("edit");
    const row = rows[index];
    const initialData: Record<string, string> = {};
    const initialNulls: Record<string, boolean> = {};
    columns.forEach(col => {
      const val = row[col];
      if (val === null) {
        initialData[col] = "";
        initialNulls[col] = true;
      } else {
        initialData[col] = String(val);
        initialNulls[col] = false;
      }
    });
    setRowEditorData(initialData);
    setRowEditorNulls(initialNulls);
    setIsRowEditorOpen(true);
  };

  const handleDuplicateRowClick = () => {
    if (selectedRowIndexes.size !== 1) return;
    const index = Array.from(selectedRowIndexes)[0];
    setRowEditorMode("insert"); // Duplication is inserting a new row!
    const row = rows[index];
    const initialData: Record<string, string> = {};
    const initialNulls: Record<string, boolean> = {};
    columns.forEach(col => {
      const val = row[col];
      if (val === null) {
        initialData[col] = "";
        initialNulls[col] = true;
      } else {
        initialData[col] = String(val);
        initialNulls[col] = false;
      }
    });
    setRowEditorData(initialData);
    setRowEditorNulls(initialNulls);
    setIsRowEditorOpen(true);
  };

  const handleDeleteRow = async () => {
    if (!selectedTable || selectedRowIndexes.size === 0) return;

    if (!confirm(`Are you sure you want to delete the ${selectedRowIndexes.size} selected row(s)?`)) return;

    setIsDataLoading(true);
    setError(null);

    try {
      let db = await getOrLoadDb();
      
      const runDelete = async (activeDbInstance: Database) => {
        const indices = Array.from(selectedRowIndexes);
        for (const index of indices) {
          const row = rows[index];
          if (!row) continue;

          const keys = primaryKeys.length > 0 ? primaryKeys : Object.keys(row);
          const conditions: string[] = [];
          const params: any[] = [];

          keys.forEach((key) => {
            const val = row[key];
            if (val === null) {
              conditions.push(`${quote(key, connection.db_type)} IS NULL`);
            } else {
              const placeholder = connection.db_type === "postgres" ? `$${params.length + 1}` : "?";
              conditions.push(`${quote(key, connection.db_type)} = ${placeholder}`);
              params.push(val);
            }
          });

          const deleteQuery = `DELETE FROM ${quote(selectedTable, connection.db_type)} WHERE ${conditions.join(" AND ")}`;
          await activeDbInstance.execute(deleteQuery, params);
        }
      };

      try {
        await runDelete(db);
      } catch (err) {
        console.warn("Retrying delete operation due to error:", err);
        db = await getOrLoadDb(true);
        await runDelete(db);
      }

      setSelectedRowIndexes(new Set());
      await fetchTableData(selectedTable, page);
    } catch (err: any) {
      console.error("Failed to delete row(s):", err);
      const errMsg = err?.message || String(err) || "Unknown deletion error";
      setError("Failed to delete row(s): " + errMsg);
      setIsDataLoading(false);
    }
  };

  const handleSaveRow = async () => {
    if (!selectedTable) return;
    setIsDataLoading(true);
    setError(null);

    try {
      let db = await getOrLoadDb();

      const runSave = async (activeDbInstance: Database) => {
        const params: any[] = [];

        if (rowEditorMode === "insert") {
          const activeCols: string[] = [];
          const placeholders: string[] = [];

          columns.forEach((col) => {
            const isNull = rowEditorNulls[col];
            const val = rowEditorData[col];
            const hasValue = val !== undefined && val !== "";

            if (isNull) {
              activeCols.push(quote(col, connection.db_type));
              placeholders.push("NULL");
            } else if (hasValue) {
              activeCols.push(quote(col, connection.db_type));
              const placeholder = connection.db_type === "postgres" ? `$${params.length + 1}` : "?";
              placeholders.push(placeholder);
              
              let finalVal: any = val;
              if (!isNaN(Number(finalVal)) && String(finalVal).trim() !== "") {
                finalVal = Number(finalVal);
              }
              params.push(finalVal);
            }
          });

          if (activeCols.length === 0) {
            throw new Error("Cannot insert empty row. Please provide at least one value.");
          }

          const insertQuery = `INSERT INTO ${quote(selectedTable, connection.db_type)} (${activeCols.join(", ")}) VALUES (${placeholders.join(", ")})`;
          await activeDbInstance.execute(insertQuery, params);
        } else {
          // Edit Mode: UPDATE query
          const index = Array.from(selectedRowIndexes)[0];
          const originalRow = rows[index];
          const keys = primaryKeys.length > 0 ? primaryKeys : Object.keys(originalRow);
          
          const updateParams: any[] = [];
          const setStatements: string[] = [];

          columns.forEach((col) => {
            const isNull = rowEditorNulls[col];
            const val = rowEditorData[col];
            
            if (isNull) {
              setStatements.push(`${quote(col, connection.db_type)} = NULL`);
            } else if (val !== undefined && val !== "") {
              const placeholder = connection.db_type === "postgres" ? `$${updateParams.length + 1}` : "?";
              setStatements.push(`${quote(col, connection.db_type)} = ${placeholder}`);
              
              let finalVal: any = val;
              if (!isNaN(Number(finalVal)) && String(finalVal).trim() !== "") {
                finalVal = Number(finalVal);
              }
              updateParams.push(finalVal);
            }
          });

          if (setStatements.length === 0) {
            return; // No changes
          }

          // WHERE clause construction with correct placeholder indexing
          const whereParamsList: any[] = [];
          const whereConditionsList: string[] = [];

          keys.forEach((key) => {
            const val = originalRow[key];
            if (val === null) {
              whereConditionsList.push(`${quote(key, connection.db_type)} IS NULL`);
            } else {
              const index = updateParams.length + whereParamsList.length + 1;
              const placeholder = connection.db_type === "postgres" ? `$${index}` : "?";
              whereConditionsList.push(`${quote(key, connection.db_type)} = ${placeholder}`);
              whereParamsList.push(val);
            }
          });

          const updateQuery = `UPDATE ${quote(selectedTable, connection.db_type)} SET ${setStatements.join(", ")} WHERE ${whereConditionsList.join(" AND ")}`;
          const finalParams = [...updateParams, ...whereParamsList];
          
          await activeDbInstance.execute(updateQuery, finalParams);
        }
      };

      try {
        await runSave(db);
      } catch (err) {
        console.warn("Retrying save operation due to error:", err);
        db = await getOrLoadDb(true);
        await runSave(db);
      }

      setIsRowEditorOpen(false);
      setSelectedRowIndexes(new Set());
      await fetchTableData(selectedTable, page);
    } catch (err: any) {
      console.error("Failed to save row changes:", err);
      const errMsg = err?.message || String(err) || "Unknown save error";
      setError("Failed to save row: " + errMsg);
      setIsDataLoading(false);
    }
  };

  // Create database handler
  const handleCreateDatabase = async () => {
    setIsConnecting(true);
    setStatusMessage("Creating database...");
    setError(null);
    try {
      const newDbName = prompt("Enter name for the new database:");
      if (!newDbName || !newDbName.trim()) {
        setIsConnecting(false);
        return;
      }

      let db = await getOrLoadDb();
      
      const runCreate = async (activeDbInstance: Database) => {
        let createQuery = "";
        if (connection.db_type === "mysql") {
          createQuery = `CREATE DATABASE \`${newDbName}\``;
        } else if (connection.db_type === "postgres") {
          createQuery = `CREATE DATABASE "${newDbName}"`;
        } else {
          return;
        }
        await activeDbInstance.execute(createQuery);
      };

      try {
        await runCreate(db);
      } catch (err) {
        console.warn("Retrying database creation due to error:", err);
        db = await getOrLoadDb(true);
        await runCreate(db);
      }

      await connectToDatabase(newDbName);
    } catch (err: any) {
      console.error("Failed to create database:", err);
      const errMsg = err?.message || String(err) || "Unknown creation error";
      setError(`Failed to create database: ` + errMsg);
      setIsConnecting(false);
    }
  };

  // Execute Custom SQL Query
  const handleRunQuery = async () => {
    if (!sqlQuery.trim()) return;
    setIsQueryRunning(true);
    setQueryError(null);
    setQueryResult(null);
    setQueryColumns([]);

    try {
      let db = await getOrLoadDb();
      
      const runQuery = async (activeDbInstance: Database) => {
        const isSelect = sqlQuery.trim().toLowerCase().startsWith("select") || 
                         sqlQuery.trim().toLowerCase().startsWith("pragma") || 
                         sqlQuery.trim().toLowerCase().startsWith("show");

        if (isSelect) {
          const results = await activeDbInstance.select<any[]>(sqlQuery);
          setQueryResult(results);
          if (results.length > 0) {
            setQueryColumns(Object.keys(results[0]));
          }
        } else {
          const result = await activeDbInstance.execute(sqlQuery);
          setQueryResult([{ message: "Query executed successfully", affectedRows: result.rowsAffected }]);
          setQueryColumns(["message", "affectedRows"]);
          
          if (sqlQuery.toLowerCase().includes("table")) {
            connectToDatabase(activeDbName);
          }
        }
      };

      try {
        await runQuery(db);
        await addHistoryItem(sqlQuery);
      } catch (err) {
        console.warn("Retrying user query due to error:", err);
        db = await getOrLoadDb(true);
        await runQuery(db);
        await addHistoryItem(sqlQuery);
      }
    } catch (err: any) {
      console.error("Query execution failed:", err);
      const errMsg = err?.message || String(err) || "SQL Error occurred";
      setQueryError(errMsg);
    } finally {
      setIsQueryRunning(false);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden h-full">
      {/* Tables Sidebar */}
      <TableSidebar
        connection={connection}
        isTableSidebarOpen={isTableSidebarOpen}
        isConnecting={isConnecting}
        activeDbName={activeDbName}
        databases={databases}
        filteredTables={filteredTables}
        selectedTable={selectedTable}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        setSelectedTable={setSelectedTable}
        connectToDatabase={connectToDatabase}
        handleCreateDatabase={handleCreateDatabase}
        onExportClick={() => setIsExportModalOpen(true)}
      />

      {/* Workspace Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-950/20 h-full">
        {/* Navigation Tabs */}
        <div className="px-6 border-b border-white/5 bg-gray-950/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsTableSidebarOpen(!isTableSidebarOpen)}
              className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-all mr-2 cursor-pointer"
              title={isTableSidebarOpen ? "Collapse tables panel" : "Expand tables panel"}
            >
              {isTableSidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            <div className="flex gap-4">
              <button
                onClick={() => setActiveTab("data")}
                className={`py-3.5 px-1 border-b-2 font-medium text-xs transition-all ${
                  activeTab === "data"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                Table Data Preview
              </button>
              <button
                onClick={() => setActiveTab("query")}
                className={`py-3.5 px-1 border-b-2 font-medium text-xs transition-all ${
                  activeTab === "query"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                SQL Editor
              </button>
              <button
                onClick={() => setActiveTab("diagram")}
                className={`py-3.5 px-1 border-b-2 font-medium text-xs transition-all ${
                  activeTab === "diagram"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                Database Diagram
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            Connected: {activeDbName} ({connection.connection_name})
          </div>
        </div>

        {/* Tab Content Panels */}
        <div className="flex-1 overflow-hidden p-6 relative flex flex-col">
          {/* Main Error display */}
          {error && (
            <div className="mb-4 p-3 bg-red-950/30 border border-red-800/40 rounded-xl text-red-200 text-xs flex gap-2 items-center shrink-0">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Connect/Loading overlay */}
          {(isConnecting || isDataLoading) && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-10 flex flex-col items-center justify-center space-y-3">
              <div className="p-4 bg-gray-900 border border-white/10 rounded-2xl shadow-xl flex items-center justify-center">
                <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
              </div>
              <p className="text-xs text-indigo-300 font-medium">{statusMessage || "Loading data..."}</p>
            </div>
          )}

          {/* PANEL 1: Table Data */}
          {activeTab === "data" && (
            <DataGrid
              selectedTable={selectedTable}
              columns={columns}
              rows={rows}
              primaryKeys={primaryKeys}
              selectedRowIndexes={selectedRowIndexes}
              isDataLoading={isDataLoading}
              page={page}
              pageSize={pageSize}
              totalRows={totalRows}
              pageInputVal={pageInputVal}
              setPageInputVal={setPageInputVal}
              handleInsertRowClick={handleInsertRowClick}
              handleEditRowClick={handleEditRowClick}
              handleDuplicateRowClick={handleDuplicateRowClick}
              handleDeleteRow={handleDeleteRow}
              fetchTableData={fetchTableData}
              handleToggleSelectAll={handleToggleSelectAll}
              handleToggleRowSelect={handleToggleRowSelect}
              handleEditRowClickExplicit={handleEditRowClickExplicit}
              handlePageChange={handlePageChange}
              handlePageInputSubmit={handlePageInputSubmit}
              columnFilters={columnFilters}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              handleSort={handleSort}
              handleFilterChange={handleFilterChange}
              handleClearFilters={handleClearFilters}
            />
          )}

          {/* PANEL 2: SQL Editor */}
          {activeTab === "query" && (
            <SqlEditorTab
              sqlQuery={sqlQuery}
              setSqlQuery={setSqlQuery}
              isQueryRunning={isQueryRunning}
              queryError={queryError}
              queryResult={queryResult}
              queryColumns={queryColumns}
              handleRunQuery={handleRunQuery}
              schemaInfo={schemaInfo}
              history={history}
              savedQueries={savedQueries}
              deleteHistoryItem={deleteHistoryItem}
              clearHistory={clearHistory}
              saveQueryItem={saveQueryItem}
              deleteSavedQueryItem={deleteSavedQueryItem}
            />
          )}

          {/* PANEL 3: Database Diagram */}
          {activeTab === "diagram" && (
            <ErdTab
              connection={connection}
              activeDb={activeDb}
              tables={tables}
              onTableSelect={setSelectedTable}
              setActiveTab={setActiveTab}
            />
          )}
        </div>
      </div>

      {/* Row Editor Modal Dialog */}
      <RowEditorModal
        isOpen={isRowEditorOpen}
        onClose={() => setIsRowEditorOpen(false)}
        rowEditorMode={rowEditorMode}
        selectedTable={selectedTable}
        columns={columns}
        primaryKeys={primaryKeys}
        rowEditorData={rowEditorData}
        setRowEditorData={setRowEditorData}
        rowEditorNulls={rowEditorNulls}
        setRowEditorNulls={setRowEditorNulls}
        handleSaveRow={handleSaveRow}
      />

      {/* Export Database Modal Dialog */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        connection={connection}
        tables={tables}
        activeDbName={activeDbName}
        getOrLoadDb={getOrLoadDb}
        sshLocalPort={sshLocalPortRef.current}
      />
    </div>
  );
}
