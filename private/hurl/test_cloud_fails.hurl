# ==============================================================================
# Altus Personal Cloud - Negative & Security Test Suite (test_cloud_fails.hurl)
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. Unauthenticated Access Control Guards (401 Unauthorized)
# ------------------------------------------------------------------------------

## 1.1 Unauthenticated session profile check (/api/v1/auth/me) should return 401
GET https://{{host}}/api/v1/auth/me
[Options]
verbose: true
HTTP 401
[Captures]
PHPSESSID: cookie "PHPSESSID"
[Asserts]
jsonpath "$.success" == false
jsonpath "$.errors" exists

## 1.2 Unauthenticated folder listing (/api/v1/folders) should return 401
GET https://{{host}}/api/v1/folders
[Options]
verbose: true
HTTP 401
[Asserts]
jsonpath "$.success" == false
jsonpath "$.errors" exists

## 1.3 Unauthenticated folder creation (POST /api/v1/folders) should return 401
POST https://{{host}}/api/v1/folders
[Options]
verbose: true
{
    "name": "unauth_folder"
}
HTTP 401
[Asserts]
jsonpath "$.success" == false

## 1.4 Unauthenticated file listing (/api/v1/files) should return 401
GET https://{{host}}/api/v1/files
[Options]
verbose: true
HTTP 401
[Asserts]
jsonpath "$.success" == false

## 1.5 Unauthenticated file upload (POST /api/v1/files/upload) should return 401
POST https://{{host}}/api/v1/files/upload
[Options]
verbose: true
[Multipart]
file: file,Mona_Lisa.jpg;
HTTP 401
[Asserts]
jsonpath "$.success" == false

## 1.6 Unauthenticated media streaming (/api/v1/stream/1) should return 401
GET https://{{host}}/api/v1/stream/1
[Options]
verbose: true
HTTP 401
[Asserts]
jsonpath "$.success" == false

## 1.7 Unauthenticated Quick Sync trigger (POST /api/v1/sync) should return 401
POST https://{{host}}/api/v1/sync
[Options]
verbose: true
{}
HTTP 401
[Asserts]
jsonpath "$.success" == false

## 1.8 Unauthenticated password update (POST /api/v1/user/password) should return 401
POST https://{{host}}/api/v1/user/password
[Options]
verbose: true
{
    "current_password": "user",
    "new_password": "newpassword123"
}
HTTP 401
[Asserts]
jsonpath "$.success" == false

# ------------------------------------------------------------------------------
# 2. Physical Storage Isolation (Nginx /storage/ Block)
# ------------------------------------------------------------------------------

## 2.1 Direct HTTP access to /storage/ directory must be blocked with 404
GET https://{{host}}/storage/
[Options]
verbose: true
HTTP 404

## 2.2 Direct HTTP access to any path inside /storage/ must be blocked with 404
GET https://{{host}}/storage/Mona_Lisa.jpg
[Options]
verbose: true
HTTP 404

# ------------------------------------------------------------------------------
# 3. Authentication & 2FA Negative Cases (400 / 401)
# ------------------------------------------------------------------------------

## 3.1 Cloud login with missing credentials should return 400
POST https://{{host}}/api/v1/auth/login
[Options]
verbose: true
{}
HTTP 400
[Asserts]
jsonpath "$.success" == false
jsonpath "$.errors" exists

## 3.2 Cloud login with wrong credentials should return 401
POST https://{{host}}/api/v1/auth/login
[Options]
verbose: true
{
    "username": "user",
    "password": "wrong_password_xyz"
}
HTTP 401
[Asserts]
jsonpath "$.success" == false
jsonpath "$.errors" exists

## 3.3 2FA verification with missing parameters should return 400
POST https://{{host}}/api/v1/auth/verify
[Options]
verbose: true
{}
HTTP 400
[Asserts]
jsonpath "$.success" == false
jsonpath "$.errors" exists

