import { RefreshCw, Database as DbIcon, Table, Key } from "lucide-react";

interface DataGridProps {
  selectedTable: string | null;
  columns: string[];
  rows: any[];
  primaryKeys: string[];
  selectedRowIndexes: Set<number>;
  isDataLoading: boolean;
  page: number;
  pageSize: number;
  totalRows: number;
  pageInputVal: string;
  setPageInputVal: (val: string) => void;
  handleInsertRowClick: () => void;
  handleEditRowClick: () => void;
  handleDuplicateRowClick: () => void;
  handleDeleteRow: () => void;
  fetchTableData: (table: string, page: number) => void;
  handleToggleSelectAll: () => void;
  handleToggleRowSelect: (idx: number) => void;
  handleEditRowClickExplicit: (idx: number) => void;
  handlePageChange: (newPage: number) => void;
  handlePageInputSubmit: () => void;
}

export default function DataGrid({
  selectedTable,
  columns,
  rows,
  primaryKeys,
  selectedRowIndexes,
  isDataLoading,
  page,
  pageSize,
  totalRows,
  pageInputVal,
  setPageInputVal,
  handleInsertRowClick,
  handleEditRowClick,
  handleDuplicateRowClick,
  handleDeleteRow,
  fetchTableData,
  handleToggleSelectAll,
  handleToggleRowSelect,
  handleEditRowClickExplicit,
  handlePageChange,
  handlePageInputSubmit,
}: DataGridProps) {
  return (
    <div className="flex-1 flex flex-col border border-white/5 rounded-xl bg-gray-900/10 overflow-hidden">
      {/* Row Actions Toolbar */}
      <div className="px-4 py-2.5 border-b border-white/5 bg-gray-950/40 flex items-center justify-between text-xs gap-3 shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={handleInsertRowClick}
            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 hover:border-indigo-500/40 text-indigo-400 rounded-lg font-semibold transition-all cursor-pointer text-[11px]"
          >
            + Insert Row
          </button>
          <button
            onClick={handleEditRowClick}
            disabled={selectedRowIndexes.size !== 1}
            className="flex items-center gap-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none text-gray-300 rounded-lg font-semibold border border-transparent hover:border-white/5 transition-all cursor-pointer text-[11px]"
          >
            Edit Selected
          </button>
          <button
            onClick={handleDuplicateRowClick}
            disabled={selectedRowIndexes.size !== 1}
            className="flex items-center gap-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none text-gray-300 rounded-lg font-semibold border border-transparent hover:border-white/5 transition-all cursor-pointer text-[11px]"
          >
            Duplicate
          </button>
          <button
            onClick={handleDeleteRow}
            disabled={selectedRowIndexes.size === 0}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 border border-red-500/10 hover:border-red-500/30 disabled:opacity-40 disabled:pointer-events-none text-red-400 rounded-lg font-semibold transition-all cursor-pointer text-[11px]"
          >
            {selectedRowIndexes.size > 1 ? `Delete Selected (${selectedRowIndexes.size})` : "Delete Selected"}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-gray-500">
            Previewing: <span className="font-semibold text-white">{selectedTable || "None"}</span>
          </span>
          <button
            onClick={() => fetchTableData(selectedTable!, page)}
            disabled={isDataLoading || !selectedTable}
            className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40 cursor-pointer"
            title="Refresh data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isDataLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="flex-1 overflow-auto">
        {!selectedTable ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <DbIcon className="w-8 h-8 text-gray-600 mb-2" />
            <p className="text-xs text-gray-500">No table selected</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <Table className="w-8 h-8 text-gray-600 mb-2" />
            <p className="text-xs text-gray-500 font-semibold mb-1">Table is empty</p>
            <p className="text-[11px] text-gray-600 max-w-[200px]">Click "+ Insert Row" to add your first record</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-gray-950 z-1 border-b border-white/5">
              <tr>
                <th className="px-4 py-3 border-r border-white/5 w-12 text-center select-none">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selectedRowIndexes.size === rows.length}
                    onChange={handleToggleSelectAll}
                    className="w-3.5 h-3.5 accent-indigo-500 bg-gray-950 border-white/10 rounded cursor-pointer"
                  />
                </th>
                {columns.map((col) => {
                  const isPk = primaryKeys.includes(col);
                  return (
                    <th key={col} className="px-4 py-3 font-semibold text-gray-400 border-r border-white/5 whitespace-nowrap">
                      <span className="flex items-center gap-1">
                        {isPk && <Key className="w-3 h-3 text-yellow-500 shrink-0" />}
                        {col}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row, idx) => {
                const isChecked = selectedRowIndexes.has(idx);
                return (
                  <tr
                    key={idx}
                    onClick={() => handleToggleRowSelect(idx)}
                    onDoubleClick={() => {
                      handleEditRowClickExplicit(idx);
                    }}
                    className={`transition-colors cursor-pointer ${
                      isChecked
                        ? "bg-indigo-600/10 text-indigo-300 border-y border-indigo-500/20"
                        : "hover:bg-white/[0.01]"
                    }`}
                  >
                    <td className="px-4 py-2.5 border-r border-white/5 w-12 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleRowSelect(idx)}
                        className="w-3.5 h-3.5 accent-indigo-500 bg-gray-950 border-white/10 rounded cursor-pointer"
                      />
                    </td>
                    {columns.map((col) => (
                      <td key={col} className="px-4 py-2.5 font-mono text-[11px] border-r border-white/5 whitespace-nowrap max-w-[240px] truncate">
                        {row[col] === null ? (
                          <span className="text-gray-700 italic">null</span>
                        ) : typeof row[col] === "boolean" ? (
                          row[col] ? "true" : "false"
                        ) : (
                          String(row[col])
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Controls */}
      {selectedTable && rows.length > 0 && (
        <div className="px-4 py-3 border-t border-white/5 bg-gray-950/40 flex items-center justify-between text-xs text-gray-400 shrink-0">
          <div className="flex items-center gap-1">
            <span>Showing</span>
            <span className="font-semibold text-white">
              {Math.min(totalRows, (page - 1) * pageSize + 1)} - {Math.min(totalRows, page * pageSize)}
            </span>
            <span>of</span>
            <span className="font-semibold text-white">{totalRows}</span>
            <span>rows</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1 || isDataLoading}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none text-gray-300 rounded-lg font-medium transition-colors cursor-pointer animate-fade-in"
            >
              Previous
            </button>
            <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 rounded-lg font-semibold text-xs select-none">
              <span>Page</span>
              <input
                type="text"
                value={pageInputVal}
                onChange={(e) => setPageInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handlePageInputSubmit();
                  }
                }}
                onBlur={handlePageInputSubmit}
                className="w-10 bg-[#07080c] border border-white/10 rounded px-1.5 py-0.5 text-center text-indigo-300 font-mono focus:outline-none focus:border-indigo-500 text-[11px]"
              />
              <span>of</span>
              <span>{Math.ceil(totalRows / pageSize) || 1}</span>
            </div>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= Math.ceil(totalRows / pageSize) || isDataLoading}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none text-gray-300 rounded-lg font-medium transition-colors cursor-pointer animate-fade-in"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
