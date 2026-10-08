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
        'stream' => 2,
        'download' => 2,
        'batchDownload' => 2,
    ];

    /**
     * Streams file inline with RFC 7233 HTTP 206 Byte-Range support.
     * Accessible via GET /api/v1/files/:id/stream or cStream::streamFile($id)
     */
    public function stream($request) {
        $fileId = isset($request->id) ? (int) $request->id : 0;
        $this->serveFile($fileId, false);
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
}
