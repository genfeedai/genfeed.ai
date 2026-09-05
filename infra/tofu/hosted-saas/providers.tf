# Deploy through the public hosted SaaS / Release workflow. CI supplies the
# required image_digest and enables DNS cutover. Out-of-band infrastructure
# changes must preserve those values to avoid service or DNS drift.

terraform {
  required_version = ">= 1.10"

  # S3-native state locking (use_lockfile) — no DynamoDB. Bucket created by the
  # bootstrap stack and intentionally hard-coded there too.
  # Bucket, key, and region come from `tofu init -backend-config=...` in CI.
  # Do not hardcode an account's state location in this tree.
  backend "s3" {
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
      ManagedBy   = "opentofu"
      Stack       = "genfeed-prod"
    }
  }
}
