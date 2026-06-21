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
  description = "Set SSM /genfeed/production/REDIS_URL to redis://<this>:6379 after apply."
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
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

output "boot_smoke_task_definition_arn" {
  value = aws_ecs_task_definition.boot_smoke.arn
}

# Network config for `aws ecs run-task` (migrate) in CI — private subnets (NAT egress).
output "task_subnets" {
  value = local.private_subnet_ids
}

output "task_security_group" {
  value = aws_security_group.ecs.id
}
