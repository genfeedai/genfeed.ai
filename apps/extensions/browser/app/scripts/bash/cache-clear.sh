#!/bin/bash

# Script to clear cache for Plasmo extension

echo "🧹 Cache and Dependencies Cleanup Script"
echo "========================================"
echo ""
echo "⚠️  WARNING: This will permanently delete:"
echo "   • Build directories (build, dist, .plasmo)"
echo "   • All node_modules directories (dependencies)"
echo "   • TypeScript build info files"
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
echo ""

# Remove build directories
echo "🗑️  Removing build directories..."
[ -d "build" ] && rm -rf build && echo "  ✅ Removed build/"
[ -d "dist" ] && rm -rf dist && echo "  ✅ Removed dist/"
[ -d ".plasmo" ] && rm -rf .plasmo && echo "  ✅ Removed .plasmo/"
[ -d ".next" ] && rm -rf .next && echo "  ✅ Removed .next/"

# Remove node_modules
echo ""
echo "📦 Removing node_modules..."
[ -d "node_modules" ] && rm -rf node_modules && echo "  ✅ Removed node_modules/"

# Remove TypeScript build info
echo ""
echo "📝 Removing TypeScript build info..."
[ -f "tsconfig.tsbuildinfo" ] && rm -f tsconfig.tsbuildinfo && echo "  ✅ Removed tsconfig.tsbuildinfo"

# Clear bun cache
echo ""
echo "🔄 Clearing bun cache..."
if command -v bun &> /dev/null; then
    bun pm cache rm 2>/dev/null || true
    echo "  ✅ Cleared bun cache"
else
    echo "  ℹ️  bun not found, skipping cache clear"
fi

echo ""
echo "🎉 All caches and node_modules cleared successfully!"
echo "💡 Next steps:"
echo "   1. Run 'bun install' to reinstall dependencies"
echo "   2. Then run 'bun run dev' or 'bun run build' to start fresh"
