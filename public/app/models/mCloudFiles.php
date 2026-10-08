<?php
namespace app\models;

// Prevent direct access to this class.
if (isset($GLOBALS['OHCRUD']) == false) { die(); }

// Model mCloudFiles - Manages cloud file records, metadata, path hashing, and SQLite persistence.
class mCloudFiles extends \ohCRUD\DB {

    public $permissions = [
        'object' => __OHCRUD_PERMISSION_ALL__
    ];

    public function __construct() {
        parent::__construct();

        $this->initTable();
    }

    /**
     * Initializes the CloudFiles database schema and indexes.
     */
    private function initTable() {
        if (!isset($this->config['DRIVER'])) {
            return;
        }

        switch ($this->config['DRIVER']) {
            case 'SQLITE':
                $sql = "CREATE TABLE IF NOT EXISTS `CloudFiles` (
                    `ID` INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
                    `USER_ID` INTEGER NOT NULL,
                    `FOLDER_ID` INTEGER DEFAULT 0,
                    `NAME` TEXT NOT NULL,
                    `PATH` TEXT NOT NULL,
                    `PATH_HASH` TEXT NOT NULL,
                    `MIME_TYPE` TEXT NOT NULL,
                    `SIZE` INTEGER NOT NULL,
                    `EXTENSION` TEXT NOT NULL,
                    `MTIME` INTEGER NOT NULL,
                    `HASH` TEXT,
                    `WIDTH` INTEGER DEFAULT NULL,
                    `HEIGHT` INTEGER DEFAULT NULL,
                    `DURATION` INTEGER DEFAULT NULL,
                    `STATUS` INTEGER DEFAULT 1,
                    `IS_FAVORITE` INTEGER DEFAULT 0,
                    `CDATE` TEXT,
                    `MDATE` TEXT,
                    `CUSER` INTEGER,
                    `MUSER` INTEGER
                );";
                $this->run($sql);

                $this->run("CREATE INDEX IF NOT EXISTS idx_CloudFiles_USER ON CloudFiles (`USER_ID`);");
                $this->run("CREATE INDEX IF NOT EXISTS idx_CloudFiles_FOLDER ON CloudFiles (`FOLDER_ID`);");
                $this->run("CREATE UNIQUE INDEX IF NOT EXISTS idx_CloudFiles_PATH_HASH ON CloudFiles (`PATH_HASH`);");
                $this->run("CREATE INDEX IF NOT EXISTS idx_CloudFiles_STATUS ON CloudFiles (`STATUS`);");
                $this->run("CREATE INDEX IF NOT EXISTS idx_CloudFiles_MIME ON CloudFiles (`MIME_TYPE`);");
                break;

            case 'MYSQL':
                $sql = "CREATE TABLE IF NOT EXISTS `CloudFiles` (
                    `ID` int(11) unsigned NOT NULL AUTO_INCREMENT,
                    `USER_ID` int(11) unsigned NOT NULL,
                    `FOLDER_ID` int(11) unsigned DEFAULT 0,
                    `NAME` varchar(255) NOT NULL,
                    `PATH` text NOT NULL,
                    `PATH_HASH` char(64) NOT NULL,
                    `MIME_TYPE` varchar(128) NOT NULL,
                    `SIZE` bigint(20) unsigned NOT NULL,
                    `EXTENSION` varchar(32) NOT NULL,
                    `MTIME` bigint(20) NOT NULL,
                    `HASH` varchar(64) DEFAULT NULL,
                    `WIDTH` int(11) DEFAULT NULL,
                    `HEIGHT` int(11) DEFAULT NULL,
                    `DURATION` int(11) DEFAULT NULL,
                    `STATUS` tinyint(1) DEFAULT 1,
                    `IS_FAVORITE` tinyint(1) DEFAULT 0,
                    `CDATE` datetime DEFAULT NULL,
                    `MDATE` datetime DEFAULT NULL,
                    `CUSER` int(11) DEFAULT NULL,
                    `MUSER` int(11) DEFAULT NULL,
                    PRIMARY KEY (`ID`),
                    UNIQUE KEY `idx_CloudFiles_PATH_HASH` (`PATH_HASH`),
                    KEY `idx_CloudFiles_USER` (`USER_ID`),
                    KEY `idx_CloudFiles_FOLDER` (`FOLDER_ID`),
                    KEY `idx_CloudFiles_STATUS` (`STATUS`),
                    KEY `idx_CloudFiles_MIME` (`MIME_TYPE`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
                $this->run($sql);
                break;
        }
    }

    /**
     * Computes a deterministic SHA-256 hash of a normalized path.
     *
     * @param string $path Normalized relative file path (e.g. "Documents/Invoices/2026_Q1.pdf")
     * @return string SHA-256 hash string
     */
    public static function hashPath(string $path): string {
        $normalized = trim($path, '/');
        return hash('sha256', $normalized);
    }

