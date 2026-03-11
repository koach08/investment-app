#!/bin/zsh

# === AI投資分析 ランチャー ===
# .app バンドルからダブルクリックで起動

PORT=3003
PROJECT_DIR="$HOME/investment-app"
PID_FILE="$PROJECT_DIR/.dev-server.pid"
LOG_FILE="$PROJECT_DIR/.dev-server.log"
URL="http://localhost:$PORT"

# Load shell environment for nodenv/nvm PATH
[[ -f "$HOME/.zprofile" ]] && source "$HOME/.zprofile"
[[ -f "$HOME/.zshrc" ]] && source "$HOME/.zshrc"

# Check if server is already running
is_running() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    rm -f "$PID_FILE"
  fi
  # Also check by port
  if lsof -i :"$PORT" -sTCP:LISTEN &>/dev/null; then
    return 0
  fi
  return 1
}

# If already running, just open browser
if is_running; then
  open "$URL"
  exit 0
fi

# Start dev server
cd "$PROJECT_DIR" || exit 1
nohup npm run dev -- -p "$PORT" > "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

# Poll until server responds (max 30 seconds)
for i in {1..30}; do
  if curl -s -o /dev/null -w '' "$URL" 2>/dev/null; then
    open "$URL"
    exit 0
  fi
  sleep 1
done

# Timeout — open anyway (page may still be compiling)
open "$URL"
