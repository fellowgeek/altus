# ==============================================================================
# Altus Personal Cloud - Positive Integration Test Suite (test_cloud_passes.hurl)
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. SPA Shell & Cloud Authentication (cApp, cCloudAuth)
# ------------------------------------------------------------------------------

## 1.1 Load Altus Cloud SPA shell and capture session cookie & CSRF token
GET https://{{host}}/cloud/
[Options]
verbose: true
HTTP 200
[Captures]
CSRF: regex /window\.ALTUS_CSRF_TOKEN = "(.*?)";/
PHPSESSID: cookie "PHPSESSID"
[Asserts]
header "Content-Type" contains "text/html"
body contains "window.ALTUS_CSRF_TOKEN"
body contains "window.ALTUS_INITIAL_USER"
cookie "PHPSESSID" exists

## 1.2 Authenticate with default admin user credentials (admin / admin)
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
jsonpath "$.data.status" == "success"
jsonpath "$.data.user.username" == "admin"
jsonpath "$.data.user.permissions" == 1

## 1.3 Validate active Cloud session profile via /api/v1/auth/me
GET https://{{host}}/api/v1/auth/me
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data.status" == "success"
jsonpath "$.data.user.username" == "admin"
jsonpath "$.data.user.permissions" == 1
jsonpath "$.data.user.totp_enabled" isBoolean

# ------------------------------------------------------------------------------
# 2. Account Settings & 2FA Provisioning (cUserSettings)
# ------------------------------------------------------------------------------

## 2.1 Initialize TOTP 2FA setup and verify secret & provisioning URI generation
POST https://{{host}}/api/v1/user/totp/setup
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{}
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data.status" == "success"
jsonpath "$.data.secret" exists
jsonpath "$.data.provisioning_uri" startsWith "otpauth://totp/"

# ------------------------------------------------------------------------------
# 3. Folder CRUD, Hierarchy, Recursive Cascades & Favorites (cFolders)
# ------------------------------------------------------------------------------

## 3.1 Create a root test folder on disk and in SQLite
POST https://{{host}}/api/v1/folders
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{
    "name": "hurl_test_root",
    "parent_id": 0,
    "color": "#3b82f6"
}
HTTP 200
[Captures]
ROOT_FOLDER_ID: jsonpath "$.data.folder.id"
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data.status" == "success"
jsonpath "$.data.folder.name" == "hurl_test_root"
jsonpath "$.data.folder.path" == "hurl_test_root"
jsonpath "$.data.folder.parent_id" == 0
jsonpath "$.data.folder.color" == "#3b82f6"

## 3.2 Create a nested child subfolder inside the root test folder
POST https://{{host}}/api/v1/folders
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{
    "name": "hurl_sub",
    "parent_id": {{ROOT_FOLDER_ID}},
    "color": "#ef4444"
}
HTTP 200
[Captures]
SUB_FOLDER_ID: jsonpath "$.data.folder.id"
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data.status" == "success"
jsonpath "$.data.folder.name" == "hurl_sub"
jsonpath "$.data.folder.path" == "hurl_test_root/hurl_sub"
jsonpath "$.data.folder.parent_id" == {{ROOT_FOLDER_ID}}

## 3.3 List subfolders and verify breadcrumb trail
GET https://{{host}}/api/v1/folders?parent_id={{ROOT_FOLDER_ID}}&sort=name_asc
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data.status" == "success"
jsonpath "$.data.parent_id" == {{ROOT_FOLDER_ID}}
jsonpath "$.data.breadcrumbs[0].name" == "hurl_test_root"
jsonpath "$.data.folders[0].NAME" == "hurl_sub"
jsonpath "$.data.folders[0].PATH" == "hurl_test_root/hurl_sub"

## 3.4 List all active folders for move-destination tree modal
GET https://{{host}}/api/v1/folders?all=1
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data.status" == "success"
jsonpath "$.data.folders" count >= 2

## 3.5 Rename, recolor, and favorite the root folder
PUT https://{{host}}/api/v1/folders/{{ROOT_FOLDER_ID}}
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{
    "name": "hurl_test_renamed",
    "color": "#10b981",
    "is_favorite": 1
}
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data.status" == "success"
jsonpath "$.data.folder.name" == "hurl_test_renamed"
jsonpath "$.data.folder.path" == "hurl_test_renamed"
jsonpath "$.data.folder.color" == "#10b981"
jsonpath "$.data.folder.is_favorite" == 1

