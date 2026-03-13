#!/bin/sh
set -e

# Ensure config directories exist with correct ownership
mkdir -p /app/config/db /app/config/logs
chown -R librarr:nodejs /app/config

# Drop privileges and run the application
exec su-exec librarr:nodejs node dist/server/index.js
