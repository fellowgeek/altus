# Product Requirements Document (PRD): Altus Personal Cloud

**Document Version:** 2.0.0  
**Project:** Altus Personal Cloud  
**Base Framework:** ohCRUD PHP Microframework (v2.6)  
**Database Engine:** SQLite 3 (`data.db`)  
**Target Environment:** Docker (Nginx, PHP-FPM, SQLite), macOS / Linux  
**Status:** Approved for Implementation  

---

## 1. Executive Summary & Vision

### 1.1 Overview
**Altus** is a fast, lightweight, single-user personal cloud storage system built on the **ohCRUD** PHP microframework. Modeled after core file-management features of Google Drive and Nextcloud, Altus provides folder organization, upload/download capabilities, media streaming, inline file previews, and account security management without framework bloat.

### 1.2 Core Architectural Principles
- **Direct Physical Filesystem Storage:** Files and folders in storage directly mirror their actual names and directory hierarchy on disk. No obfuscated hashes or synthetic folder UUIDs on the filesystem.
- **Natural Collision Prevention:** The host filesystem naturally enforces unique filenames within any folder directory.
- **Frictionless Disk Synchronization ("Quick Sync"):** Users can copy, paste, or rsync existing file collections directly into the host storage directory, then trigger an instant synchronization process that updates SQLite in milliseconds.
- **Strict Access Isolation:** Physical storage directories are never directly exposed via static HTTP. All file access, downloads, and streaming pass through ohCRUD authentication and permission verification.
- **Decoupled API Architecture:** All operations are backed by RESTful JSON endpoints, making Altus immediately ready for future native iOS, desktop, or CLI clients.
- **Zero Third-Party UI Frameworks:** Modern, responsive UI constructed entirely with pure Semantic HTML5, Vanilla CSS3, and modern Vanilla ES6+ JavaScript. No React, Vue, Tailwind, or Bootstrap.
- **Pre-Approved JS Libraries Only:** Any external JavaScript library requires explicit user confirmation before introduction.
- **Material Icons:** Iconography is powered exclusively by Google Material Symbols / Material Icons.

---

## 2. Agent Operational Directives

### 2.1 Frontend Craft via Impeccable Skill
> **Mandatory Agent Instruction:**  
> When designing, styling, building, or refining the Altus frontend (UI components, layouts, typography, micro-interactions, responsive states, transitions, empty states, and theme tokens), agents **MUST** load and follow the **`impeccable` skill** located at:  
> `/Users/erfan/.gemini/config/skills/impeccable/SKILL.md`  
> Rather than relying on hardcoded static color palettes or generic styling rules, agents will use `impeccable` directives to deliver production-grade, human-centric craft tailored to the **Operate** mode (instant scanability, clear visual hierarchy, native expectations, and fluid feedback).

### 2.2 Continuity & State Tracking via MCP Memory
> **Mandatory Agent Instruction:**  
> All agents collaborating on Altus **MUST** continuously use the **`memory` MCP server** (`memory_store`, `memory_retrieve`, `memory_search`, `memory_get_last`, `memory_update_last`) to maintain persistent project context across conversation turns and agent lifecycles:  
> - Store architectural decisions, schema modifications, and completed task milestones.  
> - Query existing memory before beginning work to ensure complete continuity.  
> - Memory records must use project root `/Users/erfan/Projects/altus` and namespace `default`.

---

## 3. System Architecture & Component Diagram

