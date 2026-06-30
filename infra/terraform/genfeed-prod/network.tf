# Private subnets (2 AZ) for ECS tasks + ElastiCache.
# Fargate task ENIs get no public IP, so each AZ egresses through a same-AZ NAT
# gateway. ALB stays in the existing public subnets.
resource "aws_subnet" "private" {
  for_each          = var.private_subnet_cidrs
  vpc_id            = var.vpc_id
  availability_zone = each.key
  cidr_block        = each.value
  tags              = { Name = "${local.name_prefix}-private-${each.key}" }
}

moved {
  from = aws_eip.nat
  to   = aws_eip.nat["us-west-1b"]
}

resource "aws_eip" "nat" {
  for_each = var.private_subnet_cidrs
  domain   = "vpc"
  tags     = { Name = "${local.name_prefix}-nat-${each.key}" }
}

moved {
  from = aws_nat_gateway.main
  to   = aws_nat_gateway.main["us-west-1b"]
}

resource "aws_nat_gateway" "main" {
  for_each      = var.private_subnet_cidrs
  allocation_id = aws_eip.nat[each.key].id
  subnet_id     = var.nat_public_subnet_ids_by_az[each.key]
  tags          = { Name = "${local.name_prefix}-nat-${each.key}" }
}

moved {
  from = aws_route_table.private
  to   = aws_route_table.private["us-west-1b"]
}

resource "aws_route_table" "private" {
  for_each = var.private_subnet_cidrs
  vpc_id   = var.vpc_id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[each.key].id
  }
  tags = { Name = "${local.name_prefix}-private-${each.key}" }
}

resource "aws_route_table_association" "private" {
  for_each       = aws_subnet.private
  subnet_id      = each.value.id
  route_table_id = aws_route_table.private[each.key].id
}
