<?php
namespace app\controllers;

// Prevent direct access to this class.
if (isset($GLOBALS['OHCRUD']) == false) { die(); }

// Controller cCloudAuth - Authentication endpoints for Altus Cloud.
class cCloudAuth extends \ohCRUD\DB {

    public $permissions = [
        'object' => __OHCRUD_PERMISSION_ALL__,
        'login' => __OHCRUD_PERMISSION_ALL__,
        'verify' => __OHCRUD_PERMISSION_ALL__,
        'logout' => __OHCRUD_PERMISSION_ALL__,
        'me' => 2,
    ];

    /**
     * POST /api/v1/auth/login
     */
    public function login($request) {
        $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);

        $payload = $request->payload ?? null;
        $username = $payload->username ?? $request->username ?? $_POST['username'] ?? null;
        $password = $payload->password ?? $request->password ?? $_POST['password'] ?? null;
        $token = $payload->token ?? $request->token ?? $_SERVER['HTTP_TOKEN'] ?? null;

        if (empty($username) && empty($token)) {
            $this->error('Username and password are required.', 400);
            $this->output();
            return;
        }

        $users = new \ohCRUD\Users();
        $user = $users->login($username, $password, $token);

        if ($user === false) {
            $this->error('Invalid credentials.', 401);
            $this->output();
            return;
        }

        // Check if user requires 2FA TOTP verification
        if (isset($user->TOTPVerified) && $user->TOTPVerified === false) {
            $this->data = [
                'totp_required' => true,
                'user_id' => (int) $user->ID,
                'username' => $user->USERNAME
            ];
            $this->output();
            return;
        }

        $this->data = [
            'status' => 'success',
            'user' => [
                'id' => (int) $user->ID,
                'username' => $user->USERNAME,
                'name' => $user->NAME ?? $user->USERNAME,
                'email' => $user->EMAIL,
                'permissions' => (int) $user->PERMISSIONS,
                'totp_enabled' => ((int) ($user->TOTP ?? 0) === 1)
            ]
        ];
        $this->output();
    }

    /**
     * POST /api/v1/auth/verify
     */
    public function verify($request) {
        $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);

        $payload = $request->payload ?? null;
        $userId = $payload->user_id ?? $request->user_id ?? $_SESSION['tempUser']->ID ?? null;
        $code = $payload->code ?? $request->code ?? $_POST['code'] ?? null;

        if (empty($userId) || empty($code)) {
            $this->error('User ID and 2FA code are required.', 400);
            $this->output();
            return;
        }

        $users = new \ohCRUD\Users();
        $user = $users->verify($userId, $code);

        if ($user === false) {
            $this->error('Invalid 2FA verification code.', 401);
            $this->output();
            return;
        }

        $this->data = [
            'status' => 'success',
            'user' => [
                'id' => (int) $user->ID,
                'username' => $user->USERNAME,
                'name' => $user->NAME ?? $user->USERNAME,
                'email' => $user->EMAIL,
                'permissions' => (int) $user->PERMISSIONS,
                'totp_enabled' => true
            ]
        ];
        $this->output();
    }

    /**
     * POST /api/v1/auth/logout
     */
    public function logout($request) {
        $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);

        $this->unsetSession('User');
        $this->unsetSession('tempUser');
        $this->clearSession();

        $this->data = [
            'status' => 'success',
            'logged_out' => true
        ];
        $this->output();
    }

    /**
     * GET /api/v1/auth/me
     */
    public function me($request) {
        $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);

        if (empty($_SESSION['User'])) {
            $this->error('Unauthorized.', 401);
            $this->output();
            return;
        }

        $user = $_SESSION['User'];
        $this->data = [
            'status' => 'success',
            'user' => [
                'id' => (int) $user->ID,
                'username' => $user->USERNAME,
                'name' => $user->NAME ?? $user->USERNAME,
                'email' => $user->EMAIL,
                'permissions' => (int) $user->PERMISSIONS,
                'totp_enabled' => ((int) ($user->TOTP ?? 0) === 1)
            ]
        ];
        $this->output();
    }
}