## 3.4 2FA verification with invalid user_id / code should return 401
POST https://{{host}}/api/v1/auth/verify
[Options]
verbose: true
{
    "user_id": 999999,
    "code": "000000"
}
HTTP 401
[Asserts]
jsonpath "$.success" == false
jsonpath "$.errors" exists

# ------------------------------------------------------------------------------
# 4. Authenticated Account Settings & TOTP Failures (400 Bad Request)
# ------------------------------------------------------------------------------

## 4.1 Bootstrap session and log in as default admin user
GET https://{{host}}/cloud/
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 200

POST https://{{host}}/api/v1/auth/login
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{
    "username": "admin",
    "password": "admin"
}
HTTP 200
[Asserts]
jsonpath "$.success" == true

## 4.2 Password update with short password (< 6 chars) should return 400
POST https://{{host}}/api/v1/user/password
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{
    "current_password": "admin",
    "new_password": "123"
}
HTTP 400
[Asserts]
jsonpath "$.success" == false
jsonpath "$.errors" exists

## 4.3 Password update with incorrect current password should return 400
POST https://{{host}}/api/v1/user/password
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{
    "current_password": "wrong_current_password",
    "new_password": "valid_new_password"
}
HTTP 400
[Asserts]
jsonpath "$.success" == false
jsonpath "$.errors" exists

## 4.4 TOTP verification with invalid 6-digit code should return 400
POST https://{{host}}/api/v1/user/totp/setup
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{}
HTTP 200

POST https://{{host}}/api/v1/user/totp/verify
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{
    "code": "000000"
}
HTTP 400
[Asserts]
jsonpath "$.success" == false
jsonpath "$.errors" exists

## 4.5 TOTP disable with wrong password confirmation should return 400
POST https://{{host}}/api/v1/user/totp/disable
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{
    "password": "wrong_password"
}
HTTP 400
[Asserts]
jsonpath "$.success" == false
jsonpath "$.errors" exists

# ------------------------------------------------------------------------------
# 5. Folder Validation, Path Traversal, Conflicts & Circular Moves
# ------------------------------------------------------------------------------

## 5.1 Creating a folder with an empty name should return 400
POST https://{{host}}/api/v1/folders
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{
    "name": "   "
}
HTTP 400
[Asserts]
jsonpath "$.success" == false

## 5.2 Creating a folder with path traversal characters (../evil) should return 400
POST https://{{host}}/api/v1/folders
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{
    "name": "../evil"
}
HTTP 400
[Asserts]
jsonpath "$.success" == false

## 5.3 Creating a folder with nested slash separator (foo/bar) should return 400
POST https://{{host}}/api/v1/folders
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{
    "name": "foo/bar"
}
HTTP 400
[Asserts]
jsonpath "$.success" == false

## 5.4 Creating a folder under a non-existent parent_id should return 404
POST https://{{host}}/api/v1/folders
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{
    "name": "orphan_folder",
    "parent_id": 999999
}
HTTP 404
[Asserts]
jsonpath "$.success" == false

## 5.5 Create temporary parent and child folders to test conflicts and circular moves
POST https://{{host}}/api/v1/folders
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{
    "name": "hurl_fail_parent",
    "parent_id": 0
}
HTTP 200
[Captures]
FAIL_PARENT_ID: jsonpath "$.data.folder.id"

POST https://{{host}}/api/v1/folders
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{
    "name": "hurl_fail_child",
    "parent_id": {{FAIL_PARENT_ID}}
}
HTTP 200
[Captures]
FAIL_CHILD_ID: jsonpath "$.data.folder.id"

## 5.6 Creating a duplicate folder with the same name in the same parent should return 409 Conflict
POST https://{{host}}/api/v1/folders
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{
    "name": "hurl_fail_parent",
    "parent_id": 0
}
HTTP 409
[Asserts]
jsonpath "$.success" == false
jsonpath "$.errors" exists

