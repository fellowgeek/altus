# Altus Personal Cloud

**Altus** is a fast, lightweight, self-hosted personal cloud storage system built on the **ohCRUD** PHP microframework (v2.6) and **SQLite 3**, paired with a zero-framework Vanilla ES6+ Single-Page Application (SPA).

Modeled after the core file-management workflows of Google Drive and Nextcloud, Altus provides direct physical filesystem parity, sub-second disk-to-database synchronization ("Quick Sync"), RFC 7233 HTTP 206 media streaming, inline theater previews, and TOTP two-factor authentication without framework bloat.

> For a deep dive into the system topology, database schema, Quick Sync sequence flows, and Mermaid architecture diagrams, see **[`ARCHITECTURE.md`](ARCHITECTURE.md)**.

---

## Key Features

### File & Folder Organization
- **Direct Physical Filesystem Parity:** Files and directories in `./storage` directly mirror their actual names and hierarchy on disk without synthetic UUID directories or hash-obfuscated filenames.
- **Hierarchical Navigation:** Interactive breadcrumb trail, folder tree traversal, and instant view switching between high-visibility **Grid View** and compact **List View**.
- **Recursive Folder Cascades:** Moving or renaming a folder updates the physical directory on disk and atomically cascades path updates across all nested subfolders and files in SQLite while preventing circular moves.
- **Custom Folder Colors:** Color-code folders using a built-in palette (Slate, Red, Orange, Yellow, Green, Blue, Indigo, Violet) from the creation modal, desktop context menu, or mobile action sheet.
- **Favorites & Search:** Star important files and folders for quick access in the dedicated **Favorites** view, filter active directories in real time, and sort by Name, Date Modified, or Size.

### Uploads, Downloads & Sync
- **Sub-Second "Quick Sync" Engine:** Drop existing folders or gigabytes of files directly into `./storage` via Finder, `rsync`, SMB, or terminal and reconcile the physical disk state into SQLite in milliseconds.
- **Drag-and-Drop Upload Queue:** Full-window drag-and-drop target and multi-file upload queue supporting payloads up to `500 MB` per request.
- **Collision Resolution:** Uploading a file with an existing filename prompts for **Overwrite**, **Keep Both** (auto-suffixed), or **Cancel**.
- **Single & Batch ZIP Downloads:** Download individual files with `Content-Disposition: attachment` or package multiple selected files and folders into an on-the-fly `.zip` archive.

### Media Streaming & Inline Theater Previews
- **HTTP 206 Partial Content Streaming:** Streams large video and audio files using a fixed `64 KB` chunked read buffer (`Range: bytes=start-end`), enabling instant scrubbing and seeking without exhausting PHP memory limits.
- **Built-In Preview Modal:**
  - **Video:** HTML5 player (`MP4`, `WebM`, `MOV`) with byte-range seeking.
  - **Audio:** Custom audio player (`MP3`, `WAV`, `OGG`, `M4A`, `FLAC`) with scrub bar and volume controls.
  - **Images:** Interactive viewer (`JPG`, `PNG`, `WebP`, `GIF`, `SVG`) with zoom and pan controls.
  - **Documents & Code:** Embedded native `PDF` viewer and monospace viewer for text/code files (`TXT`, `MD`, `JSON`, `CSV`, `LOG`, `XML`, etc.).

### Security & Responsive UX
- **Zero Static Storage Exposure:** Nginx strictly blocks direct HTTP access to `/storage/` (`deny all; return 404;`). All file access passes through ohCRUD authentication and `cStream`.
- **Authentication & TOTP 2FA:** Session-based web authentication (`HttpOnly` cookies), `Token` header authentication for API clients, bcrypt password management, and RFC 6238 TOTP Two-Factor Authentication with client-side QR code enrollment.
- **Adaptive Multi-Device Layout:** Persistent desktop sidebar (`>= 1024px`), collapsible tablet grid (`768px - 1023px`), and mobile-first ergonomics (`< 768px`) featuring an off-canvas drawer, Floating Action Button (FAB), bottom action sheets, and $\ge 48 \times 48\text{ px}$ touch targets.
- **Light & Dark Themes:** Zero third-party UI frameworks; built with semantic HTML5, Vanilla CSS3 custom properties, and synchronous `<head>` theme initialization to prevent Flash of Unstyled Content (FOUC).