```
+-------------------------------------------------------------------------+
|                                Clients                                  |
|   Desktop Browser  |  Mobile Browser  |  Future Mobile/Desktop Apps    |
+--------------------+------------------+--------------------------------+
                                    |
                            HTTPS / TLS 1.3
                                    |
+-------------------------------------------------------------------------+
|                         Nginx Reverse Proxy                             |
|  - SSL Termination (Port 443)                                           |
|  - Static Assets (/global, /themes with immutable caching)              |
|  - FastCGI proxying to PHP-FPM                                          |
|  - Physical Storage Access (/storage/): STRICTLY DENIED (404/deny all)  |
+-------------------------------------------------------------------------+
                                    |
                            FastCGI (PHP 8.2)
                                    |
+-------------------------------------------------------------------------+
|                        ohCRUD Framework Core                            |
|  +-------------------------------------------------------------------+  |
|  | Router: Session Auth (Web) & Token Auth (API), Permission Checks   |  |
|  +-------------------------------------------------------------------+  |
|  | Controllers:                                                      |  |
|  |  - cCloudAuth (Login, Logout, Session Verification)               |  |
|  |  - cUserSettings (Password update, TOTP setup/verify/disable)     |  |
|  |  - cFolders (CRUD, Color tags, hierarchy)                         |  |
|  |  - cCloudFiles (Upload, Rename, Move, Delete, Metadata)           |  |
|  |  - cStream (HTTP 206 Range streaming, Inline preview, Download)  |  |
|  |  - cSync (Disk-to-DB reconciliation engine)                       |  |
|  |  - cApp (Single-page application web shell)                       |  |
|  +-------------------------------------------------------------------+  |
|  | Models: mFolders, mCloudFiles, Users (ohCRUD Core)                |  |
+-------------------------------------------------------------------------+
            |                                               |
     PDO SQLite Queries                              POSIX File I/O
            v                                               v
+-----------------------+                       +-----------------------+
|  SQLite Database      |                       |  Physical Storage     |
|  (/data/data.db)      |                       |  (/storage / symlink) |
|  - Users              |                       |  - Actual file names  |
|  - Folders            |                       |  - Actual directories |
|  - CloudFiles         |                       |  - Direct sync ready  |
+-----------------------+                       +-----------------------+
```

---

## 4. Physical Storage & Synchronization Architecture

### 4.1 Physical File System Layout
1. **Host & Container Volume:**
   - Host path: `./storage`
   - Container mount: `/storage`
   - Symlinked or referenced inside project root.
2. **Path Mirroring:**
   - Physical folder structure on disk directly matches user-created folders:
     ```
     /storage/
     ├── Documents/
     │   ├── Invoices/
     │   │   └── 2026_Q1.pdf
     │   └── Resume.pdf
     ├── Photos/
     │   └── Vacation.jpg
     └── notes.txt
     ```
3. **Collision Safety:**
   - Handled naturally by POSIX filesystem semantics.
   - When uploading a file with an identical name to the same directory, the system provides standard user choices: **Overwrite**, **Keep Both (auto-suffix `_1`)**, or **Cancel**.
4. **Access Protection:**
   - The storage path is never served directly by Nginx. If symlinked under `public/storage`, Nginx explicitly blocks direct requests:
     ```nginx
     location ^~ /storage/ {
         deny all;
         return 404;
     }
     ```
   - All client reads route through `cStream`, which verifies user permissions before streaming.

### 4.2 Disk-to-DB Synchronization Engine ("Quick Sync")
The Quick Sync engine allows users to populate their personal cloud simply by dropping existing directories or gigabytes of files into `./storage` via Finder, terminal, or network share.

- **Trigger Points:**
  - One-click "Sync Files" button in the Altus UI.
  - REST API endpoint: `POST /api/v1/sync`.
  - CLI command: `php public/index.php "/api/v1/sync/"`.
- **Reconciliation Algorithm:**
  1. **Recursive Scan:** Traverses `/storage` ignoring system artifacts (`.DS_Store`, `.git`, temporary files).
  2. **Folder Discovery:** Compares disk directory relative paths with the `Folders` table. Inserts missing folders, establishing parent-child hierarchy.
  3. **File Discovery:** Compares relative file paths (`PATH`) with `CloudFiles`.
     - *New on disk:* Extracts MIME type, file size, modification timestamp (`MTIME`), computes `PATH_HASH` (`sha256(PATH)`), and creates database record.
     - *Modified on disk:* Compares `filemtime()` with stored `MTIME` or size; updates metadata if changed.
     - *Removed from disk:* Flags or deletes corresponding database records.
  4. **Performance & Batching:** Uses a single SQLite transaction with prepared statements for sub-second reconciliation of thousands of files.
  5. **Response Summary:** Returns exact counts:
     ```json
     {
       "status": "success",
       "scanned_files": 412,
       "added_files": 15,
       "updated_files": 2,
       "removed_files": 0,
       "added_folders": 3,
       "duration_ms": 42
     }
     ```

