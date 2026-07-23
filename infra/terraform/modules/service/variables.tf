variable "name" { type = string }
variable "name_prefix" { type = string }
variable "cluster_id" { type = string }
variable "capacity_provider" { type = string }
variable "image" { type = string }
variable "command" { type = list(string) }
variable "cpu" { type = number }
variable "memory" { type = number }
variable "port" { type = number }
variable "region" { type = string }
variable "execution_role_arn" { type = string }
variable "task_role_arn" { type = string }
variable "subnets" { type = list(string) }
variable "security_group_ids" { type = list(string) }
variable "namespace_id" { type = string }

variable "secrets" {
  type    = list(object({ name = string, valueFrom = string }))
  default = []
}
variable "environment" {
  type    = list(object({ name = string, value = string }))
  default = []
}

variable "desired_count" {
  type    = number
  default = 1
}
variable "register_alb" {
  type    = bool
  default = false
}
variable "target_group_arn" {
  type    = string
  default = ""
}
variable "health_grace" {
  type    = number
  default = 0
}
variable "health_path" {
  type    = string
  default = "/v1/health"
}
variable "min_healthy" {
  type    = number
  default = 100
}
variable "max_percent" {
  type    = number
  default = 200
}
variable "log_retention_days" {
  type    = number
  default = 7
}
