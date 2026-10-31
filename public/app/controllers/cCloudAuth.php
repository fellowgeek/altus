<?php
namespace app\controllers;

// Prevent direct access to this class.
if (isset($GLOBALS['OHCRUD']) == false) { die(); }

// Controller cCloudAuth - Authentication endpoints for Altus Cloud.
class cCloudAuth extends \ohCRUD\DB {

    public $httpMethods = [
        'login' => ['POST'],
        'verify' => ['POST'],
        'logout' => ['POST'],
        'me' => ['GET', 'HEAD'],
        'csrfToken' => ['GET', 'HEAD'],
    ];

    public $permissions = [
        'object' => __OHCRUD_PERMISSION_ALL__,
        'login' => __OHCRUD_PERMISSION_ALL__,
        'verify' => __OHCRUD_PERMISSION_ALL__,
        'logout' => __OHCRUD_PERMISSION_ALL__,
        'me' => 2,
        'csrfToken' => __OHCRUD_PERMISSION_ALL__,
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
            $this->error('Invalid credentials or authentication temporarily unavailable.', $users->outputStatusCode === 429 ? 429 : 401);
            $this->output();
            return;
        }

        // Check if user requires 2FA TOTP verification
        if (isset($user->TOTPVerified) && $user->TOTPVerified === false) {
            $this->data = [
                'totp_required' => true,
                'csrf_token' => $this->CSRF(),
                'user_id' => (int) $user->ID,
                'username' => $user->USERNAME
            ];
            $this->output();
            return;
        }

        $this->data = [
            'status' => 'success',
            'csrf_token' => $this->CSRF(),
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
        $userId = $_SESSION['tempUser']->ID ?? null;
        $requestedUserId = $payload->user_id ?? $request->user_id ?? $userId;
        $code = $payload->code ?? $request->code ?? $_POST['code'] ?? null;

        if (empty($userId) || empty($code) || (int) $requestedUserId !== (int) $userId) {
            $this->error('A matching password login and 2FA code are required.', 401);
            $this->output();
            return;
        }

        $users = new \ohCRUD\Users();
        $user = $users->verify($userId, $code);

        if ($user === false) {
            $this->error('Invalid or expired 2FA challenge.', $users->outputStatusCode === 429 ? 429 : 401);
            $this->output();
            return;
        }

        $this->data = [
            'status' => 'success',
            'csrf_token' => $this->CSRF(),
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
            'csrf_token' => $this->CSRF(),
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
        $userId = (int) $user->ID;
        $userRow = $this->read('Users', 'ID = :ID', [':ID' => $userId])->first();
        $this->data = null; // Clear so sensitive fields are never exposed

        $totpActive = $userRow ? ((int) ($userRow->TOTP ?? 0) === 1) : ((int) ($user->TOTP ?? 0) === 1);

        $this->data = [
            'status' => 'success',
            'user' => [
                'id' => (int) $user->ID,
                'username' => $user->USERNAME,
                'name' => $user->NAME ?? $user->USERNAME,
                'email' => $user->EMAIL,
                'permissions' => (int) ($userRow->PERMISSIONS ?? $user->PERMISSIONS),
                'totp_enabled' => $totpActive
            ]
        ];
        $this->output();
    }

    /** GET /api/v1/auth/csrfToken: bootstrap cookie-authenticated API clients. */
    public function csrfToken($request) {
        $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);
        $this->data = ['csrf_token' => $this->CSRF()];
        $this->output();
    }
}
