<?php
namespace app\controllers;

use app\models\mCloudFiles;
use app\controllers\cFolders;

// Prevent direct access to this class.
if (isset($GLOBALS['OHCRUD']) == false) { die(); }

// Controller cStream - HTTP 206 Range streaming, inline preview, and secure file downloads.
class cStream extends \ohCRUD\DB {

    public $permissions = [
        'object' => 2,
        'get' => 2,
        'stream' => 2,
        'thumb' => 2,
        'download' => 2,
        'batchDownload' => 2,
    ];

    /**
     * GET /api/v1/stream/:id or /api/v1/stream?id=:id
     */
    public function get($request) {
        $fileId = isset($request->id) ? (int) $request->id : 0;
        if ($fileId <= 0) {
            $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);
            $this->error('File not found.', 404);
            $this->output();
            return;
        }
        if (!empty($request->thumb) && $request->thumb !== '0' && $request->thumb !== 'false') {
            $this->serveThumbnail($fileId, $request);
            return;
        }
        $this->serveFile($fileId, false);
    }

    /**
     * Streams file inline with RFC 7233 HTTP 206 Byte-Range support, or serves a cached thumbnail when ?thumb=1 is set.
     * Accessible via GET /api/v1/files/:id/stream or cStream::stream($request)
     */
    public function stream($request) {
        $fileId = isset($request->id) ? (int) $request->id : 0;
        if (!empty($request->thumb) && $request->thumb !== '0' && $request->thumb !== 'false') {
            $this->serveThumbnail($fileId, $request);
            return;
        }
        $this->serveFile($fileId, false);
    }

    /**
     * Generates, caches, and serves an optimized image thumbnail.
     * Accessible via GET /api/v1/files/:id/thumb or GET /api/v1/files/:id/stream?thumb=1
     */
    public function thumb($request) {
        $fileId = isset($request->id) ? (int) $request->id : 0;
        $this->serveThumbnail($fileId, $request);
    }

    /**
     * Downloads file as attachment with Content-Disposition.
     * Accessible via GET /api/v1/files/:id/download or cStream::downloadFile($id)
     */
    public function download($request) {
        $fileId = isset($request->id) ? (int) $request->id : 0;
        $this->serveFile($fileId, true);
    }

    /**
     * Serves file with byte-range streaming or download disposition.
     */
    public function serveFile(int $fileId, bool $asDownload = false) {
        $userId = isset($_SESSION['User']->ID) ? (int) $_SESSION['User']->ID : 2;

        if ($fileId <= 0) {
            $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);
            $this->error('File ID is required.', 400);
            $this->output();
            return;
        }

        $mCloudFiles = new mCloudFiles();
        $file = $mCloudFiles->getFileById($fileId, $userId);
        if (!$file) {
            $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);
            $this->error('File not found.', 404);
            $this->output();
            return;
        }

        $physicalPath = cFolders::resolvePhysicalPath($file->PATH);
        if ($physicalPath === false || !file_exists($physicalPath) || !is_readable($physicalPath)) {
            $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);
            $this->error('Physical file not found or unreadable on storage.', 404);
            $this->output();
            return;
        }

        $fileSize = filesize($physicalPath);
        $mimeType = !empty($file->MIME_TYPE) ? $file->MIME_TYPE : mCloudFiles::detectMimeType($physicalPath);
        $fileName = $file->NAME;

        // Clean output buffers
        while (ob_get_level() > 0) {
            ob_end_clean();
        }

        // Handle attachment download
        if ($asDownload) {
            header('Content-Type: ' . $mimeType);
            header('Content-Disposition: attachment; filename="' . rawurlencode($fileName) . '"; filename*=UTF-8\'\'' . rawurlencode($fileName));
            header('Content-Length: ' . $fileSize);
            header('Cache-Control: private, no-transform, no-store, must-revalidate');
            header('Pragma: no-cache');
            header('Expires: 0');
            readfile($physicalPath);
            exit;
        }

        // Inline preview & streaming headers
        header('Content-Type: ' . $mimeType);
        header('Content-Disposition: inline; filename="' . rawurlencode($fileName) . '"; filename*=UTF-8\'\'' . rawurlencode($fileName));
        header('Accept-Ranges: bytes');
        header('Cache-Control: private, max-age=86400');

        $range = $_SERVER['HTTP_RANGE'] ?? null;

        // Non-range request: stream entire file
        if (empty($range) || !preg_match('/^bytes=(\d*)-(\d*)$/', $range, $matches)) {
            header('Content-Length: ' . $fileSize);
            $fp = fopen($physicalPath, 'rb');
            if ($fp) {
                while (!feof($fp)) {
                    echo fread($fp, 65536); // 64KB buffer
                    flush();
                }
                fclose($fp);
            }
            exit;
        }

        // RFC 7233 HTTP 206 Partial Content Range handling
        $start = ($matches[1] !== '') ? (int) $matches[1] : 0;
        $end = ($matches[2] !== '') ? (int) $matches[2] : ($fileSize - 1);

        if ($start > $end || $start >= $fileSize || $end >= $fileSize) {
            header('HTTP/1.1 416 Range Not Satisfiable');
            header('Content-Range: bytes */' . $fileSize);
            exit;
        }

        $length = $end - $start + 1;

        header('HTTP/1.1 206 Partial Content');
        header("Content-Range: bytes {$start}-{$end}/{$fileSize}");
        header('Content-Length: ' . $length);

        $fp = fopen($physicalPath, 'rb');
        if ($fp) {
            fseek($fp, $start);
            $bytesRemaining = $length;
            $bufferSize = 65536; // 64KB buffer preventing memory exhaustion

            while ($bytesRemaining > 0 && !feof($fp)) {
                $readSize = min($bufferSize, $bytesRemaining);
                $buffer = fread($fp, $readSize);
                echo $buffer;
                flush();
                $bytesRemaining -= strlen($buffer);
            }
            fclose($fp);
        }
        exit;
    }

    /**
     * Generates, caches in __OHCRUD_CACHE_PATH__/thumbs/, and serves a resized WebP/JPEG thumbnail.
     * Gracefully falls back to serveFile() for non-raster formats (e.g. SVG) or if GD processing fails.
     */
    public function serveThumbnail(int $fileId, ?object $request = null) {
        $userId = isset($_SESSION['User']->ID) ? (int) $_SESSION['User']->ID : 2;

        if ($fileId <= 0) {
            $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);
            $this->error('File ID is required.', 400);
            $this->output();
            return;
        }

        $mCloudFiles = new mCloudFiles();
        $file = $mCloudFiles->getFileById($fileId, $userId);
        if (!$file) {
            $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);
            $this->error('File not found.', 404);
            $this->output();
            return;
        }

        $physicalPath = cFolders::resolvePhysicalPath($file->PATH);
        if ($physicalPath === false || !file_exists($physicalPath) || !is_readable($physicalPath)) {
            $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);
            $this->error('Physical file not found or unreadable on storage.', 404);
            $this->output();
            return;
        }

        $mimeType = !empty($file->MIME_TYPE) ? $file->MIME_TYPE : mCloudFiles::detectMimeType($physicalPath);

        // Vector images (SVG) or non-GD environments fall back directly to inline stream
        if ($mimeType === 'image/svg+xml' || !function_exists('imagecreatetruecolor')) {
            $this->serveFile($fileId, false);
            return;
        }

        $maxWidth = isset($request->w) ? max(16, min(1920, (int) $request->w)) : 400;
        $maxHeight = isset($request->h) ? max(16, min(1920, (int) $request->h)) : 400;
        $quality = isset($request->q) ? max(10, min(100, (int) $request->q)) : 80;

        $mtime = (int) ($file->MTIME ?: @filemtime($physicalPath));
        $fileSize = (int) ($file->SIZE ?: @filesize($physicalPath));

        $useWebp = function_exists('imagewebp');
        $outExt = $useWebp ? 'webp' : 'jpg';
        $outMime = $useWebp ? 'image/webp' : 'image/jpeg';

        $baseCachePath = defined('__OHCRUD_CACHE_PATH__') ? rtrim(__OHCRUD_CACHE_PATH__, '/') . '/' : sys_get_temp_dir() . '/';
        $cacheDir = $baseCachePath . 'thumbs/';
        if (!is_dir($cacheDir)) {
            @mkdir($cacheDir, 0775, true);
        }

        $cacheKey = md5("altus_thumb_{$file->ID}_{$mtime}_{$fileSize}_{$maxWidth}x{$maxHeight}_q{$quality}_{$outExt}");
        $cacheFile = $cacheDir . $cacheKey . '.' . $outExt;

        // Serve directly from cache if available
        if (file_exists($cacheFile) && is_readable($cacheFile) && filesize($cacheFile) > 0) {
            $this->sendCachedThumbnail($cacheFile, $outMime, $cacheKey);
            return;
        }

        // Inspect source image metadata
        $imageInfo = @getimagesize($physicalPath);
        if (!$imageInfo || empty($imageInfo[0]) || empty($imageInfo[1])) {
            $this->serveFile($fileId, false);
            return;
        }

        $origW = (int) $imageInfo[0];
        $origH = (int) $imageInfo[1];
        $detectedMime = $imageInfo['mime'] ?? $mimeType;

        // Guard against decompression bombs (> 64 megapixels)
        if (($origW * $origH) > 64000000) {
            $this->serveFile($fileId, false);
            return;
        }

        $sourceImage = match ($detectedMime) {
            'image/jpeg' => @imagecreatefromjpeg($physicalPath),
            'image/png' => @imagecreatefrompng($physicalPath),
            'image/gif' => @imagecreatefromgif($physicalPath),
            'image/webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($physicalPath) : false,
            default => false
        };

        if (!$sourceImage) {
            $this->serveFile($fileId, false);
            return;
        }

        // Handle EXIF orientation for JPEGs if exif extension is available
        if ($detectedMime === 'image/jpeg' && function_exists('exif_read_data')) {
            $exif = @exif_read_data($physicalPath);
            $orientation = (int) ($exif['Orientation'] ?? 1);
            if ($orientation === 3) {
                $rotated = @imagerotate($sourceImage, 180, 0);
                if ($rotated) {
                    $sourceImage = $rotated;
                }
            } elseif ($orientation === 6) {
                $rotated = @imagerotate($sourceImage, -90, 0);
                if ($rotated) {
                    $sourceImage = $rotated;
                    [$origW, $origH] = [$origH, $origW];
                }
            } elseif ($orientation === 8) {
                $rotated = @imagerotate($sourceImage, 90, 0);
                if ($rotated) {
                    $sourceImage = $rotated;
                    [$origW, $origH] = [$origH, $origW];
                }
            }
        }

        // Calculate proportional dimensions without upscaling smaller images
        $ratio = min($maxWidth / $origW, $maxHeight / $origH, 1.0);
        $newW = max(1, (int) round($origW * $ratio));
        $newH = max(1, (int) round($origH * $ratio));

        $thumbImage = imagecreatetruecolor($newW, $newH);
        if (!$thumbImage) {
            unset($sourceImage);
            $this->serveFile($fileId, false);
            return;
        }

        // Preserve alpha transparency for PNG, WebP, and GIF
        imagealphablending($thumbImage, false);
        imagesavealpha($thumbImage, true);
        $transparent = imagecolorallocatealpha($thumbImage, 0, 0, 0, 127);
        imagefill($thumbImage, 0, 0, $transparent);

        imagecopyresampled($thumbImage, $sourceImage, 0, 0, 0, 0, $newW, $newH, $origW, $origH);

        $saved = false;
        if (is_dir($cacheDir) && is_writable($cacheDir)) {
            $tmpFile = $cacheFile . '.' . uniqid('', true) . '.tmp';
            if ($useWebp) {
                $saved = @imagewebp($thumbImage, $tmpFile, $quality);
            } else {
                $saved = @imagejpeg($thumbImage, $tmpFile, $quality);
            }
            if ($saved && file_exists($tmpFile)) {
                @rename($tmpFile, $cacheFile);
            } else {
                @unlink($tmpFile);
            }
        }

        unset($sourceImage, $thumbImage);

        if (file_exists($cacheFile) && is_readable($cacheFile) && filesize($cacheFile) > 0) {
            $this->sendCachedThumbnail($cacheFile, $outMime, $cacheKey);
            return;
        }

        // Fallback if cache directory wasn't writable
        $this->serveFile($fileId, false);
    }

    /**
     * Outputs a cached thumbnail file with ETag, HTTP 304 Not Modified support, and long-lived private cache headers.
     */
    private function sendCachedThumbnail(string $cacheFile, string $mimeType, string $cacheKey): void {
        while (ob_get_level() > 0) {
            ob_end_clean();
        }

        $etag = '"' . $cacheKey . '"';
        $ifNoneMatch = isset($_SERVER['HTTP_IF_NONE_MATCH']) ? trim($_SERVER['HTTP_IF_NONE_MATCH']) : '';

        header_remove('Pragma');
        header('Cache-Control: private, max-age=2592000, immutable');
        header('ETag: ' . $etag);

        if ($ifNoneMatch === $etag || $ifNoneMatch === 'W/' . $etag) {
            header('HTTP/1.1 304 Not Modified');
            exit;
        }

        header('Content-Type: ' . $mimeType);
        header('Content-Length: ' . filesize($cacheFile));
        readfile($cacheFile);
        exit;
    }

    /**
     * Batch download: creates a temporary ZIP archive containing selected files.
     * POST /api/v1/files/download or GET with ?file_ids=1,2,3
     */
    public function batchDownload($request) {
        $userId = isset($_SESSION['User']->ID) ? (int) $_SESSION['User']->ID : 2;

        $payload = $request->payload ?? null;
        $fileIds = $payload->file_ids ?? $request->file_ids ?? $_REQUEST['file_ids'] ?? [];
        if (is_string($fileIds)) {
            $fileIds = array_filter(array_map('intval', explode(',', $fileIds)));
        }

        if (empty($fileIds)) {
            $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);
            $this->error('file_ids parameter is required.', 400);
            $this->output();
            return;
        }

        $mCloudFiles = new mCloudFiles();
        $filesToZip = [];

        foreach ($fileIds as $id) {
            $file = $mCloudFiles->getFileById((int) $id, $userId);
            if ($file) {
                $physPath = cFolders::resolvePhysicalPath($file->PATH);
                if ($physPath && file_exists($physPath)) {
                    $filesToZip[] = [
                        'name' => $file->NAME,
                        'path' => $physPath
                    ];
                }
            }
        }

        if (empty($filesToZip)) {
            $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);
            $this->error('No matching files found to archive.', 404);
            $this->output();
            return;
        }

        $zipFile = tempnam(sys_get_temp_dir(), 'altus_zip_') . '.zip';

        if (class_exists('\ZipArchive')) {
            $zip = new \ZipArchive();
            if ($zip->open($zipFile, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) {
                $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);
                $this->error('Failed to create ZIP archive.', 500);
                $this->output();
                return;
            }

            foreach ($filesToZip as $item) {
                $zip->addFile($item['path'], $item['name']);
            }
            $zip->close();
        } elseif (!self::createZipArchive($zipFile, $filesToZip)) {
            $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);
            $this->error('Failed to create ZIP archive.', 500);
            $this->output();
            return;
        }

        while (ob_get_level() > 0) {
            ob_end_clean();
        }

        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="altus_download_' . date('Ymd_His') . '.zip"');
        header('Content-Length: ' . filesize($zipFile));
        header('Cache-Control: private, no-store, no-cache, must-revalidate');

        readfile($zipFile);
        @unlink($zipFile);
        exit;
    }

    /**
     * Streams multiple files into a valid PKZIP archive without requiring ext-zip.
     */
    private static function createZipArchive(string $zipFile, array $filesToZip): bool {
        $fp = @fopen($zipFile, 'wb');
        if (!$fp) {
            return false;
        }

        $centralDirectory = '';
        $offset = 0;
        $count = 0;

        foreach ($filesToZip as $item) {
            $path = $item['path'];
            $name = $item['name'];
            if (!is_readable($path)) {
                continue;
            }

            $size = (int) filesize($path);
            $crc = (int) hexdec(hash_file('crc32b', $path));
            $nameLen = strlen($name);

            // Local file header (PK\x03\x04, store method 0 for zero-overhead streaming)
            $localHeader = pack(
                'VvvvvvVVVvv',
                0x04034b50,
                20,
                0,
                0,
                0,
                0,
                $crc,
                $size,
                $size,
                $nameLen,
                0
            ) . $name;

            fwrite($fp, $localHeader);

            $in = @fopen($path, 'rb');
            if ($in) {
                stream_copy_to_stream($in, $fp);
                fclose($in);
            }

            // Central directory file header (PK\x01\x02)
            $centralDirectory .= pack(
                'VvvvvvvVVVvvvvvVV',
                0x02014b50,
                20,
                20,
                0,
                0,
                0,
                0,
                $crc,
                $size,
                $size,
                $nameLen,
                0,
                0,
                0,
                0,
                32,
                $offset
            ) . $name;

            $offset += strlen($localHeader) + $size;
            $count++;
        }

        $cdSize = strlen($centralDirectory);
        fwrite($fp, $centralDirectory);

        // End of central directory record (PK\x05\x06)
        $eocd = pack(
            'VvvvvVVv',
            0x06054b50,
            0,
            0,
            $count,
            $count,
            $cdSize,
            $offset,
            0
        );
        fwrite($fp, $eocd);
        fclose($fp);

        return $count > 0;
    }
}
