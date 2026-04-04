#!/bin/bash
# Production Deploy Orchestration Script
# Runs on EC2 host via single SSH session from GitHub Actions
# Deploys changed services in wave order with health checks
#
# Usage: ./deploy-production.sh <space-separated list of changed services>
# Example: ./deploy-production.sh api mcp notifications workers

set -euo pipefail

COMPOSE_FILE="docker/docker-compose.production.yml"
ENV_FILE=".env.production"
CHANGED_SERVICES=("$@")
FAILED_SERVICES=()
DEPLOYED_SERVICES=()
SKIPPED_SERVICES=()
DEFAULT_SERVER_IMAGE="ghcr.io/genfeedai/cloud/server:${IMAGE_TAG:-latest}"

# Wave definitions (dependency order)
WAVE_1=(redis)
WAVE_2=(api mcp notifications files)
WAVE_3=(telegram discord slack)
WAVE_4=(fanvue clips workers)

# --- Logging helpers ---

log() {
  echo "[$(date '+%H:%M:%S')] $*"
}

log_header() {
  echo ""
  echo "=========================================="
  echo " $*"
  echo "=========================================="
}

log_wave() {
  echo ""
  echo "--- Wave $1: $2 ---"
}

show_docker_disk_usage() {
  log "Docker disk usage snapshot:"
  docker system df 2>&1 || true
}

canonicalize_env_link() {
  local docker_env_path="docker/${ENV_FILE}"
  local expected_target="../${ENV_FILE}"

  mkdir -p docker

  if [ -L "$docker_env_path" ]; then
    local current_target
    current_target=$(readlink "$docker_env_path")
    if [ "$current_target" != "$expected_target" ]; then
      rm -f "$docker_env_path"
      ln -s "$expected_target" "$docker_env_path"
      log "Updated ${docker_env_path} -> ${expected_target}"
    fi
    return 0
  fi

  if [ -f "$docker_env_path" ]; then
    if cmp -s "$ENV_FILE" "$docker_env_path"; then
      local backup_path="${docker_env_path}.bak.$(date +%s)"
      mv "$docker_env_path" "$backup_path"
      ln -s "$expected_target" "$docker_env_path"
      log "Canonicalized ${docker_env_path} -> ${expected_target} (backup: ${backup_path})"
      return 0
    fi

    log "ERROR: ${docker_env_path} differs from ${ENV_FILE}"
    log "Refusing to deploy with divergent env files. Reconcile them first."
    return 1
  fi

  ln -s "$expected_target" "$docker_env_path"
  log "Created ${docker_env_path} -> ${expected_target}"
}

service_env_override_file() {
  local service="$1"
  case "$service" in
    api|fanvue|files|mcp|notifications|workers)
      printf 'apps/server/%s/%s\n' "$service" "$ENV_FILE"
      ;;
    *)
      ;;
  esac
}

validate_env_files() {
  if [ ! -f "$ENV_FILE" ]; then
    log "ERROR: ${ENV_FILE} missing from repo root"
    return 1
  fi

  canonicalize_env_link || return 1

  local service
  for service in "${CHANGED_SERVICES[@]}"; do
    local override_file
    override_file=$(service_env_override_file "$service")
    if [ -n "$override_file" ] && [ ! -f "$override_file" ]; then
      log "ERROR: required env override missing for ${service}: ${override_file}"
      return 1
    fi
  done
}

reclaim_docker_space() {
  local mode="${1:-standard}"

  log_header "Docker Space Reclaim (${mode})"
  show_docker_disk_usage

  docker container prune -f 2>&1 || true
  docker builder prune -f 2>&1 || true
  docker image prune -f 2>&1 || true

  if [ "$mode" = "aggressive" ]; then
    docker image prune -af --filter "until=168h" 2>&1 || true
    docker builder prune -af 2>&1 || true
  else
    docker image prune -af --filter "until=24h" 2>&1 || true
  fi

  docker network prune -f 2>&1 || true
  show_docker_disk_usage
}

# --- Helpers ---

is_changed() {
  local service="$1"
  for s in "${CHANGED_SERVICES[@]}"; do
    if [ "$s" = "$service" ]; then
      return 0
    fi
  done
  return 1
}

remove_conflicting_container() {
  local service="$1"
  local container="genfeed-ai-${service}"

  if docker container inspect "$container" >/dev/null 2>&1; then
    log "Removing pre-existing container ${container} to avoid name conflicts..."
    docker rm -f "$container" >/dev/null 2>&1 || {
      log "FAILED: could not remove conflicting container ${container}"
      return 1
    }
  fi
}

