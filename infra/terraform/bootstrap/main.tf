# Bootstrap stack — run ONCE, locally, with admin AWS creds.
#
#   cd infra/terraform/bootstrap
#   terraform init && terraform apply
#
# Creates the prerequisites the rest of the IaC assumes:
#   1. S3 bucket for remote Terraform state (with native S3 locking — no DynamoDB)
#   2. GitHub OIDC provider + the gha-genfeed-deploy role CI assumes (no static keys)
#
# This stack uses LOCAL state (chicken-and-egg: it creates the very bucket the
# other stacks use as their backend). Its own state is tiny and rarely changes;
# keep terraform.tfstate here out of git (see .gitignore) or migrate it into the
# bucket afterwards if you prefer.

terraform {
  required_version = ">= 1.10"
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
      Project   = "genfeed"
      ManagedBy = "terraform"
      Stack     = "bootstrap"
    }
  }
}

variable "region" {
  type    = string
  default = "us-west-1"
}

variable "github_repo" {
  type        = string
  description = "owner/name of the repo allowed to assume the deploy role"
  default     = "genfeedai/genfeed.ai"
}

variable "github_environment" {
  type        = string
  description = "GitHub Environment allowed to assume the deploy role"
  default     = "production"
}

locals {
  state_bucket_name = "genfeed-tfstate"
}

data "aws_caller_identity" "current" {}

# ── Remote state bucket (S3-native locking, no DynamoDB) ──────────────
resource "aws_s3_bucket" "state" {
  bucket = local.state_bucket_name
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# ── GitHub OIDC provider ─────────────────────────────────────────────
# AWS now trusts GitHub's OIDC thumbprints natively; thumbprint_list is no
# longer strictly required but kept for older AWS-provider compatibility.
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# ── CI deploy role ───────────────────────────────────────────────────
data "aws_iam_policy_document" "gha_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Restrict to the repo's protected GitHub Environment instead of every
    # branch/PR subject in the repository.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:environment:${var.github_environment}"]
    }
  }
}

resource "aws_iam_role" "gha_deploy" {
  name               = "gha-genfeed-deploy"
  assume_role_policy = data.aws_iam_policy_document.gha_trust.json
}

# Permissions CI needs: build/push ECR, run terraform (manage ECS/ALB/IAM/
# ElastiCache/logs/cloudmap), update/run ECS, pass task roles, read state bucket.
# Broad on purpose for plan/apply; tighten per-action once stable.
data "aws_iam_policy_document" "gha_deploy" {
  statement {
    sid    = "EcrPushPull"
    effect = "Allow"
    actions = [
      "ecr:GetAuthorizationToken",
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
    ]
    resources = ["*"]
  }
  statement {
    sid    = "EcsDeploy"
    effect = "Allow"
    actions = [
      "ecs:DescribeServices",
      "ecs:DescribeTasks",
      "ecs:DescribeTaskDefinition",
      "ecs:RegisterTaskDefinition",
      "ecs:DeregisterTaskDefinition",
      "ecs:UpdateService",
      "ecs:RunTask",
      "ecs:ListTasks",
      "ecs:TagResource",
    ]
    resources = ["*"]
  }
  statement {
    sid       = "PassTaskRoles"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/genfeed-*"]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com", "ec2.amazonaws.com"]
    }
  }
  statement {
    sid    = "TerraformManage"
    effect = "Allow"
    actions = [
      "ecs:*", "elasticloadbalancing:*", "application-autoscaling:*",
      "servicediscovery:*", "elasticache:*", "logs:*", "ecr:*",
      "ec2:Describe*", "ec2:CreateSecurityGroup", "ec2:AuthorizeSecurityGroup*",
      "ec2:RevokeSecurityGroup*", "ec2:CreateTags", "ec2:DeleteSecurityGroup",
      "ec2:*LaunchTemplate*", "autoscaling:*", "iam:GetRole", "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies", "iam:GetRolePolicy", "acm:*", "ssm:GetParameters",
      "ssm:GetParameter", "ssm:DescribeParameters", "route53:*",
    ]
    resources = ["*"]
  }
  statement {
    sid    = "ManageGenfeedIam"
    effect = "Allow"
    actions = [
      "iam:AttachRolePolicy",
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:DeleteRolePolicy",
      "iam:DetachRolePolicy",
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListAttachedRolePolicies",
      "iam:ListRolePolicies",
      "iam:PutRolePolicy",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:UpdateAssumeRolePolicy",
      "iam:UpdateRole",
    ]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/genfeed-*"]
  }
  statement {
    sid       = "StateBucket"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:DeleteObject"]
    resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
  }
}

resource "aws_iam_role_policy" "gha_deploy" {
  name   = "gha-genfeed-deploy"
  role   = aws_iam_role.gha_deploy.id
  policy = data.aws_iam_policy_document.gha_deploy.json
}

output "state_bucket" {
  value = aws_s3_bucket.state.id
}

output "gha_deploy_role_arn" {
  description = "Set this as the AWS_DEPLOY_ROLE_ARN GitHub Actions variable."
  value       = aws_iam_role.gha_deploy.arn
}
