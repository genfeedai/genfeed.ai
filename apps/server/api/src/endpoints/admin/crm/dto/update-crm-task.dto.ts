import { CreateCrmTaskDto } from '@api/endpoints/admin/crm/dto/create-crm-task.dto';
import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateCrmTaskDto extends PartialType(CreateCrmTaskDto) {
  @IsString()
  @IsOptional()
  readonly status?: string;
}
