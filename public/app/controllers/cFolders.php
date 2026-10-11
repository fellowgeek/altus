<?php
namespace app\controllers;

use app\models\mFolders;
use app\models\mCloudFiles;

// Prevent direct access to this class.
if (isset($GLOBALS['OHCRUD']) == false) { die(); }

// Controller cFolders - Folder CRUD, color tagging, hierarchy, and physical disk sync.
class cFolders extends \ohCRUD\DB {

    public $permissions = [
        'object' => 2,
        'get' => 2,
        'post' => 2,
        'put' => 2,
        'delete' => 2,
    ];

    /**
     * GET /api/v1/folders
     * Query params: parent_id (optional, default 0)
     */
    public function get($request) {
        $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);

        $userId = isset($_SESSION['User']->ID) ? (int) $_SESSION['User']->ID : 2;
        $mFolders = new mFolders();

        if (isset($request->favorites) && $request->favorites) {
            $sort = isset($request->sort) ? (string) $request->sort : 'name_asc';
            $folders = $mFolders->getFavoriteFolders($userId, $sort);
            $this->data = [
                'status' => 'success',
                'favorites' => true,
                'folders' => $folders
            ];
            $this->output();
            return;
        }

        if (isset($request->all) && $request->all) {
            $folders = $mFolders->getAllFolders($userId);
            $this->data = [
                'status' => 'success',
                'folders' => $folders
            ];
            $this->output();
            return;
        }

        $parentId = isset($request->parent_id) ? (int) $request->parent_id : 0;
        $sort = isset($request->sort) ? (string) $request->sort : 'name_asc';
        $folders = $mFolders->getSubfolders($parentId, $userId, $sort);
        $breadcrumbs = ($parentId > 0) ? $mFolders->getBreadcrumbs($parentId, $userId) : [];

