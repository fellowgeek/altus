#!/usr/bin/env bash
# Native Ubuntu installation. Nginx, TLS, and network policy remain operator-managed.
# Embedded PHP snippets intentionally preserve PHP variables literally.
# shellcheck disable=SC2016
set -Eeuo pipefail
umask 0022
PROJECT_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
PHP_VERSION=8.4
STORAGE_PATH=''
DEPLOY_USER=${SUDO_USER:-root}
COMPOSER_ENV=(env)
ADD_PPA=false
START_SERVICE=true
APP_USER=altus

usage() {
    cat <<'HELP'
Usage: sudo ./setup.sh [options]
  --php-version X.Y   PHP package series, at least 8.4 (default: 8.4)
  --storage PATH      External storage directory; creates ./storage symlink
  --deploy-user USER  Checkout owner for Composer (default: SUDO_USER or root)
  --add-php-ppa       Explicitly enable ppa:ondrej/php if required by your Ubuntu release
  --no-start         Write/test PHP-FPM configuration without enabling/restarting it
  -h, --help         Show this help

Installs dependencies, creates an altus service account and isolated FPM pool,
initializes a fresh SQLite database and random credentials, and preserves existing
settings/data. Does not install/configure Nginx, TLS, firewall rules, or Tailscale.
Root deployment requires typing yes after a security warning.
HELP
}
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }
validate_storage() {
    case "$1" in
        /|/etc|/etc/*|/usr|/usr/*|/bin|/sbin|/lib|/lib/*|/boot|/boot/*|/proc|/proc/*|/sys|/sys/*|/dev|/dev/*|/run|/run/*|/var|/home|/root|/tmp|/srv|/mnt|/media|/opt)
            die 'Storage must resolve to a dedicated data directory, not a system directory.' ;;
    esac
    case "$PROJECT_ROOT/" in "$1/"*) die 'Storage must not contain the project checkout.' ;; esac
    case "$1/" in "$PROJECT_ROOT/public/"*|"$PROJECT_ROOT/var/"*) die 'Storage cannot be inside public/ or var/.' ;; esac
}
while (($#)); do
    case "$1" in
        --php-version|--storage|--deploy-user)
            (($# >= 2)) || die "Missing value for $1"
            [[ -n $2 && $2 != --* ]] || die "Missing value for $1"
            case "$1" in
                --php-version) PHP_VERSION=$2 ;;
                --storage) STORAGE_PATH=$2 ;;
                --deploy-user) DEPLOY_USER=$2 ;;
            esac
            shift 2 ;;
        --add-php-ppa) ADD_PPA=true; shift ;;
        --no-start) START_SERVICE=false; shift ;;
        -h|--help) usage; exit 0 ;;
        *) die "Unknown option: $1" ;;
    esac
done
[[ $PHP_VERSION =~ ^[0-9]+\.[0-9]+$ ]] || die 'PHP version must be X.Y.'
[[ $(printf '%s\n' 8.4 "$PHP_VERSION" | sort -V | head -n1) == 8.4 ]] || die 'PHP 8.4 or newer is required.'
[[ $EUID == 0 ]] || die 'Run as root or with sudo.'
[[ -f /etc/os-release ]] || die 'Ubuntu is required.'
# shellcheck disable=SC1091
source /etc/os-release
[[ ${ID:-} == ubuntu || " ${ID_LIKE:-} " == *' ubuntu '* ]] || die 'This installer supports Ubuntu-based servers only.'
[[ -n $DEPLOY_USER && $DEPLOY_USER != "$APP_USER" ]] || die 'Supply --deploy-user with the checkout owner, separate from the altus service account.'
id "$DEPLOY_USER" >/dev/null 2>&1 || die 'Deployment user does not exist.'
[[ $(stat -c %U "$PROJECT_ROOT") == "$DEPLOY_USER" ]] || die 'The project directory must be owned by the deployment user.'
if [[ $(id -u "$DEPLOY_USER") == 0 ]]; then
    cat >&2 <<'WARNING'
WARNING: Deploying as root runs Composer with unrestricted system privileges.
A compromised Composer executable or vulnerability could modify any file on this
server. A separate non-root checkout owner is recommended. Composer plugins and
scripts remain disabled, and PHP-FPM will still run as the altus service account.
WARNING
    printf 'Continue deploying as root? Type yes to continue: ' >&2
    confirmation=''
    read -r confirmation || die 'Root deployment cancelled; explicit yes is required.'
    [[ $confirmation == [yY][eE][sS] ]] || die 'Root deployment cancelled; explicit yes is required.'
    COMPOSER_ENV+=(COMPOSER_ALLOW_SUPERUSER=1)
fi
[[ $PROJECT_ROOT =~ ^/[a-zA-Z0-9_./-]+$ ]] || die 'Use a project path without spaces or shell/configuration metacharacters.'
[[ -f $PROJECT_ROOT/public/composer.lock && -f $PROJECT_ROOT/private/cms/landing.html ]] || die 'Incomplete checkout.'
if $START_SERVICE; then
    [[ -d /run/systemd/system ]] || die 'systemd is required to start PHP-FPM; use --no-start for image builds.'
fi
for other_pool in /etc/php/*/fpm/pool.d/altus.conf; do
    [[ ! -f $other_pool || $other_pool == "/etc/php/$PHP_VERSION/fpm/pool.d/altus.conf" ]] || die "Another PHP series owns the Altus pool ($other_pool). Disable that pool before switching versions."
done
POOL_PATH="/etc/php/$PHP_VERSION/fpm/pool.d/altus.conf"
if [[ -f $POOL_PATH ]]; then
    if ! grep -q '^; Managed by Altus setup.sh$' "$POOL_PATH" || ! grep -Fxq "chdir = $PROJECT_ROOT/public" "$POOL_PATH"; then
        die 'The existing Altus FPM pool is unmanaged or belongs to another checkout.'
    fi
fi
# Serialize setup invocations for this checkout.
exec 9>"$PROJECT_ROOT/.setup.lock"
flock -n 9 || die 'Another setup is already running.'

# Refuse ambiguous migrations before installing packages or changing storage.
if [[ ! -f $PROJECT_ROOT/public/settings.php && ( -e $PROJECT_ROOT/data.sqlite3 || -e $PROJECT_ROOT/var/data.sqlite3 ) ]]; then
    die 'Existing database without settings.php: restore its matching secret/configuration before migrating.'
fi
if [[ -e $PROJECT_ROOT/data.sqlite3 && ! -e $PROJECT_ROOT/var/data.sqlite3 ]]; then
    die 'Legacy root database found. Follow the README migration steps before native setup.'
fi
[[ ! -L $PROJECT_ROOT/var/data.sqlite3 ]] || die 'Keep the native SQLite database in var/ rather than a symlink.'
if [[ -n $STORAGE_PATH ]]; then
    [[ $STORAGE_PATH == /* ]] || die '--storage must be an absolute directory path.'
    STORAGE_PATH=$(realpath -m -- "$STORAGE_PATH")
    validate_storage "$STORAGE_PATH"
    case "$STORAGE_PATH" in
        /|"$PROJECT_ROOT"|"$PROJECT_ROOT"/*|/etc|/usr|/var|/home|/root|/tmp)
            die 'Choose a dedicated external storage directory, outside the checkout.' ;;
    esac
    if [[ -L $PROJECT_ROOT/storage ]]; then
        [[ $(realpath -m "$PROJECT_ROOT/storage") == "$STORAGE_PATH" ]] || die 'Existing storage symlink points elsewhere; it will not be replaced.'
    elif [[ -d $PROJECT_ROOT/storage ]]; then
        [[ -z $(find "$PROJECT_ROOT/storage" -mindepth 1 ! -name .gitkeep -print -quit) ]] || die 'Storage contains files; migrate it manually before choosing --storage.'
    elif [[ -e $PROJECT_ROOT/storage ]]; then
        die 'storage exists and is not a directory.'
    fi
fi
validate_storage "$(realpath -m "${STORAGE_PATH:-$PROJECT_ROOT/storage}")"

export DEBIAN_FRONTEND=noninteractive
apt-get update
if $ADD_PPA; then
    apt-get install -y --no-install-recommends software-properties-common ca-certificates
    add-apt-repository -y ppa:ondrej/php
    apt-get update
fi
PACKAGES=(ca-certificates curl git unzip sqlite3 acl python3 "php${PHP_VERSION}-cli" "php${PHP_VERSION}-fpm"
    "php${PHP_VERSION}-sqlite3" "php${PHP_VERSION}-mbstring" "php${PHP_VERSION}-xml"
    "php${PHP_VERSION}-curl" "php${PHP_VERSION}-gd" "php${PHP_VERSION}-zip")
for package in "${PACKAGES[@]}"; do
    candidate=$(apt-cache policy "$package" | awk '/Candidate:/ {print $2}')
    [[ -n $candidate && $candidate != '(none)' ]] || die "Package $package unavailable. Choose an available PHP >=8.4 series or explicitly use --add-php-ppa."
done
apt-get install -y --no-install-recommends "${PACKAGES[@]}"
PHP_BIN="/usr/bin/php${PHP_VERSION}"
"$PHP_BIN" -r 'if (PHP_VERSION_ID < 80400) exit(1); foreach (["pdo_sqlite","mbstring","xml","dom","curl","gd","exif","zip","fileinfo","openssl","ctype","tokenizer"] as $ext) { if (!extension_loaded($ext)) { fwrite(STDERR, "Missing PHP extension: $ext\n"); exit(1); }}'

if ! id "$APP_USER" >/dev/null 2>&1; then
    useradd --system --user-group --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin "$APP_USER"
fi
[[ $(id -u "$APP_USER") != 0 ]] || die 'Invalid application account.'
getent group www-data >/dev/null || die 'Nginx socket group www-data is missing.'
getent group "$APP_USER" >/dev/null || die 'The existing altus account needs its own altus group.'
# Traversal only on parent directories; do not recursively open a home directory.
parent_dir=$PROJECT_ROOT
while [[ $parent_dir != / ]]; do
    setfacl -m "u:$APP_USER:--x,u:www-data:--x" "$parent_dir"
    parent_dir=$(dirname "$parent_dir")
done
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$PROJECT_ROOT/var" "$PROJECT_ROOT/var/log" "$PROJECT_ROOT/var/cache" "$PROJECT_ROOT/var/sessions" "$PROJECT_ROOT/var/tmp"

if [[ -n $STORAGE_PATH ]]; then
    [[ ! -e $STORAGE_PATH || -d $STORAGE_PATH ]] || die 'External storage is not a directory.'
    if [[ ! -d $STORAGE_PATH ]]; then
        install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$STORAGE_PATH"
    fi
    if [[ ! -L $PROJECT_ROOT/storage ]]; then
        if [[ -d $PROJECT_ROOT/storage ]]; then
            rm -f -- "$PROJECT_ROOT/storage/.gitkeep"
            rmdir -- "$PROJECT_ROOT/storage"
        fi
        ln -s -- "$STORAGE_PATH" "$PROJECT_ROOT/storage"
    fi
elif [[ ! -e $PROJECT_ROOT/storage && ! -L $PROJECT_ROOT/storage ]]; then
    install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$PROJECT_ROOT/storage"
fi
[[ -d $PROJECT_ROOT/storage ]] || die 'Storage symlink is broken; mount the disk before running setup.'
STORAGE_REAL=$(realpath "$PROJECT_ROOT/storage")
validate_storage "$STORAGE_REAL"
# Access existing storage without changing ownership or following nested symlinks.
find "$STORAGE_REAL" -type d -exec setfacl -m "u:$APP_USER:rwx,d:u:$APP_USER:rwx" {} +
find "$STORAGE_REAL" -type f -exec setfacl -m "u:$APP_USER:rw-" {} +
parent_dir=$(dirname "$STORAGE_REAL")
while [[ $parent_dir != / ]]; do
    setfacl -m "u:$APP_USER:--x" "$parent_dir"
    parent_dir=$(dirname "$parent_dir")
done

if [[ ! -f $PROJECT_ROOT/public/settings.php ]]; then
    "$PHP_BIN" -r 'umask(0077); $source=file_get_contents($argv[1]); $source=str_replace("CHANGE_ME_WITH_SETUP", bin2hex(random_bytes(16)), $source); $f=fopen($argv[2], "x"); if (!$f) exit(1); fwrite($f,$source); fclose($f);' \
        "$PROJECT_ROOT/public/settings.sample.php" "$PROJECT_ROOT/public/settings.php"
fi
"$PHP_BIN" "$PROJECT_ROOT/private/setup/check-config.php"
chown root:"$APP_USER" "$PROJECT_ROOT/public/settings.php"
chmod 0640 "$PROJECT_ROOT/public/settings.php"
for database_file in "$PROJECT_ROOT/var/data.sqlite3"{,-wal,-shm,-journal}; do
    if [[ -f $database_file && ! -L $database_file ]]; then
        chown "$APP_USER:$APP_USER" "$database_file"
        chmod 0600 "$database_file"
    fi
done

# Install the official Composer PHAR with installer checksum verification.
COMPOSER_PATH=/usr/local/lib/altus/composer.phar
if [[ ! -f $COMPOSER_PATH ]]; then
    installer_dir=$(mktemp -d)
    trap 'rm -rf -- "${installer_dir:-}"' EXIT
    curl -fsSL https://composer.github.io/installer.sig -o "$installer_dir/installer.sig"
    curl -fsSL https://getcomposer.org/installer -o "$installer_dir/installer.php"
    expected=$(cat "$installer_dir/installer.sig")
    actual=$("$PHP_BIN" -r 'echo hash_file("sha384", $argv[1]);' "$installer_dir/installer.php")
    [[ $expected == "$actual" ]] || die 'Composer installer checksum mismatch.'
    "$PHP_BIN" "$installer_dir/installer.php" --quiet --install-dir="$installer_dir" --filename=composer.phar
    install -D -m 0755 "$installer_dir/composer.phar" "$COMPOSER_PATH"
    rm -rf -- "$installer_dir"
    trap - EXIT
fi
runuser -u "$DEPLOY_USER" -- "${COMPOSER_ENV[@]}" "$PHP_BIN" "$COMPOSER_PATH" install --working-dir="$PROJECT_ROOT/public" --no-dev --prefer-dist --no-interaction --no-plugins --no-scripts --optimize-autoloader
runuser -u "$DEPLOY_USER" -- "${COMPOSER_ENV[@]}" "$PHP_BIN" "$COMPOSER_PATH" check-platform-reqs --working-dir="$PROJECT_ROOT/public" --no-dev
# PHP reads source; Nginx reads static assets. Neither needs code-write permissions.
find "$PROJECT_ROOT/public" -type d -exec setfacl -m "u:$APP_USER:r-x,u:www-data:r-x" {} +
find "$PROJECT_ROOT/public" -type f ! -name settings.php -exec setfacl -m "u:$APP_USER:r--,u:www-data:r--" {} +
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$PROJECT_ROOT/public/global/files" "$PROJECT_ROOT/public/global/minified"
for writable_dir in "$PROJECT_ROOT/public/global/files" "$PROJECT_ROOT/public/global/minified"; do
    find "$writable_dir" -type d -exec setfacl -m "u:$APP_USER:rwx,u:www-data:r-x,d:u:$APP_USER:rwx,d:u:www-data:r-x" {} +
    find "$writable_dir" -type f -exec setfacl -m "u:$APP_USER:rw-,u:www-data:r--" {} +
done
setfacl -m "u:$APP_USER:--x" "$PROJECT_ROOT/private"
setfacl -m "u:$APP_USER:r-x" "$PROJECT_ROOT/private/setup" "$PROJECT_ROOT/private/cms"
find "$PROJECT_ROOT/private/setup" -maxdepth 1 -type f -name '*.php' -exec setfacl -m "u:$APP_USER:r--" {} +
setfacl -m "u:$APP_USER:r--" "$PROJECT_ROOT/private/cms/landing.html"
# HTMLPurifier's default serializer cache must be writable independently of vendor/.
# Configure its cache centrally rather than granting write access to dependencies.
runuser -u "$APP_USER" -- "$PHP_BIN" "$PROJECT_ROOT/private/setup/initialize.php"
if [[ -f $PROJECT_ROOT/var/initial-credentials.txt ]]; then
    chown root:root "$PROJECT_ROOT/var/initial-credentials.txt"
    chmod 0600 "$PROJECT_ROOT/var/initial-credentials.txt"
fi

cat > "$POOL_PATH" <<POOL
; Managed by Altus setup.sh
[altus]
user = $APP_USER
group = $APP_USER
listen = /run/php/altus.sock
listen.owner = www-data
listen.group = www-data
listen.mode = 0660
pm = ondemand
pm.max_children = 5
pm.process_idle_timeout = 10s
pm.max_requests = 500
chdir = $PROJECT_ROOT/public
clear_env = yes
security.limit_extensions = .php
php_admin_value[memory_limit] = 512M
php_admin_value[upload_max_filesize] = 500M
php_admin_value[post_max_size] = 512M
php_admin_value[max_execution_time] = 300
php_admin_value[max_input_time] = 300
php_admin_flag[display_errors] = off
php_admin_flag[log_errors] = on
php_admin_flag[expose_php] = off
php_admin_value[error_log] = $PROJECT_ROOT/var/log/php-error.log
php_admin_value[session.save_path] = $PROJECT_ROOT/var/sessions
php_admin_flag[session.cookie_httponly] = on
php_admin_flag[session.cookie_secure] = on
php_admin_value[session.cookie_samesite] = Lax
php_admin_value[upload_tmp_dir] = $PROJECT_ROOT/var/tmp
POOL
"/usr/sbin/php-fpm$PHP_VERSION" -t
if $START_SERVICE; then
    systemctl enable "php$PHP_VERSION-fpm"
    systemctl restart "php$PHP_VERSION-fpm"
fi
printf '\nAltus setup complete. Nginx has not been changed.\n'
printf 'Document root: %s/public\nFPM socket: /run/php/altus.sock\nStorage: %s\n' "$PROJECT_ROOT" "$STORAGE_REAL"
printf 'Initial credentials (first installation only): %s/var/initial-credentials.txt\n' "$PROJECT_ROOT"
printf 'Configure HTTPS and private network access using README.md before signing in.\n'
