#!/usr/bin/env bash
# Run mutating HTTP tests only in a disposable Ubuntu installation.
set -Eeuo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
command -v docker >/dev/null || { echo 'Install and start Docker to run these tests.' >&2; exit 1; }
command -v hurl >/dev/null || { echo 'Install Hurl to run these tests.' >&2; exit 1; }
[[ -z ${HOST:-} ]] || { echo 'HOST is no longer used: this runner creates its own disposable server.' >&2; exit 1; }
container="altus-hurl-$$"
work=$(mktemp -d)
cleanup() {
    docker rm -f "$container" >/dev/null 2>&1 || true
    rm -rf -- "$work"
}
trap cleanup EXIT
umask 0077
echo 'Preparing a disposable Ubuntu/PHP/Nginx installation (first run may take several minutes)...'
docker run -d --name "$container" -p 127.0.0.1::443 -v "$root:/source:ro" ubuntu:26.04 sleep infinity >/dev/null
if ! docker exec -i "$container" bash -s >"$work/setup.log" 2>&1 <<'SETUP'
set -Eeuo pipefail
useradd -m deploy
mkdir /opt/altus
cd /source
tar --exclude=public/settings.php --exclude=public/vendor --exclude=public/global/files --exclude=public/global/minified \
    -cf - setup.sh public private/setup private/cms/landing.html | tar -xf - -C /opt/altus
chown -R deploy:deploy /opt/altus
cd /opt/altus
./setup.sh --php-version 8.5 --deploy-user deploy --no-start
apt-get install -y --no-install-recommends nginx openssl shellcheck
shellcheck /source/private/hurl/test.sh
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost -keyout /tmp/key.pem -out /tmp/cert.pem
# Retain all native source/storage guards, but terminate TLS in this test server.
sed -e 's|@ALTUS_ROOT@|/opt/altus|g' -e 's|@HOSTNAME@|localhost|g' \
    -e 's|@LISTEN_ADDRESS@:8080|443 ssl|' \
    -e '/root .*\/public;/a\    ssl_certificate /tmp/cert.pem;\n    ssl_certificate_key /tmp/key.pem;' \
    -e 's|fastcgi_param HTTPS on;|fastcgi_param HTTPS $https;|' \
    /source/private/nginx.native.conf >/etc/nginx/sites-enabled/altus
rm /etc/nginx/sites-enabled/default
php-fpm8.5 -D
nginx -t
nginx
SETUP
then
    # Setup output contains initial credentials; keep it private and show only errors.
    echo 'Disposable installation failed (setup output follows, with credentials redacted):' >&2
    # Redact generated credentials if initialization succeeded before a later failure.
    sed -E '/^(admin|user): /d' "$work/setup.log" >&2
    exit 1
fi
port=$(docker port "$container" 443/tcp)
port=${port##*:}
docker cp "$container:/opt/altus/var/initial-credentials.txt" "$work/credentials" >/dev/null
{
    printf 'host=localhost:%s\n' "$port"
    sed -n 's/^admin: /admin_password=/p; s/^user: /user_password=/p' "$work/credentials"
} >"$work/variables"
echo 'Running all four Hurl suites twice to verify cleanup and reruns...'
for pass in 1 2; do
    printf '\nPass %s/2\n' "$pass"
    hurl --test --jobs 1 --insecure --variables-file "$work/variables" "$root"/private/hurl/*.hurl
    docker exec -e ALTUS_HURL_TEST=1 "$container" php8.5 /source/private/hurl/check-cleanup.php
done
