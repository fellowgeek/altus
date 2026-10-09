<?php
namespace app\models;

// Prevent direct access to this class.
if (isset($GLOBALS['OHCRUD']) == false) { die(); }

// Model mFolders - Manages folder hierarchy, paths, and SQLite persistence.
class mFolders extends \ohCRUD\DB {

    public $permissions = [
        'object' => __OHCRUD_PERMISSION_ALL__
    ];

    public function __construct() {
        parent::__construct();

        $this->initTable();
    }

    /**
     * Initializes the Folders database schema and indexes.
     */
    private function initTable() {
        if (!isset($this->config['DRIVER'])) {
            return;
        }

        switch ($this->config['DRIVER']) {
            case 'SQLITE':
                $sql = "CREATE TABLE IF NOT EXISTS `Folders` (
                    `ID` INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
                    `USER_ID` INTEGER NOT NULL,
                    `PARENT_ID` INTEGER DEFAULT 0,
                    `NAME` TEXT NOT NULL,
                    `PATH` TEXT NOT NULL,
                    `PATH_HASH` TEXT NOT NULL,
                    `COLOR` TEXT DEFAULT '#5f6368',
                    `STATUS` INTEGER DEFAULT 1,
                    `IS_FAVORITE` INTEGER DEFAULT 0,
                    `CDATE` TEXT,
                    `MDATE` TEXT,
                    `CUSER` INTEGER,
                    `MUSER` INTEGER
                );";
                $this->run($sql);

                $this->run("CREATE INDEX IF NOT EXISTS idx_Folders_USER ON Folders (`USER_ID`);");
                $this->run("CREATE INDEX IF NOT EXISTS idx_Folders_PARENT ON Folders (`PARENT_ID`);");
                $this->run("CREATE UNIQUE INDEX IF NOT EXISTS idx_Folders_PATH_HASH ON Folders (`PATH_HASH`);");
                $this->run("CREATE INDEX IF NOT EXISTS idx_Folders_STATUS ON Folders (`STATUS`);");
                break;

            case 'MYSQL':
                $sql = "CREATE TABLE IF NOT EXISTS `Folders` (
                    `ID` int(11) unsigned NOT NULL AUTO_INCREMENT,
                    `USER_ID` int(11) unsigned NOT NULL,
                    `PARENT_ID` int(11) unsigned DEFAULT 0,
                    `NAME` varchar(255) NOT NULL,
                    `PATH` text NOT NULL,
                    `PATH_HASH` char(64) NOT NULL,
                    `COLOR` varchar(32) DEFAULT '#5f6368',
                    `STATUS` tinyint(1) DEFAULT 1,
                    `CDATE` datetime DEFAULT NULL,
                    `MDATE` datetime DEFAULT NULL,
                    `CUSER` int(11) DEFAULT NULL,
                    `MUSER` int(11) DEFAULT NULL,
                    PRIMARY KEY (`ID`),
                    UNIQUE KEY `idx_Folders_PATH_HASH` (`PATH_HASH`),
                    KEY `idx_Folders_USER` (`USER_ID`),
                    KEY `idx_Folders_PARENT` (`PARENT_ID`),
                    KEY `idx_Folders_STATUS` (`STATUS`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
                $this->run($sql);
                break;
        }
    }

    /**
     * Computes a deterministic SHA-256 hash of a normalized path.
     *
     * @param string $path Normalized relative directory path (e.g. "Documents/Invoices")
     * @return string SHA-256 hash string
     */
    public static function hashPath(string $path): string {
        $normalized = trim($path, '/');
        return hash('sha256', $normalized);
    }

    /**
     * Retrieve folder by ID with optional user filtering.
     */
    public function getFolderById(int $id, ?int $userId = null) {
        $where = 'ID = :ID AND STATUS = :STATUS';
        $bind = [
            ':ID' => $id,
            ':STATUS' => $this::ACTIVE
        ];

        if ($userId !== null) {
            $where .= ' AND USER_ID = :USER_ID';
            $bind[':USER_ID'] = $userId;
        }

        return $this->read('Folders', $where, $bind)->first();
    }