## 3.6 Verify child subfolder path cascaded automatically after parent rename
GET https://{{host}}/api/v1/folders?parent_id={{ROOT_FOLDER_ID}}&sort=name_asc
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data.folders[0].NAME" == "hurl_sub"
jsonpath "$.data.folders[0].PATH" == "hurl_test_renamed/hurl_sub"

## 3.7 List favorite folders and verify renamed root folder is included
GET https://{{host}}/api/v1/folders?favorites=1&sort=name_asc
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data.favorites" == true
jsonpath "$.data.folders[*].NAME" contains "hurl_test_renamed"

# ------------------------------------------------------------------------------
# 4. File Upload, Conflict Resolution, CRUD, Search & Favorites (cCloudFiles)
# ------------------------------------------------------------------------------

## 4.1 Upload an image file to the nested child subfolder
POST https://{{host}}/api/v1/files/upload
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
[Multipart]
folder_id: {{SUB_FOLDER_ID}}
conflict: keep_both
file: file,Mona_Lisa.jpg;
HTTP 200
[Captures]
FILE_ID: jsonpath "$.data.file.id"
FILE_SIZE: jsonpath "$.data.file.size"
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data.status" == "success"
jsonpath "$.data.file.name" == "Mona_Lisa.jpg"
jsonpath "$.data.file.path" == "hurl_test_renamed/hurl_sub/Mona_Lisa.jpg"
jsonpath "$.data.file.folder_id" == {{SUB_FOLDER_ID}}
jsonpath "$.data.file.mime_type" == "image/jpeg"
jsonpath "$.data.file.extension" == "jpg"
jsonpath "$.data.file.width" > 0
jsonpath "$.data.file.height" > 0

## 4.2 Re-upload same file with conflict=keep_both and verify auto-rename (_1 suffix)
POST https://{{host}}/api/v1/files/upload
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
[Multipart]
folder_id: {{SUB_FOLDER_ID}}
conflict: keep_both
file: file,Mona_Lisa.jpg;
HTTP 200
[Captures]
DUP_FILE_ID: jsonpath "$.data.file.id"
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data.status" == "success"
jsonpath "$.data.file.name" == "Mona_Lisa_1.jpg"
jsonpath "$.data.file.path" == "hurl_test_renamed/hurl_sub/Mona_Lisa_1.jpg"

## 4.3 Re-upload same file with conflict=overwrite and verify in-place record update
POST https://{{host}}/api/v1/files/upload
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
[Multipart]
folder_id: {{SUB_FOLDER_ID}}
conflict: overwrite
file: file,Mona_Lisa.jpg;
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data.status" == "success"
jsonpath "$.data.file.id" == {{FILE_ID}}
jsonpath "$.data.file.name" == "Mona_Lisa.jpg"

## 4.4 List and sort files in the subfolder (name_asc, size_desc, mtime_desc)
GET https://{{host}}/api/v1/files?folder_id={{SUB_FOLDER_ID}}&sort=name_asc
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data.folder_id" == {{SUB_FOLDER_ID}}
jsonpath "$.data.files" count == 2
jsonpath "$.data.files[0].NAME" == "Mona_Lisa.jpg"
jsonpath "$.data.files[1].NAME" == "Mona_Lisa_1.jpg"

## 4.5 Verify sorting by size_desc and search filtering within folder
GET https://{{host}}/api/v1/files?folder_id={{SUB_FOLDER_ID}}&sort=size_desc&search=Mona_Lisa_1
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data.files" count == 1
jsonpath "$.data.files[0].NAME" == "Mona_Lisa_1.jpg"

## 4.6 Rename, move file to root test folder, and mark as favorite
PUT https://{{host}}/api/v1/files/{{FILE_ID}}
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{
    "name": "Leonardo_Mona_Lisa.jpg",
    "folder_id": {{ROOT_FOLDER_ID}},
    "is_favorite": 1
}
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data.status" == "success"
jsonpath "$.data.file.id" == {{FILE_ID}}
jsonpath "$.data.file.name" == "Leonardo_Mona_Lisa.jpg"
jsonpath "$.data.file.path" == "hurl_test_renamed/Leonardo_Mona_Lisa.jpg"
jsonpath "$.data.file.folder_id" == {{ROOT_FOLDER_ID}}
jsonpath "$.data.file.is_favorite" == 1

