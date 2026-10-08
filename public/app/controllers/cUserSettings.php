<?php
namespace app\controllers;

use OTPHP\TOTP;

// Prevent direct access to this class.
if (isset($GLOBALS['OHCRUD']) == false) { die(); }

// Controller cUserSettings - Account settings: password update and TOTP 2FA management.
class cUserSettings extends \ohCRUD\DB {

    public $permissions = [
        'object' => 2,
        'password' => 2,
        'setup' => 2,
        'verify' => 2,
        'disable' => 2,
    ];

    /**
     * POST /api/v1/user/password
     */
    public function password($request) {
        $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);

        if (empty($_SESSION['User'])) {
            $this->error('Unauthorized.', 401);
            $this->output();
            return;
        }

        $payload = $request->payload ?? null;
        $currentPassword = $payload->current_password ?? $request->current_password ?? $_POST['current_password'] ?? '';
        $newPassword = $payload->new_password ?? $request->new_password ?? $_POST['new_password'] ?? '';

        if (empty($currentPassword) || empty($newPassword)) {
            $this->error('Both current password and new password are required.', 400);
            $this->output();
            return;
        }

        if (strlen($newPassword) < 6) {
            $this->error('New password must be at least 6 characters long.', 400);
            $this->output();
            return;
        }

        $userId = (int) $_SESSION['User']->ID;
        $userRow = $this->read('Users', 'ID = :ID', [':ID' => $userId])->first();

        if (!$userRow || !password_verify($currentPassword . __OHCRUD_SECRET__, $userRow->PASSWORD)) {
            $this->error('Current password does not match.', 400);
            $this->output();
            return;
        }

        $users = new \ohCRUD\Users();
        $users->update('Users', ['PASSWORD' => $newPassword], 'ID = :ID', [':ID' => $userId]);

        $this->data = [
            'status' => 'success',
            'message' => 'Password updated successfully.'
        ];
        $this->output();
    }

    /**
     * POST /api/v1/user/totp/setup
     */
    public function setup($request) {
        $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);

        if (empty($_SESSION['User'])) {
            $this->error('Unauthorized.', 401);
            $this->output();
            return;
        }

        $user = $_SESSION['User'];
        $totp = TOTP::generate();
        $totp->setLabel($user->EMAIL ?? $user->USERNAME);
        $totp->setIssuer('Altus');

        $secret = $totp->getSecret();
        $uri = $totp->getProvisioningUri();

        // Store pending secret in session for verification
        $this->setSession('pending_totp_secret', $secret);

        $this->data = [
            'status' => 'success',
            'secret' => $secret,
            'provisioning_uri' => $uri
        ];
        $this->output();
    }

    /**
     * POST /api/v1/user/totp/verify
     */
    public function verify($request) {
        $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);

        if (empty($_SESSION['User'])) {
            $this->error('Unauthorized.', 401);
            $this->output();
            return;
        }

        $payload = $request->payload ?? null;
        $code = $payload->code ?? $request->code ?? $_POST['code'] ?? '';
        $pendingSecret = $this->getSession('pending_totp_secret');

        if (empty($code) || empty($pendingSecret)) {
            $this->error('Verification code and active setup session are required.', 400);
            $this->output();
            return;
        }

        $totp = TOTP::createFromSecret($pendingSecret);
        if (!$totp->verify($code)) {
            $this->error('Invalid verification code. Please check your authenticator app.', 400);
            $this->output();
            return;
        }

        $userId = (int) $_SESSION['User']->ID;
        $encryptedSecret = $this->encryptText($pendingSecret);

        $this->update('Users', [
            'TOTP_SECRET' => $encryptedSecret,
            'TOTP' => 1
        ], 'ID = :ID', [':ID' => $userId]);

        $_SESSION['User']->TOTP = 1;
        $this->unsetSession('pending_totp_secret');

        $this->data = [
            'status' => 'success',
            'message' => 'Two-factor authentication enabled successfully.'
        ];
        $this->output();
    }

    /**
     * POST /api/v1/user/totp/disable
     */
    public function disable($request) {
        $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);

        if (empty($_SESSION['User'])) {
            $this->error('Unauthorized.', 401);
            $this->output();
            return;
        }

        $payload = $request->payload ?? null;
        $password = $payload->password ?? $request->password ?? $_POST['password'] ?? '';

        if (empty($password)) {
            $this->error('Password confirmation is required to disable 2FA.', 400);
            $this->output();
            return;
        }

        $userId = (int) $_SESSION['User']->ID;
        $userRow = $this->read('Users', 'ID = :ID', [':ID' => $userId])->first();

        if (!$userRow || !password_verify($password . __OHCRUD_SECRET__, $userRow->PASSWORD)) {
            $this->error('Password is incorrect.', 400);
            $this->output();
            return;
        }

        $this->update('Users', [
            'TOTP_SECRET' => null,
            'TOTP' => 0
        ], 'ID = :ID', [':ID' => $userId]);

        $_SESSION['User']->TOTP = 0;

        $this->data = [
            'status' => 'success',
            'message' => 'Two-factor authentication disabled successfully.'
        ];
        $this->output();
    }
}
