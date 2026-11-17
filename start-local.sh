#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# FundTrack Local Auto-Launcher (Linux / macOS)
# Checks prerequisites (Node.js >= 18, npm, .env, node_modules), installs missing
# dependencies automatically when needed, starts the server, and opens the app.
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT="${PORT:-3000}"
URL="http://localhost:${PORT}"

log()  { printf "\033[1;36m[FundTrack]\033[0m %s\n" "$1"; }
warn() { printf "\033[1;33m[FundTrack]\033[0m %s\n" "$1"; }
err()  { printf "\033[1;31m[FundTrack]\033[0m %s\n" "$1" >&2; }

install_node_if_missing() {
  local need_install=0
  if ! command -v node >/dev/null 2>&1; then
    need_install=1
  else
    local major
    major="$(node -v | sed 's/^v//' | cut -d. -f1)"
    if [ "${major:-0}" -lt 18 ]; then
      warn "Detected Node.js $(node -v); Node.js >= 18 is required."
      need_install=1
    fi
  fi

  if [ "$need_install" -eq 0 ] && command -v npm >/dev/null 2>&1; then
    log "Node.js $(node -v) and npm $(npm -v) detected."
    return 0
  fi

  warn "Node.js >= 18 / npm not found. Attempting automatic installation..."
  local os_name
  os_name="$(uname -s)"

  if [ "$os_name" = "Darwin" ]; then
    if command -v brew >/dev/null 2>&1; then
      brew install node
    else
      err "Homebrew is not installed. Please install Node.js LTS from https://nodejs.org or install Homebrew first."
      exit 1
    fi
  elif [ "$os_name" = "Linux" ]; then
    local sudo_cmd=""
    if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
      sudo_cmd="sudo"
    fi

    if command -v apt-get >/dev/null 2>&1; then
      if command -v curl >/dev/null 2>&1; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | $sudo_cmd -E bash -
      fi
      $sudo_cmd apt-get update -y && $sudo_cmd apt-get install -y nodejs npm
    elif command -v dnf >/dev/null 2>&1; then
      $sudo_cmd dnf install -y nodejs npm
    elif command -v yum >/dev/null 2>&1; then
      $sudo_cmd yum install -y nodejs npm
    elif command -v pacman >/dev/null 2>&1; then
      $sudo_cmd pacman -Sy --noconfirm nodejs npm
    elif command -v apk >/dev/null 2>&1; then
      $sudo_cmd apk add --no-cache nodejs npm
    else
      err "Unsupported package manager. Please install Node.js >= 18 manually from https://nodejs.org."
      exit 1
    fi
  else
    err "Unsupported OS ($os_name). Please install Node.js >= 18 from https://nodejs.org."
    exit 1
  fi

  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    err "Node.js / npm installation failed."
    exit 1
  fi
  log "Installed Node.js $(node -v) and npm $(npm -v)."
}

ensure_env_file() {
  if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    log "Creating .env from .env.example..."
    cp ".env.example" ".env"
  fi
}

ensure_dependencies() {
  local need_npm=0
  if [ ! -d "node_modules" ] || [ ! -x "node_modules/.bin/tsx" ] || [ ! -x "node_modules/.bin/vite" ]; then
    need_npm=1
  elif [ -f "package-lock.json" ] && [ "package-lock.json" -nt "node_modules" ]; then
    need_npm=1
  elif [ -f "package.json" ] && [ "package.json" -nt "node_modules" ]; then
    need_npm=1
  fi

  if [ "$need_npm" -eq 1 ]; then
    log "Installing npm dependencies (this may take a minute on first run)..."
    npm install --no-audit --no-fund
    touch "node_modules"
    log "Dependencies installed."
  else
    log "Dependencies verified."
  fi
}

open_browser_when_ready() {
  (
    for _ in $(seq 1 40); do
      if command -v curl >/dev/null 2>&1 && curl -sf "${URL}/api/health" >/dev/null 2>&1; then
        break
      fi
      sleep 0.5
    done
    if command -v open >/dev/null 2>&1; then
      open "$URL" >/dev/null 2>&1 || true
    elif command -v xdg-open >/dev/null 2>&1; then
      xdg-open "$URL" >/dev/null 2>&1 || true
    fi
  ) &
}

check_local_ai() {
  if ! command -v curl >/dev/null 2>&1; then
    return 0
  fi
  if curl -sf --max-time 1 "http://127.0.0.1:1337/v1/models" >/dev/null 2>&1; then
    log "Jan Local AI detected on http://127.0.0.1:1337/v1"
  elif curl -sf --max-time 1 "http://127.0.0.1:8080/v1/models" >/dev/null 2>&1; then
    log "llama-server Local AI detected on http://127.0.0.1:8080/v1"
  elif curl -sf --max-time 1 "http://127.0.0.1:11434/v1/models" >/dev/null 2>&1; then
    log "Ollama Local AI detected on http://127.0.0.1:11434/v1"
  else
    warn "Local AI server not running on 1337/8080/11434 (Tip: enable Local API Server in Jan; offline parser remains ready)."
  fi
}

log "Checking system prerequisites..."
install_node_if_missing
ensure_env_file
ensure_dependencies
check_local_ai

log "Starting FundTrack on ${URL} ..."
open_browser_when_ready
exec npm run dev
