#!/bin/zsh
set -eu

SERVICE_ROOT=${PDF_AUDIT_SERVICE_ROOT:-/Users/a1-6/Library/Application Support/PdfAuditService}
APP_ROOT=${PDF_AUDIT_APP_ROOT:-$SERVICE_ROOT/app}
CONFIG_FILE="$SERVICE_ROOT/cloudflared/config.yml"
TUNNEL_NAME_FILE="$SERVICE_ROOT/cloudflared/tunnel-name"

cd "$APP_ROOT"

if [[ -f "$CONFIG_FILE" && -f "$TUNNEL_NAME_FILE" ]]; then
  exec /opt/homebrew/bin/cloudflared tunnel \
    --protocol http2 \
    --config "$CONFIG_FILE" \
    run \
    --dns-resolver-addrs 1.1.1.1:53 \
    --dns-resolver-addrs 8.8.8.8:53 \
    "$(cat "$TUNNEL_NAME_FILE")"
fi

exec /opt/homebrew/bin/cloudflared tunnel \
  --protocol http2 \
  --dns-resolver-addrs 1.1.1.1:53 \
  --dns-resolver-addrs 8.8.8.8:53 \
  --url http://127.0.0.1:3000
