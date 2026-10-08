<?php
namespace app\controllers;

use app\models\mFolders;
use app\models\mCloudFiles;

// Prevent direct access to this class.
if (isset($GLOBALS['OHCRUD']) == false) { die(); }

// Controller cSync - Disk-to-DB Reconciliation ("Quick Sync") engine.
class cSync extends \ohCRUD\DB {

    public $permissions = [
        'object' => 2,
        'index' => 2,
        'post' => 2,
    ];

    public function index($request) {
        $this->executeSync($request);
    }

    public function post($request) {
        $this->executeSync($request);
    }

    /**
     * Executes the disk-to-database synchronization scan.
     */
    public function executeSync($request) {
        $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);
        $startTime = microtime(true);

        $storagePath = __ALTUS_STORAGE_PATH__;
        if (!is_dir($storagePath)) {
            $this->error('Physical storage directory does not exist: ' . $storagePath, 500);
            $this->output();
            return;
        }

        // Determine active user ID (defaults to Cloud User 2 if running in CLI)
        $userId = isset($_SESSION['User']->ID) ? (int) $_SESSION['User']->ID : 2;

        $scannedFiles = 0;
        $addedFiles = 0;
        $updatedFiles = 0;
        $removedFiles = 0;
        $addedFolders = 0;
        $removedFolders = 0;

        // Blacklist patterns to ignore
        $ignorePatterns = ['.DS_Store', '.git', '.gitkeep', 'Thumbs.db', 'desktop.ini'];

        try {
            $this->db->beginTransaction();

            // ---------------------------------------------------
            // STEP 1: Scan directories and files from disk
            // ---------------------------------------------------
            $diskFolders = []; // relative folder path => true
            $diskFiles = [];   // relative file path => [fullPath, relativePath, filename, ext, size, mtime]

            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($storagePath, \FilesystemIterator::SKIP_DOTS),
                \RecursiveIteratorIterator::SELF_FIRST
            );

            foreach ($iterator as $item) {
                $filename = $item->getFilename();

                // Skip ignored files, hidden temporary files, or symlinks pointing outside storage
                if (in_array($filename, $ignorePatterns, true) || str_starts_with($filename, '._') || ($filename !== '.' && $filename !== '..' && str_starts_with($filename, '.'))) {
                    continue;
                }

                if ($item->isLink()) {
                    $real = realpath($item->getPathname());
                    if ($real === false || ($real !== rtrim($storagePath, '/') && !str_starts_with($real, rtrim($storagePath, '/') . '/'))) {
                        continue;
                    }
                }

                $fullPath = $item->getPathname();
                $relativePath = trim(substr($fullPath, strlen($storagePath)), '/');

                if ($item->isDir()) {
                    $diskFolders[$relativePath] = true;
                } elseif ($item->isFile()) {
                    $scannedFiles++;
                    $diskFiles[$relativePath] = [
                        'fullPath' => $fullPath,
                        'relativePath' => $relativePath,
                        'filename' => $filename,
                        'name' => pathinfo($filename, PATHINFO_FILENAME),
                        'extension' => strtolower(pathinfo($filename, PATHINFO_EXTENSION)),
                        'size' => $item->getSize(),
                        'mtime' => $item->getMTime()
                    ];
                }
            }

            // ---------------------------------------------------
            // STEP 2: Reconcile Folders
            // ---------------------------------------------------
            // Fetch existing folders for this user
            $existingFolders = [];
            $foldersStmt = $this->db->prepare("SELECT ID, PARENT_ID, NAME, PATH, PATH_HASH FROM Folders WHERE USER_ID = :USER_ID AND STATUS = 1");
            $foldersStmt->execute([':USER_ID' => $userId]);
            $folderRows = $foldersStmt->fetchAll(\PDO::FETCH_OBJ);
            foreach ($folderRows as $row) {
                $existingFolders[$row->PATH] = $row;
            }

