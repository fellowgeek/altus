# Anonymous access, CSRF, source protection, and default-denied CORS.
GET https://{{host}}/
HTTP 200
[Captures]
CSRF: regex /__CSRF__ = '(.*?)'/
[Asserts]
body contains "Open cloud"
cookie "PHPSESSID" exists

GET https://{{host}}/this-does-not-exist/
HTTP 404

GET https://{{host}}/login/
HTTP 200
[Asserts]
body contains "LOGIN"

POST https://{{host}}/ohcrud/users/login/
X-CSRF-Token: {{CSRF}}
{
    "CSRF": "{{CSRF}}",
    "USERNAME": "bad_user",
    "PASSWORD": "bad_password"
}
HTTP 401
[Asserts]
jsonpath "$.success" == false
jsonpath "$.errors" exists

# CSRF rejection applies in production regardless of account credentials.
POST https://{{host}}/ohcrud/users/login/
X-CSRF-Token: invalid-token
{
    "CSRF": "invalid-token",
    "USERNAME": "admin",
    "PASSWORD": "{{admin_password}}"
}
HTTP 400
[Asserts]
jsonpath "$.success" == false

POST https://{{host}}/example/protectedEndPoint/
Token: bad_ohcrud_token
X-CSRF-Token: {{CSRF}}
{}
HTTP 403
[Asserts]
jsonpath "$.success" == false

POST https://{{host}}/example/publicEndPoint/
X-CSRF-Token: {{CSRF}}
{}
HTTP 200
[Asserts]
body contains "Hello from ohCRUD!"

POST https://{{host}}/ohcrud/admin/getTableList/
X-CSRF-Token: {{CSRF}}
{}
HTTP 401

GET https://{{host}}/settings.php
HTTP 404

GET https://{{host}}/.git/config
HTTP 404

POST https://{{host}}/example/whoami/
Sec-Fetch-Site: cross-site
X-CSRF-Token: {{CSRF}}
{}
HTTP 403
[Asserts]
jsonpath "$.success" == false

OPTIONS https://{{host}}/example/whoami/
Origin: https://example.com
Access-Control-Request-Method: POST
Access-Control-Request-Headers: Content-Type, X-CSRF-Token
HTTP 403
[Asserts]
header "Access-Control-Allow-Origin" not exists

POST https://{{host}}/example/whoami/
Origin: https://example.com
X-CSRF-Token: {{CSRF}}
{}
HTTP 403
[Asserts]
header "Access-Control-Allow-Origin" not exists
jsonpath "$.success" == false
