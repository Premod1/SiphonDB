import { Table, RefreshCw, Search, ChevronDown } from "lucide-react";
import { DbConnection } from "../../types/connection";

interface TableSidebarProps {
  connection: DbConnection;
  isTableSidebarOpen: boolean;
  isConnecting: boolean;
  activeDbName: string;
  databases: string[];
  filteredTables: string[];
  selectedTable: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  setSelectedTable: (table: string) => void;
  connectToDatabase: (dbName: string) => void;
  handleCreateDatabase: () => void;
}

export default function TableSidebar({
  connection,
  isTableSidebarOpen,
  isConnecting,
  activeDbName,
  databases,
  filteredTables,
  selectedTable,
  searchQuery,
  setSearchQuery,
  setSelectedTable,
  connectToDatabase,
  handleCreateDatabase,
}: TableSidebarProps) {
  return (
    <div
      className={`border-r border-white/5 bg-gray-950/40 flex flex-col h-full shrink-0 transition-all duration-300 overflow-hidden ${
        isTableSidebarOpen ? "w-64" : "w-0 border-r-0"
      }`}
    >
      <div className="p-4 border-b border-white/5 space-y-3">
        {/* Database Selector Dropdown */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
            Database
          </label>
          <div className="flex items-center gap-2 w-full">
            <div className="relative flex-1 min-w-0">
              <select
                disabled={connection.db_type === "sqlite" || isConnecting}
                value={activeDbName}
                onChange={(e) => connectToDatabase(e.target.value)}
                className="w-full bg-[#111219]/95 hover:bg-[#151722] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50 font-medium cursor-pointer appearance-none truncate pr-8"
              >
                {databases.map((db) => (
                  <option key={db} value={db} className="bg-[#07080c] text-white text-xs">
                    {db}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-gray-400">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </div>
            {connection.db_type !== "sqlite" && (
              <button
                type="button"
                onClick={handleCreateDatabase}
                disabled={isConnecting}
                className="px-2.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/20 hover:border-indigo-500/50 rounded-lg text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-all cursor-pointer flex items-center justify-center shrink-0"
                title="Create Database"
              >
                + New
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <Table className="w-3.5 h-3.5 text-indigo-400" />
            Tables
          </h3>
          <button
            onClick={() => connectToDatabase(activeDbName)}
            disabled={isConnecting}
            className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40 cursor-pointer"
            title="Refresh tables"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isConnecting ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-gray-600">
            <Search className="w-3.5 h-3.5" />
          </span>
          <input
            type="text"
            placeholder="Search tables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-gray-900/60 border border-white/5 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>

      {/* Tables list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {isConnecting ? (
          <div className="p-4 text-center space-y-2">
            <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin mx-auto" />
            <p className="text-[10px] text-gray-500">Connecting...</p>
          </div>
        ) : filteredTables.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-600">
            No tables found.
          </div>
        ) : (
          filteredTables.map((table) => {
            const isSelected = table === selectedTable;
            return (
              <button
                key={table}
                onClick={() => setSelectedTable(table)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg text-xs truncate transition-all ${
                  isSelected
                    ? "bg-indigo-600/10 border border-indigo-500/20 text-indigo-300"
                    : "text-gray-400 border border-transparent hover:bg-white/[0.02]"
                }`}
              >
                <Table className="w-3.5 h-3.5 shrink-0 text-gray-500" />
                <span className="truncate">{table}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