            // Sort disk folders by depth (shallow to deep) so parents exist first
            $sortedDiskFolders = array_keys($diskFolders);
            usort($sortedDiskFolders, function ($a, $b) {
                return substr_count($a, '/') <=> substr_count($b, '/');
            });

            // Map of folder relative path => folder ID
            $folderIdMap = ['' => 0];
            foreach ($folderRows as $row) {
                $folderIdMap[$row->PATH] = (int) $row->ID;
            }

            $insertFolderStmt = $this->db->prepare(
                "INSERT INTO Folders (USER_ID, PARENT_ID, NAME, PATH, PATH_HASH, COLOR, STATUS, CDATE, MDATE, CUSER, MUSER)
                 VALUES (:USER_ID, :PARENT_ID, :NAME, :PATH, :PATH_HASH, '#5f6368', 1, :CDATE, :MDATE, :CUSER, :MUSER)"
            );

            $now = date('Y-m-d H:i:s');

            foreach ($sortedDiskFolders as $folderPath) {
                if (!isset($existingFolders[$folderPath])) {
                    $parentPath = dirname($folderPath);
                    $parentId = ($parentPath === '.' || $parentPath === '/' || $parentPath === '') ? 0 : ($folderIdMap[$parentPath] ?? 0);
                    $folderName = basename($folderPath);
                    $pathHash = mFolders::hashPath($folderPath);

                    $insertFolderStmt->execute([
                        ':USER_ID' => $userId,
                        ':PARENT_ID' => $parentId,
                        ':NAME' => $folderName,
                        ':PATH' => $folderPath,
                        ':PATH_HASH' => $pathHash,
                        ':CDATE' => $now,
                        ':MDATE' => $now,
                        ':CUSER' => $userId,
                        ':MUSER' => $userId
                    ]);

                    $newFolderId = (int) $this->db->lastInsertId();
                    $folderIdMap[$folderPath] = $newFolderId;
                    $addedFolders++;
                }
            }

            // Handle folders removed from disk
            $deactivateFolderStmt = $this->db->prepare("UPDATE Folders SET STATUS = 0, MDATE = :MDATE, MUSER = :MUSER WHERE ID = :ID");
            foreach ($existingFolders as $fPath => $fObj) {
                if (!isset($diskFolders[$fPath])) {
                    $deactivateFolderStmt->execute([
                        ':ID' => $fObj->ID,
                        ':MDATE' => $now,
                        ':MUSER' => $userId
                    ]);
                    $removedFolders++;
                }
            }

            // ---------------------------------------------------
            // STEP 3: Reconcile CloudFiles
            // ---------------------------------------------------
            $existingFiles = [];
            $filesStmt = $this->db->prepare("SELECT ID, FOLDER_ID, NAME, PATH, PATH_HASH, SIZE, MTIME, STATUS FROM CloudFiles WHERE USER_ID = :USER_ID AND STATUS = 1");
            $filesStmt->execute([':USER_ID' => $userId]);
            $fileRows = $filesStmt->fetchAll(\PDO::FETCH_OBJ);
            foreach ($fileRows as $fRow) {
                $existingFiles[$fRow->PATH] = $fRow;
            }

            $insertFileStmt = $this->db->prepare(
                "INSERT INTO CloudFiles (USER_ID, FOLDER_ID, NAME, PATH, PATH_HASH, MIME_TYPE, SIZE, EXTENSION, MTIME, HASH, WIDTH, HEIGHT, DURATION, STATUS, IS_FAVORITE, CDATE, MDATE, CUSER, MUSER)
                 VALUES (:USER_ID, :FOLDER_ID, :NAME, :PATH, :PATH_HASH, :MIME_TYPE, :SIZE, :EXTENSION, :MTIME, :HASH, :WIDTH, :HEIGHT, :DURATION, 1, 0, :CDATE, :MDATE, :CUSER, :MUSER)"
            );

