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
define('__SITE__', $_SERVER['HTTP_HOST'] ?? 'localhost');
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
define('__OHCRUD_PERMISSION_ALL__', -1);
define('__OHCRUD_SESSION_LIFETIME__', 3600);
define('__OHCRUD_SESSION_SECURE_COOKIE__', false);
require $root . '/public/vendor/composer/ClassLoader.php';
$loader = new Composer\Autoload\ClassLoader();
foreach (require $root . '/public/vendor/composer/autoload_psr4.php' as $prefix => $paths) $loader->addPsr4($prefix, $paths);
$loader->addClassMap(require $root . '/public/vendor/composer/autoload_classmap.php');
$loader->register();
require_once $root . '/public/vendor/symfony/deprecation-contracts/function.php';
session_save_path($fixture . '/sessions');
ohCRUD\Core::configureSession();
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

function startFixtureServer(): array {
    global $fixture;
    $socket = stream_socket_server('tcp://127.0.0.1:0');
    $address = stream_socket_get_name($socket, false);
    fclose($socket);
    $environment = array_merge(getenv(), ['ALTUS_SECURITY_TEST' => '1', 'ALTUS_SECURITY_FIXTURE' => $fixture]);
    $process = proc_open([PHP_BINARY, '-S', $address, '-t', __SELF__, __DIR__ . '/http-router.php'],
        [0 => ['file', '/dev/null', 'r'], 1 => ['file', $fixture . '/server.log', 'a'],
         2 => ['file', $fixture . '/server.log', 'a']], $pipes, null, $environment);
    check(is_resource($process), 'Test server did not start');
    register_shutdown_function(static function () use ($process) { proc_terminate($process); proc_close($process); });
    for ($attempt = 0; $attempt < 100; $attempt++) {
        $connection = @stream_socket_client('tcp://' . $address);
        if ($connection) { fclose($connection); return [$process, 'http://' . $address]; }
        usleep(20000);
    }
    throw new RuntimeException('Test server did not become ready');
}

function httpRequest(string $url, string $method = 'GET', array $headers = [], ?string $body = null): array {
    $options = ['method' => $method, 'header' => implode("\r\n", $headers), 'ignore_errors' => true];
    if ($body !== null) $options['content'] = $body;
    $body = file_get_contents($url, false, stream_context_create(['http' => $options]));
    $responseHeaders = http_get_last_response_headers();
    $result = ['status' => (int) explode(' ', $responseHeaders[0])[1], 'body' => $body, 'headers' => []];
    foreach (array_slice($responseHeaders, 1) as $header) {
        if (str_contains($header, ':')) {
            [$key, $value] = explode(':', $header, 2);
            $result['headers'][strtolower($key)] = trim($value);
        }
    }
    return $result;
}
if (!getenv('ALTUS_SECURITY_FIXTURE')) register_shutdown_function(static function () use ($fixture) {
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    removeFixture($fixture);
});
