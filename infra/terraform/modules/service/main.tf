terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/ecs/${var.name_prefix}/${var.name}"
  retention_in_days = var.log_retention_days
}

# Internal DNS: <name>.genfeed.internal -> task IP (awsvpc A record).
resource "aws_service_discovery_service" "this" {
  name = var.name
  dns_config {
    namespace_id = var.namespace_id
    dns_records {
      type = "A"
      ttl  = 10
    }
    routing_policy = "MULTIVALUE"
  }
  health_check_custom_config {
    failure_threshold = 1
  }
}

resource "aws_ecs_task_definition" "this" {
  family                   = "${var.name_prefix}-${var.name}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([{
    name        = var.name
    image       = var.image
    command     = var.command
    essential   = true
    environment = var.environment
    secrets     = var.secrets
    portMappings = [{
      containerPort = var.port
      hostPort      = var.port
      protocol      = "tcp"
    }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.this.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = var.name
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:${var.port}${var.health_path} || exit 1"]
      interval    = 30
      timeout     = 10
      retries     = 5
      startPeriod = var.health_grace > 0 ? var.health_grace : 40
    }
  }])
}

resource "aws_ecs_service" "this" {
  name            = var.name
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.desired_count

  capacity_provider_strategy {
    capacity_provider = var.capacity_provider
    weight            = 1
    base              = 0
  }

  deployment_minimum_healthy_percent = var.min_healthy
  deployment_maximum_percent         = var.max_percent

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = var.subnets # private subnets (NAT egress)
    security_groups  = var.security_group_ids
    assign_public_ip = false # Fargate in private subnets; egress via NAT
  }

  service_registries {
    registry_arn = aws_service_discovery_service.this.arn
  }

  # No placement strategy: Fargate doesn't support them and auto-spreads tasks
  # across the AZs of the configured subnets.

  dynamic "load_balancer" {
    for_each = var.register_alb ? [1] : []
    content {
      target_group_arn = var.target_group_arn
      container_name   = var.name
      container_port   = var.port
    }
  }

  health_check_grace_period_seconds = var.register_alb ? var.health_grace : null
}
