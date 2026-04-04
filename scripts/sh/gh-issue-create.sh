#!/usr/bin/env bash
# gh-issue-create.sh — Drop-in replacement for `gh issue create` with duplicate detection.
# Searches ALL issues (open + closed) for similar titles before creating.
#
# Usage:
#   gh-issue-create.sh --title "My Issue" --body "Description" --label "feature"
#   gh-issue-create.sh --title "My Issue" --body "Description" --repo owner/repo
#
# Env:
#   GH_ISSUE_DEDUP_THRESHOLD  Word overlap % to flag (default: 60)
#   GH_ISSUE_FORCE            Set to "1" to skip confirmation prompt

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
REPO="genfeedai/cloud"
THRESHOLD="${GH_ISSUE_DEDUP_THRESHOLD:-60}"
FORCE="${GH_ISSUE_FORCE:-0}"
TITLE=""
BODY=""
LABELS=()
ASSIGNEES=()

# ── Parse args (mirrors gh issue create flags) ───────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --title|-t)  TITLE="$2";       shift 2 ;;
    --body|-b)   BODY="$2";        shift 2 ;;
    --label|-l)  LABELS+=("$2");   shift 2 ;;
    --assignee|-a) ASSIGNEES+=("$2"); shift 2 ;;
    --repo|-R)   REPO="$2";       shift 2 ;;
    --force)     FORCE="1";        shift ;;
    *)           echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$TITLE" ]]; then
  echo "Error: --title is required" >&2
  exit 1
fi

# ── Stop words for keyword extraction ────────────────────────────────────────
STOP_WORDS="a an the and or but in on at to for of is it with from by as be"

extract_keywords() {
  local text="$1"
  local words
  # Lowercase, strip punctuation, split
  words=$(echo "$text" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' ' ')
  local filtered=()
  for word in $words; do
    [[ ${#word} -lt 2 ]] && continue
    local is_stop=0
    for sw in $STOP_WORDS; do
      [[ "$word" == "$sw" ]] && is_stop=1 && break
    done
    [[ $is_stop -eq 0 ]] && filtered+=("$word")
  done
  echo "${filtered[*]}"
}

word_overlap_pct() {
  local title1="$1"
  local title2="$2"
  local words1 words2
  words1=$(extract_keywords "$title1")
  words2=$(extract_keywords "$title2")

  [[ -z "$words1" || -z "$words2" ]] && echo 0 && return

  local matches=0
  local total=0
  for w1 in $words1; do
    total=$((total + 1))
    for w2 in $words2; do
      if [[ "$w1" == "$w2" ]]; then
        matches=$((matches + 1))
        break
      fi
    done
  done

  [[ $total -eq 0 ]] && echo 0 && return
  echo $(( (matches * 100) / total ))
}

# ── Search for duplicates ────────────────────────────────────────────────────
keywords=$(extract_keywords "$TITLE")
search_query="${keywords// / }"

echo "Searching for similar issues..."
echo "  Keywords: $search_query"
echo ""

duplicates_found=0
duplicate_list=""

for state in open closed; do
  results=$(gh issue list --repo "$REPO" --state "$state" --search "$search_query" --limit 20 --json number,title,state 2>/dev/null || echo "[]")

  count=$(echo "$results" | jq 'length')
  for i in $(seq 0 $((count - 1))); do
    existing_number=$(echo "$results" | jq -r ".[$i].number")
    existing_title=$(echo "$results" | jq -r ".[$i].title")
    existing_state=$(echo "$results" | jq -r ".[$i].state")

    overlap=$(word_overlap_pct "$TITLE" "$existing_title")

    if [[ $overlap -ge $THRESHOLD ]]; then
      duplicates_found=$((duplicates_found + 1))
      state_label=$(echo "$existing_state" | tr '[:upper:]' '[:lower:]')
      duplicate_list+="  #${existing_number} [${state_label}] (${overlap}% match): ${existing_title}"$'\n'
    fi
  done
done

# ── Handle duplicates ────────────────────────────────────────────────────────
if [[ $duplicates_found -gt 0 ]]; then
  echo "WARNING: Found $duplicates_found potential duplicate(s):"
  echo ""
  echo "$duplicate_list"
  echo "New title: \"$TITLE\""
  echo ""

  if [[ "$FORCE" == "1" ]]; then
    echo "Force mode — creating despite duplicates."
  elif [[ -t 0 ]]; then
    read -rp "Create anyway? (y/N): " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
      echo "Aborted."
      exit 2
    fi
  else
    echo "ABORTED: Non-interactive mode and duplicates found."
    echo "Re-run with --force or GH_ISSUE_FORCE=1 to create anyway."
    exit 2
  fi
fi

# ── Build gh issue create command ────────────────────────────────────────────
cmd=(gh issue create --repo "$REPO" --title "$TITLE")

if [[ -n "$BODY" ]]; then
  cmd+=(--body "$BODY")
fi

if [[ ${#LABELS[@]} -gt 0 ]]; then
  for label in "${LABELS[@]}"; do
    cmd+=(--label "$label")
  done
fi

if [[ ${#ASSIGNEES[@]} -gt 0 ]]; then
  for assignee in "${ASSIGNEES[@]}"; do
    cmd+=(--assignee "$assignee")
  done
fi

echo "Creating issue..."
"${cmd[@]}"
