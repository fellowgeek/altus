<?php
namespace ohCRUD;

// Prevent direct access to this class
if (isset($GLOBALS['OHCRUD']) == false) { die(); }

// Class Router - routing operations class for ohCRUD, all incoming request processed by this class
class Router extends \ohCRUD\Core {

    private $request;
    private $requestMethod;
    private $urlParams = [];

    // Constructor for the Router class. It sets up routing based on the provided URL path.
    public function __construct($rawPath = null) {

        // Extract the path from the provided URL and store it in global variables.
        $GLOBALS['PATH'] = rtrim(parse_url($rawPath, PHP_URL_PATH) ?? '', '/') . '/';
        $GLOBALS['PATH_ARRAY'] = preg_split('[/]', $GLOBALS['PATH'], 0, PREG_SPLIT_NO_EMPTY);

        // Register the core error handlers.
        $this->registerCoreErrorHandlers();

        // Call the route method to process the request.
        $this->route($rawPath);
    }

    // The route method processes incoming requests and handles routing.
    public function route($rawPath = null) {

        // Variables
        $path = $GLOBALS['PATH'];
        $pathArray = $GLOBALS['PATH_ARRAY'];
        $matchedObject = null;
        $matchedMethod = null;

        // Define Environment
        $isCLI = (PHP_SAPI === 'cli');

        // ---------------------------------------------------
        // STEP 1: Find Match
        // ---------------------------------------------------
        if (isset(__OHCRUD_ENDPOINTS__[$path]) == true) {
            // Strategy A: exact path match
            $matchedObject = __OHCRUD_ENDPOINTS__[$path];
        } else {
            // Strategy B: base path + method match (only if method candidate is non-numeric and exists on controller)
            $tempPathArray = $pathArray;
            $methodCandidate = array_pop($tempPathArray);
            $basePath = '/' . implode('/', $tempPathArray) . '/';

            if (
                isset(__OHCRUD_ENDPOINTS__[$basePath]) == true &&
                !is_numeric($methodCandidate) &&
                method_exists(__OHCRUD_ENDPOINTS__[$basePath], $methodCandidate)
            ) {
                $matchedObject = __OHCRUD_ENDPOINTS__[$basePath];
                $matchedMethod = $methodCandidate;
            } else {
                // Strategy C: RESTful prefix matching (e.g. /api/v1/folders/:id or /api/v1/files/:id/stream)
                $sortedEndpoints = __OHCRUD_ENDPOINTS__;
                uksort($sortedEndpoints, function($a, $b) {
                    return strlen($b) <=> strlen($a);
                });
                foreach ($sortedEndpoints as $endpointRoute => $controllerClass) {
                    if ($endpointRoute !== '/' && str_starts_with($path, $endpointRoute)) {
                        $remaining = trim(substr($path, strlen($endpointRoute)), '/');
                        if ($remaining !== '') {
                            $segments = explode('/', $remaining);
                            $matchedObject = $controllerClass;
                            if (count($segments) >= 2) {
                                // e.g. :id/stream or :id/download
                                $this->urlParams = ['id' => $segments[0]];
                                $matchedMethod = $segments[1];
                            } elseif (!empty($segments[0])) {
                                // e.g. /api/v1/folders/:id
                                $this->urlParams = ['id' => $segments[0]];
                            }
                            break;
                        }
                    }
                }
            }
        }

        // ---------------------------------------------------
        // STEP 2: Execute Match (API)
        // ---------------------------------------------------
        if (isset($matchedObject) == true) {

            // Build Request (Parse Payload: True)
            $this->setRequest($isCLI, $rawPath, true);
            if (empty($this->urlParams) == false) {
                foreach ($this->urlParams as $paramKey => $paramVal) {
                    $this->request->$paramKey = $paramVal;
                }
            }

            // Security Checks (Skip for CLI)
            if ($isCLI == false) {
                if ($this->isRequestAllowedByFetchMetadata() == false) {
                    $this->forbidden();
                    return $this;
                }
                if ($this->isRequestAllowedByAccessPolicy() == false) {
                    $this->forbidden();
                    return $this;
                }
            }

            // Instantiate Object
            $object = new $matchedObject;

            // Check Class-level Permissions
            if (isset($object->permissions) == false || $this->checkPermissions($object->permissions) == false) {
                $this->handleAuthFailure();
                return $this;
            }

            // Determine target method to execute
            $targetMethod = $matchedMethod;
            $httpMethod = strtolower($this->requestMethod);

            if (empty($targetMethod)) {
                if (is_callable([$object, $httpMethod])) {
                    $targetMethod = $httpMethod;
                } elseif (is_callable([$object, 'index'])) {
                    $targetMethod = 'index';
                }
            }

            if (isset($targetMethod) == true) {
                // Method Target
                if (is_callable([$object, $targetMethod]) == true) {
                    // Check Method-level Permissions
                    if ($this->checkPermissions($object->permissions, $targetMethod) == true) {
                        $object->$targetMethod($this->request);
                        return $this;
                    } else {
                        $this->handleAuthFailure();
                        return $this;
                    }
                }
            } else {
                // Strategy A (Object Context fallback)
                if (method_exists($object, 'defaultPathHandler') == true) {
                    $object->defaultPathHandler($GLOBALS['PATH']);
                    return $this;
                }
                return $this;
            }
        }

        // ---------------------------------------------------
        // STEP 3: Default Handler (CMS)
        // ---------------------------------------------------
        if (defined('__OHCRUD_DEFAULT_PATH_HANDLER__') == true && __OHCRUD_DEFAULT_PATH_HANDLER__ != '') {
            $class = __OHCRUD_DEFAULT_PATH_HANDLER__;

            // Build Request (Parse Payload: False - CMS handles its own)
            $this->setRequest($isCLI, $rawPath, false);

            $object = new $class($this->request);
            if (method_exists($object, 'defaultPathHandler') == true) {
                $object->defaultPathHandler($GLOBALS['PATH']);
                return $this;
            }
        }

        // 404 Not Found
        $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);
        $this->error('ohCRUD! You just got 404\'d.', 404);
        $this->output();
    }

    // Helper to consolidate request creation
    private function setRequest($isCLI, $rawPath, $parsePayload = false) {
        if ($isCLI == true) {
            $parameters = [];
            parse_str(parse_url($rawPath, PHP_URL_QUERY) ?? '', $parameters);
            $this->request = (object) $parameters;
            $this->requestMethod = 'CLI';
        } else {
            $this->request = (object) $_REQUEST;
            $this->requestMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';

            // Only read/decode input if explicitly requested (API only)
            if ($parsePayload == true) {
                $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
                $input = file_get_contents('php://input');

                if (stripos($contentType, 'json') !== false) {
                    $this->request->payload = json_decode($input);
                } else {
                    $this->request->payload = $input;
                }
            }
        }
    }

    // Handle CORS (Cross-Origin Resource Sharing) and access policies for incoming requests.
    private function isRequestAllowedByAccessPolicy() {

        // Set up CSRF (Cross-Site Request Forgery) token.
        $this->CSRF();

        // Check if remote IP filtering is enabled and handle allowed IPs.
        if (__OHCRUD_ALLOWED_IPS_ENABLED__ == true) {
            if (in_array($_SERVER['REMOTE_ADDR'], __OHCRUD_ALLOWED_IPS__) == false) return false;
        }

        // Handle same origin requests using HTTP_ORIGIN and HTTP_REFERER to determine the request's origin.
        $origin = strtolower($_SERVER['HTTP_ORIGIN'] ?? '');
        if ($origin === '')  {
            if ($parts = parse_url(strtolower(($_SERVER['HTTP_REFERER'] ?? '')))) {
                if (isset($parts['scheme']) == true && isset($parts['host']) == true)
                $origin = $parts['scheme'] . '://' . $parts['host'];
            }
        }

        // If the origin is not set or the request is coming from the current site, allow access.
        if ($origin === ($_SERVER['REQUEST_SCHEME'] ?? '') . '://' . __SITE__) {
            return true;
        }

        // If no origin is provided, allow access (e.g., direct API calls, non-browser clients).
        if ($origin === '') {
            return true;
        }

        // Handle cross-origin requests and set appropriate CORS headers for allowed origins.
        if (in_array($origin, __OHCRUD_ALLOWED_ORIGINS__) == true || __OHCRUD_ALLOWED_ORIGINS_ENABLED__ == false) {

            // Set CORS headers
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Access-Control-Allow-Credentials: true');
            header('Access-Control-Max-Age: 86400');

            // Preflight request handling
            if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
                header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS");
                header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept, Origin, Token");
                die();
            }
            return true;
        } else {
            return false;
        }
    }

    // Check Fetch Metadata headers to prevent CSRF attacks.
    private function isRequestAllowedByFetchMetadata() {
        // If no cookies are sent, CSRF is not applicable (API / non-browser client)
        if (empty($_COOKIE) == true) {
            return true;
        }

        // Missing header = unknown (Safari, older browsers), allow
        if (empty($_SERVER['HTTP_SEC_FETCH_SITE']) == true) {
            return true;
        }

        // Cookie-authenticated + cross-site = almost certainly CSRF
        if ($_SERVER['HTTP_SEC_FETCH_SITE'] === 'cross-site') {
            return false;
        }

        return true;
    }

    // Check if the user has the necessary permissions for an operation.
    private function checkPermissions($expression, $method = null) {

        // Grant permission if the script is called from the command-line interface.
        if (PHP_SAPI === 'cli') return true;

        // Variables
        $objectHasPermission = false;
        $methodHasPermission = false;
        $userPermissions = (isset($_SESSION['User']->PERMISSIONS) == true) ? (int) $_SESSION['User']->PERMISSIONS : false;

        // Check object permission
        if (isset($expression['object']) == true) {
            if ((int) $expression['object'] == __OHCRUD_PERMISSION_ALL__ || ((int) $expression['object'] >= $userPermissions && $userPermissions !== false))
                $objectHasPermission = true;
        }

        // If no method is specified, return object permission result
        if (isset($method) == false) {
            return $objectHasPermission;
        }

        // Check method permission
        if (isset($expression[$method]) == true) {
            if ((int) $expression[$method] == __OHCRUD_PERMISSION_ALL__ || ($expression[$method] >= $userPermissions && $userPermissions !== false))
                $methodHasPermission = true;
        } else {
            $methodHasPermission = false;
        }

        // Return true only if both object and method permissions are granted
        return ($objectHasPermission && $methodHasPermission);
    }

    // Helper method for authorize/forbidden logic
    private function handleAuthFailure() {
        if (isset($_SESSION['User']) == false) {
            $this->authorize();
        } else {
            $this->forbidden();
        }
    }

    // Handle user authorization.
    private function authorize() {

        // Variables
        $users = new \ohCRUD\Users;
        $httpHeaders = getallheaders();
        $userHasLoggedIn = false;

        // Authenticate the user using basic authentication or a token.
        if (isset($_SERVER['PHP_AUTH_USER']) == true || isset($_SERVER['PHP_AUTH_PW']) == true || isset($httpHeaders['Token']) == true) {
            $userHasLoggedIn = $users->login($_SERVER['PHP_AUTH_USER'] ?? null, $_SERVER['PHP_AUTH_PW'] ?? null, $httpHeaders['Token'] ?? null);
        }
        if ($userHasLoggedIn == true) {
            $this->route();
        } else {
            if (isset($httpHeaders['Token']) == true) {
                $this->forbidden();
            } else {
                // Unauthorized access - Return 401 JSON without WWW-Authenticate header to allow SPA modal handling
                $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);
                $this->outputStatusCode = 401;
                $this->includeOutputHeader('HTTP/1.0 401 Unauthorized');
                $this->error('Unauthorized access. Please log in.', 401);
                $this->output();
            }
        }
    }

    // Handle forbidden access and return a 403 error response.
    private function forbidden() {

        $this->setOutputType(\ohCRUD\Core::OUTPUT_JSON);
        $this->error('I\'m sorry Dave, I\'m afraid I can\'t do that.', 403);
        $this->output();
    }

}
