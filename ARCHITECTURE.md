# Altus Personal Cloud — System Architecture

This document details the architectural design, request lifecycle, database schema, physical storage invariants, and synchronization flows of **Altus Personal Cloud**.

---

## 1. Core Architectural Pillars

1. **Direct Physical Filesystem Parity:** Files and directories in `./storage` (mounted to `/storage` in Docker) mirror their exact names and hierarchy on the host disk. No synthetic UUID directories or hash-obfuscated filenames exist on the filesystem.
2. **Deterministic Path Hashing (`PATH_HASH`):** Both `Folders` and `CloudFiles` store the normalized relative POSIX path (`PATH`) alongside its SHA-256 digest (`PATH_HASH`) backed by a `UNIQUE` SQLite index, enabling $O(1)$ path lookups at any folder depth.
3. **Sub-Second "Quick Sync" Engine:** Changes made directly on the host filesystem (via Finder, `rsync`, SMB, or CLI) are reconciled into SQLite inside a single atomic transaction via `cSync`.
4. **Zero Static Storage Exposure:** Nginx strictly blocks direct HTTP requests to `/storage/` (`deny all; return 404;`). All file downloads, inline previews, and media streams pass through ohCRUD authentication and `cStream`.
5. **Zero Third-Party UI Frameworks:** The Single-Page Application (SPA) is built exclusively with semantic HTML5, Vanilla CSS3 custom properties, modern Vanilla ES6+ JavaScript, and self-hosted Google Material Symbols.

---

## 2. High-Level System Topology

```mermaid
flowchart TD
    subgraph Clients["Client Layer"]
        Browser["Desktop & Mobile Web SPA (AltusApp ES6+)"]
        APIClient["REST / CLI Clients (Token Auth)"]
    end

    subgraph Proxy["Reverse Proxy Layer (Nginx)"]
        Nginx["Nginx (Ports 80 / 443 TLS)"]
        StaticAssets["Static Assets (/themes/altus/assets/)"]
        StorageDeny["/storage/ Access Guard (HTTP 404 Deny All)"]
    end

    subgraph App["Application Layer (PHP 8.2-FPM / ohCRUD v2.6)"]
        Router["ohCRUD Router (Session & Token Auth, Permissions)"]
        cApp["cApp (SPA Shell Bootstrap)"]
        cCloudAuth["cCloudAuth & cUserSettings (Auth, Password, TOTP 2FA)"]
        cFolders["cFolders (CRUD, Recursive Cascades, Favorites)"]
        cCloudFiles["cCloudFiles (Upload, Move, Rename, Favorites)"]
        cStream["cStream (RFC 7233 HTTP 206 Byte-Range & ZIP)"]
        cSync["cSync (Disk-to-DB Quick Sync Engine)"]
        Models["Models (mFolders, mCloudFiles, Users)"]
    end

    subgraph Persistence["Storage & Persistence Layer"]
        SQLite[("SQLite 3 Database (./data.sqlite3)")]
        Disk[("Physical Filesystem (./storage)")]
    end

    Browser -->|"HTTPS / Session Cookie"| Nginx
    APIClient -->|"HTTPS / Token Header"| Nginx

    Nginx -->|"Static CSS/JS/Fonts"| StaticAssets
    Nginx -.->|"Blocked Direct Access"| StorageDeny
    Nginx -->|"FastCGI (Port 9000)"| Router

    Router --> cApp
    Router --> cCloudAuth
    Router --> cFolders
    Router --> cCloudFiles
    Router --> cStream
    Router --> cSync

    cCloudAuth --> Models
    cFolders --> Models
    cCloudFiles --> Models
    cStream --> Models
    cSync --> Models

    Models -->|"PDO Prepared Statements"| SQLite
    cFolders -->|"POSIX mkdir / rename / rmdir"| Disk
    cCloudFiles -->|"Multipart Write / rename / unlink"| Disk
    cStream -->|"64 KB Chunked Read Stream"| Disk
    cSync -->|"Recursive Directory Scan"| Disk
```

---

## 3. Database Schema & Entity Relationships

Altus uses SQLite 3 (`./data.sqlite3`) in Write-Ahead Logging (WAL) compatible mode. All cloud accounts share the global physical `/storage` hierarchy, indexed by `PATH_HASH` (`sha256(strtolower(PATH))`).

```mermaid
erDiagram
    USERS {
        int ID PK
        string USERNAME
        string EMAIL
        string PASSWORD "Bcrypt hash"
        int PERMISSIONS "1 = Admin, 2 = Cloud User"
        string TOKEN "API Token"
        int TOTP "0 = Disabled, 1 = Enabled"
        string TOTP_SECRET "Encrypted RFC 6238 secret"
        int STATUS "1 = Active, 0 = Inactive"
    }

    FOLDERS {
        int ID PK
        int USER_ID FK
        int PARENT_ID FK "0 for root folders"
        string NAME "COLLATE NOCASE"
        string PATH "Relative POSIX path"
        string PATH_HASH UK "SHA-256 of normalized path"
        string COLOR "Hex badge color"
        int IS_FAVORITE "0 or 1"
        int STATUS "1 = Active, 0 = Soft-deleted"
        string CDATE
        string MDATE
    }

    CLOUDFILES {
        int ID PK
        int USER_ID FK
        int FOLDER_ID FK "0 for root files"
        string NAME "COLLATE NOCASE"
        string PATH "Relative POSIX path"
        string PATH_HASH UK "SHA-256 of normalized path"
        string MIME_TYPE
        int SIZE "Bytes"
        string EXTENSION
        int MTIME "Unix modification timestamp"
        int IS_FAVORITE "0 or 1"
        int STATUS "1 = Active, 0 = Soft-deleted"
        string CDATE
        string MDATE
    }

    USERS ||--o{ FOLDERS : "creates / modifies"
    USERS ||--o{ CLOUDFILES : "uploads / modifies"
    FOLDERS ||--o{ FOLDERS : "parent of (PARENT_ID)"
    FOLDERS ||--o{ CLOUDFILES : "contains (FOLDER_ID)"
```

