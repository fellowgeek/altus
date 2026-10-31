<?php
// Isolated security regression tests never load deployment settings or databases.
if (PHP_SAPI !== 'cli' && getenv('ALTUS_SECURITY_TEST') !== '1') {
    http_response_code(404);
    exit;
}
$root = dirname(__DIR__, 2);
$fixture = getenv('ALTUS_SECURITY_FIXTURE') ?: sys_get_temp_dir() . '/altus-security-' . bin2hex(random_bytes(8));
if (!is_dir($fixture)) mkdir($fixture, 0700, true);
foreach (['storage', 'cache', 'sessions'] as $directory) {
    if (!is_dir($fixture . '/' . $directory)) mkdir($fixture . '/' . $directory, 0700);
}
$GLOBALS['OHCRUD'] = true;
define('__SELF__', $root . '/public/');
define('__SITE__', 'localhost');
define('__APP__', 'Altus security tests');
define('__OHCRUD_SECRET__', 'isolated-security-test-secret');
define('__OHCRUD_DEBUG_MODE__', false);
define('__OHCRUD_DEBUG_MODE_SHOW_SQL__', false);
define('__OHCRUD_LOG_ENABLED__', false);
define('__OHCRUD_CACHE_ENABLED__', false);
define('__OHCRUD_CACHE_PATH__', $fixture . '/cache/');
define('__ALTUS_STORAGE_PATH__', $fixture . '/storage/');
define('__OHCRUD_DB_STAMP__', false);
define('__OHCRUD_DB_CONFIG__', ['DRIVER' => 'SQLITE', 'PERSISTENT_CONNECTION' => false,
    'SQLITE_DB' => $fixture . '/test.sqlite3', 'USERNAME' => '', 'PASSWORD' => '']);
define('__X_FRAME_OPTIONS__', 'SAMEORIGIN');
define('__X_CONTENT_TYPE_OPTIONS__', 'nosniff');
define('__OHCRUD_BASE_API_ROUTE__', '/ohcrud');
require $root . '/public/vendor/composer/ClassLoader.php';
$loader = new Composer\Autoload\ClassLoader();
foreach (require $root . '/public/vendor/composer/autoload_psr4.php' as $prefix => $paths) $loader->addPsr4($prefix, $paths);
$loader->addClassMap(require $root . '/public/vendor/composer/autoload_classmap.php');
$loader->register();
require_once $root . '/public/vendor/symfony/deprecation-contracts/function.php';
session_save_path($fixture . '/sessions');
session_start();
session_write_close();
$pdo = new PDO('sqlite:' . $fixture . '/test.sqlite3');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->exec('CREATE TABLE IF NOT EXISTS Users (ID INTEGER PRIMARY KEY, USERNAME TEXT, PASSWORD TEXT,
    EMAIL TEXT, NAME TEXT, PERMISSIONS INTEGER, STATUS INTEGER, TOTP INTEGER, TOTP_SECRET TEXT, HASH TEXT, TOKEN TEXT)');

function check(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

function removeFixture(string $path): void {
    if (is_link($path) || !is_dir($path)) { unlink($path); return; }
    foreach (new FilesystemIterator($path) as $entry) removeFixture($entry->getPathname());
    rmdir($path);
}
if (!getenv('ALTUS_SECURITY_FIXTURE')) register_shutdown_function(static function () use ($fixture) {
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    removeFixture($fixture);
});
