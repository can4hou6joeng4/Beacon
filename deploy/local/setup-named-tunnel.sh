#!/bin/zsh
set -eu

TUNNEL_NAME=${PDF_AUDIT_TUNNEL_NAME:-pdf-certificate-expiry-checker}
SERVICE_ROOT="$HOME/Library/Application Support/PdfAuditService"
CLOUDFLARED_DIR="$SERVICE_ROOT/cloudflared"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <fixed-hostname>"
  echo "Example: $0 pdf-audit.example.com"
  exit 1
fi

HOSTNAME=$1

if [[ ! -f "$HOME/.cloudflared/cert.pem" ]]; then
  echo "Missing ~/.cloudflared/cert.pem. Run: cloudflared tunnel login"
  exit 1
fi

mkdir -p "$CLOUDFLARED_DIR"

if ! /opt/homebrew/bin/cloudflared tunnel info "$TUNNEL_NAME" >/dev/null 2>&1; then
  /opt/homebrew/bin/cloudflared tunnel create "$TUNNEL_NAME"
fi

TUNNEL_ID=$(/opt/homebrew/bin/cloudflared tunnel list 2>/dev/null | awk -v name="$TUNNEL_NAME" '$2 == name {print $1; exit}')
if [[ -z "$TUNNEL_ID" ]]; then
  echo "Could not determine Tunnel ID for $TUNNEL_NAME"
  exit 1
fi

cat > "$CLOUDFLARED_DIR/config.yml" <<EOF
tunnel: $TUNNEL_ID
credentials-file: $HOME/.cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: $HOSTNAME
    service: http://127.0.0.1:3000
    originRequest:
      disableChunkedEncoding: true
      connectTimeout: 30s
      tlsTimeout: 10s
      tcpKeepAlive: 30s
      keepAliveConnections: 20
      keepAliveTimeout: 90s
      noHappyEyeballs: true
  - service: http_status:404
EOF

printf "%s" "$TUNNEL_NAME" > "$CLOUDFLARED_DIR/tunnel-name"

/opt/homebrew/bin/cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME"

echo "Configured named Tunnel: $TUNNEL_NAME"
echo "Tunnel ID: $TUNNEL_ID"
echo "Hostname: $HOSTNAME"
echo "Config: $CLOUDFLARED_DIR/config.yml"
echo "Next step: ./deploy/local/pdf-audit-service.sh install"
