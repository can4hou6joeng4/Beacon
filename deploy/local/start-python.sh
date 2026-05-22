#!/bin/zsh
set -eu

APP_ROOT=${PDF_AUDIT_APP_ROOT:-/Users/a1-6/Library/Application Support/PdfAuditService/app}

cd "$APP_ROOT"

export PYTHONPATH=src
export PDF_CHECKER_TOKEN='l1IueKBAqnPg5Q_OajKcRPMEhXBpJpLo'

exec /opt/homebrew/bin/python3 run_local.py
