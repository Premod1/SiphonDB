import { useState } from "react";
import { Terminal, Play, AlertCircle, Table, History, Bookmark, Trash2, X, BookmarkPlus } from "lucide-react";
import CodeMirror from "@uiw/react-codemirror";
import { sql } from "@codemirror/lang-sql";
import { HistoryItem, SavedQueryItem } from "../../hooks/useQueryManager";

interface SqlEditorTabProps {
  sqlQuery: string;
  setSqlQuery: (query: string) => void;
  isQueryRunning: boolean;
  queryError: string | null;
  queryResult: any[] | null;
  queryColumns: string[];
  handleRunQuery: () => void;
  schemaInfo: Record<string, string[]>;
  history: HistoryItem[];
  savedQueries: SavedQueryItem[];
  deleteHistoryItem: (id: number) => Promise<void>;
  clearHistory: () => Promise<void>;
  saveQueryItem: (name: string, queryText: string) => Promise<void>;
  deleteSavedQueryItem: (id: number) => Promise<void>;
}

export default function SqlEditorTab({
  sqlQuery,
  setSqlQuery,
  isQueryRunning,
  queryError,
  queryResult,
  queryColumns,
  handleRunQuery,
  schemaInfo,
  history,
  savedQueries,
  deleteHistoryItem,
  clearHistory,
  saveQueryItem,
  deleteSavedQueryItem,
}: SqlEditorTabProps) {
  const [activeTab, setActiveTab] = useState<"history" | "saved">("history");
  const [isSaving, setIsSaving] = useState(false);
  const [newQueryName, setNewQueryName] = useState("");

  const handleSaveClick = async () => {
    if (!newQueryName.trim() || !sqlQuery.trim()) return;
    await saveQueryItem(newQueryName, sqlQuery);
    setNewQueryName("");
    setIsSaving(false);
  };

  const handleItemClick = (queryText: string) => {
    setSqlQuery(queryText);
  };

  return (
    <div className="h-full flex flex-col space-y-4 overflow-hidden">
      
      {/* Upper Container: Sidebar + Editor */}
      <div className="flex gap-4 min-h-[260px] max-h-[360px] shrink-0">
        
        {/* Sidebar Panel */}
        <div className="w-72 border border-white/5 rounded-xl bg-gray-950 flex flex-col overflow-hidden shrink-0">
          {/* Sidebar Tabs */}
          <div className="flex border-b border-white/5 bg-gray-900 shrink-0">
            <button
              onClick={() => setActiveTab("history")}
              className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                activeTab === "history"
                  ? "border-indigo-500 text-indigo-400 font-bold bg-white/[0.01]"
                  : "border-transparent text-gray-400 hover:text-white hover:bg-white/[0.01]"
              }`}
            >
              <History className="w-3.5 h-3.5" />
              History ({history.length})
            </button>
            <button
              onClick={() => setActiveTab("saved")}
              className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                activeTab === "saved"
                  ? "border-indigo-500 text-indigo-400 font-bold bg-white/[0.01]"
                  : "border-transparent text-gray-400 hover:text-white hover:bg-white/[0.01]"
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              Saved ({savedQueries.length})
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {activeTab === "history" ? (
              <>
                <div className="flex items-center justify-between px-1 pb-1 border-b border-white/5">
                  <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Executed Queries</span>
                  {history.length > 0 && (
                    <button
                      onClick={() => {
                        if (confirm("Clear all query history?")) clearHistory();
                      }}
                      className="text-[10px] text-red-400 hover:text-red-300 font-semibold flex items-center gap-0.5 cursor-pointer"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                      Clear All
                    </button>
                  )}
                </div>
                {history.length === 0 ? (
                  <div className="py-8 text-center text-xs text-gray-600 italic">No history yet</div>
                ) : (
                  <div className="space-y-1.5">
                    {history.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleItemClick(item.query_text)}
                        className="group relative p-2 bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 hover:border-white/10 rounded-lg cursor-pointer transition-all flex flex-col text-left"
                      >
                        <span className="text-[11px] font-mono text-gray-300 line-clamp-2 pr-6 leading-tight break-all select-none">
                          {item.query_text}
                        </span>
                        <span className="text-[9px] text-gray-500 mt-1 font-mono">
                          {new Date(item.executed_at).toLocaleTimeString()}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteHistoryItem(item.id);
                          }}
                          className="absolute right-1.5 top-1.5 p-0.5 rounded text-gray-600 hover:text-red-400 hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="px-1 pb-1 border-b border-white/5">
                  <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Templates</span>
                </div>
                {savedQueries.length === 0 ? (
                  <div className="py-8 text-center text-xs text-gray-600 italic">No saved templates</div>
                ) : (
                  <div className="space-y-1.5">
                    {savedQueries.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleItemClick(item.query_text)}
                        className="group relative p-2 bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 hover:border-white/10 rounded-lg cursor-pointer transition-all flex flex-col text-left"
                      >
                        <span className="text-xs font-bold text-indigo-400 truncate pr-6 select-none">
                          {item.query_name}
                        </span>
                        <span className="text-[10px] font-mono text-gray-400 line-clamp-1 mt-0.5 leading-tight break-all select-none">
                          {item.query_text}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSavedQueryItem(item.id);
                          }}
                          className="absolute right-1.5 top-1.5 p-0.5 rounded text-gray-600 hover:text-red-400 hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Query Editor Pane */}
        <div className="flex-1 border border-white/5 rounded-xl bg-gray-950 overflow-hidden flex flex-col min-w-0">
          <div className="px-4 py-2 bg-gray-900 border-b border-white/5 flex items-center justify-between text-xs shrink-0 h-10">
            <span className="font-semibold text-white flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-indigo-400" />
              Query Editor
            </span>
            
            {/* Toolbar Buttons */}
            <div className="flex items-center gap-2">
              {isSaving ? (
                <div className="flex items-center gap-1.5 animate-fade-in">
                  <input
                    type="text"
                    placeholder="Template Name..."
                    value={newQueryName}
                    onChange={(e) => setNewQueryName(e.target.value)}
                    className="px-2 py-0.5 bg-gray-950 border border-white/10 rounded text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveClick();
                      if (e.key === "Escape") setIsSaving(false);
                    }}
                  />
                  <button
                    onClick={handleSaveClick}
                    disabled={!newQueryName.trim() || !sqlQuery.trim()}
                    className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-semibold cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setIsSaving(false)}
                    className="p-0.5 hover:bg-white/5 text-gray-400 hover:text-white rounded cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsSaving(true)}
                  disabled={!sqlQuery.trim()}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white/5 hover:bg-white/10 text-gray-300 disabled:opacity-40 rounded-lg text-[10px] font-semibold border border-white/5 transition-all cursor-pointer"
                >
                  <BookmarkPlus className="w-3.5 h-3.5 text-indigo-400" />
                  Save Query
                </button>
              )}
              
              <button
                onClick={handleRunQuery}
                disabled={isQueryRunning || !sqlQuery.trim()}
                className="flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold shadow-md shadow-indigo-600/10 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
              >
                <Play className="w-3 h-3 fill-white text-white" />
                Run Query
              </button>
            </div>
          </div>
          <div className="flex-1 bg-gray-950 text-xs font-mono overflow-hidden">
            <CodeMirror
              value={sqlQuery}
              height="100%"
              theme="dark"
              extensions={[sql({ schema: schemaInfo })]}
              onChange={(value) => setSqlQuery(value)}
              placeholder="SELECT * FROM table_name LIMIT 10;"
              className="w-full h-full focus:outline-none"
              basicSetup={{
                lineNumbers: true,
                foldGutter: false,
                dropCursor: true,
                allowMultipleSelections: false,
                indentOnInput: true,
              }}
            />
          </div>
        </div>
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
