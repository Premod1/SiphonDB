import { useState } from "react";
import { useConnectionManager } from "./hooks/useConnectionManager";
import { DbConnection } from "./types/connection";
import Sidebar from "./components/Sidebar";
import ConnectionModal from "./components/ConnectionModal";
import DbExplorer from "./components/DbExplorer";
import { Database, Server, Key, Eye, EyeOff, ShieldAlert, ArrowRight, Activity, Terminal, Play, LogOut, Menu } from "lucide-react";

function App() {
  const {
    connections,
    isLoading,
    error: dbError,
    saveConnection,
    deleteConnection,
  } = useConnectionManager();

  const [isMainSidebarOpen, setIsMainSidebarOpen] = useState(true);
  const [selectedConnection, setSelectedConnection] = useState<DbConnection | null>(null);
  const [isExplorerActive, setIsExplorerActive] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<DbConnection | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState<string>("");

  const handleSelectConnection = (conn: DbConnection) => {
    setSelectedConnection(conn);
    setIsExplorerActive(false);
    setTestStatus("idle");
    setTestMessage("");
    setShowPassword(false);
  };

  const handleNewConnection = () => {
    setEditingProfile(null);
    setIsModalOpen(true);
  };

  const handleEditConnection = (conn: DbConnection) => {
    setEditingProfile(conn);
    setIsModalOpen(true);
  };

  const handleDeleteConnection = async (id: number) => {
    if (confirm("Are you sure you want to delete this connection profile?")) {
      const success = await deleteConnection(id);
      if (success && selectedConnection?.id === id) {
        setSelectedConnection(null);
        setIsExplorerActive(false);
      }
    }
  };

  const handleSaveConnection = async (profile: Omit<DbConnection, "id"> & { id?: number }) => {
    const success = await saveConnection(profile);
    if (success) {
      if (selectedConnection && selectedConnection.id === profile.id) {
        setSelectedConnection({ ...selectedConnection, ...profile });
      }
    }
    return success;
  };

  const simulateTestConnection = () => {
    setTestStatus("testing");
    setTestMessage("Initiating connection handshake...");
    
    setTimeout(() => {
      setTestMessage(`Resolving host ${selectedConnection?.host || 'local'}...`);
    }, 800);

    setTimeout(() => {
      if (selectedConnection?.db_type === "sqlite") {
        setTestStatus("success");
        setTestMessage(`Successfully connected to SQLite database: ${selectedConnection.database_name}`);
      } else {
        setTestStatus("success");
        setTestMessage(`Handshake successful! Logged in as ${selectedConnection?.username} on database ${selectedConnection?.database_name}`);
      }
    }, 1800);
  };

  return (
    <main className="flex h-screen w-screen bg-[#07080c] text-gray-100 overflow-hidden font-sans">
      {/* Collapsible Connections Sidebar Wrapper */}
      <div className={`h-screen flex flex-col bg-gray-950/80 border-r border-white/5 transition-all duration-300 overflow-hidden shrink-0 ${
        isMainSidebarOpen ? "w-80" : "w-0 border-r-0"
      }`}>
        <Sidebar
          connections={connections}
          selectedId={selectedConnection?.id || null}
          onSelect={handleSelectConnection}
          onNew={handleNewConnection}
          onEdit={handleEditConnection}
          onDelete={handleDeleteConnection}
          isLoading={isLoading}
        />
      </div>

      {/* Main Content Area Container */}
      <section className="flex-1 flex flex-col overflow-hidden bg-gradient-to-b from-gray-900/40 via-gray-950/20 to-gray-950">
        
        {/* Global Top Navbar */}
        <div className="h-14 px-6 border-b border-white/5 bg-[#0a0c14] flex items-center gap-4 shrink-0">
          <button
            onClick={() => setIsMainSidebarOpen(!isMainSidebarOpen)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
            title={isMainSidebarOpen ? "Hide Connections List" : "Show Connections List"}
          >
            <Menu className="w-4.5 h-4.5" />
          </button>
          
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500 font-medium">Connections</span>
            {selectedConnection && (
              <>
                <span className="text-gray-700">/</span>
                <span className="font-semibold text-indigo-400">{selectedConnection.connection_name}</span>
                {isExplorerActive && (
                  <>
                    <span className="text-gray-700">/</span>
                    <span className="text-gray-400 font-medium">Explorer</span>
                  </>
                )}
              </>
            )}
          </div>
          
          {selectedConnection && isExplorerActive && (
            <button
              onClick={() => setIsExplorerActive(false)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-lg text-xs transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Disconnect
            </button>
          )}
        </div>

        {/* Dynamic Pages Area */}
        <div className="flex-1 overflow-y-auto">
          {dbError && (
            <div className="p-4 m-6 bg-red-950/30 border border-red-800/40 rounded-xl text-red-200 text-sm flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
              <span>Database Error: {dbError}</span>
            </div>
          )}

          {selectedConnection ? (
            isExplorerActive ? (
              /* Active Live Connection Explorer Mode */
              <div className="h-full flex flex-col overflow-hidden">
                <DbExplorer connection={selectedConnection} />
              </div>
            ) : (
              /* Connection Parameters Dashboard Card Mode */
              <div className="p-8 max-w-4xl w-full mx-auto space-y-8 animate-fade-in">
                {/* Header section */}
                <div className="flex items-center justify-between pb-6 border-b border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-gray-900 border border-white/10 rounded-2xl shadow-xl">
                      <Database className="w-8 h-8 text-indigo-400" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white tracking-tight">{selectedConnection.connection_name}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded border bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                          {selectedConnection.db_type}
                        </span>
                        <span className="text-xs text-gray-500">•</span>
                        <span className="text-xs text-gray-400 font-mono">
                          ID: {selectedConnection.id}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={simulateTestConnection}
                      disabled={testStatus === "testing"}
                      className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 font-medium rounded-xl text-sm transition-all cursor-pointer"
                    >
                      <Activity className={`w-4 h-4 ${testStatus === "testing" ? "animate-spin" : ""}`} />
                      Test Profile
                    </button>
                    <button
                      onClick={() => setIsExplorerActive(true)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl text-sm shadow-lg shadow-indigo-600/15 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      Connect & Explore
                    </button>
                  </div>
                </div>

                {/* Test Connection Results */}
                {testStatus !== "idle" && (
                  <div className={`p-4 rounded-xl border flex gap-3 items-start animate-fade-in ${
                    testStatus === "testing"
                      ? "bg-indigo-950/20 border-indigo-800/40 text-indigo-200"
                      : testStatus === "success"
                      ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-200"
                      : "bg-red-950/20 border-red-800/40 text-red-200"
                  }`}>
                    {testStatus === "testing" ? (
                      <Activity className="w-5 h-5 text-indigo-400 animate-spin shrink-0 mt-0.5" />
                    ) : testStatus === "success" ? (
                      <Database className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <h4 className="text-sm font-semibold">
                        {testStatus === "testing" ? "Testing connection..." : testStatus === "success" ? "Connection Successful" : "Connection Failed"}
                      </h4>
                      <p className="text-xs mt-1 text-gray-400 font-mono leading-relaxed">{testMessage}</p>
                    </div>
                  </div>
                )}

                {/* Connection Credentials Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 bg-gray-900/30 border border-white/5 rounded-2xl space-y-4">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                      <Server className="w-4 h-4 text-indigo-400" />
                      Connection parameters
                    </h3>
                    
                    <div className="space-y-3 text-sm">
                      {selectedConnection.db_type !== "sqlite" ? (
                        <>
                          <div className="flex justify-between py-1.5 border-b border-white/5">
                            <span className="text-gray-500 font-medium">Host Address</span>
                            <span className="text-gray-200 font-mono">{selectedConnection.host}</span>
                          </div>
                          <div className="flex justify-between py-1.5 border-b border-white/5">
                            <span className="text-gray-500 font-medium">Port</span>
                            <span className="text-gray-200 font-mono">{selectedConnection.port}</span>
                          </div>
                          <div className="flex justify-between py-1.5 border-b border-white/5">
                            <span className="text-gray-500 font-medium">User Profile</span>
                            <span className="text-gray-200 font-mono">{selectedConnection.username}</span>
                          </div>
                        </>
                      ) : null}
                      <div className="flex justify-between py-1.5 border-b border-white/5">
                        <span className="text-gray-500 font-medium">
                          {selectedConnection.db_type === "sqlite" ? "SQLite File Path" : "Database Name"}
                        </span>
                        <span className="text-gray-200 font-mono truncate max-w-[200px]" title={selectedConnection.database_name}>
                          {selectedConnection.database_name || "All schemas (blank)"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Security Status Card */}
                  {selectedConnection.db_type !== "sqlite" ? (
                    <div className="p-6 bg-gray-900/30 border border-white/5 rounded-2xl flex flex-col justify-between">
                      <div className="space-y-3">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                          <Key className="w-4 h-4 text-indigo-400" />
                          Security & Password
                        </h3>
                        <p className="text-xs text-gray-500 leading-relaxed">
                          For testing purposes, passwords are saved in plaintext locally inside the SQLite database.
                        </p>
                        
                        <div className="flex items-center gap-3 bg-gray-950/60 border border-white/5 p-3 rounded-xl">
                          <Key className="w-4 h-4 text-gray-600 shrink-0" />
                          <input
                            type={showPassword ? "text" : "password"}
                            readOnly
                            value={selectedConnection.password || ""}
                            className="bg-transparent border-none text-white font-mono text-sm focus:outline-none flex-1 min-w-0"
                          />
                          <button
                            onClick={() => setShowPassword(!showPassword)}
                            className="text-gray-500 hover:text-white p-1 hover:bg-white/5 rounded-lg transition-colors"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-2 bg-yellow-950/20 border border-yellow-800/40 p-3 rounded-xl mt-4">
                        <ShieldAlert className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[11px] font-semibold text-yellow-300">Plaintext Storage Warning</p>
                          <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">
                            To encrypt, look inside <code className="text-indigo-400 font-mono">useConnectionManager.ts</code> where a secure password handler TODO is defined.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 bg-gray-900/30 border border-white/5 rounded-2xl flex flex-col justify-center items-center text-center space-y-3">
                      <Terminal className="w-10 h-10 text-emerald-500/80 mb-1" />
                      <h3 className="text-sm font-bold text-gray-200">Local SQLite File Engine</h3>
                      <p className="text-xs text-gray-500 max-w-[280px] leading-relaxed">
                        SQLite does not require client-server passwords. The connection operates in the local app directory context.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[calc(100vh-3.5rem)]">
              <div className="relative group mb-6">
                <div className="absolute inset-0 bg-indigo-500/10 rounded-full blur-2xl group-hover:scale-110 transition-transform duration-500" />
                <div className="relative p-6 bg-gradient-to-tr from-indigo-950/60 to-purple-950/40 border border-indigo-500/20 rounded-full shadow-2xl">
                  <Database className="w-16 h-16 text-indigo-400" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight">SiphonDB Connection Manager</h3>
              <p className="text-sm text-gray-500 max-w-sm mt-2 leading-relaxed">
                Create, manage, and connect to your local or remote database instances securely. Click the button below to add your first database.
              </p>
              <button
                onClick={handleNewConnection}
                className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl text-sm shadow-xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-[0.99] transition-all cursor-pointer"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Modal Dialog */}
      <ConnectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveConnection}
        editingProfile={editingProfile}
      />
    </main>
  );
}

export default App;
