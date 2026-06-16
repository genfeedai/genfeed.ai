terraform {
  required_version = ">= 1.10"

  # S3-native state locking (use_lockfile) — no DynamoDB. Bucket created by the
  # bootstrap stack. `terraform init` this stack after bootstrap has applied.
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
