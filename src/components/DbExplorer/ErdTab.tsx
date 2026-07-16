import { useState, useEffect, useRef, MouseEvent, WheelEvent } from "react";
import Database from "@tauri-apps/plugin-sql";
import { DbConnection } from "../../types/connection";
import { 
  ZoomIn, 
  ZoomOut, 
  RefreshCw, 
  Key, 
  Link2, 
  Maximize,
  HelpCircle,
  Eye,
  Network
} from "lucide-react";

interface ErdTabProps {
  connection: DbConnection;
  activeDb: Database | null;
  tables: string[];
  onTableSelect: (table: string) => void;
  setActiveTab: (tab: "data" | "query" | "diagram") => void;
}

interface ColumnInfo {
  name: string;
  type: string;
  isPk: boolean;
  isFk: boolean;
}

interface TableInfo {
  name: string;
  columns: ColumnInfo[];
}

interface RelationInfo {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

export default function ErdTab({
  connection,
  activeDb,
  tables,
  onTableSelect,
  setActiveTab,
}: ErdTabProps) {
  const [schemaTables, setSchemaTables] = useState<TableInfo[]>([]);
  const [relations, setRelations] = useState<RelationInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Canvas Viewport State
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  
  // Dragging State
  const [activeDragTable, setActiveDragTable] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  // Refs for Drag & Pan lifecycles
  const dragStartRef = useRef<{ clientX: number; clientY: number; tableX: number; tableY: number } | null>(null);
  const panStartRef = useRef<{ clientX: number; clientY: number; panX: number; panY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const getStorageKey = () => `siphondb_erd_pos_${connection.id}_${activeDb ? activeDb.path.replace(/[^a-zA-Z0-9]/g, "_") : "default"}`;

  const calculateDefaultPos = (index: number) => {
    const cols = Math.max(3, Math.ceil(Math.sqrt(tables.length)));
    const spacingX = 320;
    const spacingY = 280;
    const startX = 60;
    const startY = 60;
    
    return {
      x: startX + (index % cols) * spacingX,
      y: startY + Math.floor(index / cols) * spacingY,
    };
  };

  const initializePositions = (tList: TableInfo[]) => {
    const key = getStorageKey();
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const updated = { ...parsed };
        let modified = false;
        tList.forEach((t, idx) => {
          if (!updated[t.name]) {
            updated[t.name] = calculateDefaultPos(idx);
            modified = true;
          }
        });
        setPositions(updated);
        if (modified) {
          localStorage.setItem(key, JSON.stringify(updated));
        }
        return;
      } catch (e) {
        console.error("Error reading saved ERD positions:", e);
      }
    }

    // Default grid layout
    const initialPos: Record<string, { x: number; y: number }> = {};
    tList.forEach((t, idx) => {
      initialPos[t.name] = calculateDefaultPos(idx);
    });
    setPositions(initialPos);
    localStorage.setItem(key, JSON.stringify(initialPos));
  };