get_previous_image() {
  local service="$1"
  local container="genfeed-ai-${service}"
  docker inspect --format='{{.Config.Image}}' "$container" 2>/dev/null || echo ""
}

wait_healthy() {
  local service="$1"
  local container="genfeed-ai-${service}"
  local retries=20
  local interval=3
  local start_delay=5

  log "Waiting ${start_delay}s for ${service} to initialize..."
  sleep "$start_delay"

  for i in $(seq 1 "$retries"); do
    local status
    status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "none")

    if [ "$status" = "healthy" ]; then
      log "${service} is healthy"
      return 0
    elif [ "$status" = "unhealthy" ]; then
      log "FAILED: ${service} is unhealthy — not waiting further"
      log "Last 50 log lines for ${service}:"
      docker logs --tail=50 "$container" 2>&1 || true
      return 1
    elif [ "$status" = "none" ]; then
      # No healthcheck defined — check if running
      local running
      running=$(docker inspect --format='{{.State.Running}}' "$container" 2>/dev/null || echo "false")
      if [ "$running" = "true" ]; then
        log "${service} is running (no healthcheck defined)"
        return 0
      elif [ "$running" = "false" ]; then
        log "FAILED: ${service} container exited — not waiting further"
        log "Last 50 log lines for ${service}:"
        docker logs --tail=50 "$container" 2>&1 || true
        return 1
      fi
    fi

    if [ "$i" -eq "$retries" ]; then
      log "FAILED: ${service} did not become healthy after $((retries * interval))s (last status: ${status})"
      log "Last 50 log lines for ${service}:"
      docker logs --tail=50 "$container" 2>&1 || true
      return 1
    fi

    echo "  Waiting for ${service}... ($i/$retries) [status: ${status}]"
    sleep "$interval"
  done
}

rollback_service() {
  local service="$1"
  local previous_image="$2"

  if [ -z "$previous_image" ]; then
    log "No previous image for ${service} — cannot rollback"
    return 1
  fi

  log "Rolling back ${service} to ${previous_image}..."
  docker pull "$previous_image" 2>/dev/null || true
  SERVER_IMAGE="$previous_image" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --force-recreate --no-deps "$service" 2>/dev/null || true
  log "Rollback initiated for ${service}"
}

