terraform {
  required_version = ">= 1.10"
  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}
provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = var.project, Environment = "production", ManagedBy = "opentofu" }
  }
}
