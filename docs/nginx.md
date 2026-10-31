# Nginx and HTTPS

Run these commands in your server's SSH terminal, from the Altus checkout.
Setup does not install or enable an Nginx site. If Nginx is missing:

```bash
sudo apt-get install -y nginx
```

Start with [private/nginx.native.conf](../private/nginx.native.conf). Copy it to a
local working file and edit that copy:

```bash
cp private/nginx.native.conf var/altus.nginx.conf
```

Replace `@ALTUS_ROOT@` with the **absolute checkout directory**, printed by
`pwd -P`; keep `/public` on the end of its `root` directive. Replace `@HOSTNAME@`
with your browser hostname, without `https://` or a path. Replace
`@LISTEN_ADDRESS@` as described in your chosen mode below. These are placeholders,
not values to paste unchanged. System paths below refer to the server, not your
local computer; project file links are relative to this guide.

## Option A: Nginx handles HTTPS directly

In the working copy, replace the `listen` line and add certificate directives:

```nginx
listen @LISTEN_ADDRESS@:443 ssl;     # Server IP to bind, e.g. a private LAN IP
server_name @HOSTNAME@;             # Hostname covered by your certificate
root @ALTUS_ROOT@/public;           # Absolute checkout directory + /public
ssl_certificate @CERTIFICATE_PATH@; # Absolute path to the full certificate chain
ssl_certificate_key @KEY_PATH@;     # Absolute path to its private key
```

Replace all five placeholders with your own values. Use a trusted certificate
for the hostname and arrange renewal with your certificate provider. Replace
`fastcgi_param HTTPS on;` in the template with `fastcgi_param HTTPS $https;`.
Open `https://` followed by your hostname after enabling the site.

### Tailscale-only direct HTTPS

Use the same template and certificate settings as Option A, but bind specifically
to the IP printed by `tailscale ip -4`, rather than a wildcard address:

```nginx
listen @TAILSCALE_IP@:443 ssl;       # Replace with this server's Tailscale IPv4
server_name @TAILSCALE_HOSTNAME@;    # Replace with its certificate's tailnet hostname
```

Keep the `root`, certificate directives, and `HTTPS $https` setting from Option A.
The certificate must cover that tailnet hostname and be renewed. Connect from a
Tailscale-enrolled device and restrict access through your tailnet policy. This
listener is private; no public port forwarding is needed.

## Option B: a trusted HTTPS proxy handles TLS

Keep the template's `fastcgi_param HTTPS on;` and use:

```nginx
listen 127.0.0.1:8080;              # Replace @LISTEN_ADDRESS@ with 127.0.0.1
server_name @HOSTNAME@;             # Replace with the proxy's external HTTPS hostname
root @ALTUS_ROOT@/public;           # Replace with the absolute checkout directory
```

This example assumes the proxy is on the same server. It sends requests to
`http://127.0.0.1:8080` and preserves the original Host header. Browsers connect
only to the proxy's HTTPS URL. `HTTPS on` tells PHP about trusted upstream TLS;
it does not encrypt HTTP. Do not expose this backend listener publicly.
For a remote proxy, bind to a private address and restrict access to that proxy.

For an already installed and enrolled Tailscale server, you can use Tailscale
Serve as the local HTTPS proxy after enabling the loopback Nginx site:

```bash
sudo tailscale serve --bg http://127.0.0.1:8080
sudo tailscale serve status
```

Use the HTTPS URL shown by Serve and its hostname as `@HOSTNAME@`. Enable tailnet
HTTPS if prompted. Keep access limited to your tailnet; do not enable Funnel.
See [Tailscale's setup guide](https://tailscale.com/docs/install/linux) if the
server is not enrolled yet.

## Enable, validate, and reload

Keep the template's **entire routing and protection section** for either mode.
It uses the `altus` PHP-FPM socket, executes only `index.php`, blocks direct
storage and source reads, and routes downloads/previews through authenticated
streaming. Do not add a storage alias or a generic PHP handler.

Review the working copy for remaining `@...@` placeholders. Inspect your enabled
sites with `sudo nginx -T` first: choose an unused address/port or a distinct
hostname that fits the existing listeners. Do not remove other sites or add
`default_server`. On a shared server, a reload applies to every site.

If `altus` is a **new, unused site name**, install and enable it:

```bash
sudo install -m 0644 var/altus.nginx.conf /etc/nginx/sites-available/altus
sudo ln -s /etc/nginx/sites-available/altus /etc/nginx/sites-enabled/altus
sudo nginx -t
```

If either destination exists, back it up and review/merge it first; keep the
existing symlink. Do not overwrite a live configuration blindly. If validation
fails, correct the reported file and run `sudo nginx -t` again. Reload only after
it succeeds:

```bash
sudo systemctl reload nginx
```

Open your HTTPS URL and check login, upload, download, and previews. Requests to
`/storage/test.txt`, `/settings.php`, and `/composer.json` must return 404.
If another site appears, check listener/hostname conflicts before changing any
shared settings. The example assumes Ubuntu's `www-data` Nginx worker account;
see [operations](operations.md) for permissions and troubleshooting.
