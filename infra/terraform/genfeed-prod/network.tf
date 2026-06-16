# Private subnets (2 AZ) for ECS instances + awsvpc task ENIs + ElastiCache.
# awsvpc-on-EC2 task ENIs get no public IP, so they egress (ECR pull, ElevenLabs/
# Clerk/Stripe/etc.) via a NAT gateway. ALB stays in the existing public subnets.
resource "aws_subnet" "private" {
  for_each          = var.private_subnet_cidrs
  vpc_id            = var.vpc_id
  availability_zone = each.key
  cidr_block        = each.value
  tags              = { Name = "${local.name_prefix}-private-${each.key}" }
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${local.name_prefix}-nat" }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = var.nat_public_subnet_id
  tags          = { Name = "${local.name_prefix}-nat" }
}

resource "aws_route_table" "private" {
  vpc_id = var.vpc_id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }
  tags = { Name = "${local.name_prefix}-private" }
}

resource "aws_route_table_association" "private" {
  for_each       = aws_subnet.private
  subnet_id      = each.value.id
  route_table_id = aws_route_table.private.id
}
