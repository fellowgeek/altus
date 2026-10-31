<?php
/** Assert fixture cleanup only inside the disposable Hurl container. */
if (PHP_SAPI !== 'cli' || !is_file('/.dockerenv') || getenv('ALTUS_HURL_TEST') !== '1') {
    fwrite(STDERR, "Run through private/hurl/test.sh in its disposable container.\n");
    exit(1);
}
$db = new PDO('sqlite:/opt/altus/var/data.sqlite3', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
foreach (['Folders', 'CloudFiles', 'Files'] as $table) {
    if ((int) $db->query('SELECT COUNT(*) FROM "' . $table . '" WHERE STATUS = 1')->fetchColumn() !== 0) {
        throw new RuntimeException('Active upload/folder fixtures remain in ' . $table);
    }
}
if ((int) $db->query("SELECT COUNT(*) FROM Pages WHERE URL = '/system/hurl-test/' AND STATUS = 1")->fetchColumn() !== 0) {
    throw new RuntimeException('CMS page fixture is still published.');
}
foreach (['/opt/altus/storage', '/opt/altus/public/global/files'] as $directory) {
    $entries = array_diff(scandir($directory), ['.', '..', '.gitkeep']);
    if ($entries !== []) {
        throw new RuntimeException('Uploaded fixture files remain on disk.');
    }
}
echo "Fixture cleanup verified: no active file/folder records, published test page, or uploaded files.\n";
