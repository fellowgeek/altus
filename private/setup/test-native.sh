#!/usr/bin/env bash
# Full, disposable Ubuntu install test. Requires Docker; modifies no host services.
set -Eeuo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
ubuntu=${1:-26.04}
php_version=${2:-8.5}
ppa=${3:-}
[[ $ubuntu =~ ^[0-9]+\.[0-9]+$ && $php_version =~ ^[0-9]+\.[0-9]+$ ]] || exit 1
[[ -z $ppa || $ppa == --add-php-ppa ]] || exit 1
container="altus-native-test-$$"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$container" -v "$root:/source:ro" "ubuntu:$ubuntu" sleep infinity >/dev/null
docker exec -i "$container" bash -s -- "$php_version" "$ppa" <<'TEST'
set -Eeuo pipefail
series=$1
ppa=$2
useradd -m deploy
mkdir -p /opt/altus /srv/altus-files/existing
printf 'Existing storage survives setup.\n' >/srv/altus-files/existing/keep.txt
chmod 0700 /srv/altus-files/existing
cd /source
tar --exclude=public/settings.php --exclude=public/vendor --exclude=public/global/files --exclude=public/global/minified \
    -cf - setup.sh public private/setup private/cms/landing.html | tar -xf - -C /opt/altus
mkdir /opt/altus/storage
touch /opt/altus/storage/.gitkeep
cd /opt/altus
# Root deployment must stop before creating files unless explicitly confirmed.
for answer in '' no y; do
    if ./setup.sh --deploy-user root --no-start <<<"$answer"; then exit 1; fi
done
if ./setup.sh --deploy-user root --no-start </dev/null; then exit 1; fi
[[ ! -e .setup.lock && ! -e var && ! -e public/settings.php ]]
chown -R deploy:deploy /opt/altus
args=(--php-version "$series" --deploy-user deploy --storage /srv/altus-files --no-start)
[[ -z $ppa ]] || args+=("$ppa")
./setup.sh "${args[@]}" > /tmp/first-setup.log 2>&1
# Display only newly generated passwords, after successful setup, without ANSI in logs.
python3 - <<'CHECK'
from pathlib import Path
output = Path('/tmp/first-setup.log').read_text()
assert '\x1b' not in output
assert output.index('Altus setup complete.') < output.index('admin: ')
for line in Path('var/initial-credentials.txt').read_text().splitlines():
    if line.startswith(('admin: ', 'user: ')):
        assert line in output
assert 'Root-only initial credentials file:' in output
assert 'docs/nginx.md' in output and 'Open cloud' in output
CHECK
sha256sum public/settings.php var/data.sqlite3 var/initial-credentials.txt >/tmp/before.sha
# Reproduce an existing server whose UCF-managed PHP configuration was deleted.
sha256sum "/etc/php/$series/fpm/php.ini" "/etc/php/$series/mods-available/pdo_sqlite.ini" >/tmp/php-before.sha
for module in ctype exif fileinfo iconv pdo phar tokenizer; do
    rm "/etc/php/$series/mods-available/$module.ini"
    find "/etc/php/$series/cli/conf.d" "/etc/php/$series/fpm/conf.d" -name "*-$module.ini" -delete
done
rm "/etc/php/$series/cli/php.ini"
NO_COLOR=1 ./setup.sh "${args[@]}" > /tmp/rerun-setup.log 2>&1
python3 - <<'CHECK'
from pathlib import Path
output = Path('/tmp/rerun-setup.log').read_text()
assert '\x1b' not in output
assert 'Existing settings, data, and passwords retained.' in output
for line in Path('var/initial-credentials.txt').read_text().splitlines():
    if line.startswith(('admin: ', 'user: ')):
        assert line not in output
CHECK
sha256sum -c /tmp/before.sha
sha256sum -c /tmp/php-before.sha
"php$series" -r 'if ((new PDO("sqlite::memory:"))->query("SELECT 1")->fetchColumn() != 1) exit(1);'
# Direct root login defaults to root and enables Composer only after confirmation.
chown root:root /opt/altus
root_args=(--php-version "$series" --storage /srv/altus-files --no-start)
[[ -z $ppa ]] || root_args+=("$ppa")
printf 'yes\n' | env -u SUDO_USER ./setup.sh "${root_args[@]}"
sha256sum -c /tmp/before.sha
chown deploy:deploy /opt/altus
# Verify actual ACL-backed read/write access without changing the sentinel.
runuser -u altus -- python3 -c 'with open("/srv/altus-files/existing/keep.txt", "r+b") as handle: assert handle.read() == b"Existing storage survives setup.\n"'
[[ $(stat -c %U /srv/altus-files/existing/keep.txt) == root ]]
[[ $(stat -c '%U:%a' var/initial-credentials.txt) == root:600 ]]
# Unsafe storage and unsupported PHP versions must fail before modifying anything.
if ./setup.sh --php-version "$series" --deploy-user deploy --storage /etc/altus-unsafe --no-start; then exit 1; fi
[[ ! -e /etc/altus-unsafe ]]
if ./setup.sh --php-version 8.3 --deploy-user deploy --no-start; then exit 1; fi
if ./setup.sh --php-version "$series" --deploy-user deploy --storage /srv/different --no-start; then exit 1; fi
[[ $(readlink -f storage) == /srv/altus-files ]]
# Test the operator-supplied Nginx config only inside this disposable container.
apt-get install -y --no-install-recommends nginx shellcheck
shellcheck setup.sh private/setup/test-native.sh
sed -e 's|@ALTUS_ROOT@|/opt/altus|g' -e 's|@LISTEN_ADDRESS@|127.0.0.1|g' -e 's|@HOSTNAME@|altus.test|g' /source/private/nginx.native.conf >/etc/nginx/sites-enabled/altus
rm -f /etc/nginx/sites-enabled/default
"php-fpm$series" -D
nginx -t
nginx
ALTUS_SETUP_TEST=1 "php$series" private/setup/smoke-test.php
printf 'Native deployment verified on Ubuntu %s / PHP %s.\n' "$(. /etc/os-release; echo "$VERSION_ID")" "$series"
TEST
