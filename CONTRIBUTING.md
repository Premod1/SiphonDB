# Contributing to SiphonDB 🌀

First off, thank you for considering contributing to SiphonDB! Open source is driven by passionate people like you, and whether you're fixing a typo, resolving a bug, or building a major feature, every contribution is immensely appreciated.

---

## 🧭 Table of Contents

- [Code of Conduct](#-code-of-conduct)
- [How Can I Contribute?](#-how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Working on Good First Issues](#working-on-good-first-issues)
- [Local Development Setup](#-local-development-setup)
  - [Prerequisites](#prerequisites)
  - [Clone & Run](#clone--run)
- [Project Architecture](#-project-architecture)
- [Development Workflow](#-development-workflow)
  - [Branch Naming](#branch-naming)
  - [Commit Guidelines](#commit-guidelines)
  - [Submitting a Pull Request](#submitting-a-pull-request)
- [Coding Standards](#-coding-standards)
- [Community & Getting Help](#-community--getting-help)

---

## 📜 Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for everyone. Please be respectful, constructive, and kind in all communications within issues, pull requests, and discussions.

---

## 💡 How Can I Contribute?

### Reporting Bugs
If you find a bug or unexpected behavior:
1. Search existing [GitHub Issues](https://github.com/Premod1/SiphonDB/issues) to avoid duplicates.
2. If it hasn't been reported yet, open a new issue using our **Bug Report** template.
3. Include clear steps to reproduce, your OS, database engine (PostgreSQL, MySQL, SQLite), and error messages or screenshots.

### Suggesting Enhancements
Have ideas to make SiphonDB faster or more powerful?
1. Open a new issue using our **Feature Request** template.
2. Explain the use case, why this feature is valuable, and how you imagine it working.

### Working on "Good First Issues"
If you are new to the codebase or open-source in general:
- Look for issues labeled [`good first issue`](https://github.com/Premod1/SiphonDB/labels/good%20first%20issue).
- These are beginner-friendly, self-contained tasks (such as UI polish, simple query optimizations, or bug fixes).
- Leave a comment on the issue saying you'd like to work on it so others know it's being addressed!

---

## 🛠 Local Development Setup

### Prerequisites

Make sure you have installed:
1. **Node.js** (v18.x or later, LTS recommended) & `npm`
2. **Rust** toolchain:
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
3. **OS-specific dependencies for Tauri v2**:
   - **Linux (Ubuntu/Debian)**:
     ```bash
     sudo apt update && sudo apt install -y libwebkit2gtk-4.1-dev \
       build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
     ```
   - **macOS**: Xcode Command Line Tools (`xcode-select --install`).
   - **Windows**: Microsoft C++ Build Tools & WebView2 (preinstalled on modern Windows 10/11).
   *(Check [Tauri's Official Prerequisites Guide](https://tauri.app/start/prerequisites/) for more details).*

### Clone & Run

1. **Fork the repository** on GitHub to your own account.
2. **Clone your fork locally**:
   ```bash
   git clone https://github.com/<your-username>/SiphonDB.git
   cd SiphonDB
   ```
3. **Install JavaScript dependencies**:
   ```bash
   npm install
   ```
4. **Run in development mode**:
   ```bash
   npm run tauri dev
   ```
   *The first build will compile the Rust backend and crates (`ssh2`, `tauri-plugin-sql`, `aes-gcm`, etc.), which might take a couple of minutes. Subsequent hot-reloads will be almost instantaneous.*

---

## 📂 Project Architecture

Here is how the project is structured:

```
SiphonDB/
├── src/                          # Frontend (React 19, TypeScript, Tailwind v4)
│   ├── components/
│   │   ├── DbExplorer/           # Core database explorer view
│   │   │   ├── index.tsx         # Main explorer coordinator & data state
│   │   │   ├── DataGrid.tsx      # Paginated interactive data table
│   │   │   ├── SqlEditorTab.tsx  # CodeMirror SQL runner & history
│   │   │   ├── ErdTab.tsx        # Interactive SVG schema & ERD diagram
│   │   │   ├── ExportModal.tsx   # SQL / CSV / JSON schema & data exporter
│   │   │   ├── TableSidebar.tsx  # Database & table schema tree
│   │   │   └── RowEditorModal.tsx# Single row insert / edit modal
│   │   ├── ConnectionModal.tsx   # Database profile creation / editing wizard
│   │   └── Sidebar.tsx           # Global saved connections list
│   ├── hooks/
│   │   ├── useConnectionManager.ts # Connection storage with AES-256-GCM encryption
│   │   └── useQueryManager.ts      # Query history and saved SQL templates
│   ├── types/
│   │   └── connection.ts         # TypeScript interfaces
│   └── utils/
│       └── db.ts                 # Database URI generator & quote helpers
└── src-tauri/                    # Backend (Rust, Tauri v2)
    ├── src/
    │   ├── main.rs               # Desktop executable entry point
    │   ├── lib.rs                # Tauri command registrations & setup hooks
    │   ├── encryption.rs         # Local key generator & AES-256-GCM encrypt/decrypt
    │   └── ssh_tunnel.rs         # Multi-threaded SSH TCP forwarding bridge
    └── Cargo.toml                # Rust crate dependencies
```

---

## 🔄 Development Workflow

### Branch Naming
Create a feature branch from `main`:
```bash
git checkout -b fix/issue-15-postgres-char-cast
# or
git checkout -b feat/add-query-formatting
```
Recommended prefixes:
- `fix/`: Bug fixes
- `feat/`: New features
- `perf/`: Performance optimizations
- `docs/`: Documentation updates
- `refactor/`: Code reorganization without behavior change

### Commit Guidelines
Write clear, concise commit messages in the present tense:
- `fix: resolve character truncation on postgres numerical casts (#15)`
- `perf: debounce column filtering in table data grid (#7)`
- `docs: update setup prerequisites in README`

### Submitting a Pull Request
1. Ensure your code builds with zero TypeScript errors:
   ```bash
   npm run build
   ```
2. If you touched Rust code, format it:
   ```bash
   cd src-tauri && cargo fmt && cargo check && cd ..
   ```
3. Push your branch to your fork:
   ```bash
   git push origin <your-branch-name>
   ```
   > [!TIP]
   > If you use HTTPS and encounter a `refusing to allow a Personal Access Token to create or update workflow without workflow scope` error when pushing, ensure your GitHub Personal Access Token has the `workflow` scope enabled (or push via SSH key).
4. Open a Pull Request against the `main` branch of `Premod1/SiphonDB`.
5. Fill out the [Pull Request Template](.github/pull_request_template.md). Link related issues (e.g. `Fixes #15`).

---

## 🎨 Coding Standards

- **TypeScript**: Always provide strict typings where possible. Avoid `any` unless dealing with arbitrary database row records.
- **Styling**: We use **TailwindCSS v4**. Stick to consistent color tokens (dark theme: `bg-[#07080c]`, `bg-gray-950`, borders `border-white/5` or `border-white/10`, accents `indigo-500` / `indigo-600`).
- **Icons**: Use [`lucide-react`](https://lucide.dev/).
- **Performance**:
  - Avoid heavy computations in render loops.
  - Wrap stable objects or callbacks in `useMemo` / `useCallback`.
  - Avoid blocking the Tauri main thread in Rust commands; use async execution when handling long I/O.

---

## 💬 Community & Getting Help

- **Issues & Discussions**: Ask questions or discuss architecture directly on [GitHub Issues](https://github.com/Premod1/SiphonDB/issues).
- **Maintainer**: Feel free to tag [@Premod1](https://github.com/Premod1) for reviews or questions.

Thank you for helping build SiphonDB! Happy hacking! 🚀