        $this->data = [
            'status' => 'success',
            'parent_id' => $parentId,
            'breadcrumbs' => $breadcrumbs,
            'folders' => $folders
        ];
        $this->output();
    }

    /**
     * POST /api/v1/folders
     * Payload: name (string), parent_id (int, optional), color (string, optional)
     */
    public function post($request) {
        $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);

        $userId = isset($_SESSION['User']->ID) ? (int) $_SESSION['User']->ID : 2;
        $payload = $request->payload ?? null;
        $name = trim($payload->name ?? $request->name ?? $_POST['name'] ?? '');
        $parentId = isset($payload->parent_id) ? (int) $payload->parent_id : (isset($request->parent_id) ? (int) $request->parent_id : 0);
        $color = trim($payload->color ?? $request->color ?? $_POST['color'] ?? '#64748b');

        if (empty($name)) {
            $this->error('Folder name is required.', 400);
            $this->output();
            return;
        }

        $safeName = self::sanitizeSegment($name);
        if ($safeName === '' || $safeName !== $name) {
            $this->error('Invalid folder name.', 400);
            $this->output();
            return;
        }

        // Determine parent path
        $mFolders = new mFolders();
        $parentPath = '';
        if ($parentId > 0) {
            $parentFolder = $mFolders->getFolderById($parentId, $userId);
            if (!$parentFolder) {
                $this->error('Parent folder not found.', 404);
                $this->output();
                return;
            }
            $parentPath = $parentFolder->PATH;
        }

        $relativePath = trim(($parentPath ? $parentPath . '/' : '') . $safeName, '/');
        $physicalPath = self::resolvePhysicalPath($relativePath);
        if ($physicalPath === false) {
            $this->error('Invalid folder path.', 400);
            $this->output();
            return;
        }

        if (file_exists($physicalPath)) {
            $this->error('A folder or file with that name already exists on disk.', 409);
            $this->output();
            return;
        }

        if (!mkdir($physicalPath, 0755, true)) {
            $this->error('Failed to create folder on physical storage.', 500);
            $this->output();
            return;
        }

        $pathHash = mFolders::hashPath($relativePath);
        $now = date('Y-m-d H:i:s');

        // Check if a folder record already exists (e.g. Inactive/soft-deleted folder being recreated)
        $mFolders = new mFolders();
        $existing = $mFolders->getFolderByPath($relativePath, $userId, false);

        if ($existing) {
            $this->run(
                "UPDATE Folders SET PARENT_ID = :PARENT_ID, NAME = :NAME, COLOR = :COLOR, STATUS = 1, MDATE = :MDATE, MUSER = :MUSER WHERE ID = :ID",
                [
                    ':PARENT_ID' => $parentId,
                    ':NAME' => $safeName,
                    ':COLOR' => $color,
                    ':MDATE' => $now,
                    ':MUSER' => $userId,
                    ':ID' => $existing->ID
                ]
            );
            $newId = (int) $existing->ID;
        } else {
            $this->run(
                "INSERT INTO Folders (USER_ID, PARENT_ID, NAME, PATH, PATH_HASH, COLOR, STATUS, CDATE, MDATE, CUSER, MUSER)
                 VALUES (:USER_ID, :PARENT_ID, :NAME, :PATH, :PATH_HASH, :COLOR, 1, :CDATE, :MDATE, :CUSER, :MUSER)",
                [
                    ':USER_ID' => $userId,
                    ':PARENT_ID' => $parentId,
                    ':NAME' => $safeName,
                    ':PATH' => $relativePath,
                    ':PATH_HASH' => $pathHash,
                    ':COLOR' => $color,
                    ':CDATE' => $now,
                    ':MDATE' => $now,
                    ':CUSER' => $userId,
                    ':MUSER' => $userId
                ]
            );
            $newId = (int) $this->db->lastInsertId();
        }

        $this->data = [
            'status' => 'success',
            'folder' => [
                'id' => $newId,
                'name' => $safeName,
                'path' => $relativePath,
                'parent_id' => $parentId,
                'color' => $color
            ]
        ];
        $this->output();
    }

    /**
     * PUT /api/v1/folders/:id
     * Payload: name (optional), color (optional), parent_id (optional)
     */
    public function put($request) {
        $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);

        $userId = isset($_SESSION['User']->ID) ? (int) $_SESSION['User']->ID : 2;
        $folderId = isset($request->id) ? (int) $request->id : 0;
        if ($folderId <= 0) {
            $this->error('Folder ID is required.', 400);
            $this->output();
            return;
        }

        $mFolders = new mFolders();
        $folder = $mFolders->getFolderById($folderId, $userId);
        if (!$folder) {
            $this->error('Folder not found.', 404);
            $this->output();
            return;
        }

        $payload = $request->payload ?? null;
        $newName = isset($payload->name) ? trim($payload->name) : (isset($request->name) ? trim($request->name) : null);
        $newColor = isset($payload->color) ? trim($payload->color) : (isset($request->color) ? trim($request->color) : null);
        $newParentId = isset($payload->parent_id) ? (int) $payload->parent_id : (isset($request->parent_id) ? (int) $request->parent_id : null);
        $isFavorite = isset($payload->is_favorite) ? (int) $payload->is_favorite : (isset($request->is_favorite) ? (int) $request->is_favorite : null);

        $oldRelativePath = $folder->PATH;
        $targetName = ($newName !== null && $newName !== '') ? self::sanitizeSegment($newName) : $folder->NAME;
        $targetParentId = ($newParentId !== null) ? $newParentId : (int) $folder->PARENT_ID;
        $targetColor = ($newColor !== null && $newColor !== '') ? $newColor : $folder->COLOR;
        $targetFavorite = ($isFavorite !== null) ? $isFavorite : (int) ($folder->IS_FAVORITE ?? 0);

        // Prevent moving folder into itself or its descendants
        if ($newParentId !== null && $newParentId !== (int) $folder->PARENT_ID) {
            if ($newParentId === $folderId) {
                $this->error('Cannot move folder into itself.', 400);
                $this->output();
                return;
            }
            $ancestors = $mFolders->getBreadcrumbs($newParentId, $userId);
            foreach ($ancestors as $ancestor) {
                if ($ancestor['id'] === $folderId) {
                    $this->error('Cannot move folder into one of its subfolders.', 400);
                    $this->output();
                    return;
                }
            }
        }

        // Determine new parent path
        $newParentPath = '';
        if ($targetParentId > 0) {
            $parentFolder = $mFolders->getFolderById($targetParentId, $userId);
            if (!$parentFolder) {
                $this->error('Target parent folder not found.', 404);
                $this->output();
                return;
            }
            $newParentPath = $parentFolder->PATH;
        }

        $newRelativePath = trim(($newParentPath ? $newParentPath . '/' : '') . $targetName, '/');

        // Check if rename/move on disk is needed
        if ($newRelativePath !== $oldRelativePath) {
            $oldPhysicalPath = self::resolvePhysicalPath($oldRelativePath);
            $newPhysicalPath = self::resolvePhysicalPath($newRelativePath);

            if ($oldPhysicalPath === false || $newPhysicalPath === false) {
                $this->error('Invalid path resolution.', 400);
                $this->output();
                return;
            }

            if (file_exists($newPhysicalPath)) {
                $this->error('Target destination already exists on disk.', 409);
                $this->output();
                return;
            }

            if (!rename($oldPhysicalPath, $newPhysicalPath)) {
                $this->error('Failed to rename/move directory on physical disk.', 500);
                $this->output();
                return;
            }

            // Cascade path updates to child folders and files
            $this->cascadePathUpdate($userId, $oldRelativePath, $newRelativePath);
        }

        $newPathHash = mFolders::hashPath($newRelativePath);
        $now = date('Y-m-d H:i:s');

        // Clean up any soft-deleted tombstone that might exist with this path hash to prevent unique constraint conflict
        $this->run("DELETE FROM Folders WHERE PATH_HASH = :PATH_HASH AND STATUS = 0", [':PATH_HASH' => $newPathHash]);

        $this->run(
            "UPDATE Folders SET NAME = :NAME, PARENT_ID = :PARENT_ID, PATH = :PATH, PATH_HASH = :PATH_HASH, COLOR = :COLOR, IS_FAVORITE = :IS_FAVORITE, MDATE = :MDATE, MUSER = :MUSER
             WHERE ID = :ID",
            [
                ':NAME' => $targetName,
                ':PARENT_ID' => $targetParentId,
                ':PATH' => $newRelativePath,
                ':PATH_HASH' => $newPathHash,
                ':COLOR' => $targetColor,
                ':IS_FAVORITE' => $targetFavorite,
                ':MDATE' => $now,
                ':MUSER' => $userId,
                ':ID' => $folderId
            ]
        );

        $this->data = [
            'status' => 'success',
            'folder' => [
                'id' => $folderId,
                'name' => $targetName,
                'path' => $newRelativePath,
                'parent_id' => $targetParentId,
                'color' => $targetColor,
                'is_favorite' => $targetFavorite
            ]
        ];
        $this->output();
    }

    /**
     * DELETE /api/v1/folders/:id
     */
    public function delete($table, $where = '', $bind = []) {
        if (is_string($table)) {
            return parent::delete($table, $where, $bind);
        }
        $request = $table;
        $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);

        $userId = isset($_SESSION['User']->ID) ? (int) $_SESSION['User']->ID : 2;
        $folderId = isset($request->id) ? (int) $request->id : 0;
        if ($folderId <= 0) {
            $this->error('Folder ID is required.', 400);
            $this->output();
            return;
        }

        $mFolders = new mFolders();
        $folder = $mFolders->getFolderById($folderId, $userId);
        if (!$folder) {
            $this->error('Folder not found.', 404);
            $this->output();
            return;
        }

        $physicalPath = self::resolvePhysicalPath($folder->PATH);
        if ($physicalPath !== false && is_dir($physicalPath)) {
            self::recursiveDeleteDirectory($physicalPath);
        }

        // Cascade delete in database
        $now = date('Y-m-d H:i:s');
        $prefix = $folder->PATH . '/';

        // Soft delete child files
        $this->run(
            "UPDATE CloudFiles SET STATUS = 0, MDATE = :MDATE, MUSER = :MUSER
             WHERE FOLDER_ID = :FOLDER_ID OR PATH LIKE :PREFIX",
            [
                ':MDATE' => $now,
                ':MUSER' => $userId,
                ':FOLDER_ID' => $folderId,
                ':PREFIX' => $prefix . '%'
            ]
        );

        // Soft delete child folders and current folder
        $this->run(
            "UPDATE Folders SET STATUS = 0, MDATE = :MDATE, MUSER = :MUSER
             WHERE ID = :ID OR PATH LIKE :PREFIX",
            [
                ':MDATE' => $now,
                ':MUSER' => $userId,
                ':ID' => $folderId,
                ':PREFIX' => $prefix . '%'
            ]
        );

        $this->data = [
            'status' => 'success',
            'deleted_id' => $folderId
        ];
        $this->output();
    }

    /**
     * Cascades path updates to all descendant folders and files.
     */
    private function cascadePathUpdate(int $userId, string $oldPrefix, string $newPrefix) {
        $oldPrefixWithSlash = $oldPrefix . '/';
        $newPrefixWithSlash = $newPrefix . '/';
        $now = date('Y-m-d H:i:s');

        // Update descendant folders
        $folders = $this->db->prepare("SELECT ID, PATH FROM Folders WHERE STATUS = 1 AND PATH LIKE :PREFIX");
        $folders->execute([':PREFIX' => $oldPrefixWithSlash . '%']);
        $folderRows = $folders->fetchAll(\PDO::FETCH_OBJ);

        $updateFolder = $this->db->prepare("UPDATE Folders SET PATH = :PATH, PATH_HASH = :PATH_HASH, MDATE = :MDATE, MUSER = :MUSER WHERE ID = :ID");
        foreach ($folderRows as $row) {
            $updatedPath = $newPrefixWithSlash . substr($row->PATH, strlen($oldPrefixWithSlash));
            $updateFolder->execute([
                ':PATH' => $updatedPath,
                ':PATH_HASH' => mFolders::hashPath($updatedPath),
                ':MDATE' => $now,
                ':MUSER' => $userId,
                ':ID' => $row->ID
            ]);
        }

        // Update descendant files
        $files = $this->db->prepare("SELECT ID, PATH FROM CloudFiles WHERE STATUS = 1 AND PATH LIKE :PREFIX");
        $files->execute([':PREFIX' => $oldPrefixWithSlash . '%']);
        $fileRows = $files->fetchAll(\PDO::FETCH_OBJ);

        $updateFile = $this->db->prepare("UPDATE CloudFiles SET PATH = :PATH, PATH_HASH = :PATH_HASH, MDATE = :MDATE, MUSER = :MUSER WHERE ID = :ID");
        foreach ($fileRows as $fRow) {
            $updatedPath = $newPrefixWithSlash . substr($fRow->PATH, strlen($oldPrefixWithSlash));
            $updateFile->execute([
                ':PATH' => $updatedPath,
                ':PATH_HASH' => mCloudFiles::hashPath($updatedPath),
                ':MDATE' => $now,
                ':MUSER' => $userId,
                ':ID' => $fRow->ID
            ]);
        }
    }

    /**
     * Sanitizes a single folder/filename segment.
     */
    public static function sanitizeSegment(string $segment): string {
        $segment = trim($segment);
        // Remove null bytes and control chars
        $segment = preg_replace('/[\x00-\x1F\x7F]/', '', $segment);
        // Disallow slashes, backslashes, colons, traversal
        if (str_contains($segment, '/') || str_contains($segment, '\\') || $segment === '.' || $segment === '..' || str_contains($segment, '..')) {
            return '';
        }
        return $segment;
    }

    /**
     * Resolves a relative storage path safely, protecting against path traversal.
     */
    public static function resolvePhysicalPath(string $relativePath): string|false {
        $storageRoot = realpath(rtrim(__ALTUS_STORAGE_PATH__, '/')) ?: rtrim(__ALTUS_STORAGE_PATH__, '/');
        $normalizedRelative = trim($relativePath, '/');

        // Check for null bytes, backslashes, or control characters
        if (preg_match('/[\x00-\x1F\x7F\\\\]/', $normalizedRelative)) {
            return false;
        }

        // Prevent traversal segments
        $segments = explode('/', $normalizedRelative);
        foreach ($segments as $seg) {
            if ($seg === '.' || $seg === '..' || str_contains($seg, '..')) {
                return false;
            }
        }

        $fullPath = $storageRoot . ($normalizedRelative !== '' ? '/' . $normalizedRelative : '');

        // If path already exists, verify its canonical realpath is within storageRoot
        if (file_exists($fullPath)) {
            $real = realpath($fullPath);
            if ($real === false || ($real !== $storageRoot && !str_starts_with($real, $storageRoot . '/'))) {
                return false;
            }
            return $real;
        }

        // If path does not exist yet (e.g. creating new folder or file), verify ancestor
        $parent = dirname($fullPath);
        while (!file_exists($parent) && strlen($parent) >= strlen($storageRoot)) {
            $parent = dirname($parent);
        }
        if (file_exists($parent)) {
            $realParent = realpath($parent);
            if ($realParent === false || ($realParent !== $storageRoot && !str_starts_with($realParent, $storageRoot . '/'))) {
                return false;
            }
        }

        return $fullPath;
    }

    /**
     * Recursively deletes a directory from disk.
     */
    public static function recursiveDeleteDirectory(string $dir): bool {
        if (!is_dir($dir)) {
            return false;
        }
        $items = scandir($dir);
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $path = $dir . '/' . $item;
            if (is_dir($path)) {
                self::recursiveDeleteDirectory($path);
            } else {
                @unlink($path);
            }
        }
        return @rmdir($dir);
    }
}
