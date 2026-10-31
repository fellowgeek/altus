#!/usr/bin/env python3
"""Read-only routing checks against the local Docker web server."""
import argparse
import ssl
import urllib.error
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='https://localhost')
args = parser.parse_args()
context = ssl._create_unverified_context()  # Local development uses a self-signed certificate.
groups = {
    404: ['/storage/test.txt', '/storage', '/settings.php', '/vendor/autoload.php',
          '/composer.json', '/composer.lock', '/app/views/cms/404.phtml',
          '/themes/altus-site/index.html', '/themes/altus/index.html', '/.git/config',
          '/app/controllers/cCMS.php', '/missing.php/extra'],
    200: ['/', '/cloud/', '/login/', '/themes/altus/assets/css/altus.css',
          '/themes/altus/assets/js/altus.js', '/global/images/favicon.ico',
          '/themes/altus/assets/fonts/material-symbols-outlined.woff2'],
    401: ['/api/v1/files/', '/api/v1/auth/me', '/ohcrud/admin/getTableList'],
}
for expected, paths in groups.items():
    for path in paths:
        try:
            response = urllib.request.urlopen(args.base_url + path, context=context, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        assert response.code == expected, f'{path}: expected {expected}, got {response.code}'
        response.close()
print('PASS: source/templates/storage blocked; landing/cloud/login/assets load; cloud and CMS APIs require authentication.')
