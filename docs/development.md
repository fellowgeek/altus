# Development reference

Run commands from the checkout root unless a command changes directories.

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

## Testing

Install Docker and [Hurl](https://hurl.dev/) on your development
machine, start Docker, and run from the checkout root:

```bash
private/hurl/test.sh
```

The runner creates a disposable Ubuntu 26.04 / PHP 8.5 / Nginx server, initializes
all tables through the native installer, and supplies generated account passwords
to Hurl through a private temporary variables file. It runs all four suites twice
against the same database to verify repeatability, then checks that uploaded files,
active file/folder records, and the published test page have been cleaned up after
each pass. It requires network access for Ubuntu packages and Composer; setup
may take several minutes.

The temporary HTTPS listener uses an automatically assigned localhost port and a
self-signed certificate. Certificate verification is disabled only for this test
instance. The checkout is mounted read-only; code is copied into the container.
Your settings, database, storage, running Docker stack, and host services are
untouched. Containers, logs, and temporary credentials are removed on exit.
`HOST` overrides are rejected to avoid accidentally testing a live installation.

| Suite | Coverage |
| :--- | :--- |
| `private/hurl/test_cloud_passes.hurl` | Both accounts, session rotation/logout, folders, files, conflicts, favorites, search, thumbnails, byte ranges, ZIP downloads, sync, and cleanup |
| `private/hurl/test_cloud_fails.hurl` | Anonymous guards, CSRF and method enforcement, account validation, traversal, circular moves, conflicts, missing files, and invalid ranges |
| `private/hurl/test_passes.hurl` | CMS login, page creation/edit/deletion, upload validation, admin tables, and same-origin access |
| `private/hurl/test_fails.hurl` | Invalid credentials/CSRF/tokens, source and storage guards, anonymous admin access, and denied cross-origin requests |

For installer-specific checks, run either disposable integration test:

```bash
private/setup/test-native.sh 26.04 8.5
private/setup/test-native.sh 24.04 8.4 --add-php-ppa
```

Additional isolated security tests are described in
[private/security/README.md](../private/security/README.md).


See [architecture](../ARCHITECTURE.md), [design](../DESIGN.md), and the [framework reference](DOCUMENTATION.md) for implementation details.