---

## 4. Key Operational Workflows

### 4.1 Disk-to-Database Synchronization ("Quick Sync")

When files or directories are added, modified, or removed directly inside `./storage` on the host machine, `POST /api/v1/sync` (`cSync`) reconciles the filesystem with SQLite in a single database transaction:

```mermaid
sequenceDiagram
    participant Client as Web UI / CLI / API
    participant cSync as cSync Controller
    participant Disk as Physical Storage (/storage)
    participant DB as SQLite (Folders & CloudFiles)

    Client->>cSync: POST /api/v1/sync
    cSync->>Disk: Recursively scan directories & files (skip dotfiles)
    Disk-->>cSync: Physical paths, sizes, mtimes, MIME types
    cSync->>DB: BEGIN TRANSACTION
    cSync->>DB: Load all existing Folders & CloudFiles (Active + Inactive)

    loop Each Physical Directory
        alt New Path Hash
            cSync->>DB: INSERT into Folders (STATUS = 1)
        else Previously Soft-Deleted (STATUS = 0)
            cSync->>DB: UPDATE Folders SET STATUS = 1, PARENT_ID, NAME
        end
    end

    loop Each Physical File
        alt New Path Hash
            cSync->>DB: INSERT into CloudFiles (STATUS = 1)
        else Previously Soft-Deleted (STATUS = 0)
            cSync->>DB: UPDATE CloudFiles SET STATUS = 1, SIZE, MTIME, FOLDER_ID
        else Modified on Disk (SIZE or MTIME changed)
            cSync->>DB: UPDATE CloudFiles SET SIZE, MTIME, MIME_TYPE
        end
    end

    loop Active DB Records Missing on Disk
        cSync->>DB: UPDATE Folders / CloudFiles SET STATUS = 0
    end

    cSync->>DB: COMMIT TRANSACTION
    cSync-->>Client: JSON Summary (scanned, added, updated, removed, duration_ms)
```

### 4.2 Recursive Folder Move & Rename Cascading

Because physical paths mirror database records, renaming or moving a folder cascades across both the filesystem and all descendant records in SQLite:

```mermaid
flowchart LR
    Request["PUT /api/v1/folders/:id"] --> Validate["Validate Target & Check Circular Move"]
    Validate --> DiskMove["POSIX rename(oldDiskPath, newDiskPath)"]
    DiskMove --> UpdateFolder["Update Target Folder PATH, PATH_HASH & PARENT_ID"]
    UpdateFolder --> CascadeChildren["Recursively Update Descendant Folders & CloudFiles PATH and PATH_HASH"]
    CascadeChildren --> Response["Return Updated Folder JSON"]
```

### 4.3 RFC 7233 HTTP 206 Byte-Range Media Streaming

To support instant video/audio scrubbing without exhausting PHP memory limits, `cStream` implements chunked byte-range responses:

```mermaid
sequenceDiagram
    participant Player as Browser Media Player / Viewer
    participant Nginx as Nginx Reverse Proxy
    participant cStream as cStream Controller
    participant Disk as Physical File (/storage/...)

    Player->>Nginx: GET /api/v1/files/:id/stream (Range: bytes=1048576-)
    Nginx->>cStream: FastCGI Request
    cStream->>cStream: Verify Session/Token & Lookup CloudFiles Record
    cStream->>Disk: fopen() & fseek(1048576)
    cStream-->>Player: HTTP 206 Partial Content (Content-Range, Accept-Ranges: bytes)
    loop 64 KB Buffer Chunks
        Disk-->>cStream: fread(65536)
        cStream-->>Player: Flush chunk to output stream
    end
```

---

## 5. Frontend SPA Architecture (`AltusApp`)

The frontend resides in `public/themes/altus/` and runs as a zero-dependency Single-Page Application:

- **HTML Shell (`public/themes/altus/index.html`):** Semantic layout containing the desktop sidebar, mobile off-canvas drawer, breadcrumb header, grid/list viewport container, context menus, action modals, and media theater previewer.
- **Theme Engine (`public/themes/altus/assets/css/altus.css`):** Tokenized design system using CSS custom properties under `:root` (Light Mode) and `[data-theme="dark"]` (Dark Mode), paired with an inline `<head>` script for FOUC-free startup.
- **State & View Controller (`public/themes/altus/assets/js/altus.js`):**
  - Manages active folder navigation (`currentFolderId`), breadcrumb stack, view mode (`grid` vs `list`), sort state (`name_asc`, `mtime_desc`, `size_desc`, etc.), and active filters (`favorites`, `search`).
  - Handles sequential/parallel multipart file uploads with live progress bars and collision resolution modals.
  - Orchestrates the media theater previewer with keyboard navigation (`Esc`, `ArrowLeft`, `ArrowRight`) and pan/zoom image inspection.
