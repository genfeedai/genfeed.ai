import { CreateLeadDto } from '@api/endpoints/admin/crm/dto/create-lead.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateLeadDto extends PartialType(CreateLeadDto) {
  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Assigned to (user ID)', required: false })
  readonly assignedTo?: string;
}
