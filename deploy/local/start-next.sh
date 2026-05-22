#!/bin/zsh
set -eu

APP_ROOT=${PDF_AUDIT_APP_ROOT:-/Users/a1-6/Library/Application Support/PdfAuditService/app}

cd "$APP_ROOT/web"

export PATH=/Users/a1-6/.local/share/fnm/node-versions/v24.15.0/installation/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
export NODE_ENV=production
export HOSTNAME=127.0.0.1
export PORT=3000
export PDF_CHECKER_TOKEN='l1IueKBAqnPg5Q_OajKcRPMEhXBpJpLo'
export PYTHON_AUDIT_BASE_URL='http://127.0.0.1:8787'

exec npm run start -- --hostname 127.0.0.1 --port 3000