---

## 5. Database Schema & Data Models

### 5.1 Tables

#### 5.1.1 `Users` (ohCRUD Core)
- `ID`: Primary key.
- `USERNAME`: Account username (`admin` for system admin, `user` for Cloud User).
- `EMAIL`: User email address.
- `PASSWORD`: Bcrypt password hash.
- `PERMISSIONS`: Role level:
  - `1`: Framework Administrator (CMS, logs, database execution).
  - `2`: Altus Cloud User (personal file management, UI settings).
- `TOKEN`: API token for programmatic or mobile access.
- `TOTP_SECRET` / `TOTP`: Two-factor authentication status and encrypted secret.
- `STATUS`: Active (`1`) or Inactive (`0`).

#### 5.1.2 `Folders` Table
```sql
CREATE TABLE IF NOT EXISTS `Folders` (
    `ID` INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    `USER_ID` INTEGER NOT NULL,
    `PARENT_ID` INTEGER DEFAULT 0,
    `NAME` TEXT NOT NULL,
    `PATH` TEXT NOT NULL,
    `PATH_HASH` TEXT NOT NULL,
    `COLOR` TEXT DEFAULT '#5f6368',
    `STATUS` INTEGER DEFAULT 1,
    `CDATE` TEXT,
    `MDATE` TEXT,
    `CUSER` INTEGER,
    `MUSER` INTEGER
);

CREATE INDEX IF NOT EXISTS idx_Folders_USER ON Folders (`USER_ID`);
CREATE INDEX IF NOT EXISTS idx_Folders_PARENT ON Folders (`PARENT_ID`);
CREATE UNIQUE INDEX IF NOT EXISTS idx_Folders_PATH_HASH ON Folders (`PATH_HASH`);
CREATE INDEX IF NOT EXISTS idx_Folders_STATUS ON Folders (`STATUS`);
```

#### 5.1.3 `CloudFiles` Table
```sql
CREATE TABLE IF NOT EXISTS `CloudFiles` (
    `ID` INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
    `USER_ID` INTEGER NOT NULL,
    `FOLDER_ID` INTEGER DEFAULT 0,
    `NAME` TEXT NOT NULL,
    `PATH` TEXT NOT NULL,
    `PATH_HASH` TEXT NOT NULL,
    `MIME_TYPE` TEXT NOT NULL,
    `SIZE` INTEGER NOT NULL,
    `EXTENSION` TEXT NOT NULL,
    `MTIME` INTEGER NOT NULL,
    `HASH` TEXT,
    `WIDTH` INTEGER DEFAULT NULL,
    `HEIGHT` INTEGER DEFAULT NULL,
    `DURATION` INTEGER DEFAULT NULL,
    `STATUS` INTEGER DEFAULT 1,
    `IS_FAVORITE` INTEGER DEFAULT 0,
    `CDATE` TEXT,
    `MDATE` TEXT,
    `CUSER` INTEGER,
    `MUSER` INTEGER
);

CREATE INDEX IF NOT EXISTS idx_CloudFiles_USER ON CloudFiles (`USER_ID`);
CREATE INDEX IF NOT EXISTS idx_CloudFiles_FOLDER ON CloudFiles (`FOLDER_ID`);
CREATE UNIQUE INDEX IF NOT EXISTS idx_CloudFiles_PATH_HASH ON CloudFiles (`PATH_HASH`);
CREATE INDEX IF NOT EXISTS idx_CloudFiles_STATUS ON CloudFiles (`STATUS`);
CREATE INDEX IF NOT EXISTS idx_CloudFiles_MIME ON CloudFiles (`MIME_TYPE`);
```

