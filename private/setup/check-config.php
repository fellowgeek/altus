<?php
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
$GLOBALS['OHCRUD'] = true;
$root = dirname(__DIR__, 2);
require $root . '/public/settings.php';
$expected = $root . '/var/data.sqlite3';
$actual = __OHCRUD_DB_CONFIG__['SQLITE_DB'] ?? '';
$normalize = static fn(string $path): string => (realpath(dirname($path)) ?: dirname($path)) . '/' . basename($path);
if (__OHCRUD_DEBUG_MODE__ || (__OHCRUD_DB_CONFIG__['DRIVER'] ?? '') !== 'SQLITE'
    || $normalize($actual) !== $normalize($expected)
    || in_array(__OHCRUD_SECRET__, ['', 'CHANGE_ME_WITH_SETUP', 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'], true)
    || !defined('__ALTUS_STORAGE_PATH__')
    || realpath(__ALTUS_STORAGE_PATH__) !== realpath($root . '/storage')) {
    fwrite(STDERR, "Existing settings are not configured for native production deployment.\n"
        . "Review settings.sample.php: use var/data.sqlite3, the project storage link, a unique secret, and debug=false.\n"
        . "Preserve the original secret when migrating an existing database. settings.php was not overwritten.\n");
    exit(1);
}