  const loadSchema = async () => {
    if (!activeDb) return;
    setIsLoading(true);
    setError(null);
    try {
      let colsList: { table_name: string; name: string; type: string }[] = [];
      let pksList: { table_name: string; name: string }[] = [];
      let fksList: { from_table: string; from_column: string; to_table: string; to_column: string }[] = [];

      if (connection.db_type === "sqlite") {
        await Promise.all(
          tables.map(async (table) => {
            try {
              const colInfo = await activeDb.select<any[]>(`PRAGMA table_info(\`${table}\`)`);
              colInfo.forEach((p) => {
                colsList.push({
                  table_name: table,
                  name: p.name,
                  type: String(p.type).toLowerCase() || "text",
                });
                if (p.pk > 0) {
                  pksList.push({ table_name: table, name: p.name });
                }
              });

              const fkInfo = await activeDb.select<any[]>(`PRAGMA foreign_key_list(\`${table}\`)`);
              fkInfo.forEach((f) => {
                if (f.table && f.from && f.to) {
                  fksList.push({
                    from_table: table,
                    from_column: f.from,
                    to_table: f.table,
                    to_column: f.to,
                  });
                }
              });
            } catch (err) {
              console.warn(`Failed to read metadata for table ${table}:`, err);
            }
          })
        );
      } else if (connection.db_type === "postgres") {
        const colsQuery = `
          SELECT table_name, column_name AS name, data_type AS type
          FROM information_schema.columns
          WHERE table_schema = 'public'
          ORDER BY table_name, ordinal_position;
        `;
        colsList = await activeDb.select<any[]>(colsQuery);

        const pksQuery = `
          SELECT kcu.table_name, kcu.column_name AS name
          FROM information_schema.table_constraints t
          JOIN information_schema.key_column_usage kcu
            ON kcu.constraint_name = t.constraint_name
            AND kcu.table_schema = t.table_schema
          WHERE t.constraint_type = 'PRIMARY KEY' AND t.table_schema = 'public';
        `;
        pksList = await activeDb.select<any[]>(pksQuery);

        const fksQuery = `
          SELECT
              tc.table_name AS from_table,
              kcu.column_name AS from_column,
              ccu.table_name AS to_table,
              ccu.column_name AS to_column
          FROM
              information_schema.table_constraints AS tc
              JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
              JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = ccu.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
        `;
        fksList = await activeDb.select<any[]>(fksQuery);
      } else {
        // mysql
        const colsQuery = `
          SELECT CAST(table_name AS CHAR) AS table_name, CAST(column_name AS CHAR) AS name, CAST(data_type AS CHAR) AS type
          FROM information_schema.columns
          WHERE table_schema = DATABASE()
          ORDER BY table_name, ordinal_position;
        `;
        colsList = await activeDb.select<any[]>(colsQuery);

        const pksQuery = `
          SELECT CAST(table_name AS CHAR) AS table_name, CAST(column_name AS CHAR) AS name
          FROM information_schema.key_column_usage
          WHERE table_schema = DATABASE() AND constraint_name = 'PRIMARY';
        `;
        pksList = await activeDb.select<any[]>(pksQuery);

        const fksQuery = `
          SELECT
              CAST(table_name AS CHAR) AS from_table,
              CAST(column_name AS CHAR) AS from_column,
              CAST(referenced_table_name AS CHAR) AS to_table,
              CAST(referenced_column_name AS CHAR) AS to_column
          FROM information_schema.key_column_usage
          WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL;
        `;
        fksList = await activeDb.select<any[]>(fksQuery);
      }

      const tableMap: Record<string, ColumnInfo[]> = {};
      tables.forEach((t) => {
        tableMap[t] = [];
      });

      colsList.forEach((col) => {
        if (tableMap[col.table_name]) {
          const isPk = pksList.some((pk) => pk.table_name === col.table_name && pk.name === col.name);
          const isFk = fksList.some((fk) => fk.from_table === col.table_name && fk.from_column === col.name);
          tableMap[col.table_name].push({
            name: col.name,
            type: col.type,
            isPk,
            isFk,
          });
        }
      });

      const parsedTables: TableInfo[] = Object.entries(tableMap).map(([name, cols]) => ({
        name,
        columns: cols,
      }));

      const parsedRelations: RelationInfo[] = fksList.map((fk) => ({
        fromTable: fk.from_table,
        fromColumn: fk.from_column,
        toTable: fk.to_table,
        toColumn: fk.to_column,
      }));

      setSchemaTables(parsedTables);
      setRelations(parsedRelations);
      initializePositions(parsedTables);
    } catch (err: any) {
      console.error("Failed to load ERD schema:", err);
      setError(err?.message || "Failed to load database schema.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSchema();
  }, [activeDb, tables.length]);

  // Window-level mouse listeners for seamless panning and dragging
  useEffect(() => {
    const handleWindowMouseMove = (e: globalThis.MouseEvent) => {
      if (activeDragTable && dragStartRef.current) {
        const dx = (e.clientX - dragStartRef.current.clientX) / zoom;
        const dy = (e.clientY - dragStartRef.current.clientY) / zoom;
        
        const newX = Math.round(dragStartRef.current.tableX + dx);
        const newY = Math.round(dragStartRef.current.tableY + dy);

        setPositions((prev) => ({
          ...prev,
          [activeDragTable]: { x: newX, y: newY },
        }));
      } else if (isPanning && panStartRef.current) {
        const dx = e.clientX - panStartRef.current.clientX;
        const dy = e.clientY - panStartRef.current.clientY;

        setPan({
          x: panStartRef.current.panX + dx,
          y: panStartRef.current.panY + dy,
        });
      }
    };

    const handleWindowMouseUp = () => {
      if (activeDragTable) {
        const key = getStorageKey();
        localStorage.setItem(key, JSON.stringify(positions));
        setActiveDragTable(null);
      }
      setIsPanning(false);
    };

    if (activeDragTable || isPanning) {
      window.addEventListener("mousemove", handleWindowMouseMove);
      window.addEventListener("mouseup", handleWindowMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [activeDragTable, isPanning, zoom, positions]);

  // Handle zooming using wheel
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.08;
    let nextZoom = zoom;
    if (e.deltaY < 0) {
      nextZoom = Math.min(2.0, zoom * zoomFactor);
    } else {
      nextZoom = Math.max(0.18, zoom / zoomFactor);
    }
    setZoom(nextZoom);
  };

  // Canvas pan triggers
  const handleCanvasMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    setIsPanning(true);
    panStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  // Draggable Card setup
  const handleTableMouseDown = (e: MouseEvent, tableName: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    const clientX = e.clientX;
    const clientY = e.clientY;
    const currentPos = positions[tableName] || { x: 0, y: 0 };

    dragStartRef.current = {
      clientX,
      clientY,
      tableX: currentPos.x,
      tableY: currentPos.y,
    };

    setActiveDragTable(tableName);
  };



  const handleResetLayout = () => {
    const initialPos: Record<string, { x: number; y: number }> = {};
    schemaTables.forEach((t, idx) => {
      initialPos[t.name] = calculateDefaultPos(idx);
    });
    setPositions(initialPos);
    const key = getStorageKey();
    localStorage.setItem(key, JSON.stringify(initialPos));
  };

  const handleZoomIn = () => setZoom(prev => Math.min(2.0, prev * 1.15));
  const handleZoomOut = () => setZoom(prev => Math.max(0.18, prev / 1.15));
  const handleZoomFit = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleTablePreviewAction = (tableName: string) => {
    onTableSelect(tableName);
    setActiveTab("data");
  };

  return (
    <div className="flex-1 flex flex-col border border-white/5 rounded-xl bg-gray-950 overflow-hidden relative h-full min-h-[450px]">
      
      {/* ERD Toolbar */}
      <div className="px-4 py-2 bg-gray-900 border-b border-white/5 flex items-center justify-between text-xs shrink-0 z-20">
        <span className="font-semibold text-white flex items-center gap-1.5 select-none">
          <Network className="w-3.5 h-3.5 text-indigo-400" />
          Database Diagram (ERD Schema Explorer)
        </span>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-950 border border-white/10 rounded-lg p-0.5">
            <button
              onClick={handleZoomOut}
              className="p-1 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-all cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-[10px] font-mono text-gray-500 min-w-[40px] text-center select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-all cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleZoomFit}
              className="p-1 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-all cursor-pointer border-l border-white/10 ml-0.5"
              title="Reset Zoom & Pan"
            >
              <Maximize className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleResetLayout}
            className="flex items-center gap-1 px-2.5 py-1 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg text-[10px] font-semibold border border-white/5 transition-all cursor-pointer"
          >
            Auto Layout Grid
          </button>

          <button
            onClick={loadSchema}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40 cursor-pointer"
            title="Refresh Schema"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Canvas container */}
      <div
        ref={canvasRef}
        className="flex-1 relative overflow-hidden select-none cursor-grab active:cursor-grabbing outline-none"
        onMouseDown={handleCanvasMouseDown}
        onWheel={handleWheel}
        style={{
          backgroundColor: "#090b11",
          backgroundImage: "radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 0)",
          backgroundSize: "24px 24px",
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        {/* Loading / Error States */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm z-30 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
            <p className="text-xs text-indigo-300 font-medium">Analyzing database relationships...</p>
          </div>
        )}

        {error && (
          <div className="absolute top-4 left-4 right-4 p-3 bg-red-950/30 border border-red-800/40 rounded-xl text-red-200 text-xs flex gap-2 items-center z-30">
            <HelpCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Scaled/Panned Container */}
        <div
          className="absolute inset-0 origin-top-left pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {/* SVG Connections Canvas */}
          <svg className="absolute inset-0 w-[5000px] h-[5000px] pointer-events-none overflow-visible">
            <defs>
              <marker
                id="erd-arrow"
                viewBox="0 0 10 10"
                refX="6"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#6366f1" />
              </marker>
            </defs>

            {/* Drawing relationship curves */}
            {positions && relations.map((rel, idx) => {
              const posFrom = positions[rel.fromTable];
              const posTo = positions[rel.toTable];
              if (!posFrom || !posTo) return null;

              // Find Column Index to connect specific columns
              const fromColIdx = schemaTables.find(t => t.name === rel.fromTable)?.columns.findIndex(c => c.name === rel.fromColumn) ?? 0;
              const toColIdx = schemaTables.find(t => t.name === rel.toTable)?.columns.findIndex(c => c.name === rel.toColumn) ?? 0;

              // Header: 40px, row: 28px, half row: 14px
              const fromY = posFrom.y + 40 + fromColIdx * 28 + 14;
              const toY = posTo.y + 40 + toColIdx * 28 + 14;

              // Determine exit and entry points based on horizontal alignment
              let startX = 0;
              let endX = 0;

              if (posFrom.x + 240 < posTo.x) {
                // source is left of target
                startX = posFrom.x + 240;
                endX = posTo.x - 6; // Stop 6px early for marker arrow
              } else if (posTo.x + 240 < posFrom.x) {
                // target is left of source
                startX = posFrom.x;
                endX = posTo.x + 246; // Stop 6px early for marker arrow
              } else {
                // overlap: use simple left-to-right default
                if (posFrom.x < posTo.x) {
                  startX = posFrom.x + 240;
                  endX = posTo.x - 6;
                } else {
                  startX = posFrom.x;
                  endX = posTo.x + 246;
                }
              }

              // Compute curve control points based on distance
              const cpXDist = Math.max(50, Math.min(150, Math.abs(endX - startX) / 1.8));
              const cp1X = startX + (endX > startX ? cpXDist : -cpXDist);
              const cp2X = endX + (endX > startX ? -cpXDist : cpXDist);

              return (
                <g key={`rel-${idx}`}>
                  {/* Subtle connection glow path */}
                  <path
                    d={`M ${startX} ${fromY} C ${cp1X} ${fromY}, ${cp2X} ${toY}, ${endX} ${toY}`}
                    fill="none"
                    stroke="#4338ca"
                    strokeWidth="4"
                    strokeOpacity="0.15"
                  />
                  {/* Main connection curve */}
                  <path
                    d={`M ${startX} ${fromY} C ${cp1X} ${fromY}, ${cp2X} ${toY}, ${endX} ${toY}`}
                    fill="none"
                    stroke="#6366f1"
                    strokeWidth="1.5"
                    strokeOpacity="0.8"
                    markerEnd="url(#erd-arrow)"
                  />
                  {/* Small start circle */}
                  <circle cx={startX} cy={fromY} r="3" fill="#818cf8" />
                </g>
              );
            })}
          </svg>

          {/* Table Cards */}
          {schemaTables.map((table) => {
            const pos = positions[table.name] || { x: 0, y: 0 };
            return (
              <div
                key={table.name}
                className="absolute w-60 border border-white/5 rounded-xl bg-gray-950/90 shadow-xl overflow-hidden pointer-events-auto flex flex-col"
                style={{
                  transform: `translate(${pos.x}px, ${pos.y}px)`,
                  zIndex: activeDragTable === table.name ? 100 : 10,
                }}
              >
                {/* Header (Drag Handle) */}
                <div
                  onMouseDown={(e) => handleTableMouseDown(e, table.name)}
                  className="px-3.5 py-2.5 bg-gray-900 border-b border-white/5 flex items-center justify-between cursor-grab active:cursor-grabbing text-xs font-semibold text-white select-none"
                >
                  <span className="truncate" title={table.name}>{table.name}</span>
                  <button
                    onClick={() => handleTablePreviewAction(table.name)}
                    className="p-1 rounded hover:bg-white/5 text-gray-500 hover:text-indigo-400 transition-all pointer-events-auto cursor-pointer"
                    title="Preview Table Data"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Column List */}
                <div className="py-1 flex flex-col">
                  {table.columns.map((col) => (
                    <div
                      key={col.name}
                      className="px-3.5 py-1.5 flex items-center justify-between text-[11px] font-mono border-b border-white/[0.02] last:border-b-0"
                    >
                      <span className="flex items-center gap-1.5 truncate pr-2 select-none">
                        {col.isPk ? (
                          <span className="flex items-center shrink-0" title="Primary Key">
                            <Key className="w-3 h-3 text-yellow-500" />
                          </span>
                        ) : col.isFk ? (
                          <span className="flex items-center shrink-0" title="Foreign Key Relation">
                            <Link2 className="w-3 h-3 text-indigo-400" />
                          </span>
                        ) : (
                          <span className="w-3 h-3 shrink-0" />
                        )}
                        <span className={`truncate ${col.isPk ? "text-yellow-100 font-bold" : "text-gray-300"}`}>
                          {col.name}
                        </span>
                      </span>
                      <span className="text-[10px] text-gray-500 select-none">{col.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
