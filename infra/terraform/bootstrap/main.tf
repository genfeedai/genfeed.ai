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
  account_id               = data.aws_caller_identity.current.account_id
  aws_partition            = data.aws_partition.current.partition
  genfeed_prod_name_prefix = "genfeed-production"
  genfeed_prod_ssm_path    = "/genfeed/production"
  state_bucket_name        = "genfeed-tfstate"

  genfeed_ecr_repository_arn = "arn:${local.aws_partition}:ecr:${var.region}:${local.account_id}:repository/genfeed/server"
  genfeed_ecs_arns = [
    "arn:${local.aws_partition}:ecs:${var.region}:${local.account_id}:cluster/${local.genfeed_prod_name_prefix}",
    "arn:${local.aws_partition}:ecs:${var.region}:${local.account_id}:service/${local.genfeed_prod_name_prefix}/*",
    "arn:${local.aws_partition}:ecs:${var.region}:${local.account_id}:task/${local.genfeed_prod_name_prefix}/*",
    "arn:${local.aws_partition}:ecs:${var.region}:${local.account_id}:task-definition/${local.genfeed_prod_name_prefix}-*:*",
  ]
  genfeed_elb_arns = [
    "arn:${local.aws_partition}:elasticloadbalancing:${var.region}:${local.account_id}:loadbalancer/app/${local.genfeed_prod_name_prefix}-*/*",
    "arn:${local.aws_partition}:elasticloadbalancing:${var.region}:${local.account_id}:listener/app/${local.genfeed_prod_name_prefix}-*/*/*",
    "arn:${local.aws_partition}:elasticloadbalancing:${var.region}:${local.account_id}:listener-rule/app/${local.genfeed_prod_name_prefix}-*/*/*/*",
    "arn:${local.aws_partition}:elasticloadbalancing:${var.region}:${local.account_id}:targetgroup/gpapi*/*",
    "arn:${local.aws_partition}:elasticloadbalancing:${var.region}:${local.account_id}:targetgroup/gpmcp*/*",
    "arn:${local.aws_partition}:elasticloadbalancing:${var.region}:${local.account_id}:targetgroup/gpntf*/*",
  ]
  genfeed_log_arns = [
    "arn:${local.aws_partition}:logs:${var.region}:${local.account_id}:log-group:/ecs/${local.genfeed_prod_name_prefix}/*",
    "arn:${local.aws_partition}:logs:${var.region}:${local.account_id}:log-group:/ecs/${local.genfeed_prod_name_prefix}/*:log-stream:*",
  ]
  genfeed_elasticache_arns = [
    "arn:${local.aws_partition}:elasticache:${var.region}:${local.account_id}:cluster:${local.genfeed_prod_name_prefix}-redis-*",
    "arn:${local.aws_partition}:elasticache:${var.region}:${local.account_id}:replicationgroup:${local.genfeed_prod_name_prefix}-redis",
    "arn:${local.aws_partition}:elasticache:${var.region}:${local.account_id}:subnetgroup:${local.genfeed_prod_name_prefix}-redis",
  ]
  genfeed_service_discovery_arns = [
    "arn:${local.aws_partition}:servicediscovery:${var.region}:${local.account_id}:namespace/*",
    "arn:${local.aws_partition}:servicediscovery:${var.region}:${local.account_id}:operation/*",
    "arn:${local.aws_partition}:servicediscovery:${var.region}:${local.account_id}:service/*",
  ]
  genfeed_acm_arns = [
    "arn:${local.aws_partition}:acm:${var.region}:${local.account_id}:certificate/*",
  ]
  genfeed_ec2_arns = [
    "arn:${local.aws_partition}:ec2:${var.region}:${local.account_id}:vpc/*",
    "arn:${local.aws_partition}:ec2:${var.region}:${local.account_id}:security-group/*",
    "arn:${local.aws_partition}:ec2:${var.region}:${local.account_id}:subnet/*",
    "arn:${local.aws_partition}:ec2:${var.region}:${local.account_id}:route-table/*",
    "arn:${local.aws_partition}:ec2:${var.region}:${local.account_id}:natgateway/*",
    "arn:${local.aws_partition}:ec2:${var.region}:${local.account_id}:elastic-ip/*",
  ]
  genfeed_route53_arns = [
    "arn:${local.aws_partition}:route53:::hostedzone/*",
    "arn:${local.aws_partition}:route53:::change/*",
  ]
  genfeed_ssm_arns = [
    "arn:${local.aws_partition}:ssm:${var.region}:${local.account_id}:parameter${local.genfeed_prod_ssm_path}",
    "arn:${local.aws_partition}:ssm:${var.region}:${local.account_id}:parameter${local.genfeed_prod_ssm_path}/*",
  ]
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

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

