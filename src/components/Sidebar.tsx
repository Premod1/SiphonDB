import { Plus, Database, Server, Trash2, Edit2 } from "lucide-react";
import { DbConnection } from "../types/connection";

interface SidebarProps {
  connections: DbConnection[];
  selectedId: number | null;
  onSelect: (conn: DbConnection) => void;
  onNew: () => void;
  onEdit: (conn: DbConnection) => void;
  onDelete: (id: number) => void;
  isLoading: boolean;
}

export default function Sidebar({
  connections,
  selectedId,
  onSelect,
  onNew,
  onEdit,
  onDelete,
  isLoading,
}: SidebarProps) {
  
  const getBadgeStyles = (dbType: string) => {
    switch (dbType) {
      case "postgres":
        return "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
      case "mysql":
        return "bg-cyan-500/10 text-cyan-400 border-cyan-500/20";
      case "sqlite":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      default:
        return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    }
  };

  return (
    <aside className="w-80 h-screen flex flex-col">
      {/* Sidebar Header */}
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-xl shadow-lg shadow-indigo-600/20">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-white tracking-wide text-md">SiphonDB</h1>
            <span className="text-xs text-gray-500 font-medium">Local Profiles</span>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="px-4 pt-5 pb-2">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl text-sm shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Connection
        </button>
      </div>

      {/* Connection List */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {isLoading ? (
          // Shimmer loading state
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 w-full animate-shimmer rounded-xl opacity-60 mb-2" />
          ))
        ) : connections.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Server className="w-10 h-10 text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No connections saved yet.</p>
            <p className="text-xs text-gray-600 mt-1">Create one to get started.</p>
          </div>
        ) : (
          connections.map((conn) => {
            const isSelected = conn.id === selectedId;
            return (
              <div
                key={conn.id}
                onClick={() => onSelect(conn)}
                className={`group flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all duration-200 ${
                  isSelected
                    ? "bg-white/5 border-indigo-500/40 shadow-inner shadow-black/40"
                    : "bg-transparent border-transparent hover:bg-white/[0.02] hover:border-white/5"
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className={`p-2 rounded-lg border bg-gray-900/50 ${isSelected ? "border-indigo-500/20" : "border-white/5"}`}>
                    <Server className={`w-4 h-4 ${isSelected ? "text-indigo-400" : "text-gray-400"}`} />
                  </div>
                  <div className="overflow-hidden">
                    <p className={`text-sm font-semibold truncate ${isSelected ? "text-indigo-300" : "text-gray-200 group-hover:text-white"}`}>
                      {conn.connection_name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border ${getBadgeStyles(conn.db_type)}`}>
                        {conn.db_type}
                      </span>
                      <span className="text-[11px] text-gray-500 truncate">
                        {conn.db_type === "sqlite" ? conn.database_name : `${conn.host}:${conn.port}`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Hover Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(conn);
                    }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                    title="Edit profile"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (conn.id !== undefined) {
                        onDelete(conn.id);
                      }
                    }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-950/20 transition-colors"
                    title="Delete connection"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-white/5 bg-gray-950/40 text-center text-xs text-gray-600">
        Local DB Storage Active
      </div>
    </aside>
  );
}
