#!/bin/bash
# Render deploy-time env files from AWS SSM Parameter Store.
# Intended to run on EC2 with an attached instance role.

set -euo pipefail

DEPLOY_ENV="${1:-}"
SSM_PARAMETER_PATH_PREFIX="${SSM_PARAMETER_PATH_PREFIX:-/genfeed}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_ENV_FILE="${ROOT_DIR}/.env.${DEPLOY_ENV}"

if [ -z "${DEPLOY_ENV}" ]; then
  echo "Usage: ./docker/render-ssm-env.sh <staging|production>" >&2
  exit 1
fi

case "${DEPLOY_ENV}" in
  staging|production) ;;
  *)
    echo "Unsupported deploy environment: ${DEPLOY_ENV}" >&2
    exit 1
    ;;
esac

log() {
  echo "[$(date '+%H:%M:%S')] $*"
}

require_command() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    log "ERROR: required command not found: ${command_name}"
    exit 1
  fi
}

resolve_aws_region() {
  if [ -n "${AWS_REGION:-}" ]; then
    export AWS_DEFAULT_REGION="${AWS_REGION}"
    return 0
  fi

  if [ -n "${AWS_DEFAULT_REGION:-}" ]; then
    export AWS_REGION="${AWS_DEFAULT_REGION}"
    return 0
  fi

  local configured_region
  configured_region="$(aws configure get region 2>/dev/null || true)"
  if [ -n "${configured_region}" ]; then
    export AWS_REGION="${configured_region}"
    export AWS_DEFAULT_REGION="${configured_region}"
    return 0
  fi

  if ! command -v curl >/dev/null 2>&1; then
    log "ERROR: AWS region is not configured and curl is unavailable for IMDS lookup"
    exit 1
  fi

  local token
  token="$(
    curl -fsS -X PUT \
      "http://169.254.169.254/latest/api/token" \
      -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" \
      2>/dev/null || true
  )"

  if [ -z "${token}" ]; then
    log "ERROR: AWS region is not configured and IMDSv2 token lookup failed"
    exit 1
  fi

  local identity
  identity="$(
    curl -fsS \
      -H "X-aws-ec2-metadata-token: ${token}" \
      "http://169.254.169.254/latest/dynamic/instance-identity/document" \
      2>/dev/null || true
  )"

  local region
  region="$(printf '%s\n' "${identity}" | sed -n 's/.*"region"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  if [ -z "${region}" ]; then
    log "ERROR: failed to resolve AWS region from IMDS"
    exit 1
  fi

  export AWS_REGION="${region}"
  export AWS_DEFAULT_REGION="${region}"
}

ensure_parent_dir() {
  local target_file="$1"
  mkdir -p "$(dirname "${target_file}")"
}

write_service_override_file() {
  local target_file="$1"
  local sentry_key="$2"

  ensure_parent_dir "${target_file}"

  {
    printf '%s\n' "# Generated from AWS SSM for ${DEPLOY_ENV}."
    printf '%s\n' "# This file is recreated on every deploy."
    printf '%s\n' ""

    if [ -n "${SSM_VALUES[${sentry_key}]:-}" ]; then
      printf '%s=%s\n' "SENTRY_DSN" "${SSM_VALUES[${sentry_key}]}"
    fi
  } > "${target_file}"

  chmod 600 "${target_file}"
}

render_root_env_file() {
  local temp_file
  temp_file="$(mktemp "${ROOT_ENV_FILE}.tmp.XXXXXX")"

  {
    printf '%s\n' "# Generated from AWS SSM Parameter Store for ${DEPLOY_ENV}."
    printf '%s\n' "# Parameter path: ${SSM_PARAMETER_PATH_PREFIX}/${DEPLOY_ENV}"
    printf '%s\n' "# This file is recreated on every deploy."
    printf '%s\n' ""

    for key in $(printf '%s\n' "${!SSM_VALUES[@]}" | sort); do
      printf '%s=%s\n' "${key}" "${SSM_VALUES[${key}]}"
    done
  } > "${temp_file}"

  chmod 600 "${temp_file}"
  mv "${temp_file}" "${ROOT_ENV_FILE}"
}

