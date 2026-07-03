#!/usr/bin/env bash
# One-command prod credential smoke test (AWS S3 + Postgres).
# Pulls each cred from SSM Parameter Store at runtime via command substitution,
# so no secret value is ever printed, logged, or written to disk. READ-ONLY.
#
#   bash scripts/check-prod-creds.sh
#
# Requires: awscli authenticated to the genfeed account, node, bun-installed deps.
set -euo pipefail
cd "$(dirname "$0")/.."

REGION="${AWS_SSM_REGION:-us-west-1}"
get() { aws ssm get-parameter --region "$REGION" --name "/genfeed/production/$1" --with-decryption --query Parameter.Value --output text; }

__AWS_ID="$(get AWS_ACCESS_KEY_ID)" \
__AWS_SECRET="$(get AWS_SECRET_ACCESS_KEY)" \
AWS_REGION="$(get AWS_REGION)" \
__PG="$(get DATABASE_URL)" \
node scripts/check-prod-creds.mjs
