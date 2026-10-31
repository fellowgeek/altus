<?php
namespace ohCRUD;

if (!isset($GLOBALS['OHCRUD'])) { die(); }

/** Shared attempt counters survive new sessions and concurrent PHP workers. */
class AuthThrottle extends DB {
    public function allow(string $scope, string $identity, int $limit, int $seconds = 300): bool {
        $this->db->exec('CREATE TABLE IF NOT EXISTS AuthAttempts (
            ID VARCHAR(64) PRIMARY KEY, WINDOW_START INTEGER NOT NULL, ATTEMPTS INTEGER NOT NULL
        )');
        $start = intdiv(time(), $seconds) * $seconds;
        $key = hash('sha256', $scope . "\0" . $identity . "\0" . $start);
        $this->db->beginTransaction();
        try {
            $sql = $this->config['DRIVER'] === 'MYSQL'
                ? 'INSERT INTO AuthAttempts (ID, WINDOW_START, ATTEMPTS) VALUES (?, ?, 1)
                   ON DUPLICATE KEY UPDATE ATTEMPTS = ATTEMPTS + 1'
                : 'INSERT INTO AuthAttempts (ID, WINDOW_START, ATTEMPTS) VALUES (?, ?, 1)
                   ON CONFLICT(ID) DO UPDATE SET ATTEMPTS = ATTEMPTS + 1';
            $this->db->prepare($sql)->execute([$key, $start]);
            $query = $this->db->prepare('SELECT ATTEMPTS FROM AuthAttempts WHERE ID = ?');
            $query->execute([$key]);
            $allowed = (int) $query->fetchColumn() <= $limit;
            $query->closeCursor();
            $this->db->prepare('DELETE FROM AuthAttempts WHERE WINDOW_START < ?')->execute([$start - $seconds]);
            $this->db->commit();
            return $allowed;
        } catch (\Throwable $error) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $error;
        }
    }
}