    /**
     * Retrieve folder by relative path hash.
     */
    public function getFolderByPath(string $path, ?int $userId = null, bool $onlyActive = true) {
        $hash = self::hashPath($path);
        $where = 'PATH_HASH = :PATH_HASH';
        $bind = [
            ':PATH_HASH' => $hash
        ];

        if ($onlyActive) {
            $where .= ' AND STATUS = :STATUS';
            $bind[':STATUS'] = $this::ACTIVE;
        }

        if ($userId !== null) {
            $where .= ' AND USER_ID = :USER_ID';
            $bind[':USER_ID'] = $userId;
        }

        return $this->read('Folders', $where, $bind)->first();
    }

    /**
     * Retrieve list of subfolders under a given parent.
     */
    public function getSubfolders(int $parentId = 0, ?int $userId = null, string $sort = 'name_asc'): array {
        $where = 'PARENT_ID = :PARENT_ID AND STATUS = :STATUS';
        $bind = [
            ':PARENT_ID' => $parentId,
            ':STATUS' => $this::ACTIVE
        ];

        if ($userId !== null) {
            $where .= ' AND USER_ID = :USER_ID';
            $bind[':USER_ID'] = $userId;
        }

        $orderBy = match ($sort) {
            'name_desc' => 'NAME COLLATE NOCASE DESC',
            'mtime_desc', 'date_desc' => 'CDATE DESC',
            'mtime_asc', 'date_asc' => 'CDATE ASC',
            default => 'NAME COLLATE NOCASE ASC'
        };

        $result = $this->read('Folders', $where, $bind, '*', $orderBy);
        if (is_array($this->data)) {
            return $this->data;
        }
        return [];
    }

    /**
     * Retrieve all active folders for a user ordered by path.
     */
    public function getAllFolders(?int $userId = null): array {
        $where = 'STATUS = :STATUS';
        $bind = [
            ':STATUS' => $this::ACTIVE
        ];

        if ($userId !== null) {
            $where .= ' AND USER_ID = :USER_ID';
            $bind[':USER_ID'] = $userId;
        }

        $result = $this->read('Folders', $where, $bind, '*', 'PATH ASC');
        if (is_array($this->data)) {
            return $this->data;
        }
        return [];
    }

    /**
     * Retrieve list of favorite folders for a user.
     */
    public function getFavoriteFolders(?int $userId = null, string $sort = 'name_asc'): array {
        $where = 'IS_FAVORITE = 1 AND STATUS = :STATUS';
        $bind = [
            ':STATUS' => $this::ACTIVE
        ];

        if ($userId !== null) {
            $where .= ' AND USER_ID = :USER_ID';
            $bind[':USER_ID'] = $userId;
        }

        $orderBy = match ($sort) {
            'name_desc' => 'NAME COLLATE NOCASE DESC',
            'mtime_desc', 'date_desc' => 'CDATE DESC',
            'mtime_asc', 'date_asc' => 'CDATE ASC',
            default => 'NAME COLLATE NOCASE ASC'
        };

        $result = $this->read('Folders', $where, $bind, '*', $orderBy);
        if (is_array($this->data)) {
            return $this->data;
        }
        return [];
    }

    /**
     * Builds breadcrumb hierarchy array for a folder.
     */
    public function getBreadcrumbs(int $folderId, ?int $userId = null): array {
        $breadcrumbs = [];
        $currentId = $folderId;

        while ($currentId > 0) {
            $folder = $this->getFolderById($currentId, $userId);
            if (!$folder) {
                break;
            }
            array_unshift($breadcrumbs, [
                'id' => (int) $folder->ID,
                'name' => $folder->NAME,
                'path' => $folder->PATH,
                'color' => $folder->COLOR ?? '#5f6368'
            ]);
            $currentId = (int) $folder->PARENT_ID;
        }

        return $breadcrumbs;
    }
}
