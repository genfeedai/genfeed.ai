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
DEPLOY_ENV="production"
CONTAINER_PREFIX="genfeed-ai"
CHANGED_SERVICES=("$@")

# Production health-check tuning: shorter timeout, faster failure surface.
# WAIT_FAST_FAIL=true causes wait_healthy() to bail immediately on 'unhealthy'
# or on a container that has already exited, rather than exhausting retries.
WAIT_RETRIES=20
WAIT_INTERVAL=3
WAIT_START_DELAY=5
WAIT_FAST_FAIL="true"

DEPLOY_HEADER="Production Deployment"

# Source shared deploy logic (logging, wave orchestration, summary, etc.)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=docker/deploy-common.sh
source "${SCRIPT_DIR}/deploy-common.sh"


run_deploy