# Permissions CI needs: build/push ECR, run OpenTofu over the genfeed production
# stack, update/run ECS tasks, pass task roles, and read/write the state bucket.
data "aws_iam_policy_document" "gha_deploy" {
  statement {
    # ECR GetAuthorizationToken is account-scoped by AWS and does not support a
    # repository ARN. Repository operations are scoped in EcrRepositoryPushPull.
    sid       = "EcrAuthToken"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid    = "EcrRepositoryPushPull"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
    ]
    resources = [local.genfeed_ecr_repository_arn]
  }
  statement {
    sid    = "EcsDeploy"
    effect = "Allow"
    actions = [
      "ecs:DescribeServices",
      "ecs:DescribeTasks",
      "ecs:UpdateService",
      "ecs:RunTask",
      "ecs:TagResource",
    ]
    resources = local.genfeed_ecs_arns
  }
  statement {
    # RegisterTaskDefinition and ListTasks are control-plane operations whose
    # resource support is account/cluster-level; keep them separate from service
    # mutation permissions so the wildcard is auditable.
    sid    = "EcsTaskDefinitionLifecycle"
    effect = "Allow"
    actions = [
      "ecs:DeregisterTaskDefinition",
      "ecs:DescribeTaskDefinition",
      "ecs:ListTasks",
      "ecs:RegisterTaskDefinition",
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
      "ecs:*",
      "elasticloadbalancing:*",
      "servicediscovery:*",
      "elasticache:*",
      "logs:*",
      "ecr:*",
      "ec2:CreateSecurityGroup",
      "ec2:AuthorizeSecurityGroup*",
      "ec2:RevokeSecurityGroup*",
      "ec2:CreateTags",
      "ec2:DeleteSecurityGroup",
      "acm:*",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
      "ssm:GetParameter",
      # Write + tag actions for Terraform-managed SSM SecureStrings (e.g. the
      # ElastiCache REDIS_PASSWORD auth token created in genfeed-prod). Scoped to
      # genfeed_ssm_arns via the resources block below — never account-wide.
      "ssm:PutParameter",
      "ssm:DeleteParameter",
      "ssm:AddTagsToResource",
      "ssm:RemoveTagsFromResource",
      "ssm:ListTagsForResource",
      "route53:*",
    ]
    resources = concat(
      local.genfeed_ecs_arns,
      local.genfeed_elb_arns,
      local.genfeed_service_discovery_arns,
      local.genfeed_elasticache_arns,
      local.genfeed_log_arns,
      [local.genfeed_ecr_repository_arn],
      local.genfeed_ec2_arns,
      local.genfeed_acm_arns,
      local.genfeed_ssm_arns,
      local.genfeed_route53_arns,
    )
  }
  statement {
    # These are read/list/control-plane APIs used by OpenTofu data sources or AWS
    # service models that do not support useful resource-level scoping.
    sid    = "TerraformGlobalReadAndControlPlane"
    effect = "Allow"
    actions = [
      "acm:ListCertificates",
      "ec2:Describe*",
      "ecr:GetAuthorizationToken",
      "ecs:List*",
      "elasticache:Describe*",
      "elasticloadbalancing:Describe*",
      "rds:DescribeDBInstances",
      "rds:DescribeDBSnapshots",
      "route53:GetChange",
      "route53:ListHostedZonesByName",
      "ssm:DescribeParameters",
    ]
    resources = ["*"]
  }
  statement {
    # Least-privilege for the deploy-ecs.yml pre-migration snapshot (mirrors the
    # Vitae GCP "gcloud sql backups create" step): create/tag only the genfeed-data
    # snapshots, never account-wide.
    sid    = "RdsPreMigrationSnapshot"
    effect = "Allow"
    actions = [
      "rds:CreateDBSnapshot",
      "rds:AddTagsToResource",
    ]
    resources = [
      "arn:${local.aws_partition}:rds:*:${local.account_id}:db:genfeed-data",
      "arn:${local.aws_partition}:rds:*:${local.account_id}:snapshot:pre-migrate-*",
    ]
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
    resources = ["arn:${local.aws_partition}:iam::${local.account_id}:role/genfeed-*"]
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
