import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';

export class LinkOrganizationDto {
  @IsEntityId()
  @ApiProperty({ description: 'Organization to attach to the billing account' })
  readonly organizationId!: string;
}
