<?php
namespace app\controllers;

// Prevent direct access to this class.
if (isset($GLOBALS['OHCRUD']) == false) { die(); }

/**
 * Controller cApp - Single Page Application (SPA) Web Shell Controller for Altus Cloud.
 * Serves the responsive web shell and injects authenticated session state.
 */
class cApp extends \ohCRUD\DB {

    public $permissions = [
        'object' => __OHCRUD_PERMISSION_ALL__,
        'index' => __OHCRUD_PERMISSION_ALL__,
        'get' => __OHCRUD_PERMISSION_ALL__,
    ];

    /**
     * Default GET action for /cloud/
     */
    public function get($request) {
        $this->renderShell($request);
    }

    /**
     * Index action fallback
     */
    public function index($request) {
        $this->renderShell($request);
    }

    /**
     * Default path handler for deep client routes under /cloud/
     */
    public function defaultPathHandler($path = null) {
        $this->renderShell((object) []);
    }

    /**
     * Render the Altus SPA shell template from themes/altus/index.html
     */
    private function renderShell($request) {
        $this->setOutputType(\ohCRUD\Core::OUTPUT_HTML);

        $templatePath = __SELF__ . 'themes/altus/index.html';
        if (file_exists($templatePath) == false) {
            $this->outputStatusCode = 500;
            $this->data = '<h1>Altus Error</h1><p>Theme template themes/altus/index.html not found.</p>';
            $this->output();
            return;
        }

        $html = file_get_contents($templatePath);

        // Check authentication state
        $initialUser = null;
        if (isset($_SESSION['User']) == true && isset($_SESSION['User']->PERMISSIONS) && $_SESSION['User']->PERMISSIONS <= 2) {
            $user = $_SESSION['User'];
            $initialUser = [
                'id' => (int) $user->ID,
                'username' => $user->USERNAME,
                'name' => $user->NAME ?? $user->USERNAME,
                'email' => $user->EMAIL,
                'permissions' => (int) $user->PERMISSIONS,
                'totp_enabled' => ((int) ($user->TOTP ?? 0) === 1),
            ];
        }

        // Generate CSRF token if session exists
        $csrfToken = '';
        if (isset($_SESSION['CSRF']) == true) {
            $csrfToken = $_SESSION['CSRF'];
        }

        $sessionBootstrap = sprintf(
            '<script>' . "\n" .
            '  window.ALTUS_INITIAL_USER = %s;' . "\n" .
            '  window.ALTUS_CSRF_TOKEN = %s;' . "\n" .
            '</script>',
            json_encode($initialUser, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT),
            json_encode($csrfToken)
        );

        // Inject bootstrap variables into <head>
        if (str_contains($html, '</head>')) {
            $html = str_replace('</head>', $sessionBootstrap . "\n</head>", $html);
        } else {
            $html = $sessionBootstrap . $html;
        }

        $this->includeOutputHeader('Content-Type: text/html; charset=utf-8');
        $this->data = $html;
        $this->output();
    }
}
