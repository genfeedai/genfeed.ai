import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class CloneWorkflowDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description:
      'Target brand ID for the duplicated workflow. Defaults to the current selected brand.',
    required: false,
  })
  readonly brandId?: string;
}
