<?php
require __DIR__ . '/bootstrap.php';
$files = new app\models\mCloudFiles();
$samples = [
    ['attack.html', 'text/html', '<script>document.cookie="compromised=yes"</script>'],
    ['attack.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'],
    ['attack.xml', 'application/xml', '<test/>'],
    ['attack.js', 'text/javascript', 'alert(1)'],
    ['document.md', 'text/markdown', '# Document'],
    ['plain.txt', 'text/plain', '0123456789'],
    ['image.png', 'image/png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=')],
    ['video.mp4', 'video/mp4', '0123456789'],
    ['document.pdf', 'application/pdf', '%PDF-1.7'],
];
foreach ($samples as $index => [$name, $mime, $body]) {
    file_put_contents(__ALTUS_STORAGE_PATH__ . $name, $body);
    $pdo->prepare('INSERT INTO CloudFiles (ID, USER_ID, NAME, PATH, PATH_HASH, MIME_TYPE, SIZE, EXTENSION, MTIME) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$index + 1, $name, $name, hash('sha256', $name), $mime, strlen($body), pathinfo($name, PATHINFO_EXTENSION), time()]);
}
[$server, $base] = startFixtureServer();
foreach ($samples as $index => [$name, $mime, $body]) {
    $response = httpRequest($base . '/stream/' . ($index + 1));
    check($response['status'] === 200 && $response['body'] === $body, 'File delivery changed: ' . $name);
    $expectedPolicy = $mime === 'application/pdf'
        ? "default-src 'none'; object-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"
        : "sandbox; default-src 'none'";
    check($response['headers']['content-security-policy'] === $expectedPolicy, 'Incorrect document policy: ' . $name);
    check($response['headers']['x-content-type-options'] === 'nosniff', 'Missing nosniff');
    check(str_starts_with($response['headers']['content-disposition'], $index < 5 ? 'attachment;' : 'inline;'), 'Incorrect disposition: ' . $name);
}
$range = httpRequest($base . '/stream/8', 'GET', ['Range: bytes=2-5']);
check($range['status'] === 206 && $range['body'] === '2345', 'Media range streaming failed');
check($range['headers']['content-range'] === 'bytes 2-5/10', 'Range metadata changed');
$suffix = httpRequest($base . '/stream/6', 'GET', ['Range: bytes=-4']);
check($suffix['status'] === 206 && $suffix['body'] === '6789'
    && $suffix['headers']['content-range'] === 'bytes 6-9/10', 'Suffix range returned the wrong end of the file');
foreach (['bytes=-100', 'bytes=0-100', 'bytes=0-'] as $header) {
    $response = httpRequest($base . '/stream/6', 'GET', ['Range: ' . $header]);
    check($response['status'] === 206 && $response['body'] === '0123456789'
        && $response['headers']['content-range'] === 'bytes 0-9/10', 'Valid full-file range failed: ' . $header);
}
foreach (['bytes=-0', 'bytes=-', 'bytes=10-', 'bytes=5-2'] as $header) {
    $response = httpRequest($base . '/stream/6', 'GET', ['Range: ' . $header]);
    check($response['status'] === 416 && $response['headers']['content-range'] === 'bytes */10', 'Unsatisfiable range accepted: ' . $header);
}
$pdfRange = httpRequest($base . '/stream/9', 'GET', ['Range: bytes=-3']);
check($pdfRange['status'] === 206 && $pdfRange['body'] === '1.7'
    && !str_contains($pdfRange['headers']['content-security-policy'], 'sandbox'), 'PDF suffix delivery or native-viewer policy failed');
file_put_contents(__ALTUS_STORAGE_PATH__ . 'document.pdf', '<script>alert(1)</script>');
$spoofedPdf = httpRequest($base . '/stream/9');
check(str_starts_with($spoofedPdf['headers']['content-disposition'], 'attachment;')
    && $spoofedPdf['headers']['content-security-policy'] === "sandbox; default-src 'none'", 'Non-PDF content bypassed the sandbox');
$cmsImage = httpRequest($base . '/cms-image');
check($cmsImage['status'] === 200 && $cmsImage['headers']['content-disposition'] === 'attachment'
    && $cmsImage['headers']['content-security-policy'] === "sandbox; default-src 'none'", 'CMS image route bypassed active-content protection');
echo "PASS: active documents remain sandboxed downloads; native PDF viewing, MIME spoof protection, and byte ranges verified.\n";
