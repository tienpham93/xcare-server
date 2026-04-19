#!/bin/bash

# Configuration
POSTGRES_PORT=5432
OLLAMA_PORT=11434
SERVER_PORT=5002

echo "🚀 [PRE-TEST] Starting Orchestration..."

# Function to wait for a port with a timeout
wait_for_port() {
    local port=$1
    local name=$2
    local timeout=30
    local count=0

    echo "⏳ [$name] Waiting for port $port..."
    until nc -z localhost $port; do
        sleep 1
        count=$((count + 1))
        if [ $count -ge $timeout ]; then
            echo "❌ [$name] Error: Timeout reached waiting for port $port. Is the service running?"
            exit 1
        fi
    done
    echo "✅ [$name] $name is ready on port $port."
}

# 1. Start Docker dependencies
echo "📅 [DOCKER] Starting containers..."

# Check if Ollama is already running on the host
HOST_OLLAMA=false
if nc -z localhost $OLLAMA_PORT; then
  echo "ℹ️  [OLLAMA] Native Ollama detected on host port $OLLAMA_PORT. Skipping container."
  HOST_OLLAMA=true
fi

# Run Docker Compose
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  if [ "$HOST_OLLAMA" = true ]; then
    docker compose up -d db
  else
    docker compose up -d db ollama
  fi
elif command -v docker-compose >/dev/null 2>&1; then
  if [ "$HOST_OLLAMA" = true ]; then
    docker-compose up -d db
  else
    docker-compose up -d db ollama
  fi
else
  echo "⚠️  [DOCKER] Warning: Neither 'docker compose' nor 'docker-compose' found. Skipping automated startup."
fi

# 2. Wait for PostgreSQL & Ollama
wait_for_port $POSTGRES_PORT "POSTGRES"
# If we are using host Ollama, wait_for_port will return instantly
wait_for_port $OLLAMA_PORT "OLLAMA"

# 4. Pull Models if missing
# We use explicit ':latest' tags to match Ollama's internal naming and ensure deterministic checks
check_model() {
    # Check for the exact model name in the JSON response
    curl -s http://localhost:$OLLAMA_PORT/api/tags | grep -q "\"name\":\"$1\""
}

pull_model() {
    if ! check_model "$1"; then
        echo "📥 [OLLAMA] Pulling model $1 (this may take a few minutes)..."
        curl -X POST http://localhost:$OLLAMA_PORT/api/pull -d "{\"name\":\"$1\"}"
        echo "✅ [OLLAMA] Model $1 pulled."
    else
        echo "✅ [OLLAMA] Model $1 is already present. Skipping pull."
    fi
}

# Pinning specific version sizes to ensure alignment and prevent non-deterministic updates
pull_model "llama3:8b"
pull_model "llama3.1:8b"
pull_model "mxbai-embed-large:335m"

# 5. Start Express Server
echo "🚀 [SERVER] Starting Express server on port $SERVER_PORT..."
# Kill any zombies first
lsof -ti:$SERVER_PORT | xargs kill -9 || true
# Start in background
bun src/server.ts > server.test.log 2>&1 &
# Wait for server to bind
wait_for_port $SERVER_PORT "SERVER"

echo "🎉 [PRE-TEST] Environment is ready for Integration Tests!"
