output "cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.server.repository_url
}

output "alb_dns_name" {
  description = "Smoke-test here before flipping public service DNS."
  value       = aws_lb.main.dns_name
}

output "api_url" {
  value = "https://${local.fqdn}"
}

output "public_backend_urls" {
  description = "Public HTTPS URLs routed through the production ALB."
  value = {
    for name, hostname in local.public_service_hostnames : name => "https://${hostname}"
  }
}

output "redis_primary_endpoint" {
  description = "Production Redis endpoint. ECS tasks connect with REDIS_URL=rediss://<this>:6379 and REDIS_PASSWORD from SSM."
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "redis_replication_group_id" {
  description = "ElastiCache replication group id for AUTH enablement checks during deploy."
  value       = aws_elasticache_replication_group.redis.id
}

output "service_names" {
  value = [for k, m in module.service : m.service_name]
}

output "migrate_task_family" {
  value = aws_ecs_task_definition.migrate.family
}

output "migrate_task_definition_arn" {
  value = aws_ecs_task_definition.migrate.arn
}

output "credential_backfill_task_definition_arn" {
  value = aws_ecs_task_definition.credential_backfill.arn
}

output "articles_seed_task_definition_arn" {
  value = aws_ecs_task_definition.articles_seed.arn
}

output "harness_profile_seed_task_definition_arn" {
  value = try(aws_ecs_task_definition.harness_profile_seed[0].arn, null)
}

output "boot_smoke_task_definition_arn" {
  value = aws_ecs_task_definition.boot_smoke.arn
}

output "worker_boot_smoke_task_definition_arn" {
  value = aws_ecs_task_definition.worker_boot_smoke.arn
}

# Network config for `aws ecs run-task` (migrate) in CI — private subnets (NAT egress).
output "task_subnets" {
  value = local.private_subnet_ids
}

output "task_security_group" {
  value = aws_security_group.ecs.id
}

# Network outputs consumed by the separate Marketplace state. No credentials.
output "vpc_id" { value = local.vpc_id }
output "cluster_arn" { value = aws_ecs_cluster.main.arn }
output "alb_security_group_id" { value = aws_security_group.alb.id }
output "rds_security_group_ids" { value = data.aws_db_instance.genfeed.vpc_security_groups }
output "https_listener_arn" { value = aws_lb_listener.https.arn }
output "route53_zone_id" { value = local.zone_id }
output "alb_zone_id" { value = aws_lb.main.zone_id }
output "service_discovery_namespace_id" { value = aws_service_discovery_private_dns_namespace.internal.id }
