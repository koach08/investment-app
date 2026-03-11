#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_NAME="InvestmentApp.app"
APP_PATH="$PROJECT_DIR/$APP_NAME"

echo "=== AI投資分析 App Builder ==="

# Step 1: Generate icon
echo "[1/3] Generating icon..."
python3 "$SCRIPT_DIR/generate-icon.py"

# Step 2: Create .app bundle structure
echo "[2/3] Building $APP_NAME..."
rm -rf "$APP_PATH"
mkdir -p "$APP_PATH/Contents/MacOS"
mkdir -p "$APP_PATH/Contents/Resources"

# Copy Info.plist
cp "$SCRIPT_DIR/Info.plist" "$APP_PATH/Contents/"

# Copy launcher script
cp "$SCRIPT_DIR/launcher.sh" "$APP_PATH/Contents/MacOS/launcher"
chmod +x "$APP_PATH/Contents/MacOS/launcher"

# Copy icon
if [[ -f "$SCRIPT_DIR/AppIcon.icns" ]]; then
  cp "$SCRIPT_DIR/AppIcon.icns" "$APP_PATH/Contents/Resources/"
else
  echo "Warning: AppIcon.icns not found, app will use default icon"
fi

# Step 3: Clear quarantine
echo "[3/3] Clearing quarantine..."
xattr -cr "$APP_PATH" 2>/dev/null || true

# Step 4: Copy to Desktop
DESKTOP_PATH="$HOME/Desktop/$APP_NAME"
rm -rf "$DESKTOP_PATH"
cp -r "$APP_PATH" "$DESKTOP_PATH"

echo ""
echo "Done! $APP_NAME をデスクトップに配置しました"
echo "  $DESKTOP_PATH"
