<?php
if (PHP_SAPI !== 'cli-server' || getenv('ALTUS_SECURITY_TEST') !== '1') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/bootstrap.php';
if (str_starts_with($_SERVER['REQUEST_URI'], '/stream/')) {
    $_SESSION['User'] = (object) ['ID' => 1];
    (new app\controllers\cStream())->serveFile((int) basename(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH)));
    exit;
}
http_response_code(404);
