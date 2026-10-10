<?php
// Prevent direct access to this class.
if (isset($GLOBALS['OHCRUD']) == false) {
    http_response_code(404);
    die();
}

// Enable or disable IP filtering for allowed remote IPs.
define('__OHCRUD_ALLOWED_IPS_ENABLED__', false);

// List of allowed remote IPs that can make requests to this application.
define('__OHCRUD_ALLOWED_IPS__', [
    '127.0.0.1',
]);

// Enable or disable filtering for allowed origins for Cross-Origin Resource Sharing (CORS).
// Set to false if you want to allow all origins. ( not recommended )
define('__OHCRUD_ALLOWED_ORIGINS_ENABLED__', false);

// List of allowed remote origins for Cross-Origin Resource Sharing (CORS).
define('__OHCRUD_ALLOWED_ORIGINS__', [
    'http://localhost',
    'http://ohcrud.local',
]);

// Define API endpoints and their corresponding controller classes.
define('__OHCRUD_ENDPOINTS__', [
    __OHCRUD_BASE_API_ROUTE__ . '/admin/' => 'app\controllers\cAdmin',
    __OHCRUD_BASE_API_ROUTE__ . '/themes/' => 'app\controllers\cThemes',
    __OHCRUD_BASE_API_ROUTE__ . '/pages/' => 'app\controllers\cPages',
    __OHCRUD_BASE_API_ROUTE__ . '/users/' => 'app\controllers\cUsers',
    __OHCRUD_BASE_API_ROUTE__ . '/files/' => 'app\controllers\cFiles',
    '/example/' => 'app\controllers\cExample',

    // Altus Cloud SPA Application Shell
    // '/' => 'app\controllers\cApp',
    '/cloud/' => 'app\controllers\cApp',

    // Altus RESTful API v1
    '/api/v1/auth/' => 'app\controllers\cCloudAuth',
    '/api/v1/user/' => 'app\controllers\cUserSettings',
    '/api/v1/user/totp/' => 'app\controllers\cUserSettings',
    '/api/v1/sync/' => 'app\controllers\cSync',
    '/api/v1/folders/' => 'app\controllers\cFolders',
    '/api/v1/files/' => 'app\controllers\cCloudFiles',
    '/api/v1/stream/' => 'app\controllers\cStream',

    /*
    Uncomment and add more URL paths to map to objects (controllers, models, etc.).
    '/example1/' => 'app\controllers\cSandbox',
    */
]);

// Define the default path handler for web/CMS requests.
define('__OHCRUD_DEFAULT_PATH_HANDLER__', '\app\controllers\cCMS');
