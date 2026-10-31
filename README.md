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
├── setup.sh                              # Native Ubuntu / PHP >= 8.4 installation
├── docker-compose.yml                     # Multi-container setup (Nginx, PHP 8.4-FPM, Composer)
├── data.sqlite3                           # Primary SQLite database (mounted to /data/data.sqlite3)
├── storage/                               # Physical file store (mounted to /storage)
├── ARCHITECTURE.md                        # System topology, ER schema & workflow Mermaid diagrams
├── AGENTS.md                              # Developer & AI agent operational guide
├── DESIGN.md                              # Design system tokens, typography, and layout specs
├── PRODUCT.md                             # Product positioning and architectural constraints
├── PRD.md                                 # Product Requirements Document & phase history
├── private/
│   ├── nginx.conf                         # Reverse proxy, TLS, FastCGI & /storage/ access block
│   ├── PHP.Dockerfile                     # PHP 8.4-FPM image (SQLite, GD, EXIF, Zip, Mbstring)
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

### Recommended deployment: Ubuntu + PHP-FPM

Target a maintained Ubuntu-based Linux server with **PHP 8.4 or newer**, Nginx,
and local SQLite storage. Use a supported PHP series with current security updates.
`setup.sh` installs PHP CLI/FPM, SQLite, GD, EXIF, mbstring, XML/DOM, cURL, ZIP,
Composer dependencies, and filesystem ACL tools. It does **not** install or change
Nginx, TLS certificates, firewall rules, or Tailscale.

