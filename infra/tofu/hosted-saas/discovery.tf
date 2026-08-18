# Private DNS namespace for internal service-to-service resolution.
# Each service registers as <name>.genfeed.internal (Cloud Map A records ->
# container-instance IP). api reaches files at http://files.genfeed.internal:3012,
# clips/bots reach api at http://api.genfeed.internal:3010, etc.
resource "aws_service_discovery_private_dns_namespace" "internal" {
  name = "genfeed.internal"
  vpc  = local.vpc_id
}
