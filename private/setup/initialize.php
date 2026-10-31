<?php
/** Offline, first-install database initialization; never runs through HTTP. */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
if (PHP_VERSION_ID < 80400) {
    fwrite(STDERR, "PHP 8.4 or newer is required.\n");
    exit(1);
}
$root = dirname(__DIR__, 2);
$database = $root . '/var/data.sqlite3';
$credentials = $root . '/var/initial-credentials.txt';
$temporary = null;
umask(0077);
$GLOBALS['OHCRUD'] = true;
define('__OHCRUD_PERMISSION_ALL__', -1);

try {
    if (file_exists($database)) {
        // Existing installations are validated without resetting accounts or content.
        require $root . '/public/vendor/autoload.php';
        if (__OHCRUD_DEBUG_MODE__ || __OHCRUD_DB_CONFIG__['DRIVER'] !== 'SQLITE'
            || realpath(__OHCRUD_DB_CONFIG__['SQLITE_DB']) !== realpath($database)) {
            throw new RuntimeException('Existing settings must use production mode and var/data.sqlite3. Review settings.php; it was not overwritten.');
        }
        $db = new PDO('sqlite:' . $database, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        foreach (['Users', 'Pages', 'Files', 'Folders', 'CloudFiles'] as $table) {
            $db->query('SELECT 1 FROM "' . $table . '" LIMIT 1');
        }
        echo "Existing database retained; accounts and CMS content unchanged.\n";
        exit(0);
    }
    if (file_exists($credentials)) {
        throw new RuntimeException('Initial credentials already exist without a database. Review the previous installation before retrying.');
    }
    $temporary = tempnam($root . '/var', '.setup-db-');
    if ($temporary === false) {
        throw new RuntimeException('Cannot create staging database.');
    }
    define('__ALTUS_SETUP_DATABASE__', $temporary);
    require $root . '/public/vendor/autoload.php';
    if (!__OHCRUD_DEBUG_MODE__ || __OHCRUD_DB_CONFIG__['DRIVER'] !== 'SQLITE'
        || __OHCRUD_DB_CONFIG__['SQLITE_DB'] !== $temporary) {
        throw new RuntimeException('Settings do not support isolated initialization. Use settings.sample.php while preserving any existing secret.');
    }
    if (__OHCRUD_SECRET__ === 'CHANGE_ME_WITH_SETUP' || strlen(__OHCRUD_SECRET__) !== 32) {
        throw new RuntimeException('A 32-character installation secret is required.');
    }
    $users = new \ohCRUD\Users();
    $pages = new \app\models\mPages();
    $files = new \app\models\mFiles();
    $folders = new \app\models\mFolders();
    $cloudFiles = new \app\models\mCloudFiles();
    foreach ([$users, $pages, $files, $folders, $cloudFiles] as $model) {
        if (!$model->success) {
            throw new RuntimeException('Schema initialization failed.');
        }
    }
    $secrets = [];
    foreach (['admin', 'user'] as $username) {
        $secrets[$username] = bin2hex(random_bytes(12));
        $users->update('Users', ['PASSWORD' => $secrets[$username]], 'USERNAME = :name', [':name' => $username]);
        if (!$users->success) {
            throw new RuntimeException('Cannot set initial account password.');
        }
    }
    $pages->update('Pages', [
        'TITLE' => 'Your personal cloud',
        'TEXT' => file_get_contents($root . '/private/cms/landing.html'),
        'THEME' => 'altus-site', 'LAYOUT' => 'index', 'STATUS' => 1, 'PERMISSIONS' => -1,
    ], 'URL = :url', [':url' => '/']);
    if (!$pages->success) {
        throw new RuntimeException('Cannot seed landing page.');
    }
    // Default passwords must never reach the live database.
    foreach ($users->db->query('SELECT USERNAME, PASSWORD FROM Users') as $row) {
        if (!isset($secrets[$row['USERNAME']]) || !password_verify($secrets[$row['USERNAME']] . __OHCRUD_SECRET__, $row['PASSWORD'])) {
            throw new RuntimeException('Initial password verification failed.');
        }
    }
    if ($users->db->query('PRAGMA integrity_check')->fetchColumn() !== 'ok') {
        throw new RuntimeException('Database integrity check failed.');
    }
    $handle = fopen($credentials, 'x');
    if (!$handle) {
        throw new RuntimeException('Cannot write initial credentials.');
    }
    $credentialText = "Altus initial credentials — store securely, then remove this file.\n\n"
        . "admin: " . $secrets['admin'] . "\nuser: " . $secrets['user'] . "\n";
    $written = fwrite($handle, $credentialText);
    fclose($handle);
    if ($written !== strlen($credentialText)) {
        unlink($credentials);
        throw new RuntimeException('Could not persist initial credentials; database was not published.');
    }
    // Publish without overwriting a database that appeared during initialization.
    if (!link($temporary, $database)) {
        unlink($credentials);
        throw new RuntimeException('Cannot publish database; existing data was not overwritten.');
    }
    unlink($temporary);
    $temporary = null;
    echo "Database initialized with unique passwords and the CMS landing page.\n";
} catch (Throwable $error) {
    if ($temporary && is_file($temporary)) {
        unlink($temporary);
    }
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(1);
}
