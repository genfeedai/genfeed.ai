output "cluster_name" { value = local.hosted.cluster_name }
output "task_subnets" { value = local.hosted.task_subnets }
output "task_security_group" { value = aws_security_group.marketplace.id }
output "bootstrap_task_definition_arn" { value = try(aws_ecs_task_definition.operation["bootstrap"].arn, "") }
output "migrate_task_definition_arn" { value = aws_ecs_task_definition.operation["migrate"].arn }
output "service_name" { value = try(module.api[0].service_name, "") }
output "api_url" { value = "https://${local.fqdn}" }
output "target_group_arn" { value = aws_lb_target_group.api.arn }