---

## 6. Functional Feature Specifications

### 6.1 Authentication & Security
- **Authentication Flow:** Handled via `ohCRUD\Users`.
  - Web browser: Secure HTTP-only session cookie (`__OHCRUD_SESSION_SECURE_COOKIE__ = true`).
  - Mobile / API client: `Token: <hash><token>` header authentication.
- **Role Isolation:**
  - Cloud User operations require `PERMISSIONS <= 2`.
  - Admin tools (`/ohcrud/admin/`) strictly enforce `PERMISSIONS = 1`.
- **User Account Management in UI:**
  - Password change with current-password verification.
  - TOTP enrollment with QR code (inline SVG) and manual secret verification.
  - TOTP disable with password confirmation.

### 6.2 File & Folder Browser
- **Navigation:**
  - Breadcrumb navigation (`Home / Documents / Projects / 2026`).
  - Single-click or double-click folder traversal.
  - "Up one level" back navigation.
- **View Modes:**
  - **Grid View:** High-visibility cards with preview thumbnails/icons, filename, and size.
  - **List View:** Compact tabular view with columns for Name, Date Modified, Type, Size, and Actions.
  - Preference persisted in `localStorage`.
- **Organization & Customization:**
  - Folder coloring: Assign visual color badges (e.g. Slate, Blue, Emerald, Amber, Crimson, Purple, Coral).
  - Search: Real-time search query filtering active folder contents, with global search option.
  - Sorting: By Name (asc/desc), Date Modified (newest/oldest), Size (largest/smallest).

### 6.3 File Actions
- **Upload:**
  - Full-window Drag-and-drop zone + Upload Button.
  - Multi-file progress queue.
  - Writes directly to the target folder on physical disk and creates the DB record.
- **Download:**
  - Single file download with `Content-Disposition: attachment; filename="<name>"`.
  - Batch download (packaged into a temporary `.zip` archive on the fly).
- **Delete:**
  - Soft-delete or immediate physical deletion option.
- **Rename & Move:**
  - Modal with validation to rename files or folders on disk and DB simultaneously.
  - Move dialog allowing folder tree navigation.

### 6.4 Media Preview & Streaming Engine
- **Byte-Range Media Streaming (HTTP 206):**
  - Full RFC 7233 Range support for audio and video scrubbing/seeking.
  - Chunked read buffer (64KB) preventing PHP memory exhaustion on large files.
- **Inline Previewers:**
  - **Images:** JPG, PNG, WebP, GIF, SVG with zoom/pan modal.
  - **PDF:** Native browser PDF renderer embedded in preview modal.
  - **Audio:** Custom HTML5 audio player (MP3, WAV, OGG, M4A, FLAC) with scrub bar.
  - **Video:** HTML5 video player (MP4, WebM, MOV) with range-seeking.
  - **Text / Code:** Monospace code viewer for TXT, MD, JSON, CSV, LOG, XML.

---

## 7. Responsive UX & Platform Requirements

### 7.1 Viewport Specifications
- **Mobile (< 768px):**
  - Off-canvas slide-out navigation drawer.
  - Floating Action Button (FAB) for fast upload / create folder.
  - Touch targets with minimum dimension of 48px x 48px.
  - Bottom sheet for item actions (Download, Rename, Color, Delete).
- **Tablet (768px - 1023px):**
  - Responsive collapsible sidebar.
  - Adaptive 3-column grid.
- **Desktop (>= 1024px):**
  - Persistent left sidebar with storage stats and navigation.
  - Top header with search bar, view switcher, sync trigger, and account profile.
  - Context menu on right click / item action menu.
  - Keyboard navigation (`Esc` to dismiss modals, arrow keys for media preview navigation).