    /**
     * Retrieve file by ID with optional user filtering.
     */
    public function getFileById(int $id, ?int $userId = null) {
        $where = 'ID = :ID AND STATUS = :STATUS';
        $bind = [
            ':ID' => $id,
            ':STATUS' => $this::ACTIVE
        ];

        if ($userId !== null) {
            $where .= ' AND USER_ID = :USER_ID';
            $bind[':USER_ID'] = $userId;
        }

        return $this->read('CloudFiles', $where, $bind)->first();
    }

    /**
     * Retrieve file by relative path hash.
     */
    public function getFileByPath(string $path, ?int $userId = null) {
        $hash = self::hashPath($path);
        $where = 'PATH_HASH = :PATH_HASH AND STATUS = :STATUS';
        $bind = [
            ':PATH_HASH' => $hash,
            ':STATUS' => $this::ACTIVE
        ];

        if ($userId !== null) {
            $where .= ' AND USER_ID = :USER_ID';
            $bind[':USER_ID'] = $userId;
        }

        return $this->read('CloudFiles', $where, $bind)->first();
    }

    /**
     * Retrieve files within a folder with optional sorting and search filtering.
     */
    public function getFilesByFolder(int $folderId, ?int $userId = null, string $sort = 'name_asc', ?string $search = null): array {
        $where = 'FOLDER_ID = :FOLDER_ID AND STATUS = :STATUS';
        $bind = [
            ':FOLDER_ID' => $folderId,
            ':STATUS' => $this::ACTIVE
        ];

        if ($userId !== null) {
            $where .= ' AND USER_ID = :USER_ID';
            $bind[':USER_ID'] = $userId;
        }

        if (!empty($search)) {
            $where .= ' AND NAME LIKE :SEARCH';
            $bind[':SEARCH'] = '%' . $search . '%';
        }

        $orderBy = match ($sort) {
            'name_desc' => 'NAME DESC',
            'date_desc', 'mtime_desc' => 'MTIME DESC',
            'date_asc', 'mtime_asc' => 'MTIME ASC',
            'size_desc' => 'SIZE DESC',
            'size_asc' => 'SIZE ASC',
            default => 'NAME ASC'
        };

        $result = $this->read('CloudFiles', $where, $bind, '*', $orderBy);
        if (is_array($this->data)) {
            return $this->data;
        }
        return [];
    }

    /**
     * Retrieve favorite files for a user with optional sorting.
     */
    public function getFavoriteFiles(?int $userId = null, string $sort = 'name_asc'): array {
        $where = 'IS_FAVORITE = 1 AND STATUS = :STATUS';
        $bind = [
            ':STATUS' => $this::ACTIVE
        ];

        if ($userId !== null) {
            $where .= ' AND USER_ID = :USER_ID';
            $bind[':USER_ID'] = $userId;
        }

        $orderBy = match ($sort) {
            'name_desc' => 'NAME DESC',
            'date_desc', 'mtime_desc' => 'MTIME DESC',
            'date_asc', 'mtime_asc' => 'MTIME ASC',
            'size_desc' => 'SIZE DESC',
            'size_asc' => 'SIZE ASC',
            default => 'NAME ASC'
        };

        $result = $this->read('CloudFiles', $where, $bind, '*', $orderBy);
        if (is_array($this->data)) {
            return $this->data;
        }
        return [];
    }

    /**
     * Safely detects MIME type using fileinfo or extension fallback.
     */
    public static function detectMimeType(string $filePath): string {
        if (file_exists($filePath)) {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mime = finfo_file($finfo, $filePath);
            if (!empty($mime)) {
                return $mime;
            }
        }

        $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
        $map = [
            'pdf' => 'application/pdf',
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'svg' => 'image/svg+xml',
            'mp4' => 'video/mp4',
            'webm' => 'video/webm',
            'mov' => 'video/quicktime',
            'mp3' => 'audio/mpeg',
            'wav' => 'audio/wav',
            'ogg' => 'audio/ogg',
            'm4a' => 'audio/mp4',
            'flac' => 'audio/flac',
            'txt' => 'text/plain',
            'md' => 'text/markdown',
            'json' => 'application/json',
            'csv' => 'text/csv',
            'xml' => 'application/xml',
            'zip' => 'application/zip'
        ];

        return $map[$ext] ?? 'application/octet-stream';
    }

    /**
     * Returns image dimensions if the file is a raster or SVG image.
     */
    public static function getImageDimensions(string $filePath): ?array {
        if (!file_exists($filePath)) {
            return null;
        }

        $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
        if ($ext === 'svg') {
            $content = @file_get_contents($filePath);
            if ($content && preg_match('/<svg[^>]+viewBox=["\']\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*["\']/i', $content, $m)) {
                return ['width' => (int) $m[3], 'height' => (int) $m[4]];
            }
            if ($content && preg_match('/width=["\']([0-9.]+)px?["\'].*?height=["\']([0-9.]+)px?["\']/is', $content, $m)) {
                return ['width' => (int) $m[1], 'height' => (int) $m[2]];
            }
            return null;
        }

        $size = @getimagesize($filePath);
        if ($size && !empty($size[0]) && !empty($size[1])) {
            return ['width' => (int) $size[0], 'height' => (int) $size[1]];
        }

        return null;
    }
}