            $updateFileStmt = $this->db->prepare(
                "UPDATE CloudFiles SET FOLDER_ID = :FOLDER_ID, SIZE = :SIZE, MTIME = :MTIME, MIME_TYPE = :MIME_TYPE, WIDTH = :WIDTH, HEIGHT = :HEIGHT, MDATE = :MDATE, MUSER = :MUSER
                 WHERE ID = :ID"
            );

            foreach ($diskFiles as $filePath => $fileMeta) {
                $dirName = dirname($filePath);
                $folderId = ($dirName === '.' || $dirName === '/' || $dirName === '') ? 0 : ($folderIdMap[$dirName] ?? 0);
                $pathHash = mCloudFiles::hashPath($filePath);

                if (!isset($existingFiles[$filePath])) {
                    // New file on disk
                    $mime = mCloudFiles::detectMimeType($fileMeta['fullPath']);
                    $dimensions = mCloudFiles::getImageDimensions($fileMeta['fullPath']);

                    $insertFileStmt->execute([
                        ':USER_ID' => $userId,
                        ':FOLDER_ID' => $folderId,
                        ':NAME' => $fileMeta['filename'],
                        ':PATH' => $filePath,
                        ':PATH_HASH' => $pathHash,
                        ':MIME_TYPE' => $mime,
                        ':SIZE' => $fileMeta['size'],
                        ':EXTENSION' => $fileMeta['extension'],
                        ':MTIME' => $fileMeta['mtime'],
                        ':HASH' => null,
                        ':WIDTH' => $dimensions['width'] ?? null,
                        ':HEIGHT' => $dimensions['height'] ?? null,
                        ':DURATION' => null,
                        ':CDATE' => $now,
                        ':MDATE' => $now,
                        ':CUSER' => $userId,
                        ':MUSER' => $userId
                    ]);
                    $addedFiles++;
                } else {
                    // Existing file: check if modified
                    $dbFile = $existingFiles[$filePath];
                    if ((int) $dbFile->MTIME !== (int) $fileMeta['mtime'] || (int) $dbFile->SIZE !== (int) $fileMeta['size'] || (int) $dbFile->FOLDER_ID !== (int) $folderId) {
                        $mime = mCloudFiles::detectMimeType($fileMeta['fullPath']);
                        $dimensions = mCloudFiles::getImageDimensions($fileMeta['fullPath']);

                        $updateFileStmt->execute([
                            ':FOLDER_ID' => $folderId,
                            ':SIZE' => $fileMeta['size'],
                            ':MTIME' => $fileMeta['mtime'],
                            ':MIME_TYPE' => $mime,
                            ':WIDTH' => $dimensions['width'] ?? null,
                            ':HEIGHT' => $dimensions['height'] ?? null,
                            ':MDATE' => $now,
                            ':MUSER' => $userId,
                            ':ID' => $dbFile->ID
                        ]);
                        $updatedFiles++;
                    }
                }
            }

            // Handle files removed from disk
            $deactivateFileStmt = $this->db->prepare("UPDATE CloudFiles SET STATUS = 0, MDATE = :MDATE, MUSER = :MUSER WHERE ID = :ID");
            foreach ($existingFiles as $fPath => $fObj) {
                if (!isset($diskFiles[$fPath])) {
                    $deactivateFileStmt->execute([
                        ':ID' => $fObj->ID,
                        ':MDATE' => $now,
                        ':MUSER' => $userId
                    ]);
                    $removedFiles++;
                }
            }

            $this->db->commit();
        } catch (\Exception $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            $this->error('Sync failed: ' . $e->getMessage(), 500);
            $this->output();
            return;
        }

        $durationMs = (int) round((microtime(true) - $startTime) * 1000);

        $this->data = [
            'status' => 'success',
            'scanned_files' => $scannedFiles,
            'added_files' => $addedFiles,
            'updated_files' => $updatedFiles,
            'removed_files' => $removedFiles,
            'added_folders' => $addedFolders,
            'removed_folders' => $removedFolders,
            'duration_ms' => $durationMs
        ];
        $this->output();
    }
}
