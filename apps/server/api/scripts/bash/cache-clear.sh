#!/bin/bash

# Clean all node_modules and cache files in api.genfeed.ai
# Usage: ./scripts/bash/clean:cache.sh [--reinstall]

set -e

# Go to project root (2 levels up from scripts/bash/)
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "🧹 Cache and Dependencies Cleanup Script"
echo "========================================"
echo ""
echo "⚠️  WARNING: This will permanently delete:"
echo "   • All node_modules directories (dependencies)"
echo "   • All build artifacts (dist, build, .next)"
echo "   • All cache folders (.jest-cache)"
echo "   • All log files"
echo "   • All reports"
echo ""
echo "📁 Apps that will be affected:"

# Get all app directories
APPS_DIR="apps"
APPS=($(ls -d $APPS_DIR/*/ 2>/dev/null | sed 's|apps/||' | sed 's|/||' || true))

# Show the apps that will be affected
for app in "${APPS[@]}"; do
    echo "   • $app"
done

echo ""
echo "💡 After cleanup, you'll need to run 'bun install'"
echo ""

# Ask for confirmation
read -p "❓ Are you sure you want to continue? (y/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Operation cancelled."
    exit 1
fi

echo ""
echo "🚀 Starting cleanup process..."
echo "Project root: $PROJECT_ROOT"
echo ""

# Function to safely remove directory (preserves .keep files)
safe_rm() {
  if [ -d "$1" ]; then
    echo "  ✓ Removing: $1"
    chmod -R +w "$1" 2>/dev/null || true
    # Find and remove all files/dirs except .keep files
    find "$1" -mindepth 1 ! -name ".keep" -delete 2>/dev/null || rm -rf "$1"
  fi
}

# Function to safely remove file
safe_rm_file() {
  if [ -f "$1" ]; then
    echo "  ✓ Removing: $1"
    rm -f "$1"
  fi
}

echo "📦 Removing node_modules folders..."
safe_rm "node_modules"
safe_rm "apps/api/node_modules"
safe_rm "apps/mcp/node_modules"
safe_rm "apps/files/node_modules"
safe_rm "apps/notifications/node_modules"

echo ""
echo "🗑️  Removing build artifacts..."
safe_rm "dist"
safe_rm "dist.old"
safe_rm "build"
safe_rm ".next"

echo ""
echo "🧪 Removing cache folders..."
safe_rm ".jest-cache"
safe_rm "apps/api/.jest-cache"
safe_rm "apps/mcp/.jest-cache"
safe_rm "apps/files/.jest-cache"
safe_rm "apps/notifications/.jest-cache"

echo ""
echo "📝 Removing log files..."
safe_rm "logs"
safe_rm "*.log"

echo ""
echo "📊 Removing reports..."
safe_rm "reports"

echo ""
echo "🔒 Removing lock files (optional)..."
# Uncomment if you want to remove lock file
# safe_rm_file "bun.lockb"

echo ""
echo "🎉 All caches and node_modules cleared successfully!"
echo ""

# Check if --reinstall flag is passed
if [ "$1" = "--reinstall" ]; then
  echo "📥 Reinstalling dependencies..."
  bun install
  echo ""
  echo "🏗️  Building libs..."
  bun run build:libs
  echo ""
  echo "✅ All done! Ready to develop."
else
  echo "💡 Next steps:"
  echo "   1. Run 'bun install' to reinstall dependencies"
  echo "   2. Or run this script with --reinstall:"
  echo "      ./scripts/bash/cache-clear.sh --reinstall"
fi

