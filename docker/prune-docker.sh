#!/bin/bash
# Docker cleanup script for production servers
# Run this after all deployments are complete

LOCK_FILE="/tmp/docker-prune.lock"
LOCK_TIMEOUT=300  # 5 minutes max wait for lock

echo "Starting Docker cleanup..."

# Check for and kill any stuck prune operations
check_stuck_prune() {
  echo "Checking for stuck prune operations..."

  # Find any stuck docker prune processes (older than 5 minutes)
  stuck_pids=$(ps aux | grep -E "docker (image|container|network|volume|system) prune" | grep -v grep | awk '{print $2}')

  if [ -n "$stuck_pids" ]; then
    echo "Found stuck prune processes: $stuck_pids"
    echo "Killing stuck processes..."
    for pid in $stuck_pids; do
      kill -9 "$pid" 2>/dev/null && echo "   Killed process $pid" || echo "   Failed to kill $pid"
    done
    sleep 2
  else
    echo "No stuck prune operations found"
  fi
}

# Check for stuck operations before starting
check_stuck_prune

# Function to acquire lock
acquire_lock() {
  local wait_time=0

  while [ -f "$LOCK_FILE" ]; do
    if [ $wait_time -ge $LOCK_TIMEOUT ]; then
      echo "Timeout waiting for lock (another prune may be stuck)"
      # Check if lock is stale (older than 10 minutes)
      if [ $(($(date +%s) - $(stat -f %m "$LOCK_FILE" 2>/dev/null || stat -c %Y "$LOCK_FILE" 2>/dev/null || echo 0))) -gt 600 ]; then
        echo "Removing stale lock file"
        rm -f "$LOCK_FILE"
        break
      fi
      return 1
    fi
    echo "Another prune operation is running, waiting... ($wait_time/$LOCK_TIMEOUT seconds)"
    sleep 5
    wait_time=$((wait_time + 5))
  done

  # Create lock file
  echo $$ > "$LOCK_FILE"
  return 0
}

# Function to release lock
release_lock() {
  rm -f "$LOCK_FILE"
}

# Trap to ensure lock is released on exit
trap release_lock EXIT INT TERM

# Try to acquire lock
if ! acquire_lock; then
  echo "Could not acquire lock, skipping cleanup"
  exit 0
fi

echo "Lock acquired, proceeding with cleanup..."

# Prune old images (older than 24 hours)
echo "Pruning old Docker images..."
if docker image prune --filter "until=24h" -f 2>&1 | tee /tmp/docker-prune.log | grep -q "Error response from daemon"; then
  echo "Image prune encountered an error (may be running elsewhere)"
else
  echo "Image prune completed"
fi

# Prune stopped containers (older than 24 hours)
echo "Pruning stopped containers..."
if docker container prune --filter "until=24h" -f 2>&1 | grep -q "Error response from daemon"; then
  echo "Container prune encountered an error"
else
  echo "Container prune completed"
fi

# Prune unused networks
echo "Pruning unused networks..."
if docker network prune -f 2>&1 | grep -q "Error response from daemon"; then
  echo "Network prune encountered an error"
else
  echo "Network prune completed"
fi

# Show disk space saved
echo ""
echo "Docker disk usage:"
docker system df

echo ""
echo "Docker cleanup complete!"

# Lock will be released by trap on exit
