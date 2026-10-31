# Security regression checks

Run from the project root with PHP 8.4 or newer and installed Composer dependencies:

```bash
php private/security/auth.php
php private/security/deletion.php
php private/security/stream.php
php private/security/session.php
python3 private/security/nginx.py
```

The PHP tests create temporary SQLite databases, files, sessions, and local HTTP
servers. They never load deployment settings or use the real account database or
storage. The Nginx check makes anonymous, read-only requests to the local Docker
server; pass `--base-url` to check a different authorized test instance.

Coverage includes password-bound MFA challenges, shared attempt limits, symlink
deletion boundaries, active-document downloads, media byte ranges, origin and CSRF
checks, HTTP verb enforcement, session rotation/logout, and cookie and stateless
API authentication. The PHP test HTTP router is available only with an explicit
test environment flag and is outside the public document root.

Cookie-based API clients first fetch `GET /api/v1/auth/csrfToken`, retain its session
cookie, and send the returned `data.csrf_token` as `X-CSRF-Token` on mutations.
Retain replacement cookies after login and verification, and update the token from
authentication responses. The SPA handles these steps automatically. Stateless
API token clients without session cookies do not require CSRF tokens.

Cross-origin API access is denied by default. Intentional integrations must be
explicitly allowlisted in `public/routes.php`; avoid wildcard or reflected origins.
Cloud mutations require their intended HTTP verbs, including POST for login,
logout, password/2FA changes, and synchronization.
