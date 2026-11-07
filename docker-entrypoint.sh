#!/bin/sh
# Hosts often mount the data disk owned by root. Fix the folder's owner, then drop to the unprivileged user.
set -e
DIR="$(dirname "${DB_FILE:-/data/app.db}")"
mkdir -p "$DIR"
if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$DIR"
  exec su-exec node "$@"
fi
exec "$@"
