import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';

export class ScheduleHistoryImportDto {
  @IsEntityId()
  @ApiProperty({
    description: 'The connected account whose existing posts to import',
    required: true,
  })
  readonly credentialId!: string;
}
