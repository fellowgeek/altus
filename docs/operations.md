# Operations reference

Run commands on the installation machine, from the checkout root. Back up before
changing an existing installation. Never run Docker and native PHP against the
same writable database.

## Storage and existing installations

Native setup preserves `public/settings.php`, `var/data.sqlite3`, accounts, CMS
content, and storage on reruns. Its root-only `var/initial-credentials.txt` holds
original passwords; it is not updated when you change passwords. Store it safely
and remove it when no longer needed.

To use a separate disk, mount it persistently first. Choose a dedicated directory
on that disk and pass its resolved absolute path. For example, **only if**
`../altus-files` is your intended mounted data directory:

```bash
STORAGE_DIR="$(realpath -m ../altus-files)"
sudo ./setup.sh --php-version 8.5 --storage "$STORAGE_DIR"
```

Use your original PHP version and package options on reruns. Setup can link an
empty `storage/` or one containing only `.gitkeep`. It refuses to replace populated
storage or a symlink pointing elsewhere. Existing target files keep their owners;
setup grants the `altus` account access through ACLs. Storage must support ACLs.
Run **Sync Files** after importing files. Copy tools that retain restrictive
permissions may require ACL repairs before PHP can read imported files.

For populated storage, stop writes, back it up, copy to the mounted disk, verify
the copy, then arrange the `storage/` symlink yourself. Do not delete the original
until verified. Configure a PHP-FPM systemd override with `RequiresMountsFor=`
pointing to the resolved storage directory, so PHP cannot start without the mount.
A symlink alone does not ensure the disk is mounted. Keep SQLite on local disk,
not SMB/NFS.

For Docker-to-native migration, stop the old instance and back it up. Copy its
`data.sqlite3` to `var/data.sqlite3`, adapt configuration using
`public/settings.sample.php`, and move/link storage. **Preserve the original
32-character settings secret**, which protects password verification, tokens, and
TOTP secrets. Also preserve CMS uploads in `public/global/files/`. Setup refuses
ambiguous legacy databases, missing settings, and placeholder secrets. A legacy
placeholder secret needs a planned secret rotation and account/token/TOTP reset;
do not let setup silently replace it.

## Backups and updates

Pause uploads, sync, and other writes during a backup. Native database backup:

```bash
BACKUP_DIR="var/backups/$(date +%Y%m%d-%H%M%S)"
sudo install -d -o altus -g altus -m 0700 "$BACKUP_DIR"
sudo -u altus sqlite3 var/data.sqlite3 ".backup '$BACKUP_DIR/data.sqlite3'"
sudo install -m 0600 public/settings.php "$BACKUP_DIR/settings.php"
```

Also copy `storage/` contents (follow its target if symlinked) and
`public/global/files/` into your protected backup location. Keep an off-server
copy. The SQLite command above takes a consistent database snapshot; do not copy
a live SQLite file blindly. For Docker, stop the stack with `docker compose down`
first, then copy `data.sqlite3`, any SQLite sidecar files, matching settings, and
the same file directories before starting it again. Test restores separately.

After a backup and review of release-specific migration instructions:

```bash
git pull --ff-only
sudo ./setup.sh --php-version 8.5
```

Replace `8.5` with the originally selected version and retain any storage/package
options. Run Git as the checkout owner. Setup refreshes dependencies and its
managed pool; it is not a general schema migration tool. Docker users instead
rerun `docker compose run --rm composer_installation` and
`docker compose up -d --build web php`.

## Installer options and troubleshooting

`./setup.sh --help` lists options. `--deploy-user USER` selects the checkout
owner. Prefer a non-root owner; root deployment requires explicit **yes** and
runs Composer with system privileges. Plugins/scripts remain disabled. PHP-FPM
always runs as `altus`.

`--no-start` writes and validates the FPM pool without enabling/restarting the
service. Otherwise setup restarts the selected PHP service, affecting other pools
in it. Setup refuses a second Altus pool under another PHP version; review the
old pool before switching. It restores missing PHP module/INI configuration from
package templates, preserving existing files. `sudo env NO_COLOR=1 ./setup.sh` disables colors; redirected output is plain.

- Check the chosen service, e.g. `sudo systemctl status php8.5-fpm`.
- Inspect `var/log/php-error.log` and your Nginx error log for failures.
- Use `namei -l storage` and `getfacl storage` to diagnose directory access.
- Nginx defaults to `www-data`; a custom worker account needs matching static-file
  ACLs and FPM socket ownership in the managed pool configuration.
- Login requires HTTPS because session cookies are secure. Follow
  [Nginx and HTTPS](nginx.md), including the correct direct/proxy HTTPS parameter.
- Keep the 500 MB upload limit, 512 MB native request limit, and 300-second PHP
  timeout in mind when tuning a proxy. Do not weaken source/storage protections.

## CMS landing page

Native first installation seeds the landing page. Existing installations can
keep their content. To explicitly replace only the `/` page with the supplied
landing page, back up first, set the CMS default theme/layout to `altus-site` /
`index`, then run:

```bash
sudo -u altus python3 private/cms/install-landing.py --database var/data.sqlite3
```

For local Docker development, run `python3 private/cms/install-landing.py` on the
host after the first app visit has created the tables. The helper also saves a
database backup under `logs/` (native: `var/log/`). Do not rerun it after editing
the landing page unless you intend to replace that content. If CMS caching is
enabled, clear `cCMS:/` or wait for its cache duration to expire.
