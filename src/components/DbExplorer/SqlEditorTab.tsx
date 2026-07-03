import { Terminal, Play, AlertCircle, Table } from "lucide-react";

interface SqlEditorTabProps {
  sqlQuery: string;
  setSqlQuery: (query: string) => void;
  isQueryRunning: boolean;
  queryError: string | null;
  queryResult: any[] | null;
  queryColumns: string[];
  handleRunQuery: () => void;
}

export default function SqlEditorTab({
  sqlQuery,
  setSqlQuery,
  isQueryRunning,
  queryError,
  queryResult,
  queryColumns,
  handleRunQuery,
}: SqlEditorTabProps) {
  return (
    <div className="h-full flex flex-col space-y-4 overflow-hidden">
      {/* Query Console Editor */}
      <div className="border border-white/5 rounded-xl bg-gray-950 overflow-hidden flex flex-col shrink-0">
        <div className="px-4 py-2 bg-gray-900 border-b border-white/5 flex items-center justify-between text-xs">
          <span className="font-semibold text-white flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-indigo-400" />
            Query Editor
          </span>
          <button
            onClick={handleRunQuery}
            disabled={isQueryRunning || !sqlQuery.trim()}
            className="flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold shadow-md shadow-indigo-600/10 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
          >
            <Play className="w-3 h-3 fill-white text-white" />
            Run Query
          </button>
        </div>
        <textarea
          value={sqlQuery}
          onChange={(e) => setSqlQuery(e.target.value)}
          placeholder="SELECT * FROM table_name LIMIT 10;"
          className="w-full p-4 h-28 bg-gray-900/20 text-gray-200 font-mono text-xs focus:outline-none resize-none"
        />
      </div>

      {/* Console Error */}
      {queryError && (
        <div className="p-3 bg-red-950/30 border border-red-800/40 rounded-xl text-red-200 text-xs flex gap-2 items-center shrink-0">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="font-mono">{queryError}</span>
        </div>
      )}

      {/* Query Results View */}
      <div className="flex-1 border border-white/5 rounded-xl bg-gray-900/10 overflow-hidden flex flex-col min-h-0">
        <div className="px-4 py-2.5 border-b border-white/5 bg-gray-950/40 flex items-center justify-between text-xs shrink-0">
          <span className="font-semibold text-gray-400 flex items-center gap-1.5">
            <Table className="w-3.5 h-3.5 text-indigo-400" />
            Query Results
          </span>
          {queryResult && (
            <span className="text-gray-500 font-mono text-[10px]">
              Returned {queryResult.length} rows
            </span>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {!queryResult ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-4">
              <Terminal className="w-8 h-8 text-gray-600 mb-2" />
              <p className="text-xs text-gray-500">Run a query to view results</p>
            </div>
          ) : queryResult.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-4">
              <Table className="w-8 h-8 text-gray-600 mb-2" />
              <p className="text-xs text-gray-500 font-semibold mb-1">Query returned empty result</p>
              <p className="text-[11px] text-gray-600">The statement completed successfully with no rows returned.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-gray-950 z-1 border-b border-white/5">
                <tr>
                  {queryColumns.map((col) => (
                    <th key={col} className="px-4 py-3 font-semibold text-gray-400 border-r border-white/5 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {queryResult.map((row, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.01]">
                    {queryColumns.map((col) => (
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
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
