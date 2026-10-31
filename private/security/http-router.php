<?php
if (PHP_SAPI !== 'cli-server' || getenv('ALTUS_SECURITY_TEST') !== '1') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/bootstrap.php';
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path === '/') {
    echo '<a href="/cloud/">Open cloud</a>';
    exit;
}
if (preg_match('@^/(?:themes|global)/[a-zA-Z0-9_./-]+\.(?:css|js|woff2|png|ico)$@', $path)
    && !str_contains($path, '..') && is_file(__SELF__ . ltrim($path, '/'))) {
    return false;
}
if (str_starts_with($_SERVER['REQUEST_URI'], '/stream/')) {
    $_SESSION['User'] = (object) ['ID' => 1];
    (new app\controllers\cStream())->serveFile((int) basename(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH)));
    exit;
}
if ($path === '/cms-image') {
    $method = new ReflectionMethod(app\controllers\cFiles::class, 'serveImage');
    $method->invoke(new app\controllers\cFiles(), __ALTUS_STORAGE_PATH__ . 'attack.svg');
    exit;
}
require $root . '/public/routes.php';
new ohCRUD\Router($_SERVER['REQUEST_URI']);
