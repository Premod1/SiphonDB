import { Key } from "lucide-react";

interface RowEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  rowEditorMode: "insert" | "edit";
  selectedTable: string | null;
  columns: string[];
  primaryKeys: string[];
  rowEditorData: Record<string, string>;
  setRowEditorData: (data: Record<string, string>) => void;
  rowEditorNulls: Record<string, boolean>;
  setRowEditorNulls: (nulls: Record<string, boolean>) => void;
  handleSaveRow: () => void;
}

export default function RowEditorModal({
  isOpen,
  onClose,
  rowEditorMode,
  selectedTable,
  columns,
  primaryKeys,
  rowEditorData,
  setRowEditorData,
  rowEditorNulls,
  setRowEditorNulls,
  handleSaveRow,
}: RowEditorModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-white/10 rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-fade-in">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gray-950/80 border-b border-white/5 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">
              {rowEditorMode === "insert" ? "Insert New Record" : "Edit Record Details"}
            </h3>
            <span className="text-[10px] text-gray-500 font-semibold font-mono uppercase mt-0.5 block">
              Table: {selectedTable}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xs font-semibold p-1 hover:bg-white/5 rounded-lg"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Form */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {columns.map((col) => {
            const isPk = primaryKeys.includes(col);
            const isNull = rowEditorNulls[col];
            return (
              <div key={col} className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 flex items-center gap-1">
                  {isPk && <Key className="w-3 h-3 text-yellow-500 shrink-0" />}
                  {col}
                  {isPk && <span className="text-[9px] text-yellow-500 font-medium">(PK)</span>}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    disabled={isNull}
                    placeholder={isNull ? "NULL (value excluded)" : "Enter value..."}
                    value={rowEditorData[col] || ""}
                    onChange={(e) => setRowEditorData({ ...rowEditorData, [col]: e.target.value })}
                    className="flex-1 bg-gray-950 border border-white/5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 focus:outline-none disabled:opacity-40 disabled:pointer-events-none rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-600 transition-all font-mono"
                  />
                  <label className="flex items-center gap-1.5 shrink-0 text-xs text-gray-500 hover:text-gray-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isNull}
                      onChange={(e) => setRowEditorNulls({ ...rowEditorNulls, [col]: e.target.checked })}
                      className="w-3.5 h-3.5 accent-indigo-500 bg-gray-950 border-white/10 rounded cursor-pointer"
                    />
                    NULL
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-gray-950/40 border-t border-white/5 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 font-semibold rounded-xl text-xs transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveRow}
            className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-xl text-xs shadow-md shadow-indigo-600/10 transition-all cursor-pointer"
          >
            Save Record
          </button>
        </div>
      </div>
    </div>
  );
}
