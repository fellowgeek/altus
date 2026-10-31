# CMS authentication, page lifecycle, uploads, and same-origin access.
GET https://{{host}}/
HTTP 200
[Captures]
CSRF: regex /__CSRF__ = '(.*?)'/
[Asserts]
body contains "Open cloud"
cookie "PHPSESSID" exists

POST https://{{host}}/ohcrud/users/login/
X-CSRF-Token: {{CSRF}}
{
    "CSRF": "{{CSRF}}",
    "USERNAME": "admin",
    "PASSWORD": "{{admin_password}}"
}
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data.loggedIn" == true
cookie "PHPSESSID" exists

# Fetch a token for the rotated authenticated session.
GET https://{{host}}/api/v1/auth/csrfToken
HTTP 200
[Captures]
CSRF: jsonpath "$.data.csrf_token"

POST https://{{host}}/example/whoami/
X-CSRF-Token: {{CSRF}}
{}
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data" == "admin"

POST https://{{host}}/ohcrud/admin/getTableList
X-CSRF-Token: {{CSRF}}
{
    "CSRF": "{{CSRF}}"
}
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data.Pages" exists
jsonpath "$.data.Users" exists

POST https://{{host}}/ohcrud/pages/save/
X-CSRF-Token: {{CSRF}}
{
    "CSRF": "{{CSRF}}",
    "URL": "/system/hurl-test/",
    "TITLE": "System Test",
    "TEXT": "This is a test page.",
    "STATUS": 1
}
HTTP 200
[Asserts]
jsonpath "$.success" == true

GET https://{{host}}/system/hurl-test/
HTTP 200
[Asserts]
body contains "This is a test page."

POST https://{{host}}/ohcrud/pages/save/
X-CSRF-Token: {{CSRF}}
{
    "CSRF": "{{CSRF}}",
    "URL": "/system/hurl-test/",
    "TITLE": "System Test 2",
    "TEXT": "This is a test page 2.",
    "STATUS": 1
}
HTTP 200
[Asserts]
jsonpath "$.success" == true

GET https://{{host}}/system/hurl-test/
HTTP 200
[Asserts]
body contains "This is a test page 2."

POST https://{{host}}/ohcrud/pages/restoreDeletePage/
X-CSRF-Token: {{CSRF}}
{
    "CSRF": "{{CSRF}}",
    "URL": "/system/hurl-test/"
}
HTTP 200
[Asserts]
jsonpath "$.success" == true

GET https://{{host}}/system/hurl-test/
HTTP 404

POST https://{{host}}/ohcrud/files/upload/?CSRF={{CSRF}}
X-CSRF-Token: {{CSRF}}
[Multipart]
0: file,Mona_Lisa.jpg;
HTTP 200
[Captures]
ID: jsonpath "$.data.ID"
[Asserts]
jsonpath "$.success" == true

POST https://{{host}}/ohcrud/files/upload/?CSRF={{CSRF}}
X-CSRF-Token: {{CSRF}}
[Multipart]
0: file,test_passes.hurl;
HTTP 415
[Asserts]
jsonpath "$.success" == false

POST https://{{host}}/ohcrud/admin/deleteTableRow/
X-CSRF-Token: {{CSRF}}
{
    "CSRF": "{{CSRF}}",
    "TABLE": "Files",
    "KEY_COLUMN": "ID",
    "KEY_VALUE": "{{ID}}"
}
HTTP 200
[Asserts]
jsonpath "$.success" == true

# Same-origin requests remain usable without cross-origin permission headers.
POST https://{{host}}/example/whoami/
Origin: https://{{host}}
X-CSRF-Token: {{CSRF}}
{}
HTTP 200
[Asserts]
jsonpath "$.data" == "admin"
header "Access-Control-Allow-Origin" not exists

POST https://{{host}}/ohcrud/users/logout/
X-CSRF-Token: {{CSRF}}
{}
HTTP 200
[Asserts]
jsonpath "$.success" == true

GET https://{{host}}/api/v1/auth/me
HTTP 401
