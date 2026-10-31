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
chown -R deploy:deploy /opt/altus
cd /opt/altus
args=(--php-version "$series" --deploy-user deploy --storage /srv/altus-files --no-start)
[[ -z $ppa ]] || args+=("$ppa")
./setup.sh "${args[@]}"
sha256sum public/settings.php var/data.sqlite3 var/initial-credentials.txt >/tmp/before.sha
./setup.sh "${args[@]}"
sha256sum -c /tmp/before.sha
runuser -u altus -- test -r /srv/altus-files/existing/keep.txt
runuser -u altus -- test -w /srv/altus-files/existing/keep.txt
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
sed 's|@ALTUS_ROOT@|/opt/altus|g' /source/private/nginx.native.conf >/etc/nginx/sites-enabled/altus
rm -f /etc/nginx/sites-enabled/default
"php-fpm$series" -D
nginx -t
nginx
ALTUS_SETUP_TEST=1 "php$series" private/setup/smoke-test.php
printf 'Native deployment verified on Ubuntu %s / PHP %s.\n' "$(. /etc/os-release; echo "$VERSION_ID")" "$series"
TEST
