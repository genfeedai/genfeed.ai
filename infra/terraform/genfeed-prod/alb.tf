# ── ACM cert for api.genfeed.ai (DNS-validated via Route53) ──────────
resource "aws_acm_certificate" "api" {
  domain_name       = local.fqdn
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}

resource "aws_route53_record" "api_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }
  zone_id = local.zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for r in aws_route53_record.api_cert_validation : r.fqdn]
}

resource "aws_acm_certificate" "public_backend" {
  domain_name               = local.public_service_hostnames["mcp"]
  subject_alternative_names = [local.public_service_hostnames["notifications"]]
  validation_method         = "DNS"
  lifecycle { create_before_destroy = true }
}

resource "aws_route53_record" "public_backend_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.public_backend.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }
  zone_id = local.zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "public_backend" {
  certificate_arn         = aws_acm_certificate.public_backend.arn
  validation_record_fqdns = [for r in aws_route53_record.public_backend_cert_validation : r.fqdn]
}

# ── ALB ──────────────────────────────────────────────────────────────
resource "aws_lb" "main" {
  name                       = "${local.name_prefix}-alb"
  load_balancer_type         = "application"
  internal                   = false
  drop_invalid_header_fields = true
  security_groups            = [aws_security_group.alb.id]
  subnets                    = local.public_subnet_ids
}

# api target group.
resource "aws_lb_target_group" "api" {
  name_prefix          = "gpapi" # <=6 chars; create_before_destroy needs unique names on replace
  port                 = local.services.api.port
  protocol             = "HTTP"
  vpc_id               = local.vpc_id
  target_type          = "ip" # awsvpc tasks register their ENI IP, not the instance
  deregistration_delay = 30

  health_check {
    path                = "/v1/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
    matcher             = "200"
  }
  lifecycle { create_before_destroy = true }
}

resource "aws_lb_target_group" "public_backend" {
  for_each = {
    for name in local.public_backend_service_names : name => local.services[name]
  }

  name_prefix          = local.public_target_group_prefixes[each.key]
  port                 = each.value.port
  protocol             = "HTTP"
  vpc_id               = local.vpc_id
  target_type          = "ip"
  deregistration_delay = 30

  health_check {
    path                = "/v1/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
    matcher             = "200"
  }
  lifecycle { create_before_destroy = true }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.api.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_lb_listener_certificate" "public_backend" {
  listener_arn    = aws_lb_listener.https.arn
  certificate_arn = aws_acm_certificate_validation.public_backend.certificate_arn
}

resource "aws_lb_listener_rule" "public_backend" {
  for_each = {
    for name in local.public_backend_service_names : name => local.services[name]
  }

  listener_arn = aws_lb_listener.https.arn
  priority     = local.public_listener_priorities[each.key]

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.public_backend[each.key].arn
  }

  condition {
    host_header {
      values = [local.public_service_hostnames[each.key]]
    }
  }
}

resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ── Public service DNS -> ALB (gated: the actual traffic cutover) ─────
# Only created when enable_dns_cutover=true, so the first apply builds the ALB
# without stealing live traffic from the old box before services are healthy.
resource "aws_route53_record" "api" {
  count = var.enable_dns_cutover ? 1 : 0
  # Overwrite the pre-existing manual A record (old EC2 box) on cutover instead
  # of failing with "record already exists".
  allow_overwrite = true
  zone_id         = local.zone_id
  name            = local.fqdn
  type            = "A"
  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "public_backend" {
  for_each = var.enable_dns_cutover ? {
    for name in local.public_backend_service_names : name => local.public_service_hostnames[name]
  } : {}

  # Overwrite the pre-existing manual A records (old EC2 box) on cutover.
  allow_overwrite = true
  zone_id         = local.zone_id
  name            = each.value
  type            = "A"
  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}
