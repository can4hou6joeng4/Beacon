#!/bin/zsh
set -eu

ROOT=/Users/a1-6/Documents/pdf-certificate-expiry-checker
SERVICE_ROOT="$HOME/Library/Application Support/PdfAuditService"
APP_ROOT="$SERVICE_ROOT/app"
AGENTS_DIR=$HOME/Library/LaunchAgents
PLISTS=(
  com.a1.pdf-expiry.python.plist
  com.a1.pdf-expiry.next.plist
  com.a1.pdf-expiry.cloudflared.plist
)

usage() {
  echo "Usage: $0 {install|start|stop|restart|status|logs|url}"
}

copy_plists() {
  mkdir -p "$SERVICE_ROOT/logs"
  rm -rf "$APP_ROOT"
  mkdir -p "$APP_ROOT"
  rsync -a --delete \
    --exclude '.git' \
    --exclude 'deploy/local/logs' \
    "$ROOT/" "$APP_ROOT/"
  cp "$ROOT/deploy/local"/start-*.sh "$SERVICE_ROOT/"
  chmod +x "$SERVICE_ROOT"/start-*.sh
  mkdir -p "$AGENTS_DIR"
  for plist in $PLISTS; do
    cp "$ROOT/deploy/local/$plist" "$AGENTS_DIR/$plist"
  done
}

bootout_all() {
  for plist in $PLISTS; do
    launchctl bootout "gui/$(id -u)" "$AGENTS_DIR/$plist" 2>/dev/null || true
  done
}

bootstrap_all() {
  for plist in $PLISTS; do
    launchctl bootstrap "gui/$(id -u)" "$AGENTS_DIR/$plist" 2>/dev/null || true
    launchctl kickstart -k "gui/$(id -u)/${plist:r}"
  done
}

case "${1:-}" in
  install)
    copy_plists
    bootout_all
    bootstrap_all
    ;;
  start)
    bootstrap_all
    ;;
  stop)
    bootout_all
    ;;
  restart)
    bootout_all
    bootstrap_all
    ;;
  status)
    for plist in $PLISTS; do
      label=${plist:r}
      echo "== $label =="
      launchctl print "gui/$(id -u)/$label" 2>/dev/null | sed -n '1,35p' || echo "not loaded"
    done
    ;;
  logs)
    tail -n 80 "$SERVICE_ROOT"/logs/*.log 2>/dev/null || true
    ;;
  url)
    config_file="$SERVICE_ROOT/cloudflared/config.yml"
    if [[ -f "$config_file" ]]; then
      host=$(awk '/hostname:/ {print $3; exit}' "$config_file")
      if [[ -n "$host" ]]; then
        if [[ -z "${PDF_CHECKER_TOKEN:-}" ]]; then
          echo "PDF_CHECKER_TOKEN is required to print a legacy local URL" >&2
          exit 1
        fi
        echo "https://$host/?token=$PDF_CHECKER_TOKEN"
        exit 0
      fi
    fi
    rg -o 'https://[-a-z0-9]+\.trycloudflare\.com' "$SERVICE_ROOT"/logs/cloudflared.err.log "$SERVICE_ROOT"/logs/cloudflared.out.log 2>/dev/null | tail -1 || true
    ;;
  *)
    usage
    exit 1
    ;;
esac
