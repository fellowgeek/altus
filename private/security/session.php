<?php
require __DIR__ . '/bootstrap.php';

$core = new ohCRUD\Core();
$pdo->prepare('INSERT INTO Users (ID, USERNAME, PASSWORD, PERMISSIONS, STATUS, TOTP, HASH, TOKEN) VALUES (1, ?, ?, 2, 1, 0, ?, ?)')
    ->execute(['security-user', password_hash('test-password' . __OHCRUD_SECRET__, PASSWORD_BCRYPT),
        str_repeat('a', 40), $core->encryptText(str_repeat('b', 40))]);
[$server, $base] = startFixtureServer();
function cookieFrom(array $response): string {
    return explode(';', $response['headers']['set-cookie'] ?? '')[0];
}
function tokenFrom(array $response): string {
    return json_decode($response['body'], true)['data']['csrf_token'] ?? '';
}

$bootstrap = httpRequest($base . '/api/v1/auth/csrfToken');
check($bootstrap['status'] === 200, 'CSRF bootstrap failed');
$cookie = cookieFrom($bootstrap);
$csrf = tokenFrom($bootstrap);
check(strlen($csrf) === 64 && $cookie !== '', 'Missing session/CSRF bootstrap: ' . json_encode($bootstrap));
$flags = strtolower($bootstrap['headers']['set-cookie']);
check(str_contains($flags, 'httponly') && str_contains($flags, 'samesite=lax') && !str_contains($flags, 'domain='), 'Cookie is not hardened/host-only');
check(!$core->checkCSRF(''), 'Empty CSRF token accepted');

foreach ([[], ['Sec-Fetch-Site: same-site'], ['Origin: ' . $base], ['Referer: ' . $base . '/cloud/']] as $extra) {
    $response = httpRequest($base . '/api/v1/auth/login', 'POST', array_merge(['Cookie: ' . $cookie, 'Content-Type: application/json'], $extra), '{}');
    check($response['status'] === 403, 'Cookie mutation without CSRF accepted');
}
foreach ([['Origin: https://untrusted.example'], ['Referer: https://untrusted.example/page'],
    ['Origin: null'], ['Origin: https://untrusted.example', 'Sec-Fetch-Site: same-site']] as $extra) {
    $response = httpRequest($base . '/api/v1/auth/csrfToken', 'GET', $extra);
    check($response['status'] === 403 && !isset($response['headers']['access-control-allow-origin']), 'Untrusted origin received access');
}
$response = httpRequest($base . '/api/v1/auth/csrfToken', 'GET', ['Cookie: ' . $cookie, 'Sec-Fetch-Site: cross-site']);
check($response['status'] === 403, 'Cross-site cookie request accepted');
$credentials = json_encode(['username' => 'security-user', 'password' => 'test-password']);
$headers = ['Cookie: ' . $cookie, 'X-CSRF-Token: ' . $csrf, 'Content-Type: application/json', 'Origin: ' . $base];
$login = httpRequest($base . '/api/v1/auth/login', 'POST', $headers, $credentials);
check($login['status'] === 200, 'Valid same-origin login failed: ' . $login['body']);
$authCookie = cookieFrom($login);
check($authCookie !== '' && $authCookie !== $cookie, 'Login did not rotate session');
check(httpRequest($base . '/api/v1/auth/me', 'GET', ['Cookie: ' . $cookie])['status'] === 401, 'Old session authenticated after rotation');
check(httpRequest($base . '/api/v1/auth/me', 'GET', ['Cookie: ' . $authCookie])['status'] === 200, 'Rotated session lost authentication');
foreach (['/api/v1/auth/logout', '/api/v1/auth/login', '/api/v1/user/password', '/api/v1/folders/post', '/api/v1/sync'] as $path) {
    check(httpRequest($base . $path, 'GET', ['Cookie: ' . $authCookie])['status'] === 405, 'GET allowed mutation: ' . $path);
}
$create = httpRequest($base . '/api/v1/folders', 'POST', ['Cookie: ' . $authCookie, 'X-CSRF-Token: ' . $csrf, 'Content-Type: application/json'], '{"name":"safe-folder"}');
check($create['status'] === 200 && is_dir(__ALTUS_STORAGE_PATH__ . 'safe-folder'), 'Valid CSRF mutation failed: ' . $create['body']);
$api = httpRequest($base . '/api/v1/auth/me', 'GET', ['Token: ' . str_repeat('a', 40) . str_repeat('b', 40)]);
check($api['status'] === 200, 'Stateless token API authentication failed');
$basic = httpRequest($base . '/api/v1/folders', 'POST', ['Authorization: Basic ' . base64_encode('security-user:test-password'), 'Content-Type: application/json'], '{"name":"api-folder"}');
check($basic['status'] === 200 && is_dir(__ALTUS_STORAGE_PATH__ . 'api-folder'), 'Stateless API mutation failed');
$logout = httpRequest($base . '/api/v1/auth/logout', 'POST', ['Cookie: ' . $authCookie, 'X-CSRF-Token: ' . $csrf]);
check($logout['status'] === 200, 'Logout failed');
check(httpRequest($base . '/api/v1/auth/me', 'GET', ['Cookie: ' . $authCookie])['status'] === 401, 'Logout left authenticated session');
$newCookie = cookieFrom($logout);
$newToken = tokenFrom($logout);
check($newCookie !== $authCookie && $newToken !== $csrf, 'Logout reused session or CSRF token');
$relogin = httpRequest($base . '/api/v1/auth/login', 'POST', ['Cookie: ' . $newCookie, 'X-CSRF-Token: ' . $newToken, 'Content-Type: application/json'], $credentials);
check($relogin['status'] === 200, 'Login after logout failed');
$totp = OTPHP\TOTP::generate();
$pdo->prepare('INSERT INTO Users (ID, USERNAME, PASSWORD, PERMISSIONS, STATUS, TOTP, TOTP_SECRET) VALUES (2, ?, ?, 2, 1, 1, ?)')
    ->execute(['mfa-user', password_hash('test-password' . __OHCRUD_SECRET__, PASSWORD_BCRYPT), $core->encryptText($totp->getSecret())]);