---

## Repository Structure

```text
altus/
├── docker-compose.yml                     # Multi-container setup (Nginx, PHP 8.2-FPM, Composer)
├── data.sqlite3                           # Primary SQLite database (mounted to /data/data.sqlite3)
├── storage/                               # Physical file store (mounted to /storage)
├── ARCHITECTURE.md                        # System topology, ER schema & workflow Mermaid diagrams
├── AGENTS.md                              # Developer & AI agent operational guide
├── DESIGN.md                              # Design system tokens, typography, and layout specs
├── PRODUCT.md                             # Product positioning and architectural constraints
├── PRD.md                                 # Product Requirements Document & phase history
├── private/
│   ├── nginx.conf                         # Reverse proxy, TLS, FastCGI & /storage/ access block
│   ├── PHP.Dockerfile                     # PHP 8.2-FPM image (SQLite, GD, EXIF, Zip, Mbstring)
│   ├── PHP-Custom.ini                     # 500M upload/POST limits & 300s execution timeouts
│   └── hurl/                              # Hurl HTTP integration test suite
└── public/
    ├── index.php                          # Application entrypoint
    ├── routes.php                         # URL route registration table
    ├── settings.php                       # Runtime configuration & environment settings
    ├── ohcrud/                            # Core microframework (Core, DB, Router, Users)
    ├── app/
    │   ├── controllers/                   # REST API & SPA controllers (cApp, cSync, cStream, etc.)
    │   └── models/                        # SQLite schemas & business logic (mFolders, mCloudFiles)
    └── themes/altus/                      # Vanilla SPA frontend
        ├── index.html                     # Semantic HTML5 shell, modals & preview theater
        └── assets/
            ├── css/altus.css              # Design tokens, responsive grid & light/dark themes
            ├── js/altus.js                # AltusApp ES6+ state manager, upload queue & previewer
            ├── js/qrcode.min.js           # Standalone QR generator for TOTP 2FA enrollment
            └── fonts/                     # Self-hosted Material Symbols Outlined woff2 font
```

---

## Getting Started

### Prerequisites
- **Docker** and **Docker Compose** (recommended for containerized deployment)
- Or a local stack with **PHP >= 8.2** (`pdo_sqlite`, `mbstring`, `gd`, `exif`, `zip`, `curl`), **SQLite 3**, **Composer**, and **Nginx**

### Quick Start with Docker Compose

1. **Start the application stack:**
   ```bash
   docker compose up -d
   ```
   This builds the `php` (PHP 8.2-FPM) service, runs `composer install` via `composer_installation`, and launches `web` (Nginx) on ports `80` and `443`.

2. **Verify mounted volumes:**
   - `./public` $\rightarrow$ `/app`
   - `./storage` $\rightarrow$ `/storage`
   - `./data.sqlite3` $\rightarrow$ `/data/data.sqlite3`
   - `./logs` $\rightarrow$ `/logs`

3. **Open Altus in your browser:**
   - Web UI: `http://localhost/cloud/` or `https://localhost/cloud/`

### Default Accounts & Permission Levels

| Role | Username | Permission Level | Capabilities |
| :--- | :--- | :---: | :--- |
| **Cloud User** | `user` | `2` | Full access to Altus personal cloud storage, file streaming, Quick Sync, and account security settings. |
| **Administrator** | `admin` | `1` | Full access to both Altus personal cloud and underlying ohCRUD administrative endpoints. |

> **Security Note:** Update default passwords and enroll in TOTP Two-Factor Authentication immediately via the **Account Settings** modal after first login.

---

## Disk-to-Database Synchronization ("Quick Sync")

Because Altus preserves direct physical filesystem parity inside `./storage`, you can copy, move, or `rsync` files directly on the host machine without using the web uploader:

```bash
cp -R ~/Pictures/Vacation ./storage/Photos/
```

Then reconcile the physical disk with SQLite using any of three methods:

1. **Web UI:** Click the **Sync Files** button in the top header bar.
2. **CLI (inside Docker):**
   ```bash
   docker compose exec php php /app/index.php "/api/v1/sync/"
   ```
