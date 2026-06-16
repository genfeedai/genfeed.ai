resource "aws_ecs_cluster" "main" {
  name = local.name_prefix
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# awsvpc network mode gives each task its own ENI/IP, so Cloud Map A records
# resolve to the task (matching the app's fixed http://files:3012 calls). ENI
# trunking raises the per-instance ENI cap so ~5 awsvpc tasks fit on a
# t3a.medium (base limit is ~3). Account-wide, must precede instance launch.
resource "aws_ecs_account_setting_default" "awsvpc_trunking" {
  name  = "awsvpcTrunking"
  value = "enabled"
}

# ── EC2 capacity (ASG of ECS-optimized instances) ────────────────────
resource "aws_launch_template" "ecs" {
  name_prefix   = "${local.name_prefix}-"
  image_id      = data.aws_ssm_parameter.ecs_ami.value
  instance_type = var.instance_type

  iam_instance_profile {
    arn = aws_iam_instance_profile.ecs_instance.arn
  }
  vpc_security_group_ids = [aws_security_group.ecs.id]

  # Register the instance with this cluster.
  user_data = base64encode(<<-EOF
    #!/bin/bash
    echo "ECS_CLUSTER=${aws_ecs_cluster.main.name}" >> /etc/ecs/ecs.config
    echo "ECS_ENABLE_SPOT_INSTANCE_DRAINING=true" >> /etc/ecs/ecs.config
  EOF
  )

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${local.name_prefix}-ecs" }
  }
  lifecycle { create_before_destroy = true }
}

resource "aws_autoscaling_group" "ecs" {
  name_prefix         = "${local.name_prefix}-"
  vpc_zone_identifier = local.public_subnet_ids
  min_size            = var.asg_min
  max_size            = var.asg_max
  desired_capacity    = var.asg_desired

  launch_template {
    id      = aws_launch_template.ecs.id
    version = "$Latest"
  }

  # Required for ECS managed scaling to manage this ASG.
  tag {
    key                 = "AmazonECSManaged"
    value               = "true"
    propagate_at_launch = true
  }
  lifecycle { create_before_destroy = true }
}

resource "aws_ecs_capacity_provider" "ec2" {
  name = "${local.name_prefix}-ec2"
  auto_scaling_group_provider {
    auto_scaling_group_arn         = aws_autoscaling_group.ecs.arn
    managed_termination_protection = "DISABLED"
    managed_scaling {
      status          = "ENABLED"
      target_capacity = 100
    }
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = [aws_ecs_capacity_provider.ec2.name, "FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.ec2.name
    weight            = 1
    base              = 1
  }
}