render_minimal_service_override_files() {
  write_service_override_file "${ROOT_DIR}/apps/server/api/.env.${DEPLOY_ENV}" "API_SENTRY_DSN"
  write_service_override_file "${ROOT_DIR}/apps/server/files/.env.${DEPLOY_ENV}" "FILES_SENTRY_DSN"
  write_service_override_file "${ROOT_DIR}/apps/server/mcp/.env.${DEPLOY_ENV}" "MCP_SENTRY_DSN"
  write_service_override_file "${ROOT_DIR}/apps/server/notifications/.env.${DEPLOY_ENV}" "NOTIFICATIONS_SENTRY_DSN"
  write_service_override_file "${ROOT_DIR}/apps/server/workers/.env.${DEPLOY_ENV}" "WORKERS_SENTRY_DSN"
  write_service_override_file "${ROOT_DIR}/apps/server/clips/.env.${DEPLOY_ENV}" "CLIPS_SENTRY_DSN"
  write_service_override_file "${ROOT_DIR}/apps/server/discord/.env.${DEPLOY_ENV}" "DISCORD_SENTRY_DSN"
  write_service_override_file "${ROOT_DIR}/apps/server/slack/.env.${DEPLOY_ENV}" "SLACK_SENTRY_DSN"
  write_service_override_file "${ROOT_DIR}/apps/server/telegram/.env.${DEPLOY_ENV}" "TELEGRAM_SENTRY_DSN"

  if [ -d "${ROOT_DIR}/apps/server/fanvue" ]; then
    write_service_override_file "${ROOT_DIR}/apps/server/fanvue/.env.${DEPLOY_ENV}" "FANVUE_SENTRY_DSN"
  fi
}

run_env_sync_if_available() {
  if ! command -v bun >/dev/null 2>&1; then
    log "Bun is not available on the host; using minimal service override rendering"
    return 1
  fi

  if [ ! -d "${ROOT_DIR}/node_modules" ]; then
    log "node_modules is not present on the host; using minimal service override rendering"
    return 1
  fi

  if bun run env:sync "${DEPLOY_ENV}" >/dev/null 2>&1; then
    log "Generated app/service env files via bun run env:sync ${DEPLOY_ENV}"
    return 0
  fi

  log "bun run env:sync ${DEPLOY_ENV} failed; using minimal service override rendering"
  return 1
}

require_command aws
resolve_aws_region

declare -A SSM_VALUES=()
SSM_PATH="${SSM_PARAMETER_PATH_PREFIX}/${DEPLOY_ENV}"

log "Fetching SSM parameters from ${SSM_PATH} in ${AWS_REGION}"

PARAMETER_ROWS="$(
  aws ssm get-parameters-by-path \
    --path "${SSM_PATH}" \
    --recursive \
    --with-decryption \
    --region "${AWS_REGION}" \
    --query 'Parameters[].[Name,Value]' \
    --output text
)"

if [ -z "${PARAMETER_ROWS}" ] || [ "${PARAMETER_ROWS}" = "None" ]; then
  log "ERROR: no SSM parameters found under ${SSM_PATH}"
  exit 1
fi

while IFS=$'\t' read -r full_name parameter_value; do
  [ -n "${full_name}" ] || continue

  key="${full_name##*/}"
  if [ -z "${key}" ]; then
    log "ERROR: invalid SSM parameter name: ${full_name}"
    exit 1
  fi

  if printf '%s' "${parameter_value}" | grep -q $'\n'; then
    log "ERROR: multiline env values are not supported for ${key}"
    exit 1
  fi

  if [ -n "${SSM_VALUES[${key}]:-}" ]; then
    log "ERROR: duplicate SSM parameter leaf detected for ${key}"
    exit 1
  fi

  SSM_VALUES["${key}"]="${parameter_value}"
done <<< "${PARAMETER_ROWS}"

umask 077
render_root_env_file

if ! run_env_sync_if_available; then
  render_minimal_service_override_files
fi

log "Rendered ${#SSM_VALUES[@]} env keys from SSM for ${DEPLOY_ENV}"
