# AGENTS.md: Developer & Agent Guide for Altus Personal Cloud

Welcome to **Altus Personal Cloud**. This document is the definitive operational reference for AI agents and human developers modifying, debugging, or extending this repository.

---

## 1. Quick Orientation & System Vision

Altus is a fast, lightweight, single-user personal cloud storage system built on the **ohCRUD** PHP microframework (v2.6) and **SQLite 3**, paired with a modern zero-framework Vanilla Single-Page Application (SPA).

### Architectural Pillars
- **Physical Filesystem Parity:** Files and directories in `./storage` (mounted to `/storage` in Docker) mirror their actual names and hierarchy on disk. No synthetic UUID directories or hash-obfuscated filenames exist on the host filesystem.
- **Fast Indexed Queries via Deterministic Hashes:** The database stores relative POSIX paths (`PATH`) and their SHA-256 digests (`PATH_HASH`) with unique indexes, enabling $O(1)$ lookups regardless of directory depth.
- **Sub-Second "Quick Sync" Engine:** Dropping files into the storage directory outside the web application (e.g., via Finder, rsync, SMB) can be instantly reconciled into SQLite in milliseconds via `POST /api/v1/sync`.
- **Zero Static Storage Exposure:** Nginx strictly blocks `/storage/` (`deny all; return 404;`). All file access passes through ohCRUD authentication and `cStream` with RFC 7233 HTTP 206 Byte-Range streaming.
- **Zero Third-Party UI Frameworks:** The frontend is 100% semantic HTML5, Vanilla CSS3, and modern Vanilla ES6+. No React, Vue, Tailwind, or Bootstrap.

---

## 2. Mandatory Protocol: Persistent Context via MCP Memory

All agents working on Altus **must** leverage the persistent **`mcp-memory`** server (`memory_store`, `memory_retrieve`, `memory_search`, `memory_get_last`, `memory_update_last`) with project root `/Users/erfan/Projects/altus` and namespace `default`.

### Essential Memory Records to Consult:
- **`system/last_memory`**: Latest checkpoint of the active session and recent updates.
- **`altus/architecture/core`**: Foundation architecture, physical storage concepts, and constraints.
- **`altus/guides/codebase_map`**: Comprehensive directory and component interaction map.
- **`altus/features/post_phase7`**: Post-Phase 7 enhancements (Favorites system, soft-delete sync reactivation, recursive folder cascades, multi-attribute case-insensitive sorting, and dark mode).
- **`altus/phase/1` through `altus/phase/7`**: Granular implementation logs and architectural decisions for each delivery phase.

> **Directive:** Before undertaking substantial changes, always query memory (`memory_search` or `memory_retrieve`) to ensure continuity. When completing tasks or discovering architectural nuances, update memory records using `memory_store`.

