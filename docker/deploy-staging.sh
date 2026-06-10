#!/bin/bash
# Staging Deploy Orchestration Script
# Runs on EC2 host via single SSH session from GitHub Actions
# Deploys changed services in wave order with health checks and per-service rollback
#
# Usage: ./deploy-staging.sh <space-separated list of changed services>
# Example: ./deploy-staging.sh api mcp notifications workers

set -euo pipefail

COMPOSE_FILE="docker/docker-compose.staging.yml"
ENV_FILE=".env.staging"
DEPLOY_ENV="staging"
CONTAINER_PREFIX="genfeed-staging"
CHANGED_SERVICES=("$@")

# Staging health-check tuning: longer initial wait + more retries to handle
# slower container startup on the shared host; no fast-fail on unhealthy so
# transient states (e.g. during JIT compilation) are tolerated.
WAIT_RETRIES=60
WAIT_INTERVAL=3
WAIT_START_DELAY=10
WAIT_FAST_FAIL=""

DEPLOY_HEADER="Staging Deployment"

# Source shared deploy logic (logging, wave orchestration, summary, etc.)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=docker/deploy-common.sh
source "${SCRIPT_DIR}/deploy-common.sh"

run_deploy