### 7.2 UI Constraints
- Zero CSS or JS UI frameworks (no Tailwind, Bootstrap, React, Vue).
- All icons from Google Material Symbols / Material Icons.
- Any external JS library must receive user approval before inclusion.
- Visual craft directed by the `impeccable` skill.

---

## 8. RESTful API Specifications

All endpoints return JSON responses following ohCRUD conventions:
```json
{
  "data": {},
  "errors": [],
  "success": true
}
```

### 8.1 API Endpoints Summary

| Endpoint | Method | Permission | Description |
| :--- | :--- | :--- | :--- |
| `/api/v1/auth/login` | `POST` | Public | Authenticate user with credentials. |
| `/api/v1/auth/verify` | `POST` | Public | Verify TOTP code for 2FA session. |
| `/api/v1/auth/logout` | `POST` | Public | Invalidate session. |
| `/api/v1/auth/me` | `GET` | 2 | Get current user profile and permission level. |
| `/api/v1/user/password` | `POST` | 2 | Update user password. |
| `/api/v1/user/totp/setup` | `POST` | 2 | Generate TOTP secret and provisioning URI. |
| `/api/v1/user/totp/verify` | `POST` | 2 | Verify code and activate TOTP. |
| `/api/v1/user/totp/disable` | `POST` | 2 | Disable TOTP with password confirmation. |
| `/api/v1/sync` | `POST` | 2 | Execute disk-to-DB reconciliation scan. |
| `/api/v1/folders` | `GET` | 2 | List folders (filter by `parent_id`). |
| `/api/v1/folders` | `POST` | 2 | Create new folder on disk & in DB. |
| `/api/v1/folders/:id` | `PUT` | 2 | Rename, recolor, or move folder. |
| `/api/v1/folders/:id` | `DELETE`| 2 | Delete folder and contents from disk & DB. |
| `/api/v1/files` | `GET` | 2 | List files in folder with search/sort filters. |
| `/api/v1/files/upload` | `POST` | 2 | Multipart file upload to target folder on disk. |
| `/api/v1/files/:id` | `PUT` | 2 | Rename or move file. |
| `/api/v1/files/:id` | `DELETE`| 2 | Delete file from disk & DB. |
| `/api/v1/files/:id/stream` | `GET` | 2 | Stream file inline with HTTP 206 Range support. |
| `/api/v1/files/:id/download` | `GET`| 2 | Download file with attachment disposition. |

---

## 9. Phased Implementation Tasks

### Phase 1: Environment & Storage Foundation
- [x] **Task 1.1:** Configure storage volume (`./storage` -> `/storage`) in `docker-compose.yml`.
- [x] **Task 1.2:** Update `private/nginx.conf` to deny static access to storage paths.
- [x] **Task 1.3:** Configure upload and POST size limits in `private/PHP-Custom.ini` (e.g. 500M).
- [x] **Task 1.4:** Define new routes in `public/routes.php` (`/api/v1/...` and `/cloud/`).
- [x] **Task 1.5:** Record Phase 1 completion in MCP memory (`altus/phase/1`).

### Phase 2: Database Schema & User Seeding
- [x] **Task 2.1:** Implement `mFolders.php` model with `Folders` table creation, indexing, and path hashes.
- [x] **Task 2.2:** Implement `mCloudFiles.php` model with `CloudFiles` table creation, indexing, and path hashes.
- [x] **Task 2.3:** Seed Cloud User (`USERNAME = user`, `PERMISSIONS = 2`, `STATUS = 1`) alongside existing `admin`.
- [x] **Task 2.4:** Record Phase 2 completion in MCP memory (`altus/phase/2`).

### Phase 3: Disk-to-DB Sync Engine & Core APIs
- [ ] **Task 3.1:** Implement `cSync.php` controller to scan `/storage` and reconcile files/folders with SQLite.
- [ ] **Task 3.2:** Implement `cCloudAuth.php` and `cUserSettings.php` (login, password, TOTP).
- [ ] **Task 3.3:** Implement `cFolders.php` for folder creation, renaming on disk/DB, recoloring, and deletion.
- [ ] **Task 3.4:** Implement `cCloudFiles.php` for file queries, renaming, moving, and deletion.
- [ ] **Task 3.5:** Implement `cStream.php` with HTTP 206 Range support for audio/video seeking and downloads.
- [ ] **Task 3.6:** Implement file upload endpoint writing directly to physical target folder.
- [ ] **Task 3.7:** Record Phase 3 completion in MCP memory (`altus/phase/3`).

