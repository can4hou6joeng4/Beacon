#!/bin/zsh
set -eu

APP_ROOT=${PDF_AUDIT_APP_ROOT:-/Users/a1-6/Library/Application Support/PdfAuditService/app}

cd "$APP_ROOT"

export PYTHONPATH=src
if [[ -z "${PDF_CHECKER_TOKEN:-}" ]]; then
  echo "PDF_CHECKER_TOKEN is required for legacy local startup" >&2
  exit 1
fi

exec /opt/homebrew/bin/python3 run_local.py
