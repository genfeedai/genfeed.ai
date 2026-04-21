#!/bin/bash
set -euo pipefail

# ============================================================================
# setup-skills.sh — Set up Claude Code dev skills for the Genfeed.ai monorepo
#
# Generates .claude/skills/ symlinks from .agents/skills/ for Claude Code
# discovery. Optionally syncs dev skills from the shipshitdev skills repo.
#
# Usage:
#   scripts/setup-skills.sh              # Generate symlinks only
#   scripts/setup-skills.sh --sync       # Sync from shipshitdev + generate symlinks
#   scripts/setup-skills.sh --check      # Validate skill integrity (CI-safe)
# ============================================================================

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS_SKILLS="${REPO_ROOT}/.agents/skills"
CLAUDE_SKILLS="${REPO_ROOT}/.claude/skills"
SHIPSHITDEV_SKILLS="${HOME}/www/shipshitdev/public/skills/skills"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }

# Skills to sync from shipshitdev (dev/build skills only)
SYNC_SKILLS=(
  api-design-expert
  biome-validator
  bun-validator
  component-library
  docker-expert
  error-handling-expert
  mcp-builder
  performance-expert
  react-hook-form
  react-patterns
  react-testing-library
  refactor-code
  scaffold
  security-expert
  shadcn
  spec-first
  table-filters
  tailwind
  tailwind-validator
  testing-expert
  turborepo
  typescript-expert
)

generate_symlinks() {
  mkdir -p "$CLAUDE_SKILLS"

  # Remove stale symlinks
  find "$CLAUDE_SKILLS" -maxdepth 1 -type l -delete 2>/dev/null

  local count=0
  for dir in "$AGENTS_SKILLS"/*/; do
    local name
    name=$(basename "$dir")
    ln -sf "../../.agents/skills/${name}" "${CLAUDE_SKILLS}/${name}"
    ((count++))
  done

  log "Generated ${count} symlinks in .claude/skills/"
}

sync_from_shipshitdev() {
  if [[ ! -d "$SHIPSHITDEV_SKILLS" ]]; then
    warn "shipshitdev skills repo not found at ${SHIPSHITDEV_SKILLS}"
    warn "Skipping sync. Symlinks will use existing .agents/skills/ content."
    return 0
  fi

  local synced=0
  local skipped=0
  for skill in "${SYNC_SKILLS[@]}"; do
    if [[ -d "${SHIPSHITDEV_SKILLS}/${skill}" ]]; then
      # Only sync if source is newer or dest doesn't exist
      if [[ ! -d "${AGENTS_SKILLS}/${skill}" ]]; then
        cp -r "${SHIPSHITDEV_SKILLS}/${skill}" "${AGENTS_SKILLS}/"
        ((synced++))
      else
        # Replace with latest
        rm -rf "${AGENTS_SKILLS}/${skill}"
        cp -r "${SHIPSHITDEV_SKILLS}/${skill}" "${AGENTS_SKILLS}/"
        ((synced++))
      fi
    else
      warn "Not in shipshitdev: ${skill}"
      ((skipped++))
    fi
  done

  log "Synced ${synced} skills from shipshitdev (${skipped} not found)"
}

check_integrity() {
  local errors=0

  # Check all SKILL.md have frontmatter
  for f in "$AGENTS_SKILLS"/*/SKILL.md; do
    if [[ -f "$f" ]] && ! head -n 1 "$f" | grep -q '^---$'; then
      err "Missing frontmatter: $f"
      ((errors++))
    fi
  done

  # Check for broken symlinks
  local broken
  broken=$(find "$CLAUDE_SKILLS" -maxdepth 1 -type l ! -exec test -e {} \; 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$broken" -gt 0 ]]; then
    err "${broken} broken symlinks in .claude/skills/"
    ((errors++))
  fi

  # Check every .agents/skills/ entry has a .claude/skills/ symlink
  for dir in "$AGENTS_SKILLS"/*/; do
    local name
    name=$(basename "$dir")
    if [[ ! -L "${CLAUDE_SKILLS}/${name}" ]]; then
      err "Missing symlink: .claude/skills/${name}"
      ((errors++))
    fi
  done

  # Check no external symlinks
  for link in "$CLAUDE_SKILLS"/*/; do
    if [[ -L "${link%/}" ]]; then
      local target
      target=$(readlink "${link%/}")
      if [[ "$target" == /* ]] || [[ "$target" == ~* ]]; then
        err "External symlink detected: ${link%/} -> ${target}"
        ((errors++))
      fi
    fi
  done

  if [[ "$errors" -eq 0 ]]; then
    log "All checks passed"
    return 0
  else
    err "${errors} error(s) found"
    return 1
  fi
}

case "${1:-}" in
  --sync)
    sync_from_shipshitdev
    generate_symlinks
    check_integrity
    ;;
  --check)
    check_integrity
    ;;
  "")
    generate_symlinks
    ;;
  *)
    echo "Usage: setup-skills.sh [--sync|--check]"
    exit 1
    ;;
esac
