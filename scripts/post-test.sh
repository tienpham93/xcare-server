#!/bin/bash

SERVER_PORT=5002

echo "🧹 [POST-TEST] Cleaning up environment..."

# 1. Kill the Express Server
echo "🛑 [SERVER] Stopping Express server on port $SERVER_PORT..."
lsof -ti:$SERVER_PORT | xargs kill -9 || true
echo "✅ [SERVER] Express server stopped."

# 2. Teardown Docker
echo "🛑 [DOCKER] Stopping and removing containers..."
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  docker compose down
elif command -v docker-compose >/dev/null 2>&1; then
  docker-compose down
else
  echo "⚠️  [DOCKER] Skipping automated teardown (command not found)."
fi
echo "✅ [DOCKER] Environment torn down."

echo "🎉 [POST-TEST] Clean up complete!"