### Phase 4: Frontend Development (Impeccable Skill Guided)
- [ ] **Task 4.1:** Invoke the `impeccable` skill to establish design direction, tokens, typography, and layout structure in **Operate** mode.
- [ ] **Task 4.2:** Integrate Material Symbols / Material Icons font assets.
- [ ] **Task 4.3:** Build responsive app shell (`public/themes/altus/` or view template) with desktop sidebar and mobile off-canvas drawer.
- [ ] **Task 4.4:** Build Vanilla ES6+ state manager (`altus.js`) handling folder navigation, view switching (Grid/List), sorting, and search.
- [ ] **Task 4.5:** Implement folder rendering with custom color badges.
- [ ] **Task 4.6:** Implement file grid and list view renderers.
- [ ] **Task 4.7:** Record Phase 4 completion in MCP memory (`altus/phase/4`).

### Phase 5: File Operations & Interactions
- [ ] **Task 5.1:** Implement Drag & Drop upload with visual overlay and progress queue.
- [ ] **Task 5.2:** Build folder creation modal with color palette picker.
- [ ] **Task 5.3:** Build rename and move modals with inline validation.
- [ ] **Task 5.4:** Implement "Sync Files" button in UI connected to `/api/v1/sync` with instant toast feedback.
- [ ] **Task 5.5:** Implement single and batch download triggers.
- [ ] **Task 5.6:** Implement delete confirmation and action sheets for mobile.
- [ ] **Task 5.7:** Record Phase 5 completion in MCP memory (`altus/phase/5`).

### Phase 6: Media Preview System
- [ ] **Task 6.1:** Build accessible preview modal with backdrop and keyboard shortcuts (`Esc`, arrows).
- [ ] **Task 6.2:** Implement image previewer with pan/zoom.
- [ ] **Task 6.3:** Implement embedded PDF viewer.
- [ ] **Task 6.4:** Implement HTML5 audio player with scrub bar and volume controls.
- [ ] **Task 6.5:** Implement HTML5 video player utilizing HTTP 206 Range streaming.
- [ ] **Task 6.6:** Implement text and code viewer.
- [ ] **Task 6.7:** Record Phase 6 completion in MCP memory (`altus/phase/6`).

### Phase 7: Account Settings & Security Audit
- [ ] **Task 7.1:** Build account settings panel for password updates and TOTP enrollment/deactivation.
- [ ] **Task 7.2:** Audit all routes to verify permission enforcement (`PERMISSIONS <= 2`).
- [ ] **Task 7.3:** Verify path traversal immunity across all disk-touching endpoints.
- [ ] **Task 7.4:** Test mobile responsiveness on simulated touch viewports.
- [ ] **Task 7.5:** Record Phase 7 completion in MCP memory (`altus/phase/7`).

---

## 10. Acceptance Criteria & Verification
1. **Physical Filesystem Parity:** Adding a file or folder manually to `./storage` on the host and clicking "Sync Files" registers it in the SQLite database and displays it in the browser in under 200ms.
2. **Access Control:** Direct access to `/storage/*` via browser or cURL without session or Token results in `401 Unauthorized` or `404 Not Found`.
3. **Role Enforcement:** User with `PERMISSIONS = 2` cannot access `/ohcrud/admin/` or administrative DB methods (`403 Forbidden`).
4. **Media Streaming:** Large MP4 videos seek smoothly across timestamps without downloading the full file first.
5. **Craft & Performance:** Zero UI framework dependencies; client assets remain under 60KB uncompressed; design adheres to the `impeccable` standard.