deploy_wave() {
  local wave_num="$1"
  shift
  local wave_services=("$@")
  local to_deploy=()

  # Filter to only changed services in this wave
  for service in "${wave_services[@]}"; do
    if is_changed "$service"; then
      to_deploy+=("$service")
    else
      SKIPPED_SERVICES+=("$service")
    fi
  done

  if [ ${#to_deploy[@]} -eq 0 ]; then
    log "Wave ${wave_num}: no changed services, skipping"
    return 0
  fi

  log_wave "$wave_num" "${to_deploy[*]}"

  declare -A prev_images
  for service in "${to_deploy[@]}"; do
    prev_images[$service]=$(get_previous_image "$service")
    if [ -n "${prev_images[$service]}" ]; then
      log "  ${service} current image: ${prev_images[$service]}"
    fi
  done

  for service in "${to_deploy[@]}"; do
    remove_conflicting_container "$service"
  done

  # Deploy all services in this wave
  log "Deploying: ${to_deploy[*]}"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --force-recreate --no-deps "${to_deploy[@]}"

  # Health check each service — fail fast on first failure
  for service in "${to_deploy[@]}"; do
    if wait_healthy "$service"; then
      DEPLOYED_SERVICES+=("$service")
    else
      log "FAILED: ${service} — deploy aborted"
      rollback_service "$service" "${prev_images[$service]:-}"
      FAILED_SERVICES+=("$service")
      log "ABORTING: ${service} failed in wave ${wave_num} — skipping remaining waves"
      return 1
    fi
  done
}

# --- Main ---

if [ ${#CHANGED_SERVICES[@]} -eq 0 ]; then
  log "No services to deploy"
  exit 0
fi

log_header "Production Deployment"
log "Services to deploy: ${CHANGED_SERVICES[*]}"
log "Compose file: ${COMPOSE_FILE}"
log "Target server image: ${DEFAULT_SERVER_IMAGE}"

# 0. Validate canonical env setup
log_header "Environment Validation"
validate_env_files || exit 1

# 1. Docker login
log_header "Docker Login"
if [ -n "${GITHUB_TOKEN:-}" ]; then
  echo "$GITHUB_TOKEN" | docker login ghcr.io -u "${GITHUB_ACTOR:-genfeedai}" --password-stdin
  log "Logged into ghcr.io"
else
  log "GITHUB_TOKEN not set — assuming already logged in"
fi

# 2. Batch pull all changed images (except redis which uses redis:7-alpine)
log_header "Pulling Images"
PULL_SERVICES=()
for service in "${CHANGED_SERVICES[@]}"; do
  if [ "$service" != "redis" ]; then
    PULL_SERVICES+=("$service")
  fi
done

if [ ${#PULL_SERVICES[@]} -gt 0 ]; then
  reclaim_docker_space standard
  log "Pulling images for: ${PULL_SERVICES[*]}"
  if ! docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull "${PULL_SERVICES[@]}"; then
    log "Initial image pull failed — retrying after aggressive Docker cleanup"
    reclaim_docker_space aggressive
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull "${PULL_SERVICES[@]}"
  fi
  log "All images pulled"
else
  log "No images to pull (only redis changed)"
fi

# 3. Deploy in waves
log_header "Deploying Services"

deploy_wave 1 "${WAVE_1[@]}" || { log "FATAL: Wave 1 failed — aborting deploy"; exit 1; }
deploy_wave 2 "${WAVE_2[@]}" || { log "FATAL: Wave 2 failed — aborting deploy"; exit 1; }
deploy_wave 3 "${WAVE_3[@]}" || { log "FATAL: Wave 3 failed — aborting deploy"; exit 1; }
deploy_wave 4 "${WAVE_4[@]}" || { log "FATAL: Wave 4 failed — aborting deploy"; exit 1; }

# 4. Docker cleanup
log_header "Docker Cleanup"
log "Pruning old images..."
docker image prune -f --filter "until=24h" 2>&1 || true
docker container prune -f --filter "until=24h" 2>&1 || true
docker network prune -f 2>&1 || true
log "Cleanup complete"

# 5. Final API health check (if API was deployed or is running)
if is_changed "api"; then
  log_header "Final API Verification"
  for i in $(seq 1 10); do
    if curl -sf --max-time 10 http://localhost:3001/v1/health >/dev/null 2>&1; then
      log "api.genfeed.ai is healthy (HTTP check passed)"
      break
    fi
    if [ "$i" -eq 10 ]; then
      log "WARNING: API HTTP health check did not pass after 10 attempts"
    fi
    sleep 5
  done
fi

# 6. Summary
log_header "Deployment Summary"

if [ ${#DEPLOYED_SERVICES[@]} -gt 0 ]; then
  log "Deployed: ${DEPLOYED_SERVICES[*]}"
fi
if [ ${#SKIPPED_SERVICES[@]} -gt 0 ]; then
  log "Skipped (unchanged): ${SKIPPED_SERVICES[*]}"
fi
if [ ${#FAILED_SERVICES[@]} -gt 0 ]; then
  log "FAILED (rolled back): ${FAILED_SERVICES[*]}"
fi

# Generate GitHub Actions step summary if running in CI
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## Deployment Results"
    echo ""
    echo "| Service | Status |"
    echo "|---------|--------|"
    if [ ${#DEPLOYED_SERVICES[@]} -gt 0 ]; then
      for s in "${DEPLOYED_SERVICES[@]}"; do echo "| ${s} | deployed |"; done
    fi
    if [ ${#SKIPPED_SERVICES[@]} -gt 0 ]; then
      for s in "${SKIPPED_SERVICES[@]}"; do echo "| ${s} | skipped |"; done
    fi
    if [ ${#FAILED_SERVICES[@]} -gt 0 ]; then
      for s in "${FAILED_SERVICES[@]}"; do echo "| ${s} | **FAILED** (rolled back) |"; done
    fi
    echo ""
    echo "**Commit:** \`${GITHUB_SHA:-unknown}\`"
    echo "**Author:** ${GITHUB_ACTOR:-unknown}"
    echo "**Time:** $(date -u)"
  } >> "$GITHUB_STEP_SUMMARY"
fi

# Exit with failure if any service failed
if [ ${#FAILED_SERVICES[@]} -gt 0 ]; then
  log "Deployment completed with failures"
  exit 1
fi

log "Deployment completed successfully"
exit 0
