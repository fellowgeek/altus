<?php
/** Run only inside a disposable native-install test container, as root. */
if (PHP_SAPI !== 'cli' || !is_file('/.dockerenv') || getenv('ALTUS_SETUP_TEST') !== '1') {
    fwrite(STDERR, "Run through private/setup/test-native.sh in a disposable container.\n");
    exit(1);
}
$root = dirname(__DIR__, 2);
$base = 'http://127.0.0.1:8080';
$cookie = '';
function request(string $path, string $method = 'GET', mixed $body = null): array {
    global $base, $cookie;
    $curl = curl_init($base . $path);
    $headers = ['Host: altus.test'];
    if (is_string($body)) $headers[] = 'Content-Type: application/json';
    curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true,
        CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $headers,
        CURLOPT_COOKIE => $cookie, CURLOPT_TIMEOUT => 30]);
    if ($body !== null) curl_setopt($curl, CURLOPT_POSTFIELDS, $body);
    $response = curl_exec($curl);
    if ($response === false) throw new RuntimeException(curl_error($curl));
    $headerSize = curl_getinfo($curl, CURLINFO_HEADER_SIZE);
    $head = substr($response, 0, $headerSize);
    if (preg_match('/Set-Cookie: (PHPSESSID=[^;]+)/i', $head, $match)) $cookie = $match[1];
    return [curl_getinfo($curl, CURLINFO_RESPONSE_CODE), substr($response, $headerSize)];
}
function check(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}
foreach (['/', '/cloud/', '/login/?redirect=%2F%3Faction%3Dtables%26table%3DUsers', '/themes/altus-site/assets/css/site.css'] as $path) {
    check(request($path)[0] === 200, 'Expected 200: ' . $path);
}
foreach (['/storage/test.txt', '/settings.php', '/vendor/autoload.php', '/themes/altus-site/index.html', '/composer.json', '/.git/config'] as $path) {
    check(request($path)[0] === 404, 'Expected protected 404: ' . $path);
}
check(request('/api/v1/auth/me')[0] === 401, 'Anonymous access should be denied.');
$credentials = file_get_contents($root . '/var/initial-credentials.txt');
preg_match('/^user: (.+)$/m', $credentials, $match);
check(isset($match[1]), 'Missing generated credentials.');
[$status, $body] = request('/api/v1/auth/login', 'POST', json_encode(['username' => 'user', 'password' => $match[1]]));
check($status === 200 && (json_decode($body, true)['success'] ?? false), 'Generated cloud password did not authenticate.');
check(request('/api/v1/auth/me')[0] === 200, 'Authenticated session failed.');
$upload = tempnam(sys_get_temp_dir(), 'altus-smoke-');
$name = 'setup-smoke-' . bin2hex(random_bytes(8)) . '.txt';
file_put_contents($upload, 'Native deployment upload verification.');
try {
    [$status, $body] = request('/api/v1/files/upload', 'POST', ['file' => new CURLFile($upload, 'text/plain', $name), 'folder_id' => '0']);
    check($status === 200 && (json_decode($body, true)['success'] ?? false), 'Upload failed.');
    check(file_get_contents($root . '/storage/' . $name) === file_get_contents($upload), 'Upload did not reach linked storage.');
    $db = new PDO('sqlite:' . $root . '/var/data.sqlite3');
    $query = $db->prepare('SELECT ID FROM CloudFiles WHERE NAME = ? AND STATUS=1');
    $query->execute([$name]);
    $id = $query->fetchColumn();
    $query->closeCursor();
    check($id !== false, 'Upload not indexed.');
    [$status, $body] = request('/api/v1/files/' . $id . '/download');
    check($status === 200 && $body === file_get_contents($upload), 'Authenticated download failed.');
    check(request('/api/v1/files/' . $id, 'DELETE')[0] === 200, 'Delete failed.');
    check(!file_exists($root . '/storage/' . $name), 'Deleted file remains on disk.');
} finally {
    unlink($upload);
}
request('/api/v1/auth/logout', 'POST', '{}');
preg_match('/^admin: (.+)$/m', $credentials, $match);
[$status, $body] = request('/api/v1/auth/login', 'POST', json_encode(['username' => 'admin', 'password' => $match[1]]));
check($status === 200 && (json_decode($body, true)['success'] ?? false), 'Generated admin password did not authenticate.');
[$status, $body] = request('/?action=tables&table=Users');
check($status === 200 && str_contains($body, '/themes/admin/'), 'CMS Users table route failed.');
echo "Native smoke test passed: routing, source/storage protection, both accounts, sessions, symlink upload/download/delete, CMS administration.\n";
