<?php
namespace app\controllers;

use app\models\mFolders;
use app\models\mCloudFiles;
use app\controllers\cFolders;
use app\controllers\cStream;

// Prevent direct access to this class.
if (isset($GLOBALS['OHCRUD']) == false) { die(); }

// Controller cCloudFiles - Cloud file management: queries, upload, rename, move, delete, streaming delegation.
class cCloudFiles extends \ohCRUD\DB {

    public $permissions = [
        'object' => 2,
        'get' => 2,
        'upload' => 2,
        'put' => 2,
        'delete' => 2,
        'stream' => 2,
        'download' => 2,
    ];

    /**
     * GET /api/v1/files
     * Query params: folder_id (int, default 0), sort (string), search (string)
     */
    public function get($request) {
        $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);

        $userId = isset($_SESSION['User']->ID) ? (int) $_SESSION['User']->ID : 2;
        $folderId = isset($request->folder_id) ? (int) $request->folder_id : 0;
        $sort = isset($request->sort) ? (string) $request->sort : 'name_asc';
        $search = isset($request->search) ? trim((string) $request->search) : null;

        $mCloudFiles = new mCloudFiles();
        $files = $mCloudFiles->getFilesByFolder($folderId, $userId, $sort, $search);

        $this->data = [
            'status' => 'success',
            'folder_id' => $folderId,
            'files' => $files
        ];
        $this->output();
    }

    /**
     * POST /api/v1/files/upload
     * Multipart form upload:
     * - files: $_FILES['file'] or $_FILES[0]
     * - folder_id: int (default 0)
     * - conflict: 'keep_both' | 'overwrite' | 'cancel' (default 'keep_both')
     */
    public function upload($request) {
        $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);

        $userId = isset($_SESSION['User']->ID) ? (int) $_SESSION['User']->ID : 2;
        $folderId = isset($_POST['folder_id']) ? (int) $_POST['folder_id'] : (isset($request->folder_id) ? (int) $request->folder_id : 0);
        $conflict = isset($_POST['conflict']) ? trim($_POST['conflict']) : (isset($request->conflict) ? trim($request->conflict) : 'keep_both');

        // Locate uploaded file
        $uploadInfo = null;
        if (!empty($_FILES['file'])) {
            $uploadInfo = $_FILES['file'];
        } elseif (!empty($_FILES[0])) {
            $uploadInfo = $_FILES[0];
        } elseif (!empty($_FILES['files']) && is_array($_FILES['files']['name'])) {
            $uploadInfo = [
                'name' => $_FILES['files']['name'][0],
                'type' => $_FILES['files']['type'][0],
                'tmp_name' => $_FILES['files']['tmp_name'][0],
                'error' => $_FILES['files']['error'][0],
                'size' => $_FILES['files']['size'][0]
            ];
        }

        if (!$uploadInfo || empty($uploadInfo['tmp_name']) || $uploadInfo['error'] !== UPLOAD_ERR_OK) {
            $errMsg = match ($uploadInfo['error'] ?? null) {
                UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Uploaded file exceeds max allowable size.',
                UPLOAD_ERR_PARTIAL => 'File was only partially uploaded.',
                UPLOAD_ERR_NO_FILE => 'No file was submitted.',
                default => 'Upload error occurred.'
            };
            $this->error($errMsg, 400);
            $this->output();
            return;
        }

        // Determine destination folder path on disk
        $mFolders = new mFolders();
        $folderRelativePath = '';
        if ($folderId > 0) {
            $folder = $mFolders->getFolderById($folderId, $userId);
            if (!$folder) {
                $this->error('Target folder not found.', 404);
                $this->output();
                return;
            }
            $folderRelativePath = $folder->PATH;
        }

        $folderPhysicalPath = cFolders::resolvePhysicalPath($folderRelativePath);
        if ($folderPhysicalPath === false || !is_dir($folderPhysicalPath)) {
            $this->error('Target directory is inaccessible.', 500);
            $this->output();
            return;
        }

        $rawFilename = basename($uploadInfo['name']);
        $safeFilename = cFolders::sanitizeSegment($rawFilename);
        if ($safeFilename === '') {
            $safeFilename = 'file_' . time();
        }

        $extension = strtolower(pathinfo($safeFilename, PATHINFO_EXTENSION));
        $basenameWithoutExt = pathinfo($safeFilename, PATHINFO_FILENAME);

        $targetRelativePath = trim(($folderRelativePath ? $folderRelativePath . '/' : '') . $safeFilename, '/');
        $targetPhysicalPath = cFolders::resolvePhysicalPath($targetRelativePath);

        // Handle collision on disk
        if (file_exists($targetPhysicalPath)) {
            if ($conflict === 'cancel') {
                $this->error('A file with that name already exists in this folder.', 409);
                $this->output();
                return;
            } elseif ($conflict === 'keep_both') {
                $counter = 1;
                while (file_exists($targetPhysicalPath)) {
                    $newFilename = "{$basenameWithoutExt}_{$counter}" . ($extension ? ".{$extension}" : '');
                    $targetRelativePath = trim(($folderRelativePath ? $folderRelativePath . '/' : '') . $newFilename, '/');
                    $targetPhysicalPath = cFolders::resolvePhysicalPath($targetRelativePath);
                    $counter++;
                }
                $safeFilename = basename($targetRelativePath);
            }
        }

        // Move uploaded file directly to physical target
        if (!move_uploaded_file($uploadInfo['tmp_name'], $targetPhysicalPath)) {
            $this->error('Failed to write uploaded file to physical storage.', 500);
            $this->output();
            return;
        }

        $fileSize = filesize($targetPhysicalPath);
        $mtime = filemtime($targetPhysicalPath);
        $mime = mCloudFiles::detectMimeType($targetPhysicalPath);
        $dimensions = mCloudFiles::getImageDimensions($targetPhysicalPath);
        $pathHash = mCloudFiles::hashPath($targetRelativePath);
        $now = date('Y-m-d H:i:s');

        // Check if database record already exists (e.g. In case of overwrite)
        $mCloudFiles = new mCloudFiles();
        $existing = $mCloudFiles->getFileByPath($targetRelativePath, $userId);

        if ($existing) {
            $this->run(
                "UPDATE CloudFiles SET NAME = :NAME, SIZE = :SIZE, MIME_TYPE = :MIME_TYPE, EXTENSION = :EXTENSION, MTIME = :MTIME, WIDTH = :WIDTH, HEIGHT = :HEIGHT, STATUS = 1, MDATE = :MDATE, MUSER = :MUSER
                 WHERE ID = :ID",
                [
                    ':NAME' => $safeFilename,
                    ':SIZE' => $fileSize,
                    ':MIME_TYPE' => $mime,
                    ':EXTENSION' => $extension,
                    ':MTIME' => $mtime,
                    ':WIDTH' => $dimensions['width'] ?? null,
                    ':HEIGHT' => $dimensions['height'] ?? null,
                    ':MDATE' => $now,
                    ':MUSER' => $userId,
                    ':ID' => $existing->ID
                ]
            );
            $fileId = (int) $existing->ID;
        } else {
            $this->run(
                "INSERT INTO CloudFiles (USER_ID, FOLDER_ID, NAME, PATH, PATH_HASH, MIME_TYPE, SIZE, EXTENSION, MTIME, HASH, WIDTH, HEIGHT, DURATION, STATUS, IS_FAVORITE, CDATE, MDATE, CUSER, MUSER)
                 VALUES (:USER_ID, :FOLDER_ID, :NAME, :PATH, :PATH_HASH, :MIME_TYPE, :SIZE, :EXTENSION, :MTIME, :HASH, :WIDTH, :HEIGHT, :DURATION, 1, 0, :CDATE, :MDATE, :CUSER, :MUSER)",
                [
                    ':USER_ID' => $userId,
                    ':FOLDER_ID' => $folderId,
                    ':NAME' => $safeFilename,
                    ':PATH' => $targetRelativePath,
                    ':PATH_HASH' => $pathHash,
                    ':MIME_TYPE' => $mime,
                    ':SIZE' => $fileSize,
                    ':EXTENSION' => $extension,
                    ':MTIME' => $mtime,
                    ':HASH' => null,
                    ':WIDTH' => $dimensions['width'] ?? null,
                    ':HEIGHT' => $dimensions['height'] ?? null,
                    ':DURATION' => null,
                    ':CDATE' => $now,
                    ':MDATE' => $now,
                    ':CUSER' => $userId,
                    ':MUSER' => $userId
                ]
            );
            $fileId = (int) $this->db->lastInsertId();
        }

        $this->data = [
            'status' => 'success',
            'file' => [
                'id' => $fileId,
                'name' => $safeFilename,
                'path' => $targetRelativePath,
                'folder_id' => $folderId,
                'size' => $fileSize,
                'mime_type' => $mime,
                'extension' => $extension,
                'mtime' => $mtime,
                'width' => $dimensions['width'] ?? null,
                'height' => $dimensions['height'] ?? null
            ]
        ];
        $this->output();
    }

    /**
     * PUT /api/v1/files/:id
     * Payload: name (optional), folder_id (optional), is_favorite (optional)
     */
    public function put($request) {
        $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);

        $userId = isset($_SESSION['User']->ID) ? (int) $_SESSION['User']->ID : 2;
        $fileId = isset($request->id) ? (int) $request->id : 0;
        if ($fileId <= 0) {
            $this->error('File ID is required.', 400);
            $this->output();
            return;
        }

        $mCloudFiles = new mCloudFiles();
        $file = $mCloudFiles->getFileById($fileId, $userId);
        if (!$file) {
            $this->error('File not found.', 404);
            $this->output();
            return;
        }

        $payload = $request->payload ?? null;
        $newName = isset($payload->name) ? trim($payload->name) : (isset($request->name) ? trim($request->name) : null);
        $newFolderId = isset($payload->folder_id) ? (int) $payload->folder_id : (isset($request->folder_id) ? (int) $request->folder_id : null);
        $isFavorite = isset($payload->is_favorite) ? (int) $payload->is_favorite : (isset($request->is_favorite) ? (int) $request->is_favorite : null);

        $oldRelativePath = $file->PATH;
        $targetName = ($newName !== null && $newName !== '') ? cFolders::sanitizeSegment($newName) : $file->NAME;
        $targetFolderId = ($newFolderId !== null) ? $newFolderId : (int) $file->FOLDER_ID;
        $targetFavorite = ($isFavorite !== null) ? $isFavorite : (int) $file->IS_FAVORITE;

        // Determine destination folder relative path
        $mFolders = new mFolders();
        $destinationFolderRelative = '';
        if ($targetFolderId > 0) {
            $targetFolder = $mFolders->getFolderById($targetFolderId, $userId);
            if (!$targetFolder) {
                $this->error('Target folder not found.', 404);
                $this->output();
                return;
            }
            $destinationFolderRelative = $targetFolder->PATH;
        }

        $newRelativePath = trim(($destinationFolderRelative ? $destinationFolderRelative . '/' : '') . $targetName, '/');

        // Check if file rename or move on disk is needed
        if ($newRelativePath !== $oldRelativePath) {
            $oldPhysicalPath = cFolders::resolvePhysicalPath($oldRelativePath);
            $newPhysicalPath = cFolders::resolvePhysicalPath($newRelativePath);

            if ($oldPhysicalPath === false || $newPhysicalPath === false) {
                $this->error('Invalid path resolution.', 400);
                $this->output();
                return;
            }

            if (file_exists($newPhysicalPath)) {
                $this->error('A file with that name already exists in target destination.', 409);
                $this->output();
                return;
            }

            if (!rename($oldPhysicalPath, $newPhysicalPath)) {
                $this->error('Failed to move or rename file on disk.', 500);
                $this->output();
                return;
            }
        }

        $newPathHash = mCloudFiles::hashPath($newRelativePath);
        $extension = strtolower(pathinfo($targetName, PATHINFO_EXTENSION));
        $now = date('Y-m-d H:i:s');

        $this->run(
            "UPDATE CloudFiles SET NAME = :NAME, FOLDER_ID = :FOLDER_ID, PATH = :PATH, PATH_HASH = :PATH_HASH, EXTENSION = :EXTENSION, IS_FAVORITE = :IS_FAVORITE, MDATE = :MDATE, MUSER = :MUSER
             WHERE ID = :ID AND USER_ID = :USER_ID",
            [
                ':NAME' => $targetName,
                ':FOLDER_ID' => $targetFolderId,
                ':PATH' => $newRelativePath,
                ':PATH_HASH' => $newPathHash,
                ':EXTENSION' => $extension,
                ':IS_FAVORITE' => $targetFavorite,
                ':MDATE' => $now,
                ':MUSER' => $userId,
                ':ID' => $fileId,
                ':USER_ID' => $userId
            ]
        );

        $this->data = [
            'status' => 'success',
            'file' => [
                'id' => $fileId,
                'name' => $targetName,
                'path' => $newRelativePath,
                'folder_id' => $targetFolderId,
                'is_favorite' => $targetFavorite
            ]
        ];
        $this->output();
    }

    /**
     * DELETE /api/v1/files/:id
     */
    public function delete($table, $where = '', $bind = []) {
        if (is_string($table)) {
            return parent::delete($table, $where, $bind);
        }
        $request = $table;
        $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);

        $userId = isset($_SESSION['User']->ID) ? (int) $_SESSION['User']->ID : 2;
        $fileId = isset($request->id) ? (int) $request->id : 0;
        if ($fileId <= 0) {
            $this->error('File ID is required.', 400);
            $this->output();
            return;
        }

        $mCloudFiles = new mCloudFiles();
        $file = $mCloudFiles->getFileById($fileId, $userId);
        if (!$file) {
            $this->error('File not found.', 404);
            $this->output();
            return;
        }

        $physicalPath = cFolders::resolvePhysicalPath($file->PATH);
        if ($physicalPath && file_exists($physicalPath)) {
            @unlink($physicalPath);
        }

        $now = date('Y-m-d H:i:s');
        $this->run(
            "UPDATE CloudFiles SET STATUS = 0, MDATE = :MDATE, MUSER = :MUSER WHERE ID = :ID AND USER_ID = :USER_ID",
            [
                ':MDATE' => $now,
                ':MUSER' => $userId,
                ':ID' => $fileId,
                ':USER_ID' => $userId
            ]
        );

        $this->data = [
            'status' => 'success',
            'deleted_id' => $fileId
        ];
        $this->output();
    }

    /**
     * GET /api/v1/files/:id/stream
     */
    public function stream($request) {
        $cStream = new cStream();
        $cStream->stream($request);
    }

    /**
     * GET /api/v1/files/:id/download
     */
    public function download($request) {
        $cStream = new cStream();
        $cStream->download($request);
    }
}
