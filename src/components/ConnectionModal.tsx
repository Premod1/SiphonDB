import { useState, useEffect } from "react";
import { X, Database, Server, User, Lock, Folder, ArrowRight, ArrowLeft } from "lucide-react";
import { DbConnection, DbType } from "../types/connection";
import { open } from "@tauri-apps/plugin-dialog";

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (profile: Omit<DbConnection, "id"> & { id?: number }) => Promise<boolean>;
  editingProfile: DbConnection | null;
}

const defaultProfile = {
  connection_name: "",
  db_type: "postgres" as DbType,
  host: "127.0.0.1",
  port: 5432,
  username: "postgres",
  password: "",
  database_name: "",
  use_ssh: false,
  ssh_host: "",
  ssh_port: 22,
  ssh_username: "",
  ssh_password: "",
  ssh_key_path: "",
};

export default function ConnectionModal({
  isOpen,
  onClose,
  onSave,
  editingProfile,
}: ConnectionModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [activeSubTab, setActiveSubTab] = useState<"main" | "ssh">("main");
  const [formData, setFormData] = useState<Omit<DbConnection, "id"> & { id?: number }>(defaultProfile);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleBrowseDatabase = async () => {
    try {
      const filePath = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "SQLite Database",
            extensions: ["db", "sqlite", "sqlite3", "db3"]
          },
          {
            name: "All Files",
            extensions: ["*"]
          }
        ]
      });
      if (filePath && typeof filePath === "string") {
        setFormData((prev) => ({ ...prev, database_name: filePath }));
      }
    } catch (err) {
      console.error("Failed to select database file:", err);
    }
  };

  const handleBrowseKeyFile = async () => {
    try {
      const filePath = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "SSH Private Key",
            extensions: ["key", "pem", "pub", "*"]
          },
          {
            name: "All Files",
            extensions: ["*"]
          }
        ]
      });
      if (filePath && typeof filePath === "string") {
        setFormData((prev) => ({ ...prev, ssh_key_path: filePath }));
      }
    } catch (err) {
      console.error("Failed to select key file:", err);
    }
  };

  // Sync state when editing profile changes or modal opens
  useEffect(() => {
    if (editingProfile) {
      setFormData({
        ...defaultProfile,
        ...editingProfile
      });
      setStep(2); // Go straight to details if editing
      setActiveSubTab("main");
    } else {
      setFormData(defaultProfile);
      setStep(1); // Start at engine selection for new connections
      setActiveSubTab("main");
    }
    setValidationError(null);
  }, [editingProfile, isOpen]);

  // Adjust defaults when db_type changes
  const selectEngine = (type: DbType) => {
    setFormData((prev) => {
      let defaultPort = 5432;
      let defaultUser = "postgres";
      
      if (type === "mysql") {
        defaultPort = 3306;
        defaultUser = "root";
      } else if (type === "sqlite") {
        defaultPort = 0;
        defaultUser = "";
      }
      
      return {
        ...prev,
        db_type: type,
        port: type === "sqlite" ? undefined : defaultPort,
        username: type === "sqlite" ? undefined : defaultUser,
        host: type === "sqlite" ? undefined : "127.0.0.1",
      };
    });
    setStep(2);
    setActiveSubTab("main");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Simple validation
    if (!formData.connection_name.trim()) {
      setValidationError("Connection name is required.");
      return;
    }

    if (formData.db_type !== "sqlite") {
      if (!formData.host?.trim()) {
        setValidationError("Host is required.");
        return;
      }
      if (!formData.port || isNaN(Number(formData.port))) {
        setValidationError("Valid port is required.");
        return;
      }

      if (formData.use_ssh) {
        if (!formData.ssh_host?.trim()) {
          setValidationError("SSH host is required when SSH Tunneling is enabled.");
          return;
        }
        if (!formData.ssh_username?.trim()) {
          setValidationError("SSH username is required when SSH Tunneling is enabled.");
          return;
        }
        if (!formData.ssh_password?.trim() && !formData.ssh_key_path?.trim()) {
          setValidationError("Please provide either an SSH password or an SSH key file path.");
          return;
        }
      }
    } else {
      if (!formData.database_name?.trim()) {
        setValidationError("Database file path/name is required.");
        return;
      }
    }

    setIsSubmitting(true);
    const success = await onSave(formData);
    setIsSubmitting(false);

    if (success) {
      onClose();
    } else {
      setValidationError("Failed to save connection profile. Check console for details.");
    }
  };

  if (!isOpen) return null;

  const isSqlite = formData.db_type === "sqlite";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg overflow-hidden transition-all transform glass rounded-2xl shadow-2xl border border-white/10">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-400" />
            {editingProfile ? "Edit Connection" : "New Connection"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step 1: Select Database Engine */}
        {step === 1 ? (
          <div className="p-6 space-y-6">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                Select Database Engine
              </h3>
              <p className="text-xs text-gray-500">
                Choose the database driver for your connection profile
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3.5">
              {/* PostgreSQL Card */}
              <button
                type="button"
                onClick={() => selectEngine("postgres")}
                className="w-full flex items-center justify-between p-4 bg-indigo-950/20 hover:bg-indigo-900/30 border border-indigo-500/20 hover:border-indigo-500/50 rounded-2xl text-left transition-all group hover:scale-[1.01]"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-indigo-950/40 rounded-xl border border-indigo-500/20 group-hover:scale-105 transition-transform">
                    <Database className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">PostgreSQL</h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Connect to remote or local Postgres instances
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>

              {/* MySQL Card */}
              <button
                type="button"
                onClick={() => selectEngine("mysql")}
                className="w-full flex items-center justify-between p-4 bg-cyan-950/20 hover:bg-cyan-900/30 border border-cyan-500/20 hover:border-cyan-500/50 rounded-2xl text-left transition-all group hover:scale-[1.01]"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-cyan-950/40 rounded-xl border border-cyan-500/20 group-hover:scale-105 transition-transform">
                    <Database className="w-6 h-6 text-cyan-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">MySQL / MariaDB</h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Connect to MySQL servers or cloud database services
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>

              {/* SQLite Card */}
              <button
                type="button"
                onClick={() => selectEngine("sqlite")}
                className="w-full flex items-center justify-between p-4 bg-emerald-950/20 hover:bg-emerald-900/30 border border-emerald-500/20 hover:border-emerald-500/50 rounded-2xl text-left transition-all group hover:scale-[1.01]"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-950/40 rounded-xl border border-emerald-500/20 group-hover:scale-105 transition-transform">
                    <Database className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">SQLite File</h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Open a local file-based database instantly
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
          </div>
        ) : (
          /* Step 2: Connection Form */
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {validationError && (
              <div className="p-3 text-sm text-red-200 bg-red-950/40 border border-red-800/60 rounded-xl">
                {validationError}
              </div>
            )}

            {/* Selected Engine & Sub-Tab Display */}
            <div className="flex items-center justify-between p-2.5 bg-white/[0.02] border border-white/5 rounded-xl text-sm">
              <span className="text-gray-400">Database Engine:</span>
              <span className={`px-2.5 py-0.5 uppercase font-bold tracking-wider text-xs rounded border ${
                formData.db_type === "postgres" 
                  ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                  : formData.db_type === "mysql"
                  ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              }`}>
                {formData.db_type === "postgres" ? "PostgreSQL" : formData.db_type === "mysql" ? "MySQL" : "SQLite"}
              </span>
            </div>

            {/* Sub Tabs Switcher */}
            {!isSqlite && (
              <div className="flex border-b border-white/5 gap-4">
                <button
                  type="button"
                  onClick={() => setActiveSubTab("main")}
                  className={`pb-2 text-xs font-semibold border-b-2 transition-all ${
                    activeSubTab === "main"
                      ? "border-indigo-500 text-indigo-400 font-bold"
                      : "border-transparent text-gray-400 hover:text-white"
                  }`}
                >
                  Main (Database)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubTab("ssh")}
                  className={`pb-2 text-xs font-semibold border-b-2 transition-all ${
                    activeSubTab === "ssh"
                      ? "border-indigo-500 text-indigo-400 font-bold"
                      : "border-transparent text-gray-400 hover:text-white"
                  }`}
                >
                  SSH Tunnel
                </button>
              </div>
            )}

            {/* Form Fields: Main Tab */}
            {(isSqlite || activeSubTab === "main") && (
              <div className="space-y-4">
                {/* Connection Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    Connection Name
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                      <Database className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      placeholder="e.g. Production DB"
                      className="w-full pl-10 pr-4 py-2 bg-gray-900/60 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
                      value={formData.connection_name}
                      onChange={(e) => setFormData({ ...formData, connection_name: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {!isSqlite ? (
                  <>
                    {/* Host & Port */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">
                          Host
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                            <Server className="w-4 h-4" />
                          </span>
                          <input
                            type="text"
                            placeholder="127.0.0.1"
                            className="w-full pl-10 pr-4 py-2 bg-gray-900/60 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
                            value={formData.host || ""}
                            onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">
                          Port
                        </label>
                        <input
                          type="number"
                          placeholder={formData.db_type === "mysql" ? "3306" : "5432"}
                          className="w-full px-3 py-2 bg-gray-900/60 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
                          value={formData.port || ""}
                          onChange={(e) => setFormData({ ...formData, port: e.target.value ? Number(e.target.value) : undefined })}
                        />
                      </div>
                    </div>

                    {/* Username & Password */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">
                          Username
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                            <User className="w-4 h-4" />
                          </span>
                          <input
                            type="text"
                            placeholder="username"
                            className="w-full pl-10 pr-4 py-2 bg-gray-900/60 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
                            value={formData.username || ""}
                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">
                          Password
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                            <Lock className="w-4 h-4" />
                          </span>
                          <input
                            type="password"
                            placeholder="password"
                            className="w-full pl-10 pr-4 py-2 bg-gray-900/60 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
                            value={formData.password || ""}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}

                {/* Database File / Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    {isSqlite ? "Database File Path" : "Database Name"}
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                        <Folder className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        placeholder={isSqlite ? "e.g. /path/to/my-db.db or filename.db" : "e.g. my_database (leave blank to list all)"}
                        className="w-full pl-10 pr-4 py-2 bg-gray-900/60 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
                        value={formData.database_name || ""}
                        onChange={(e) => setFormData({ ...formData, database_name: e.target.value })}
                        required={isSqlite}
                      />
                    </div>
                    {isSqlite && (
                      <button
                        type="button"
                        onClick={handleBrowseDatabase}
                        className="px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 hover:border-indigo-500/50 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                      >
                        <Folder className="w-4 h-4" />
                        Browse
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Form Fields: SSH Tunnel Tab */}
            {!isSqlite && activeSubTab === "ssh" && (
              <div className="space-y-4">
                <label className="flex items-center gap-2.5 text-sm text-gray-300 font-semibold cursor-pointer select-none bg-white/[0.01] border border-white/5 rounded-xl p-3.5 hover:bg-white/[0.03]">
                  <input
                    type="checkbox"
                    checked={formData.use_ssh || false}
                    onChange={(e) => setFormData({ ...formData, use_ssh: e.target.checked })}
                    className="w-4 h-4 accent-indigo-500 bg-gray-950 border-white/10 rounded cursor-pointer"
                  />
                  Enable SSH Tunneling
                </label>

                {formData.use_ssh && (
                  <div className="space-y-4 pt-2 animate-fade-in">
                    {/* SSH Host & Port */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-2">
                        <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                          SSH Host
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. bastion.server.com"
                          className="w-full px-3 py-2 bg-gray-900/60 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
                          value={formData.ssh_host || ""}
                          onChange={(e) => setFormData({ ...formData, ssh_host: e.target.value })}
                          required={formData.use_ssh}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                          SSH Port
                        </label>
                        <input
                          type="number"
                          placeholder="22"
                          className="w-full px-3 py-2 bg-gray-900/60 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
                          value={formData.ssh_port || 22}
                          onChange={(e) => setFormData({ ...formData, ssh_port: e.target.value ? Number(e.target.value) : 22 })}
                          required={formData.use_ssh}
                        />
                      </div>
                    </div>

                    {/* SSH Username */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                        SSH Username
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. ubuntu"
                        className="w-full px-3 py-2 bg-gray-900/60 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
                        value={formData.ssh_username || ""}
                        onChange={(e) => setFormData({ ...formData, ssh_username: e.target.value })}
                        required={formData.use_ssh}
                      />
                    </div>

                    {/* SSH Auth (Password & Keypath) */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                          SSH Password / Passphrase
                        </label>
                        <input
                          type="password"
                          placeholder="Optional if key file is passwordless"
                          className="w-full px-3 py-2 bg-gray-900/60 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
                          value={formData.ssh_password || ""}
                          onChange={(e) => setFormData({ ...formData, ssh_password: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                          SSH Key File Path
                        </label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            placeholder="Optional path to private key"
                            className="flex-1 min-w-0 px-2 py-2 bg-gray-900/60 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-xs font-mono"
                            value={formData.ssh_key_path || ""}
                            onChange={(e) => setFormData({ ...formData, ssh_key_path: e.target.value })}
                          />
                          <button
                            type="button"
                            onClick={handleBrowseKeyFile}
                            className="px-2.5 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 hover:border-indigo-500/50 rounded-xl text-[10px] font-bold transition-all shrink-0 cursor-pointer"
                          >
                            Browse
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-between gap-3 pt-4 border-t border-white/5">
              {!editingProfile ? (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white rounded-xl text-sm transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
              ) : (
                <div /> // Placeholder to keep layout right-aligned
              )}
              
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white rounded-xl text-sm transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-xl text-sm shadow-lg shadow-indigo-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? "Saving..." : editingProfile ? "Update Connection" : "Add Connection"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
