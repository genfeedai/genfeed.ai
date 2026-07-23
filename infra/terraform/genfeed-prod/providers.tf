# ┌─────────────────────────────────────────────────────────────────────────┐
# │ ⚠  DO NOT run a bare `terraform/tofu apply` on this stack from a laptop.  │
# └─────────────────────────────────────────────────────────────────────────┘
# This config is CI-first. Two inputs are supplied at deploy time by GitHub
# Actions and are NOT hardcoded here — their file defaults are placeholders that
# only exist so the config parses:
#
#   • image_tag          default "latest"  → CI passes the real commit SHA
#                                             (-var="image_tag=<sha>")
#   • enable_dns_cutover  default false     → CI passes true
#                                             (-var="enable_dns_cutover=true")
#
# A plain local apply runs with those wrong defaults and will plan destructive
# drift against healthy production: it reverts all task definitions to :latest
# (a full redeploy) AND DESTROYS the api/mcp/notifications Route53 records
# (prod DNS offline). Nothing is actually missing from AWS — the drift is purely
# an artifact of applying without the CI-injected vars.
#
# Deploy through CI. For an out-of-band change (e.g. a cost tweak), use a
# `-target`ed apply scoped to the specific resources, never a full apply — or
# pass -var="image_tag=<current-sha>" -var="enable_dns_cutover=true" (or the
# equivalent TF_VAR_* env vars) first.

terraform {
  required_version = ">= 1.10"

  # S3-native state locking (use_lockfile) — no DynamoDB. Bucket created by the
  # bootstrap stack and intentionally hard-coded there too.
  backend "s3" {
    bucket       = "genfeed-tfstate"
    key          = "genfeed-prod/terraform.tfstate"
    region       = "us-west-1"
    encrypt      = true
    use_lockfile = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project     = "genfeed"
      Environment = "production"
      ManagedBy   = "terraform"
      Stack       = "genfeed-prod"
    }
  }
}
