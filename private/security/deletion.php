<?php
require __DIR__ . '/bootstrap.php';

use app\controllers\cFolders;

mkdir($fixture . '/outside');
file_put_contents($fixture . '/outside/keep.txt', 'outside storage');
mkdir(__ALTUS_STORAGE_PATH__ . 'keep');
file_put_contents(__ALTUS_STORAGE_PATH__ . 'keep/inside.txt', 'inside storage, outside deleted folder');
mkdir(__ALTUS_STORAGE_PATH__ . 'delete/nested', 0700, true);
file_put_contents(__ALTUS_STORAGE_PATH__ . 'delete/nested/file.txt', 'delete normally');
symlink($fixture . '/outside', __ALTUS_STORAGE_PATH__ . 'delete/external');
symlink(__ALTUS_STORAGE_PATH__ . 'keep', __ALTUS_STORAGE_PATH__ . 'delete/internal');
symlink($fixture . '/missing', __ALTUS_STORAGE_PATH__ . 'delete/broken');
symlink(__ALTUS_STORAGE_PATH__ . 'delete', __ALTUS_STORAGE_PATH__ . 'delete/cycle');
check(cFolders::recursiveDeleteDirectory(__ALTUS_STORAGE_PATH__ . 'delete'), 'Normal recursive deletion failed');
check(!file_exists(__ALTUS_STORAGE_PATH__ . 'delete'), 'Deleted folder remains');
check(file_get_contents($fixture . '/outside/keep.txt') === 'outside storage', 'Followed external symlink');
check(file_exists(__ALTUS_STORAGE_PATH__ . 'keep/inside.txt'), 'Followed internal symlink');
symlink(__ALTUS_STORAGE_PATH__ . 'keep', __ALTUS_STORAGE_PATH__ . 'alias');
check(cFolders::recursiveDeleteDirectory(__ALTUS_STORAGE_PATH__ . 'alias'), 'Top-level symlink deletion failed');
check(file_exists(__ALTUS_STORAGE_PATH__ . 'keep/inside.txt'), 'Top-level symlink target deleted');
check(!cFolders::recursiveDeleteDirectory($fixture . '/outside'), 'Allowed direct deletion outside storage');
check(!cFolders::recursiveDeleteDirectory(__ALTUS_STORAGE_PATH__), 'Allowed deleting storage root');
echo "PASS: recursive deletion preserves external/internal symlink targets, handles broken/cyclic links, and refuses paths outside storage.\n";
