#!/bin/bash
# Environmental Packaging Script for HaiberDyn Agentic Terminal Tools
# Author: HaiberDyn

ROOT_DIR=$(pwd)
DIST_DIR="$ROOT_DIR/dist"
COMMON_FILES=("README.md" "LICENSE" "haiberdyn_terminal.png")

# Ensure build is fresh
wsl npm run build

function package_env() {
    ENV_NAME=$1
    PACKAGING_DIR="$ROOT_DIR/packaging/$ENV_NAME"
    
    echo "--- Packaging for $ENV_NAME ---"
    
    # Clean and setup environment directory
    rm -rf "$PACKAGING_DIR/dist"
    cp -r "$DIST_DIR" "$PACKAGING_DIR/dist"
    
    for file in "${COMMON_FILES[@]}"; do
        cp "$ROOT_DIR/$file" "$PACKAGING_DIR/"
    done
    
    # Enter packaging dir and run vsce
    cd "$PACKAGING_DIR"
    VSIX_FILE=$(wsl vsce package --no-git-check | grep "Packaged:" | awk '{print $NF}' | xargs basename)
    
    # Define target suffix
    SUFFIX=""
    if [ "$ENV_NAME" == "antigravity" ]; then
        SUFFIX="-4-antigravity"
    else
        SUFFIX="-4-ghcopilot"
    fi

    # Rename and move
    TARGET_NAME="${VSIX_FILE%.vsix}${SUFFIX}.vsix"
    echo "Renaming $VSIX_FILE to $TARGET_NAME"
    mv "$VSIX_FILE" "$ROOT_DIR/$TARGET_NAME"
    
    cd "$ROOT_DIR"
    
    echo "✓ Package created: $TARGET_NAME"
}

# Run packaging for both targets
package_env "vscode"
package_env "antigravity"

echo "=== All packages generated in root directory ==="
ls -lh *.vsix
