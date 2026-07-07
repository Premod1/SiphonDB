import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { save, open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { DbConnection } from "../../types/connection";
import { quote } from "../../utils/db";
import { X, Download, AlertCircle, CheckCircle2, RefreshCw, FileText, Database as DbIcon, ShieldCheck } from "lucide-react";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  connection: DbConnection;
  tables: string[];
  activeDbName: string;
  getOrLoadDb: (forceRefresh?: boolean) => Promise<Database>;
  sshLocalPort: number | null;
}

type ExportFormat = "sql" | "csv" | "json";

export default function ExportModal({
  isOpen,
  onClose,
  connection,
  tables,
  activeDbName,
  getOrLoadDb,
  sshLocalPort,
}: ExportModalProps) {
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<ExportFormat>("sql");
  const [useNativeDump, setUseNativeDump] = useState(true);
  
  // SQL specific options
  const [includeSchema, setIncludeSchema] = useState(true);
  const [includeData, setIncludeData] = useState(true);
  const [dropTables, setDropTables] = useState(true);

  // Status & Progress States
  const [status, setStatus] = useState<"idle" | "exporting" | "success" | "error">("idle");
  const [progressMsg, setProgressMsg] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [targetPath, setTargetPath] = useState("");

  // Sync selected tables with available tables on open
  useEffect(() => {
    if (isOpen) {
      setSelectedTables(new Set(tables));
      setStatus("idle");
      setErrorMessage("");
      setProgressMsg("");
    }
  }, [isOpen, tables]);

  if (!isOpen) return null;

  const handleToggleTable = (table: string) => {
    setSelectedTables((prev) => {
      const next = new Set(prev);
      if (next.has(table)) {
        next.delete(table);
      } else {
        next.add(table);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedTables(new Set(tables));
  };

  const handleSelectNone = () => {
    setSelectedTables(new Set());
  };

  // Helper: Escape SQL String
  const formatSqlValue = (val: any) => {
    if (val === null || val === undefined) return "NULL";
    if (typeof val === "number") return String(val);
    if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
    // String escape
    return `'${String(val).replace(/'/g, "''")}'`;
  };

  // Helper: Escape CSV Field
  const escapeCsvField = (val: any) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Helper: Get Column Metadata
  const fetchColumnMetadata = async (db: Database, tableName: string): Promise<{ name: string; type: string }[]> => {
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
      console.error(`Failed to fetch columns for ${tableName}:`, e);
      return [];
    }
  };

  // Helper: Generate Postgres CREATE TABLE SQL statement
  const generatePostgresSchema = async (db: Database, tableName: string) => {
    const query = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `;
    const cols = await db.select<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }[]>(query, [tableName]);
    if (cols.length === 0) return `/* Could not fetch columns for ${tableName} */`;
    
    const fields = cols.map(c => {
      let line = `  "${c.column_name}" ${c.data_type.toUpperCase()}`;
      if (c.is_nullable === 'NO') {
        line += " NOT NULL";
      }
      if (c.column_default !== null) {
        line += ` DEFAULT ${c.column_default}`;
      }
      return line;
    });
    return `CREATE TABLE "${tableName}" (\n${fields.join(",\n")}\n);`;
  };

  const handleExport = async () => {
    if (!useNativeDump && selectedTables.size === 0) {
      alert("Please select at least one table to export.");
      return;
    }

    let filePathOrDir = "";
    try {
      if (format === "sql") {
        const defaultExt = connection.db_type === "sqlite" && useNativeDump ? "db" : "sql";
        const filterName = connection.db_type === "sqlite" && useNativeDump ? "SQLite Database" : "SQL Dump";
        const filterExts = connection.db_type === "sqlite" && useNativeDump ? ["db", "sqlite"] : ["sql"];

        const selected = await save({
          title: "Save Backup",
          defaultPath: `${activeDbName}_backup.${defaultExt}`,
          filters: [{ name: filterName, extensions: filterExts }]
        });
        if (!selected) return;
        filePathOrDir = selected;
      } else {
        const selected = await open({
          title: "Select Directory to Save CSV/JSON Files",
          directory: true
        });
        if (!selected) return;
        filePathOrDir = selected as string;
      }
    } catch (err: any) {
      console.error("File dialog error:", err);
      return;
    }

    setTargetPath(filePathOrDir);
    setStatus("exporting");
    setProgressMsg("Initializing export...");

    try {
      if (format === "sql" && useNativeDump) {
        setProgressMsg(`Running fast native backup for ${activeDbName}...`);
        const host = connection.use_ssh && sshLocalPort ? "127.0.0.1" : connection.host;
        const port = connection.use_ssh && sshLocalPort ? sshLocalPort : connection.port;

        await invoke("run_native_dump", {
          params: {
            db_type: connection.db_type,
            host: host,
            port: port,
            username: connection.username,
            password: connection.password,
            database_name: connection.database_name || activeDbName,
            target_path: filePathOrDir,
          }
        });

        setStatus("success");
        setProgressMsg("Fast native backup completed successfully!");
        return;
      }

      const db = await getOrLoadDb();
      const tableList = Array.from(selectedTables);
      
      if (format === "sql") {
        // Initialize empty SQL file
        const header = `-- SiphonDB Database Export\n-- Database: ${activeDbName}\n-- Engine: ${connection.db_type}\n-- Date: ${new Date().toISOString()}\n\n`;
        await invoke("save_file", { path: filePathOrDir, contents: header });

        for (let i = 0; i < tableList.length; i++) {
          const tableName = tableList[i];
          setProgressMsg(`Processing Table ${i + 1}/${tableList.length}: ${tableName} (schema)...`);

          let tableSql = "";

          // Drop statement
          if (dropTables) {
            tableSql += `DROP TABLE IF EXISTS ${quote(tableName, connection.db_type)};\n`;
          }

          // Create Table Schema statement
          if (includeSchema) {
            if (connection.db_type === "sqlite") {
              const res = await db.select<{ sql: string }[]>(
                `SELECT sql FROM sqlite_schema WHERE type='table' AND name = ?`,
                [tableName]
              );
              if (res[0]?.sql) {
                tableSql += `${res[0].sql};\n\n`;
              }
            } else if (connection.db_type === "mysql") {
              const res = await db.select<any[]>(`SHOW CREATE TABLE \`${tableName}\``);
              const createTableVal = res[0]?.["Create Table"] || res[0]?.["create table"];
              if (createTableVal) {
                tableSql += `${createTableVal};\n\n`;
              }
            } else {
              // postgres
              const res = await generatePostgresSchema(db, tableName);
              tableSql += `${res}\n\n`;
            }
          }

          await invoke("append_text_file", { path: filePathOrDir, content: tableSql });

          // Include data
          if (includeData) {
            // Get total rows
            let countQuery = "";
            if (connection.db_type === "postgres") {
              countQuery = `SELECT COUNT(*) AS count FROM "${tableName}"`;
            } else {
              countQuery = `SELECT COUNT(*) AS count FROM \`${tableName}\``;
            }
            const countResult = await db.select<{ count: any }[]>(countQuery);
            const totalRows = Number(countResult[0]?.count || 0);

            if (totalRows > 0) {
              const colMeta = await fetchColumnMetadata(db, tableName);
              const columnNames = colMeta.map(c => c.name);
              
              // Build projection string
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

              // Paginate & Insert
              let offset = 0;
              const batchSize = 500;
              
              while (offset < totalRows) {
                setProgressMsg(
                  `Processing Table ${i + 1}/${tableList.length}: ${tableName} (data ${offset}/${totalRows} rows)...`
                );

                let dataQuery = "";
                if (connection.db_type === "postgres") {
                  dataQuery = `SELECT ${selectFields} FROM "${tableName}" LIMIT ${batchSize} OFFSET ${offset}`;
                } else {
                  dataQuery = `SELECT ${selectFields} FROM \`${tableName}\` LIMIT ${batchSize} OFFSET ${offset}`;
                }

                const batchRows = await db.select<any[]>(dataQuery);
                if (batchRows.length === 0) break;

                let insertSql = "";
                const quotedCols = columnNames.map(col => quote(col, connection.db_type)).join(", ");

                batchRows.forEach((row) => {
                  const values = columnNames.map((col) => formatSqlValue(row[col])).join(", ");
                  insertSql += `INSERT INTO ${quote(tableName, connection.db_type)} (${quotedCols}) VALUES (${values});\n`;
                });

                await invoke("append_text_file", { path: filePathOrDir, content: insertSql });
                offset += batchRows.length;
              }
              await invoke("append_text_file", { path: filePathOrDir, content: "\n" });
            }
          }
        }
      } else if (format === "csv") {
        for (let i = 0; i < tableList.length; i++) {
          const tableName = tableList[i];
          const fileTarget = `${filePathOrDir}/${tableName}.csv`;
          
          setProgressMsg(`Processing Table ${i + 1}/${tableList.length}: ${tableName}...`);

          const colMeta = await fetchColumnMetadata(db, tableName);
          const columnNames = colMeta.map(c => c.name);

          // Write CSV Header
          const header = columnNames.map(escapeCsvField).join(",") + "\n";
          await invoke("save_file", { path: fileTarget, contents: header });

          // Get total rows
          let countQuery = "";
          if (connection.db_type === "postgres") {
            countQuery = `SELECT COUNT(*) AS count FROM "${tableName}"`;
          } else {
            countQuery = `SELECT COUNT(*) AS count FROM \`${tableName}\``;
          }
          const countResult = await db.select<{ count: any }[]>(countQuery);
          const totalRows = Number(countResult[0]?.count || 0);

          if (totalRows > 0) {
            // Build projection string
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

            let offset = 0;
            const batchSize = 1000;
            while (offset < totalRows) {
              setProgressMsg(
                `Processing Table ${i + 1}/${tableList.length}: ${tableName} (${offset}/${totalRows} rows)...`
              );

              let dataQuery = "";
              if (connection.db_type === "postgres") {
                dataQuery = `SELECT ${selectFields} FROM "${tableName}" LIMIT ${batchSize} OFFSET ${offset}`;
              } else {
                dataQuery = `SELECT ${selectFields} FROM \`${tableName}\` LIMIT ${batchSize} OFFSET ${offset}`;
              }

              const batchRows = await db.select<any[]>(dataQuery);
              if (batchRows.length === 0) break;

              let csvLines = "";
              batchRows.forEach((row) => {
                csvLines += columnNames.map(col => escapeCsvField(row[col])).join(",") + "\n";
              });

              await invoke("append_text_file", { path: fileTarget, content: csvLines });
              offset += batchRows.length;
            }
          }
        }
      } else if (format === "json") {
        for (let i = 0; i < tableList.length; i++) {
          const tableName = tableList[i];
          const fileTarget = `${filePathOrDir}/${tableName}.json`;
          
          setProgressMsg(`Processing Table ${i + 1}/${tableList.length}: ${tableName}...`);

          // Start JSON array
          await invoke("save_file", { path: fileTarget, contents: "[\n" });

          const colMeta = await fetchColumnMetadata(db, tableName);
          
          // Get total rows
          let countQuery = "";
          if (connection.db_type === "postgres") {
            countQuery = `SELECT COUNT(*) AS count FROM "${tableName}"`;
          } else {
            countQuery = `SELECT COUNT(*) AS count FROM \`${tableName}\``;
          }
          const countResult = await db.select<{ count: any }[]>(countQuery);
          const totalRows = Number(countResult[0]?.count || 0);

          if (totalRows > 0) {
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

            let offset = 0;
            const batchSize = 1000;
            while (offset < totalRows) {
              setProgressMsg(
                `Processing Table ${i + 1}/${tableList.length}: ${tableName} (${offset}/${totalRows} rows)...`
              );

              let dataQuery = "";
              if (connection.db_type === "postgres") {
                dataQuery = `SELECT ${selectFields} FROM "${tableName}" LIMIT ${batchSize} OFFSET ${offset}`;
              } else {
                dataQuery = `SELECT ${selectFields} FROM \`${tableName}\` LIMIT ${batchSize} OFFSET ${offset}`;
              }

              const batchRows = await db.select<any[]>(dataQuery);
              if (batchRows.length === 0) break;

              let jsonLines = "";
              batchRows.forEach((row, idx) => {
                const isLastRow = (offset + idx) === totalRows - 1;
                jsonLines += `  ${JSON.stringify(row)}${isLastRow ? "" : ","}\n`;
              });

              await invoke("append_text_file", { path: fileTarget, content: jsonLines });
              offset += batchRows.length;
            }
          }
          
          // End JSON array
          await invoke("append_text_file", { path: fileTarget, content: "]" });
        }
      }

      setStatus("success");
      setProgressMsg("Export completed successfully!");
    } catch (err: any) {
      console.error("Database export failed:", err);
      setStatus("error");
      setErrorMessage(err?.message || String(err) || "Unknown error occurred during export");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div 
        className="w-full max-w-2xl bg-[#0c0d14]/90 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/5 bg-gray-950/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Export Database</h3>
              <p className="text-[10px] text-gray-500 font-mono">Active Database: {activeDbName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={status === "exporting"}
            className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        {status === "exporting" ? (
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-4 flex-1">
            <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-full animate-pulse">
              <RefreshCw className="w-10 h-10 text-indigo-400 animate-spin" />
            </div>
            <h4 className="text-sm font-semibold text-white">Exporting Database Content...</h4>
            <p className="text-xs text-indigo-300 font-mono bg-gray-950/60 px-4 py-2 border border-white/5 rounded-xl max-w-md w-full truncate">
              {progressMsg}
            </p>
          </div>
        ) : status === "success" ? (
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-4 flex-1">
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            </div>
            <h4 className="text-base font-bold text-white">Export Succeeded!</h4>
            <p className="text-xs text-gray-400 max-w-md">
              Your database has been successfully written to:
            </p>
            <p className="text-xs text-emerald-400 font-mono bg-gray-950/60 px-4 py-2 border border-white/5 rounded-xl max-w-md w-full select-all break-all">
              {targetPath}
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl text-xs transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
            {status === "error" && (
              <div className="p-3 bg-red-950/30 border border-red-800/40 rounded-xl text-red-200 flex gap-2 items-center">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Step 1: Format */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                1. Select Format
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setFormat("sql")}
                  className={`flex flex-col items-center justify-center p-4 border rounded-xl gap-2 transition-all cursor-pointer ${
                    format === "sql"
                      ? "bg-indigo-600/10 border-indigo-500 text-indigo-400 shadow-md"
                      : "bg-gray-900/40 border-white/5 text-gray-400 hover:bg-white/[0.02]"
                  }`}
                >
                  <FileText className="w-6 h-6" />
                  <span className="font-semibold text-[11px]">SQL Dump (.sql)</span>
                  <span className="text-[9px] text-gray-500">Single schema + insert file</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFormat("csv")}
                  className={`flex flex-col items-center justify-center p-4 border rounded-xl gap-2 transition-all cursor-pointer ${
                    format === "csv"
                      ? "bg-indigo-600/10 border-indigo-500 text-indigo-400 shadow-md"
                      : "bg-gray-900/40 border-white/5 text-gray-400 hover:bg-white/[0.02]"
                  }`}
                >
                  <DbIcon className="w-6 h-6" />
                  <span className="font-semibold text-[11px]">CSV Files (.csv)</span>
                  <span className="text-[9px] text-gray-500">Directory with table CSVs</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFormat("json")}
                  className={`flex flex-col items-center justify-center p-4 border rounded-xl gap-2 transition-all cursor-pointer ${
                    format === "json"
                      ? "bg-indigo-600/10 border-indigo-500 text-indigo-400 shadow-md"
                      : "bg-gray-900/40 border-white/5 text-gray-400 hover:bg-white/[0.02]"
                  }`}
                >
                  <ShieldCheck className="w-6 h-6" />
                  <span className="font-semibold text-[11px]">JSON Files (.json)</span>
                  <span className="text-[9px] text-gray-500">Directory with table JSONs</span>
                </button>
              </div>
            </div>

            {/* Step 2: SQL Customization / Native Backup */}
            {format === "sql" && (
              <div className="space-y-3">
                {connection.db_type !== "sqlite" ? (
                  <div className="p-4 bg-indigo-950/20 border border-indigo-500/25 rounded-xl space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-indigo-300">
                      <input
                        type="checkbox"
                        checked={useNativeDump}
                        onChange={(e) => setUseNativeDump(e.target.checked)}
                        className="w-4 h-4 accent-indigo-500 bg-gray-950 border-white/10 rounded cursor-pointer animate-pulse"
                      />
                      ⚡ Use Fast Native Backup (mysqldump / pg_dump)
                    </label>
                    <p className="text-[10px] text-gray-400 pl-6 leading-relaxed">
                      Recommended for large databases. Runs the official database CLI dump utilities. It is up to 100x faster, processes data in a separate system thread, and avoids memory issues on massive tables.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-indigo-950/20 border border-indigo-500/25 rounded-xl space-y-1.5">
                    <p className="text-indigo-300 font-bold flex items-center gap-1.5">
                      ⚡ SQLite Backup (Instant Copy)
                    </p>
                    <p className="text-[10px] text-gray-400 leading-relaxed">
                      SQLite backups are executed via direct filesystem level copying of the database file. This is instantaneous even for databases of 10GB or larger.
                    </p>
                  </div>
                )}

                {!useNativeDump && connection.db_type !== "sqlite" && (
                  <div className="space-y-2 p-4 bg-gray-900/40 border border-white/5 rounded-xl">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                      SQL Options
                    </label>
                    <div className="flex items-center gap-6">
                      <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-300">
                        <input
                          type="checkbox"
                          checked={includeSchema}
                          onChange={(e) => setIncludeSchema(e.target.checked)}
                          className="w-4 h-4 accent-indigo-500 bg-gray-950 border-white/10 rounded cursor-pointer"
                        />
                        Include CREATE SCHEMA
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-300">
                        <input
                          type="checkbox"
                          checked={includeData}
                          onChange={(e) => setIncludeData(e.target.checked)}
                          className="w-4 h-4 accent-indigo-500 bg-gray-950 border-white/10 rounded cursor-pointer"
                        />
                        Include INSERT Data
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-300">
                        <input
                          type="checkbox"
                          checked={dropTables}
                          onChange={(e) => setDropTables(e.target.checked)}
                          className="w-4 h-4 accent-indigo-500 bg-gray-950 border-white/10 rounded cursor-pointer"
                        />
                        Add DROP TABLE IF EXISTS
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Tables Selection */}
            {!(format === "sql" && useNativeDump) ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    2. Select Tables ({selectedTables.size} / {tables.length} selected)
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-gray-600">•</span>
                    <button
                      type="button"
                      onClick={handleSelectNone}
                      className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="border border-white/5 rounded-xl bg-gray-950/60 p-3 max-h-[220px] overflow-y-auto grid grid-cols-2 gap-2">
                  {tables.length === 0 ? (
                    <div className="col-span-2 py-4 text-center text-gray-500 italic">No tables to export</div>
                  ) : (
                    tables.map((table) => {
                      const isChecked = selectedTables.has(table);
                      return (
                        <label
                          key={table}
                          className={`flex items-center gap-2.5 p-2 rounded-lg border transition-all cursor-pointer truncate ${
                            isChecked
                              ? "bg-indigo-600/5 border-indigo-500/20 text-indigo-300"
                              : "bg-transparent border-transparent text-gray-400 hover:bg-white/[0.01]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleTable(table)}
                            className="w-3.5 h-3.5 accent-indigo-500 bg-gray-950 border-white/10 rounded cursor-pointer shrink-0"
                          />
                          <span className="truncate text-xs font-mono font-medium">{table}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 bg-gray-900/40 border border-white/5 rounded-xl text-center space-y-1">
                <p className="font-semibold text-gray-300">Entire Database Selection</p>
                <p className="text-[10px] text-gray-500">
                  Fast Native Backup will export all tables, columns, and data directly. Individual table filtering is not available for native backup.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        {status !== "exporting" && status !== "success" && (
          <div className="px-6 py-4 border-t border-white/5 bg-gray-950/40 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-white/10 hover:bg-white/5 text-gray-300 rounded-xl font-medium text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={selectedTables.size === 0}
              className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 disabled:pointer-events-none text-white font-semibold rounded-xl text-xs shadow-lg shadow-indigo-600/15 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Configure & Export
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