### Frontend Craft Protocol:
When modifying or adding UI components, styles, or interactions, agents **must** consult the `impeccable` skill (`/Users/erfan/.gemini/config/skills/impeccable/SKILL.md`) and adhere to the tokens and guidelines defined in [`DESIGN.md`](file:///Users/erfan/Projects/altus/DESIGN.md) and [`PRODUCT.md`](file:///Users/erfan/Projects/altus/PRODUCT.md).

---

## 3. Directory Layout & "Where to Look"

```
altus/
├── docker-compose.yml                     # Multi-container orchestration (web, php)
├── data.db                                # Primary SQLite database (mounted to /data/data.db)
├── storage/                               # Physical file store (mounted to /storage)
├── DESIGN.md                              # Impeccable design system tokens & specifications
├── PRODUCT.md                             # Product definition & conventions
├── PRD.md                                 # Full product requirements and phase history
├── private/
│   ├── nginx.conf                         # Reverse proxy, SSL, FastCGI, storage blocking & cache rules
│   ├── PHP.Dockerfile                     # Custom PHP 8.2-FPM image with SQLite, GD, EXIF, etc.
│   ├── PHP-Custom.ini                     # 500M upload/POST limits, 300s timeout execution limits
│   └── hurl/                              # Integration test suites (test.sh, test_passes.hurl)
└── public/
    ├── index.php                          # Single application entrypoint
    ├── routes.php                         # URL routing configuration table
    ├── settings.php                       # Runtime database, encryption keys, and environment config
    ├── ohcrud/                            # Core microframework classes
    │   ├── Core.php                       # Base class, crypto, error handling, JSON responses
    │   ├── DB.php                         # PDO SQLite wrapper, query builder, transactions
    │   ├── Router.php                     # Route resolution, REST path param extraction, auth verification
    │   └── Users.php                      # User authentication, token issuance, bcrypt, TOTP
    ├── app/
    │   ├── controllers/                   # RESTful API and Web controllers
    │   │   ├── cApp.php                   # Single-Page Application web shell & bootstrap
    │   │   ├── cCloudAuth.php             # User login, TOTP verification, session logout, /me
    │   │   ├── cUserSettings.php          # Password update, TOTP 2FA enrollment/disable
    │   │   ├── cFolders.php               # Folder CRUD, tree queries, recursive move/rename, favorites
    │   │   ├── cCloudFiles.php            # File queries, multipart upload, rename, move, delete, favorites
    │   │   ├── cStream.php                # HTTP 206 Partial Content byte-range streaming, inline view, ZIP download
    │   │   └── cSync.php                  # Disk-to-DB sync reconciliation engine with soft-delete reactivation
    │   └── models/                        # Business logic and database schemas
    │       ├── mFolders.php               # Folders schema, indexes, path hashing, parent-child cascades
    │       └── mCloudFiles.php            # CloudFiles schema, indexes, path hashing, sorting, MIME detection
    └── themes/altus/                      # Modern Vanilla Frontend SPA
        ├── index.html                     # Semantic HTML5 shell, action modals, theater previewer
        └── assets/
            ├── css/altus.css              # Vanilla CSS3, custom property design tokens, light/dark themes
            ├── js/altus.js                # AltusApp Vanilla ES6+ state manager, upload queue, previewer
            ├── js/qrcode.min.js           # Lightweight standalone QR code generator for TOTP 2FA
            └── fonts/                     # Self-hosted Material Symbols Outlined woff2 font
```

---

## 4. Key Component Deep Dive & Modification Touchpoints

### 4.1 Routing & HTTP Flow
- **Registration:** [`public/routes.php`](file:///Users/erfan/Projects/altus/public/routes.php)
  - Maps endpoint prefixes to fully qualified controller classes (e.g., `'/api/v1/folders/' => 'app\controllers\cFolders'`).
- **Dispatching:** [`public/ohcrud/Router.php`](file:///Users/erfan/Projects/altus/public/ohcrud/Router.php)
  - Extracts REST route parameters into `$this->parameters` (e.g., `/api/v1/folders/:id` extracts the integer ID).
  - Matches HTTP verbs to controller methods: `GET` -> `read()`, `POST` -> `create()`, `PUT` -> `update()`, `DELETE` -> `delete()`.
  - Enforces session or token authentication. Note that root `/` and `/cloud/` route to [`cApp`](file:///Users/erfan/Projects/altus/public/app/controllers/cApp.php) which serves the SPA HTML shell; unauthorized browser requests render an inline HTML login modal rather than triggering HTTP 401 Basic Auth dialogs.

### 4.2 Storage Synchronization Engine
- **Implementation:** [`public/app/controllers/cSync.php`](file:///Users/erfan/Projects/altus/public/app/controllers/cSync.php)
- **Key Logic:**
  1. Traverses `/storage` recursively, skipping `.DS_Store`, `.git`, and dotfiles.
  2. Compares physical directory hierarchy with `Folders` table.
  3. Compares physical file paths with `CloudFiles` table.
  4. **Soft-Delete Reactivation:** If a file or folder exists on disk that was previously marked inactive (`STATUS = 0`) in SQLite, `cSync` reactivates it with `STATUS = 1` rather than throwing unique `PATH_HASH` constraint exceptions.
  5. Runs in a single SQLite transaction for sub-second execution on thousands of files.

### 4.3 Folder Operations & Recursive Hierarchy Cascading
- **Implementation:** [`public/app/controllers/cFolders.php`](file:///Users/erfan/Projects/altus/public/app/controllers/cFolders.php) & [`public/app/models/mFolders.php`](file:///Users/erfan/Projects/altus/public/app/models/mFolders.php)
- **Cascading Invariant:**
  - Renaming or moving a folder moves the physical directory on disk (`rename($oldDiskPath, $newDiskPath)`), and recursively updates the `PATH`, `PATH_HASH`, and `FOLDER_ID` of all child subfolders and child files in SQLite.
  - Circular move prevention: A folder cannot be moved into itself or into any of its descendants.

### 4.4 Media Streaming & RFC 7233 Byte-Range Handling
- **Implementation:** [`public/app/controllers/cStream.php`](file:///Users/erfan/Projects/altus/public/app/controllers/cStream.php)
- **Key Logic:**
  - Validates user permissions before opening any file descriptor.
  - Implements HTTP 206 Partial Content with `Range: bytes=start-end` handling.
  - Uses a fixed 64KB read buffer (`4096 * 16`) to stream large audio/video media (MP4, WebM, MP3, FLAC) without PHP memory limit exhaustion.
  - Powers single-file attachment downloads and multi-file batch ZIP archive downloads.

### 4.5 Sorting System (Dual-Tier)
- **Backend Sorting:** [`mCloudFiles.php`](file:///Users/erfan/Projects/altus/public/app/models/mCloudFiles.php) & [`mFolders.php`](file:///Users/erfan/Projects/altus/public/app/models/mFolders.php)
  - Uses `NAME COLLATE NOCASE ASC / DESC` for natural, case-insensitive alphabetical sorting.
  - Supports `mtime_asc`, `mtime_desc`, `size_asc`, `size_desc`.
- **Frontend Sorting:** [`public/themes/altus/assets/js/altus.js`](file:///Users/erfan/Projects/altus/public/themes/altus/assets/js/altus.js)
  - Interactive table headers (`th.sortable`) cycle sort direction with visual arrow indicators.
  - State persisted in `localStorage.getItem('altus_sort')`.

### 4.6 Theme & Dark Mode Architecture
- **Theme Variables:** [`public/themes/altus/assets/css/altus.css`](file:///Users/erfan/Projects/altus/public/themes/altus/assets/css/altus.css)
  - Defined under `:root` (light mode) and `[data-theme="dark"]` (dark mode).
- **FOUC Prevention:** [`public/themes/altus/index.html`](file:///Users/erfan/Projects/altus/public/themes/altus/index.html)
  - Inline synchronous `<script>` in `<head>` reads `localStorage.getItem('altus_theme')` or `prefers-color-scheme` and immediately sets `document.documentElement.setAttribute('data-theme', ...)` before rendering.
- **Toggle Control:** Header button `#themeToggleBtn` toggles theme via `AltusApp.toggleTheme()`.

### 4.7 Favorites System
- **Database Schema:** `IS_FAVORITE INTEGER DEFAULT 0` column on both `Folders` and `CloudFiles` tables.
- **Endpoints:**
  - `POST /api/v1/folders/:id/favorite` (body: `{"is_favorite": true|false}`)
  - `POST /api/v1/files/:id/favorite` (body: `{"is_favorite": true|false}`)
- **Frontend Views:**
  - Star toggles on folder cards, file cards, list rows, context menus, mobile action sheets, and media preview header.
  - Dedicated "Favorites" navigation item in desktop sidebar and mobile drawer.

---

## 5. Development Playbooks for Common Agent Tasks

### Playbook A: Adding a New API Endpoint
1. Register the route prefix in [`public/routes.php`](file:///Users/erfan/Projects/altus/public/routes.php).
2. Implement or update the controller in [`public/app/controllers/`](file:///Users/erfan/Projects/altus/public/app/controllers/).
3. Always verify user permissions:
   ```php
   $userId = (int) ($this->session->get('user_id') ?? 0);
   if ($userId <= 0) {
       $this->error('Unauthorized', 401);
       return;
   }
   ```
4. Sanitize parameters and prevent path traversal (never trust raw client-provided filenames).
5. Return JSON payload using standard ohCRUD data properties:
   ```php
   $this->data = ['status' => 'success', 'result' => $payload];
   ```

### Playbook B: Modifying or Adding Database Schema Columns
1. Add the column to `createTable()` in the respective model ([`mFolders.php`](file:///Users/erfan/Projects/altus/public/app/models/mFolders.php) or [`mCloudFiles.php`](file:///Users/erfan/Projects/altus/public/app/models/mCloudFiles.php)).
2. Include an automatic migration block in the model constructor or init method to ensure existing SQLite databases receive the column seamlessly (see `IS_FAVORITE` migration in `mFolders::__construct()`):
   ```php
   try {
       $this->db->exec("ALTER TABLE Folders ADD COLUMN NEW_COLUMN INTEGER DEFAULT 0");
   } catch (\PDOException $e) {
       // Column already exists
   }
   ```
3. Update indexes if the new column is queried or filtered.

### Playbook C: Editing the Frontend SPA
1. Modify semantic markup in [`public/themes/altus/index.html`](file:///Users/erfan/Projects/altus/public/themes/altus/index.html).
2. Style strictly with CSS Custom Properties in [`public/themes/altus/assets/css/altus.css`](file:///Users/erfan/Projects/altus/public/themes/altus/assets/css/altus.css). Verify both `:root` and `[data-theme="dark"]`.
3. Add client logic to [`public/themes/altus/assets/js/altus.js`](file:///Users/erfan/Projects/altus/public/themes/altus/assets/js/altus.js) inside the `AltusApp` class.
4. **Cache Busting:** If modifying CSS or JS, increment the cache-buster query parameter in `index.html` (e.g. `altus.css?v=7.1.3`). Note that Nginx is also configured with `no-cache, must-revalidate` for `.css` and `.js`.
5. Verify touch targets on mobile viewports (< 768px): all interactive elements must be at least 48px $\times$ 48px.

---

## 6. Local Environment & Operational Verification

### Running the Environment
The application is containerized with Docker Compose:
```bash
docker compose up -d
```
- **Web Server:** `nginx:latest` bound to `http://localhost:80` and `https://localhost:443`.
- **Backend:** `altus-php` running PHP 8.2-FPM on port 9000.
- **Host Volumes:**
  - `./public` -> `/app`
  - `./storage` -> `/storage`
  - `./data.db` -> `/data/data.db`
  - `./logs` -> `/logs`

### User Credentials
- **Standard Cloud User:** Username `user`, Permission level `2` (Full access to personal cloud storage and account settings).
- **System Administrator:** Username `admin`, Permission level `1` (Access to ohCRUD admin panels).

### Running Quick Sync via CLI
```bash
docker compose exec php php /app/index.php "/api/v1/sync/"
```

### Running Integration Tests
```bash
cd private/hurl && ./test.sh
```

---

## 7. Golden Rules for Future Agents

1. **Never Introduce External UI Frameworks:** Do not install or import Bootstrap, Tailwind, React, Vue, or jQuery. Keep the frontend pure Vanilla HTML5/CSS3/ES6+.
2. **Never Break Direct Filesystem Parity:** Any file or folder created in the virtual cloud MUST physically exist at the corresponding path under `./storage`.
3. **Always Guard Physical Storage:** Never remove or bypass Nginx's `location ^~ /storage/ { deny all; return 404; }` rule. File downloads and streams MUST pass through `cStream`.
4. **Case-Insensitive Uniqueness:** POSIX filesystems on macOS and Windows may be case-preserving but case-insensitive. Always use `COLLATE NOCASE` and normalize paths when computing `PATH_HASH`.
5. **Keep MCP Memory Current:** Update memory records when adding significant features or discovering architectural edge cases. Future agents depend on your updates!
