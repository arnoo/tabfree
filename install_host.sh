#!/bin/bash
set -e

HOST_SCRIPT="$(pwd)/host.py"
MANIFEST_FILE="fr.btmx.seticon.json"

if [ ! -f "$HOST_SCRIPT" ]; then
    echo "Error: host.py not found in current directory."
    exit 1
fi

chmod +x "$HOST_SCRIPT"

echo "Generating manifest with path: $HOST_SCRIPT"
sed "s|PLACEHOLDER_PATH|$HOST_SCRIPT|g" "$MANIFEST_FILE" > "$MANIFEST_FILE.tmp" && mv "$MANIFEST_FILE.tmp" "$MANIFEST_FILE"

TARGET_DIR="$HOME/.mozilla/native-messaging-hosts"
mkdir -p "$TARGET_DIR"

ln -sf "$(pwd)/$MANIFEST_FILE" "$TARGET_DIR/$MANIFEST_FILE"

echo "Success!"
echo "1. Native Host registered at: $TARGET_DIR/$MANIFEST_FILE"
echo "2. Ensure you have 'xseticon' and 'xdotool' installed."
echo "3. Load the extension in Firefox (manifest.json)."