3. **REST API:**
   ```bash
   curl -X POST http://localhost/api/v1/sync \
     -H "Token: <YOUR_API_TOKEN>"
   ```

---

## RESTful API Reference

All API endpoints return standardized JSON payloads:

```json
{
  "data": {},
  "errors": [],
  "success": true
}
```

### Endpoints (`/api/v1`)

| Endpoint | Method | Auth Level | Description |
| :--- | :---: | :---: | :--- |
| `/api/v1/auth/login` | `POST` | Public | Authenticate user with username & password. |
| `/api/v1/auth/verify` | `POST` | Public | Verify 6-digit TOTP code to complete 2FA login. |
| `/api/v1/auth/logout` | `POST` | Public | Destroy active session. |
| `/api/v1/auth/me` | `GET` | `<= 2` | Retrieve current authenticated user profile & storage usage. |
| `/api/v1/user/password` | `POST` | `<= 2` | Update account password (requires current password). |
| `/api/v1/user/totp/setup` | `POST` | `<= 2` | Generate TOTP secret and `otpauth://` provisioning URI. |
| `/api/v1/user/totp/verify` | `POST` | `<= 2` | Verify TOTP code and activate 2FA on the account. |
| `/api/v1/user/totp/disable` | `POST` | `<= 2` | Disable TOTP 2FA (requires password confirmation). |
| `/api/v1/sync` | `POST` | `<= 2` | Run Disk-to-DB Quick Sync reconciliation scan. |
| `/api/v1/folders` | `GET` | `<= 2` | List folders (`parent_id`, `favorites`, `tree`, `sort`). |
| `/api/v1/folders` | `POST` | `<= 2` | Create a new physical directory and `Folders` DB record. |
| `/api/v1/folders/:id` | `PUT` | `<= 2` | Rename, recolor, or move a folder with recursive child cascading. |
| `/api/v1/folders/:id` | `DELETE` | `<= 2` | Delete a folder and all nested contents from disk and DB. |
| `/api/v1/folders/:id/favorite` | `POST` | `<= 2` | Toggle favorite status (`{"is_favorite": true\|false}`). |
| `/api/v1/files` | `GET` | `<= 2` | List files (`folder_id`, `search`, `favorites`, `sort`). |
| `/api/v1/files/upload` | `POST` | `<= 2` | Multipart file upload to target folder with collision mode. |
| `/api/v1/files/:id` | `PUT` | `<= 2` | Rename or move a file on disk and in SQLite. |
| `/api/v1/files/:id` | `DELETE` | `<= 2` | Delete a file from disk and SQLite. |
| `/api/v1/files/:id/favorite` | `POST` | `<= 2` | Toggle favorite status (`{"is_favorite": true\|false}`). |
| `/api/v1/files/:id/stream` | `GET` | `<= 2` | Stream file inline with RFC 7233 HTTP 206 Byte-Range support. |
| `/api/v1/files/:id/download` | `GET` | `<= 2` | Download single file as attachment (`Content-Disposition`). |
| `/api/v1/stream/batchDownload` | `GET` | `<= 2` | Stream an on-the-fly `.zip` archive of multiple files/folders. |

---

## Testing & Verification

Integration tests are powered by [Hurl](https://hurl.dev/) and located in `private/hurl/`:

```bash
cd private/hurl && ./test.sh
```

---

## Documentation & Project References

- **[`ARCHITECTURE.md`](ARCHITECTURE.md):** System topology, SQLite ER diagram, Quick Sync sequence flow, and HTTP 206 streaming Mermaid diagrams.
- **[`AGENTS.md`](AGENTS.md):** Comprehensive developer and AI agent handbook, architectural invariants, and modification playbooks.
- **[`PRD.md`](PRD.md):** Full Product Requirements Document, database schemas, and phased implementation log.
- **[`DESIGN.md`](DESIGN.md):** Design system tokens, color palettes, typography scale, and responsive layout specifications.
- **[`PRODUCT.md`](PRODUCT.md):** Product definition, target users, and UI conventions.
- **[`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md):** Underlying ohCRUD microframework reference documentation.

---

## License

Altus Personal Cloud and the underlying ohCRUD microframework are open-source software licensed under the [MIT License](LICENSE).