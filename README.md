# SiphonDB 🌀

**SiphonDB** is a lightweight, modern, and highly responsive desktop database client and explorer. Built using **Tauri v2**, **React 19**, **TypeScript**, and **Rust**, it provides a sleek, glassmorphic database management interface right on your desktop with built-in secure SSH tunneling.

---

## ✨ Features

- **🔋 Multi-Engine Support**: Seamlessly connect to and query **PostgreSQL**, **MySQL / MariaDB**, and local **SQLite** database files.
- **🔒 Built-in SSH Tunneling**: Establish encrypted SSH tunnels directly inside the application. Supports both **Password** and **Private Key** (.key, .pem) authentication, fully executed in multi-threaded Rust.
- **📊 Interactive Data Grid**: Browse schema tables via a paginated table view with dynamic CSS-based data casting (automatically handling decimal, binary, and geometry types).
- **🛠 Row-Level Operations**: Directly **Insert**, **Edit**, **Duplicate**, and **Delete** database rows using automatic primary key discovery.
- **⚡ SQL Editor**: Run custom, arbitrary SQL queries with tabular output rendering, syntax error alerts, and direct database execution.
- **♻️ Self-Healing Connection Pool**: Automatic reconnect hooks that silently retry failed queries when server sessions or SSH tunnels go stale.
- **🎨 Modern Glassmorphic Design**: Crisp dark mode interface with collapsible sidebars, smooth micro-animations, and responsive layouts built with TailwindCSS v4.

---

## 🛠 Tech Stack

- **Frontend**: React 19, TypeScript, TailwindCSS v4, Lucide React, Vite
- **Desktop Runtime**: Tauri v2 (Rust backend, system dialog integrations)
- **Database Core**: `@tauri-apps/plugin-sql` (local database drivers for SQLite, MySQL, and PostgreSQL)
- **SSH Protocol**: Rust `ssh2` crate with `vendored-openssl` for self-contained secure communication bridging

---

## 📂 Project Structure

```
SiphonDB/
├── src/                      # React Frontend
│   ├── components/
│   │   ├── DbExplorer/       # Core Explorer View
│   │   │   ├── DataGrid      # Grid table component
│   │   │   ├── TableSidebar  # Schema and tables selector
│   │   │   ├── SqlEditorTab  # Query editor and runner
│   │   │   └── RowEditorModal# Row insert/edit modal dialog
│   │   ├── ConnectionModal   # Database profile creation wizard
│   │   └── Sidebar           # Global saved profiles panel
│   ├── hooks/
│   │   └── useConnectionManager.ts # Sqlite-backed profile storage hook
│   └── utils/
│       └── db.ts             # Connection URI builders & SQL query helpers
└── src-tauri/                # Tauri Desktop Shell (Rust)
    ├── src/
    │   ├── main.rs           # Tauri entry point
    │   ├── lib.rs            # Command registering & state initialization
    │   └── ssh_tunnel.rs     # Rust background SSH TCP-bridge & tunnel worker
    └── Cargo.toml            # Rust dependencies (ssh2, tauri-plugin-sql)
```

---

## 🚀 Getting Started

### Prerequisites

To run SiphonDB locally, make sure you have the following installed on your machine:
1. **Node.js** (v18.x or higher)
2. **Rust** toolchain (installed via [rustup](https://rustup.rs/))
3. Development packages for your OS (see [Tauri's Prerequisites Guide](https://tauri.app/start/prerequisites/))

### Installation

1. Clone or navigate to the project directory:
   ```bash
   cd SiphonDB
   ```

2. Install the JavaScript/TypeScript dependencies:
   ```bash
   npm install
   ```

### Running in Development Mode

To start the Vite development server and launch the Tauri window:
```bash
npm run tauri dev
```

### Building for Production

To bundle SiphonDB into a standalone platform-specific installer (executable):
```bash
npm run tauri build
```

---

## 🔒 Security Note

> [!WARNING]
> By default, database and SSH passwords are saved locally in plaintext inside a private SQLite database (`connections.db`). To configure password encryption, look inside `useConnectionManager.ts` where a secure password handler TODO is defined.

---

## ⚙️ Architecture & SSH Tunneling

When you check **Enable SSH Tunneling**, Tauri initiates the following sequence:
1. The React frontend invokes the `start_ssh_tunnel` Rust command.
2. Rust binds a local listener to a random free port on `127.0.0.1:0`.
3. An SSH session is initialized, authenticated, and a direct-tcpip channel is requested to the remote database port.
4. A background thread listens for incoming connections on the local port and bidirectionally bridges the local TCP streams with the SSH channel streams.
5. The local port is returned to React, which updates the connection URI to direct all queries through `127.0.0.1:[random_port]`.