$directOtp = httpRequest($base . '/api/v1/auth/verify', 'POST', ['Content-Type: application/json'], json_encode(['user_id' => 2, 'code' => $totp->now()]));
check($directOtp['status'] === 401, 'Public OTP endpoint bypassed password login');
$mfaBootstrap = httpRequest($base . '/api/v1/auth/csrfToken');
$mfaToken = tokenFrom($mfaBootstrap);
$mfaLogin = httpRequest($base . '/api/v1/auth/login', 'POST', ['Cookie: ' . cookieFrom($mfaBootstrap), 'X-CSRF-Token: ' . $mfaToken, 'Content-Type: application/json'],
    '{"username":"mfa-user","password":"test-password"}');
check($mfaLogin['status'] === 200 && json_decode($mfaLogin['body'], true)['data']['totp_required'], 'MFA login did not issue challenge');
$mfaCookie = cookieFrom($mfaLogin);
check(httpRequest($base . '/api/v1/auth/me', 'GET', ['Cookie: ' . $mfaCookie])['status'] === 401, 'Password alone authenticated MFA account over HTTP');
$mfaHeaders = ['Cookie: ' . $mfaCookie, 'X-CSRF-Token: ' . $mfaToken, 'Content-Type: application/json'];
check(httpRequest($base . '/api/v1/auth/verify', 'POST', $mfaHeaders, json_encode(['user_id' => 1, 'code' => $totp->now()]))['status'] === 401,
    'HTTP endpoint accepted mismatched account');
$verified = httpRequest($base . '/api/v1/auth/verify', 'POST', $mfaHeaders, json_encode(['user_id' => 2, 'code' => $totp->now()]));
check($verified['status'] === 200 && cookieFrom($verified) !== $mfaCookie, 'MFA completion failed to rotate session');
check(httpRequest($base . '/api/v1/auth/me', 'GET', ['Cookie: ' . cookieFrom($verified)])['status'] === 200, 'Verified MFA session failed');
echo "PASS: strict host-only cookies, CSRF, hostile origins, HTTP verbs, session rotation/logout, cookie and stateless API compatibility.\n";
if (in_array('--browser', $argv, true)) {
    new app\models\mCloudFiles();
    echo $base . "\n";
    fgets(STDIN); // Keep only disposable fixtures alive for a local browser check.
}
