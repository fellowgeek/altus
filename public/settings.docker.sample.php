<?php
// Local Docker development only. Copy to settings.php and replace the secret before use.
if (!isset($GLOBALS['OHCRUD'])) {
    http_response_code(404);
    exit;
}

define('__SELF__', __DIR__ . '/');
define('__SITE__', $_SERVER['HTTP_HOST'] ?? '');
define('__DOMAIN__', implode('.', array_slice(explode('.', __SITE__), -2)));
define('__SUB_DOMAIN__', (count($parts = explode('.', __SITE__)) > 2) ? $parts[0] : '');
define('__APP__', 'Altus');

// Container storage mount; never expose it through Nginx.
define('__ALTUS_STORAGE_PATH__', '/storage/');
define('__OHCRUD_BASE_API_ROUTE__', '/ohcrud');

// Development mode creates missing tables and seeds admin/admin and user/user.
define('__OHCRUD_DEBUG_MODE__', true);
define('__OHCRUD_DEBUG_MODE_SHOW_SQL__', false);
define('__OHCRUD_DEBUG_EXPANDED_LEVEL__', 3);
define('__OHCRUD_ADMIN_ENABLE_SQL_EXECUTION__', false);
define('__OHCRUD_LOG_ENABLED__', true);
define('__OHCRUD_LOG_PATH__', '/logs/');
define('__OHCRUD_CACHE_ENABLED__', false);
define('__OHCRUD_CACHE_PATH__', '/ramdisk/');

// Replace with 32 random characters. Preserve it with its matching database.
define('__OHCRUD_SECRET__', 'CHANGE_ME_WITH_SETUP');
define('__OHCRUD_SESSION_LIFETIME__', 3600);
define('__OHCRUD_SESSION_SECURE_COOKIE__', true);
define('__X_FRAME_OPTIONS__', 'SAMEORIGIN');
define('__X_CONTENT_TYPE_OPTIONS__', 'nosniff');
define('__OHCRUD_DB_STAMP__', true);
define('__OHCRUD_DB_CONFIG__', [
    'DRIVER' => 'SQLITE',
    'PERSISTENT_CONNECTION' => false,
    'SQLITE_DB' => '/data/data.sqlite3',
    'MYSQL_HOST' => '',
    'MYSQL_DB' => '',
    'USERNAME' => '',
    'PASSWORD' => '',
]);

define('__OHCRUD_CMS_CACHE_DURATION__', 3600);
define('__OHCRUD_CMS_ADMIN_THEME__', 'admin');
define('__OHCRUD_CMS_ADMIN_LAYOUT__', 'edit');
define('__OHCRUD_CMS_DEFAULT_THEME__', 'altus-site');
define('__OHCRUD_CMS_DEFAULT_LAYOUT__', 'index');
define('__OHCRUD_CMS_LAZY_LOAD_IMAGES__', false);
define('__OHCRUD_CMS_MINIFY_CSS__', false);
define('__OHCRUD_CMS_MINIFY_JS__', false);
