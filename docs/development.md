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

## Testing & Verification

Additional isolated security checks are described in [private/security/README.md](../private/security/README.md).

Integration tests are powered by [Hurl](https://hurl.dev/) and located in `private/hurl/`. Run Hurl only against a disposable development database with the expected default accounts. These suites create and modify files and account state; failed runs may leave fixtures behind. Older assertions may require updates for current landing-page and session behavior. Use the native smoke test below for installer verification.

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


See [architecture](../ARCHITECTURE.md), [design](../DESIGN.md), and the [framework reference](DOCUMENTATION.md) for implementation details.