## 4.7 List favorite files and verify moved/renamed file is present
GET https://{{host}}/api/v1/files?favorites=1&sort=name_asc
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data.favorites" == true
jsonpath "$.data.files[*].NAME" contains "Leonardo_Mona_Lisa.jpg"

# ------------------------------------------------------------------------------
# 5. Media Streaming, RFC 7233 Byte-Range & Downloads (cStream)
# ------------------------------------------------------------------------------

## 5.1 Stream full file inline via /api/v1/files/:id/stream
GET https://{{host}}/api/v1/files/{{FILE_ID}}/stream
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 200
[Asserts]
header "Content-Type" == "image/jpeg"
header "Content-Disposition" contains "inline"
header "Content-Disposition" contains "Leonardo_Mona_Lisa.jpg"
header "Accept-Ranges" == "bytes"
bytes count == {{FILE_SIZE}}

## 5.2 Stream file via direct /api/v1/stream/:id route
GET https://{{host}}/api/v1/stream/{{FILE_ID}}
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 200
[Asserts]
header "Content-Type" == "image/jpeg"
header "Accept-Ranges" == "bytes"
bytes count == {{FILE_SIZE}}

## 5.3 Stream partial content using RFC 7233 HTTP 206 Byte-Range request (first 1024 bytes)
GET https://{{host}}/api/v1/files/{{FILE_ID}}/stream
Range: bytes=0-1023
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 206
[Asserts]
header "Content-Type" == "image/jpeg"
header "Content-Range" == "bytes 0-1023/{{FILE_SIZE}}"
header "Content-Length" == "1024"
bytes count == 1024

## 5.4 Download single file as attachment via /api/v1/files/:id/download
GET https://{{host}}/api/v1/files/{{FILE_ID}}/download
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 200
[Asserts]
header "Content-Type" == "image/jpeg"
header "Content-Disposition" contains "attachment"
header "Content-Disposition" contains "Leonardo_Mona_Lisa.jpg"
bytes count == {{FILE_SIZE}}

## 5.5 Batch download multiple files as a ZIP archive
GET https://{{host}}/api/v1/stream/batchDownload?file_ids={{FILE_ID}},{{DUP_FILE_ID}}
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 200
[Asserts]
header "Content-Type" == "application/zip"
header "Content-Disposition" contains "attachment; filename=\"altus_download_"
bytes count > 0

# ------------------------------------------------------------------------------
# 6. Quick Sync Engine & State Cleanup (cSync, cCloudFiles, cFolders)
# ------------------------------------------------------------------------------

## 6.1 Run disk-to-database Quick Sync reconciliation
POST https://{{host}}/api/v1/sync
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{}
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data.status" == "success"
jsonpath "$.data.scanned_files" >= 2
jsonpath "$.data.duration_ms" >= 0

## 6.2 Delete the duplicate uploaded file
DELETE https://{{host}}/api/v1/files/{{DUP_FILE_ID}}
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data.status" == "success"
jsonpath "$.data.deleted_id" == {{DUP_FILE_ID}}

## 6.3 Recursively delete the root test folder (cascades to subfolder & remaining file)
DELETE https://{{host}}/api/v1/folders/{{ROOT_FOLDER_ID}}
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data.status" == "success"
jsonpath "$.data.deleted_id" == {{ROOT_FOLDER_ID}}

## 6.4 Verify cascade-deleted file is no longer streamable
GET https://{{host}}/api/v1/files/{{FILE_ID}}/stream
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
HTTP 404
[Asserts]
jsonpath "$.success" == false

## 6.5 Log out of the Cloud session
POST https://{{host}}/api/v1/auth/logout
[Options]
verbose: true
[Cookies]
PHPSESSID: {{PHPSESSID}}
{}
HTTP 200
[Asserts]
jsonpath "$.success" == true
jsonpath "$.data.status" == "success"
jsonpath "$.data.logged_out" == true