1. Clone the repository as your normal deployment user. Keep the checkout outside
   the Nginx document root; only its `public/` directory will be served. Run setup
   from the checkout:

   ```bash
   chmod +x setup.sh
   sudo ./setup.sh
   ```

   The default PHP package series is `8.4`. To use another available series:

   ```bash
   sudo ./setup.sh --php-version 8.5
   ```

   Ubuntu releases provide different PHP versions. The script checks the configured
   APT repositories and stops if the requested packages are unavailable. Configure
   a trusted package source first, or explicitly opt into the third-party
   [Ondřej Surý PHP PPA](https://launchpad.net/~ondrej/+archive/ubuntu/php):

   ```bash
   sudo ./setup.sh --php-version 8.4 --add-php-ppa
   ```

   Verified combinations are Ubuntu 24.04 / PHP 8.4 with the opt-in PPA, and
   Ubuntu 26.04 / PHP 8.5 from the distribution repositories.

   No third-party repository is added without that option. `--deploy-user USER`
   selects the non-root checkout owner when `SUDO_USER` is unavailable. Composer
   runs as that user, installs the committed lockfile, and disables plugins/scripts.
   Run `./setup.sh --help` for all options.

2. Review the generated installation:

   | Location | Purpose |
   | :--- | :--- |
   | `public/settings.php` | Production SQLite configuration and generated installation secret; preserved on reruns |
   | `var/data.sqlite3` | Database, outside the web root; newly initialized with users and the CMS landing page |
   | `var/log/`, `var/cache/`, `var/tmp/`, `var/sessions/` | Runtime data writable by the dedicated `altus` service account |
   | `var/initial-credentials.txt` | Unique initial passwords for `admin` and `user`; readable only by root after setup |
   | `storage/` | Cloud files, optionally a symlink to another disk |
   | `public/global/files/`, `public/global/minified/` | Writable CMS upload/asset directories; separate from private cloud storage |

   Retrieve the initial passwords locally, store them securely, and remove the
   credentials file when no longer needed:

   ```bash
   sudo cat var/initial-credentials.txt
   sudo rm var/initial-credentials.txt
   ```

   Setup creates a dedicated `altus` PHP-FPM pool at
   `/etc/php/<version>/fpm/pool.d/altus.conf`, listening on `/run/php/altus.sock`.
   It tests the FPM configuration, enables the selected service, and restarts it.
   This restart also affects other pools in the same PHP service. `--no-start`
   skips service activation for image builds; configuration validation still runs.
   Setup refuses to create a second Altus pool under another PHP version. Disable
   the old pool before switching versions, then rerun setup and start the new one.

3. Configure Nginx and HTTPS using the next sections, then open `/`. The main
   **Open cloud** button leads to `/cloud/`; footer **Login** leads to CMS
   administration. Sign in with the generated credentials, change passwords, and
   enroll in TOTP two-factor authentication in account settings.

The script is safe to rerun for dependency installation: it retains settings,
account passwords, and CMS content. It does not migrate an existing Docker
installation automatically. Production debug mode and raw SQL execution are off;
secure session cookies require HTTPS. No known default passwords are published.

### Storage on a separate disk

Mount your data volume persistently before running setup. Choose a dedicated
subdirectory on it, then supply its absolute path through `--storage`:

```bash
# Set this to your mounted data volume's dedicated Altus directory.
STORAGE_DIR="$(realpath -m ../altus-files)"
sudo ./setup.sh --storage "$STORAGE_DIR"
readlink -f storage
```

Include the same `--php-version` option if you selected a different PHP series.
The target may already contain files. Setup adds access/default ACLs for the
`altus` account to its existing files/directories without changing their owners
or following nested symlinks. ACL-capable storage is required. Files later copied
with tools that preserve restrictive ACLs/modes may need their permissions repaired.
Parent directories receive traversal access only. The web process can read the
application code but needs write access only to runtime/upload directories.

Setup replaces an empty `storage/` (or one containing only `.gitkeep`) with a
symlink. It refuses to replace populated storage or a link pointing elsewhere.
For an existing library, stop writes, back up the data, copy it to the mounted
volume, verify the copy, then replace `storage/` with the symlink yourself before
rerunning setup. Keep the database and credentials with the installation; linking
storage alone does not move account metadata, favorites, or the folder index.
Run **Sync Files** after importing files. Do not create an Nginx `alias` to storage.

Keep SQLite on a local filesystem, not an SMB/NFS share. For a separately mounted
storage volume, add an FPM systemd override with `RequiresMountsFor=` set to the
resolved storage target so the service cannot start against an unmounted directory.
Use `sudo systemctl edit php8.4-fpm` (adjust the version), then daemon-reload and
restart that service. A symlink alone does not guarantee the disk is mounted.

### Private access with Tailscale (recommended)

Prefer a private LAN/VLAN or an authenticated VPN over direct Internet exposure.
**Tailscale is a mesh VPN, not a VLAN**: it supplies a private network between your
approved devices. Keep application authentication and TOTP enabled even inside
that network.

A straightforward deployment is:

```text
Your device → Tailscale HTTPS → loopback Nginx → Altus PHP-FPM socket
```

Install and authenticate Tailscale using its
[Linux installation instructions](https://tailscale.com/docs/install/linux),
restrict access to the server with your tailnet access policy, and use
[Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve) to expose
only the local Nginx listener to your tailnet:

```bash
sudo tailscale up
sudo tailscale serve --bg http://127.0.0.1:8080
sudo tailscale serve status
```

Enable tailnet HTTPS when prompted. Visit the HTTPS URL reported by Serve; do not
use the loopback HTTP URL for browser login because session cookies are secure.
Do **not** enable Tailscale Funnel for this private service: Funnel publishes it
to the Internet. Do not forward router ports or open public inbound 80/443 for
this loopback setup. Preserve your SSH access when applying any firewall changes.
The installer deliberately leaves network policy to the server operator.

### Nginx configuration

The supplied [`private/nginx.native.conf`](private/nginx.native.conf) is a complete
server-block example for the Tailscale Serve arrangement. It binds only to
`127.0.0.1:8080`, sends dynamic routes to `public/index.php`, serves frontend assets,
blocks direct storage access, and prevents execution of other PHP files.
It also avoids serving application source, templates, or Composer manifests.

Install Nginx separately if it is not already present. Render the template from
the project root, review it, and enable it in your existing Nginx configuration:

```bash
ALTUS_ROOT="$(pwd -P)"
sed "s|@ALTUS_ROOT@|$ALTUS_ROOT|g" private/nginx.native.conf > /tmp/altus-nginx.conf
sudo install -m 0644 /tmp/altus-nginx.conf /etc/nginx/sites-available/altus
sudo ln -s /etc/nginx/sites-available/altus /etc/nginx/sites-enabled/altus
sudo nginx -t
sudo systemctl reload nginx
```

If the site is already enabled, retain its existing symlink rather than recreating
it. Merge the example with your current configuration where appropriate. The
socket is accessible to Ubuntu's usual Nginx worker account, `www-data`; adapt
`listen.owner`/`listen.group` and static-file ACLs if your Nginx uses another user.

For **Nginx-managed TLS** on a private LAN or Tailscale address, replace the loopback
listener with a listener bound to that private address, set your actual
`server_name`, configure `ssl_certificate` and `ssl_certificate_key`, and replace
`fastcgi_param HTTPS on;` with `fastcgi_param HTTPS $https;`. Provision and renew a
trusted certificate. Keep the FastCGI socket, routing, source-file protection, and
this storage guard:

```nginx
location ^~ /storage/ {
    deny all;
    return 404;
}
```

Do not point Nginx at the project root. Do not enable a generic PHP handler that
executes uploaded files. The example's forced `HTTPS on` is appropriate only behind
the trusted local TLS-terminating proxy; it is not a way to make public HTTP secure.
Nginx and PHP allow a 500 MB file plus multipart overhead (512 MB request limit).
Long PHP requests have a 300-second limit; tune pool concurrency/memory for the
server. Public Internet exposure, if unavoidable, also needs trusted TLS, firewall
rules, timely security updates, and deliberate review of the administrator surface.

### Verification, updates, and backups

After setup and Nginx configuration:

```bash
sudo systemctl status php8.4-fpm  # use the selected PHP series
sudo nginx -t
curl -I http://127.0.0.1:8080/
curl -I http://127.0.0.1:8080/storage/test.txt  # must return 404
```

Use the private HTTPS URL to verify login, upload/download, previews, and Quick
Sync. Check `var/log/php-error.log` and your Nginx logs for permission errors. Use
`namei -l storage` and `getfacl storage` to inspect traversal and ACLs.

Before updates, stop application writes and back up **all three**: the SQLite
metadata, `public/settings.php` (especially its secret), and physical storage.
Use SQLite's backup command instead of copying a live database file blindly:

```bash
BACKUP_DIR="var/backups/$(date +%Y%m%d-%H%M%S)"
sudo install -d -o altus -g altus -m 0700 "$BACKUP_DIR"
sudo -u altus sqlite3 var/data.sqlite3 ".backup '$BACKUP_DIR/data.sqlite3'"
sudo install -m 0600 public/settings.php "$BACKUP_DIR/settings.php"
```

Protect backups as secrets and keep an off-server copy, including the storage
contents. Restore the secret with its database: changing it breaks password
verification and encrypted tokens/TOTP secrets. For a Docker migration, stop the
old instance, copy its database into `var/data.sqlite3`, adapt paths in settings
using the native sample while **preserving its original secret**, and move/link
storage. If the old secret is a placeholder, rotate it and reset the affected
passwords/tokens/TOTP in a controlled migration first; setup rejects placeholder
secrets. Never run both deployments against the same writable database.

After pulling trusted updates as the deployment user, rerun setup with the same
options. It refreshes locked dependencies and the managed FPM pool; it is not a
schema-migration system for arbitrary future releases. Read release-specific
migration instructions before upgrading.

### Docker development environment

The existing Docker Compose configuration remains available for development with
PHP 8.4-FPM. It uses different container paths: `./public` → `/app`, `./storage` →
`/storage`, `./data.sqlite3` → `/data/data.sqlite3`, and `./logs` → `/logs`.
It expects a prepared `public/settings.php`, SQLite database, and TLS certificate
files under `private/`. Retain the matching database secret. Native setup settings
and the generated FPM pool are not used by Compose.

```bash
docker compose up -d
```

### Accounts & permission levels

| Role | Username | Permission level | Capabilities |
| :--- | :--- | :---: | :--- |
| Cloud user | `user` | `2` | Personal cloud storage, streaming, sync, and account settings |
| Administrator | `admin` | `1` | Cloud access and the underlying CMS administration |

Native setup assigns a different random password to each account. Older debug-mode
installations may have seeded known defaults; change those before enabling access.

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

Integration tests are powered by [Hurl](https://hurl.dev/) and located in `private/hurl/`. All test suites are idempotent and automatically clean up any temporary folders or files created in `./storage` and `data.sqlite3`.

### Native installer integration test

A disposable Docker test performs the actual APT/Composer installation, verifies
rerun preservation and storage permissions, and runs Nginx/FPM checks for login,
CMS administration, upload/download/delete, and blocked source/storage URLs:

```bash
private/setup/test-native.sh 26.04 8.5
private/setup/test-native.sh 24.04 8.4 --add-php-ppa
```

These tests require Internet access and Docker, add the PPA only inside the second
container, and remove their containers on exit. They do not modify host services.

### Prerequisites
1. Install Hurl (e.g., `brew install hurl` on macOS).
2. Ensure the application stack is running (`docker compose up -d`) and `altus.test` (or `localhost`) resolves to `127.0.0.1`.

### Test Suites (`private/hurl/`)

| Suite | Scope & Coverage |
| :--- | :--- |
| `private/hurl/test_cloud_passes.hurl` | **Altus Cloud (Positive):** End-to-end lifecycle covering `/cloud/` SPA shell bootstrap, authentication (`login`, `me`, `logout`), TOTP 2FA setup, folder CRUD & recursive path cascades, multipart file uploads (`keep_both` and `overwrite` conflict modes), sorting & search, favorites, RFC 7233 HTTP 206 byte-range streaming, single & batch `.zip` downloads, and Quick Sync reconciliation. |
| `private/hurl/test_cloud_fails.hurl` | **Altus Cloud (Negative & Security):** Unauthenticated `401` guards across all `/api/v1/*` endpoints, Nginx `/storage/` direct-access blocking (`404`), invalid auth/2FA/password inputs (`400`/`401`), path traversal prevention (`../evil`, `foo/bar`), circular folder move guards (`400`), duplicate conflicts (`409`), and out-of-bounds byte ranges (`416`). |
| `private/hurl/test_passes.hurl` | **ohCRUD Core (Positive):** Core microframework login, CMS page lifecycle, file upload, admin table inspection, and CORS preflight headers. |
| `private/hurl/test_fails.hurl` | **ohCRUD Core (Negative & Security):** Invalid credentials/tokens, protected route guards, `.git` and `settings.php` blocking, and `Sec-Fetch-Site: cross-site` CSRF rejection. |

### Running the Tests

1. **Run all Hurl suites (`test.sh`):**
   ```bash
   cd private/hurl && ./test.sh
   ```
   By default, `test.sh` targets `https://altus.test`. You can override the target host with the `HOST` environment variable:
   ```bash
   cd private/hurl && HOST=localhost ./test.sh
   ```

2. **Run only the Altus Cloud test suites:**
   ```bash
   cd private/hurl && hurl --test --variable host=altus.test test_cloud_passes.hurl test_cloud_fails.hurl
   ```

3. **Run a single suite with detailed failure output (or `--insecure` if local TLS certificates are untrusted):**
   ```bash
   cd private/hurl && hurl --test --error-format long --variable host=altus.test test_cloud_passes.hurl
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
### Public site and CMS theme

The public root (`/`) is an editable `Pages` record using the `altus-site` theme and
`index` layout. Its **Open cloud** link leads to `/cloud/`, where the existing cloud
sign-in flow remains responsible for authentication. The public theme supports
regular Markdown/HTML CMS content and the shared 403/404 views, with no runtime or
PHP version in its footer. It reads the same `altus_theme` and `altus_accent` browser
preferences as the file manager.

For another existing installation:

1. Set `__OHCRUD_CMS_DEFAULT_THEME__` to `altus-site` and keep the default layout
   `index` in `public/settings.php` (this configuration is intentionally untracked).
2. Run `python3 private/cms/install-landing.py` from the project checkout. This
   explicitly replaces only the `/` page, after backing up the existing database
   under `logs/` (or `var/log/` on native installations). For native deployment, run
   `sudo -u altus python3 private/cms/install-landing.py --database var/data.sqlite3`. Do not rerun it after editing the landing copy unless you intend
   to restore the supplied content.
3. Invalidate the CMS cache key `cCMS:/` through `unsetCache`, or allow the configured
   CMS cache duration to expire before checking the updated root.

Edit the landing page normally through the CMS after installation. New content
pages can select `altus-site` / `index` in the theme and layout controls. Public
styles live in `public/themes/altus-site/assets/css/site.css`; `tokens.css` carries
an isolated copy of the cloud app's tokens and references its local icon font,
without loading the file manager's layout styles. Keep that token copy aligned
when changing the shared visual language.

The landing page adds a light-blue sky gradient and decorative cloud layers, with
an adapted dark palette. These layers appear only at `/`; CMS articles and error
pages keep the neutral reading surface. The four-second cloud settling animation
is disabled by `prefers-reduced-motion`. The locally hosted cloud texture is from
[Jaume Sanchez's CSS3DClouds](https://github.com/spite/CSS3DClouds); its MIT notice is
preserved in `public/themes/altus-site/assets/img/cloud-LICENSE.txt`.
