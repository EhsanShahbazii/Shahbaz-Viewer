# ⚡ SQLite Viewer & Database Studio

<div align="center">

![SQLite Viewer & Database Studio Banner](resources/banner.png?raw=true)

### The Ultra-Fast SQLite Studio, Virtualized DataGrid & ER Diagrams for VS Code & Cursor

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg?style=for-the-badge&logo=visualstudiocode)](https://github.com/EhsanShahbazii/Shahbaz-Viewer)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)
[![Author](https://img.shields.io/badge/Author-Ehsan%20Shahbazi-amber.svg?style=for-the-badge&logo=github)](https://github.com/EhsanShahbazii)
[![SQLite](https://img.shields.io/badge/Engine-Disk%20CLI%20%2B%20WASM-003B57.svg?style=for-the-badge&logo=sqlite)](https://sqlite.org)
[![Performance](https://img.shields.io/badge/FPS-60%20Virtualized-emerald.svg?style=for-the-badge)](#-performance-architecture)

**[Install from Marketplace](#-installation)** • **[Core Features](#-core-features)** • **[ER Diagrams](#-2-interactive-entity-relationship-er-diagram)** • **[SQL Studio](#-4-sql-studio--monaco-query-engine)** • **[Visual Charts](#-3-visual-analytics--quick-charts)** • **[GitHub Repo](https://github.com/EhsanShahbazii/Shahbaz-Viewer)**

</div>

---

## 📖 Origin of the Project
Inspired by **Shahbaz** ([شاهباز](https://en.wikipedia.org/wiki/Shahbaz_(bird))), the legendary royal falcon of ancient Persia and the historic standard of Cyrus the Great—renowned across millennia for its **unmatched speed**, **penetrating vision**, and **regal majesty**.

> *Designed to give developers the fastest, most razor-sharp, and visually majestic SQLite exploration studio in the world right inside Visual Studio Code and Cursor.*

Crafted with dedication by **[Ehsan Shahbazi](https://github.com/EhsanShahbazii)**.

---

## 🌟 Why SQLite Viewer & Database Studio?

Most SQLite extensions are sluggish, crash on databases over 2 GB, lack visual inspection tools, or break when handling heavy tables and large datasets. **SQLite Viewer & Database Studio** provides a unified, studio-grade environment engineered for speed:

| Capability | Legacy Viewers | ⚡ SQLite Viewer & Database Studio |
| :--- | :--- | :--- |
| **Large Databases (> 2 GB - 7 GB+)** | 💥 Crash (`File size > 2 GiB`) | 🚀 **Instant Open & Sub-10ms Paging (Kernel MMAP)** |
| **Grid Performance** | Laggy HTML tables; freezes at >5k rows | **60 FPS TanStack Virtualization (100k+ rows)** |
| **Cell Selection & Stats** | Single cell click only | **Excel-style multi-cell drag with Live Aggregates (Sum, Avg, Min, Max, Count)** |
| **Media & BLOB Preview** | Raw hex strings or truncation | **Visual Badges & Preview Modal (Images, Videos, WebP, GIFs, Hex Dump)** |
| **Entity Relationships** | Text schema or static lines | **Interactive Canvas ER Graph with draggable nodes & layout persistence** |
| **Data Visualizer** | None (requires external tools) | **Built-in Quick Charts (Bar, Line, Area, Scatter, Donut/Pie, Treemap)** |
| **SQL Scratchpad** | Plain textarea | **Monaco SQL Studio with EXPLAIN query plan advisor & timing** |
| **Data Importer** | Manual scripts | **3-Step CSV/TSV/JSON/JSONL Import Wizard with auto type inference** |
| **Mock Data Generator** | None | **Foreign-Key Safe Mock Generator (up to 1,048,576 rows)** |
| **Code Generation** | Basic SQL | **Production Prisma, Drizzle, TypeORM, Kysely & Zod Schemas** |
| **File Exports** | Overwrites single files | **Filesystem-safe timestamped exports (CSV, JSON, Markdown, SQL, TS, PNG, SVG, PDF)** |

---

## 🚀 Core Features

### ⚡ 1. High-Performance Virtualized DataGrid
Browse, search, sort, and edit massive tables effortlessly without frame drops.

![DataGrid Interface](resources/screenshots/datagrid.png?raw=true)

- **Sub-10ms Pagination on 7GB+ Databases**: Dual-tier RAM caching and kernel memory-mapped I/O (`PRAGMA mmap_size = 256MB`).
- **60 FPS Virtualized Scrolling**: Render 100,000+ rows smoothly with `@tanstack/react-virtual`.
- **Excel-Style Multi-Cell Range Selection**: Click and drag across rows and columns or hold `Shift` + Arrow keys to select rectangular cell regions.
- **Instant Live Aggregate Footer**: Real-time computation of **Sum**, **Average**, **Min**, **Max**, **Count**, and **Numeric Count** on selected cells in under 2 milliseconds.
- **Media Link Detection & Quick Preview**: Automatically highlights image and video URLs with visual badge indicators. Click any badge to open the instant media inspection modal.
- **Persistent Search, Filter & Sorting**: New records stream in without breaking or resetting user filter queries or column sorting.
- **Safe Transactional Editing**: Double-click any cell to edit inline. Changes are tracked with amber dirty markers. Commit as a single atomic batch or revert with 1 click.

---

### 🗺️ 2. Interactive Entity-Relationship (ER) Diagram
Understand your database architecture visually in seconds.

![ER Diagram](resources/screenshots/erdiagram.png?raw=true)

- **Dynamic Foreign Key Graph**: Automatic linking of foreign keys with curved relationship vectors and cardinality indicators.
- **Draggable Table Nodes**: Arrange entities freely on an infinite canvas with mouse wheel zoom in/out (20% to 300%) and smooth panning.
- **Layout Memory & Persistence**: Saved node positions persist automatically across sessions and editor reloads. Reset to auto-layout anytime with 1 click.
- **High-Res Multi-Format Export**: Export your ER diagram directly to **PNG**, **SVG**, **PDF**, or **JSON Schema** with timestamped filenames for documentation and PRs.
- **Hardware-Accelerated 60 FPS Engine**: Coordinated through `requestAnimationFrame` to eliminate canvas dragging latency even with large schemas.

---

### 📊 3. Visual Analytics & Quick Charts
Turn raw SQL tables and query results into rich visual reports inside your editor.

![Visual Charts](resources/screenshots/charts.png?raw=true)

- **Multiple Chart Archetypes**:
  - 📊 **Bar Charts** (Vertical & Horizontal)
  - 📈 **Line & Area Charts** (Continuous time-series & metrics)
  - 🍩 **Pie & Donut Charts** (Distribution & categorical shares)
  - 🔵 **Scatter & Bubble Plots** (Correlations & outliers)
  - 🟩 **Treemaps & Histograms** (Hierarchical volume breakdowns)
- **Theme-Aware Sync**: Automatically matches your active VS Code theme (Dark+, Light+, Monokai, GitHub Dark, Cursor).
- **Export Ready**: 1-click export to high-resolution PNG or vector SVG with timestamped naming.
- **Configuration Persistence**: Save customized metric, dimension, and aggregation settings per table.

---

### 💻 4. SQL Studio & Monaco Query Engine
A studio-grade SQL scratchpad with intelligent query performance analytics.

![SQL Studio](resources/screenshots/sqlstudio.png?raw=true)

- **Integrated Monaco Editor**: Full SQL syntax highlighting, auto-completion, and query formatting (`Cmd+Shift+F` / `Ctrl+Shift+F`).
- **Precise Execution Metrics**: High-resolution execution timing down to microseconds (`ms`) and row count badges.
- **EXPLAIN QUERY PLAN Advisor**: Automatically analyzes query execution plans to identify unindexed full-table scans, scanning bottlenecks, and missing indexes with proactive advisory tips.
- **Interactive Query Results Grid**: Full search, column sorting, cell selection, and TSV copy on query output datasets.
- **Safe IPC Capping**: Safely caps massive unpaginated queries to 5,000 rows with clear `Capped from X rows` indicators, protecting your VS Code process from memory exhaustion.
- **History Log**: Re-run recent queries with a single click.

---

### 🪄 5. CSV / JSON Import Wizard
Import external data into SQLite without writing boilerplate ingestion scripts.

![Import Wizard](resources/screenshots/importwizard.png?raw=true)

- **Format Support**: Import **CSV**, **TSV**, **JSON** arrays, and **JSONL / NDJSON** newline-delimited data files.
- **Automatic Column Type Detection**: Scans sample rows to automatically infer `INTEGER`, `REAL`, `TEXT`, or `BOOLEAN` types.
- **Flexible Ingestion Targets**:
  - Create a brand-new table automatically with inferred DDL.
  - Append rows into an existing table.
  - Replace / overwrite existing tables safely within a transaction.
- **Live Schema & Data Preview**: Inspect columns, edit field names, or adjust detected types prior to committing the import.

---

### 🎲 6. Smart Foreign-Key Safe Mock Data Generator
Populate your database with realistic seed data for load testing and development.

- **Semantic Field Generation**: Automatically detects column names to generate real-world names, emails, UUIDs, phone numbers, prices, timestamps, and JSON payloads.
- **Foreign Key Constraint Integrity**: Intelligently inspects parent tables and samples valid primary keys so generated child rows **never violate foreign key constraints**!
- **High-Volume Generation**: Generate up to **2²⁰ (1,048,576) rows** in high-speed batches.
- **Direct Insert or Preview**: Review generated records before committing to disk.

---

### 🔍 7. Deep Type-Aware Inspectors

#### 📦 BLOB & Media Inspector
- Inspect raw binary data, images, video links, avatars, document attachments, and files.
- **Selective Previews**: Fetches bounded previews (up to 32KB) during paging to avoid memory bloat, with instant on-demand retrieval for full payloads.
- **Image & Video Preview**: Automatically identifies binary magic numbers (PNG, JPEG, GIF, WebP, SVG, MP4) and renders an immediate graphical preview.
- **Hex Dump Viewer**: Classic dual-column memory hex dump with ASCII sidebar.
- **Export Binary**: Download any BLOB directly to disk with timestamped filename (`column_YYYY-MM-DD_HH-mm-ss.bin`).

#### 🌲 JSON Tree Inspector
- Formatted JSON tree viewer with collapsible branches, syntax coloring, copy-to-clipboard, and JSON validation.

---

### ⚡ 8. Modern ORM & Code Generator
Export table schemas directly into modern production code in 1 click:

- **Prisma**: Full `model` schema with `@id`, `@default(autoincrement())`, `@unique`, and relation linkages (`@relation`).
- **Drizzle ORM**: Complete `sqliteTable` declarations with typed columns (`integer`, `text`, `real`).
- **TypeScript & Zod**: TypeScript `interface` and runtime validation `z.object` schemas.
- **TypeORM & SQLAlchemy**: Python declarative models and TypeScript entity decorators.
- **Go**: Struct definitions with `json:"..." db:"..."` tags.
- **1-Click Open Beside**: Opens generated code in an untitled VS Code editor side-by-side (`Cmd+N`).

---

### 📤 9. Timestamped Exporters
Never overwrite previous exports accidentally:

- **Formats Supported**: **CSV**, **JSON**, **Markdown Tables**, **SQL INSERT statements**, and **TypeScript Interfaces**.
- **Timestamp Standard**: Files are automatically stamped as:
  `<table_or_query>_export_YYYY-MM-DD_HH-mm-ss.<ext>`
- **Destination Options**:
  - 💾 **Save to Project Folder**: Writes directly into workspace root.
  - 📁 **Save to Custom File**: Open native OS file picker with timestamp pre-filled.
  - 📝 **Open in Editor**: Opens formatted export in a side tab.
  - 📋 **Copy to Clipboard**: Quick copy for pasting into Slack, Notion, or GitHub.

---

## ⌨️ Keyboard Shortcuts

| Shortcut (Mac) | Shortcut (Windows/Linux) | Action |
| :--- | :--- | :--- |
| `Double Click` | `Double Click` | Edit cell in-place |
| `Enter` | `Enter` | Save cell edit |
| `Escape` | `Escape` | Discard cell edit / Close open modal |
| `Shift + Click` | `Shift + Click` | Extend multi-cell rectangular range selection |
| `Cmd + B` | `Ctrl + B` | Toggle Left Sidebar (collapse / expand) |
| `Cmd + Enter` | `Ctrl + Enter` | Execute SQL query in SQL Studio |
| `Cmd + Shift + F`| `Ctrl + Shift + F` | Format SQL query in SQL Studio |
| `Mouse Wheel` | `Mouse Wheel` | Zoom in / Zoom out in ER Diagram |

---

## 🛠️ Performance Architecture

1. **Dual-Tier Hybrid Engine**: Combines native `sqlite3` CLI streaming with in-memory `sql.js` WebAssembly fallback, seamlessly supporting files from kilobytes up to tens of gigabytes.
2. **Kernel Memory-Mapped I/O**: Queries leverage `PRAGMA mmap_size = 268435456` and `PRAGMA cache_size = -64000` to execute directly through OS page cache.
3. **RAM Cardinality & Schema Caches**: Total row counts and metadata schemas are cached in RAM, reducing page navigation latency to `0.0 ms`.
4. **TanStack Virtual DOM Windowing**: Only cells visible in the viewport are rendered in the DOM, maintaining 60 FPS even on million-row tables.
5. **Bounded IPC Serialization**: BLOB columns are fetched via length and 32KB substring preview, slashing IPC payload sizes by 99.9% while preserving format detection.
6. **RequestAnimationFrame Canvas**: ER graph dragging and zooming are synced to display refresh cycles for jitter-free 60fps rendering.

---

## 📦 Installation

### From VS Code Marketplace
1. Open Visual Studio Code or Cursor.
2. Press `Cmd+Shift+X` (or `Ctrl+Shift+X`) to open the Extensions tab.
3. Search for **`SQLite Viewer & Database Studio`** (or `sqlite-viewer-studio`).
4. Click **Install**.

### Opening a Database
- **Double Click**: Click any `.db`, `.sqlite`, `.sqlite3`, `.db3`, `.s3db`, or `.sl3` file in the VS Code file explorer.
- **Activity Bar**: Click the **SQLite Studio** database icon in the left activity bar to see all databases in your workspace.
- **Command Palette**: Press `Cmd+Shift+P` and run:
  ```
  SQLite Studio: Open Database
  ```

---

## 🧑‍💻 Development & Building

To build the extension from source:

```bash
# 1. Clone the repository
git clone https://github.com/EhsanShahbazii/Shahbaz-Viewer.git
cd Shahbaz-Viewer

# 2. Install dependencies
npm install

# 3. Build extension host and React webview
npm run build

# 4. Launch in VS Code
# Press F5 to open the Extension Development Host with sample.db!
```

---

## 👨‍💻 Author & Credits

- **Creator & Lead Engineer**: [Ehsan Shahbazi](https://github.com/EhsanShahbazii)
- **Repository**: [https://github.com/EhsanShahbazii/Shahbaz-Viewer](https://github.com/EhsanShahbazii/Shahbaz-Viewer)
- **Report an Issue**: [https://github.com/EhsanShahbazii/Shahbaz-Viewer/issues](https://github.com/EhsanShahbazii/Shahbaz-Viewer/issues)
- **License**: Released under the [MIT License](LICENSE).

<div align="center">

**⚡ SQLite Viewer & Database Studio — High-Performance SQLite Engineering**

Made with ❤️ by [Ehsan Shahbazi](https://github.com/EhsanShahbazii)

</div>