## 5.7 Moving a folder into itself should return 400 Bad Request
PUT https://{{host}}/api/v1/folders/{{FAIL_PARENT_ID}}
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{
    "parent_id": {{FAIL_PARENT_ID}}
}
HTTP 400
[Asserts]
jsonpath "$.success" == false
jsonpath "$.errors" exists

## 5.8 Moving a parent folder into one of its descendants should return 400 Bad Request
PUT https://{{host}}/api/v1/folders/{{FAIL_PARENT_ID}}
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{
    "parent_id": {{FAIL_CHILD_ID}}
}
HTTP 400
[Asserts]
jsonpath "$.success" == false
jsonpath "$.errors" exists

## 5.9 Updating or deleting a non-existent folder ID should return 404
PUT https://{{host}}/api/v1/folders/999999
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{
    "name": "ghost_folder"
}
HTTP 404
[Asserts]
jsonpath "$.success" == false

DELETE https://{{host}}/api/v1/folders/999999
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 404
[Asserts]
jsonpath "$.success" == false

# ------------------------------------------------------------------------------
# 6. File Upload, Conflict & Streaming Negative Cases (400 / 404 / 409 / 416)
# ------------------------------------------------------------------------------

## 6.1 Uploading with no file attached should return 400 Bad Request
POST https://{{host}}/api/v1/files/upload
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{
    "folder_id": 0
}
HTTP 400
[Asserts]
jsonpath "$.success" == false

## 6.2 Uploading a file to a non-existent folder_id should return 404 Not Found
POST https://{{host}}/api/v1/files/upload
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
[Multipart]
folder_id: 999999
file: file,Mona_Lisa.jpg;
HTTP 404
[Asserts]
jsonpath "$.success" == false

## 6.3 Upload a file into hurl_fail_parent and verify conflict=cancel returns 409 Conflict on duplicate
POST https://{{host}}/api/v1/files/upload
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
[Multipart]
folder_id: {{FAIL_PARENT_ID}}
conflict: keep_both
file: file,Mona_Lisa.jpg;
HTTP 200
[Captures]
FAIL_FILE_ID: jsonpath "$.data.file.id"

POST https://{{host}}/api/v1/files/upload
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
[Multipart]
folder_id: {{FAIL_PARENT_ID}}
conflict: cancel
file: file,Mona_Lisa.jpg;
HTTP 409
[Asserts]
jsonpath "$.success" == false
jsonpath "$.errors" exists

## 6.4 Out-of-bounds HTTP Byte-Range request should return 416 Range Not Satisfiable
GET https://{{host}}/api/v1/files/{{FAIL_FILE_ID}}/stream
Range: bytes=99999999-100000000
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 416

## 6.5 Streaming, updating, or deleting a non-existent file ID should return 404 Not Found
GET https://{{host}}/api/v1/files/999999/stream
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 404
[Asserts]
jsonpath "$.success" == false

PUT https://{{host}}/api/v1/files/999999
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{
    "name": "nonexistent.jpg"
}
HTTP 404
[Asserts]
jsonpath "$.success" == false

DELETE https://{{host}}/api/v1/files/999999
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 404
[Asserts]
jsonpath "$.success" == false

## 6.6 Batch ZIP download with missing or non-existent file_ids should return 400 / 404
GET https://{{host}}/api/v1/stream/batchDownload
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 400
[Asserts]
jsonpath "$.success" == false

GET https://{{host}}/api/v1/stream/batchDownload?file_ids=999999
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 404
[Asserts]
jsonpath "$.success" == false

# ------------------------------------------------------------------------------
# 7. Cleanup Temporary Negative Test Fixtures & Logout
# ------------------------------------------------------------------------------

## 7.1 Recursively delete temporary folder hurl_fail_parent and its contents
DELETE https://{{host}}/api/v1/folders/{{FAIL_PARENT_ID}}
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 200
[Asserts]
jsonpath "$.success" == true

## 7.2 Log out of session
POST https://{{host}}/api/v1/auth/logout
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{}
HTTP 200
[Asserts]
jsonpath "$.success" == true
