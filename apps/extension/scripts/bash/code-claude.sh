#!/bin/bash

# Ask for yolo mode
echo "❓ Do you want to run in YOLO mode? (skips confirmation prompt)"
read -p "Type 'y' for YOLO mode, anything else for normal mode: " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    YOLO_MODE=true
    echo "⚡ YOLO mode enabled! Proceeding without further confirmation."
else
    YOLO_MODE=false
fi

if [ "$YOLO_MODE" = true ]; then
    claude --dangerously-skip-permissions
else
    claude
fi
