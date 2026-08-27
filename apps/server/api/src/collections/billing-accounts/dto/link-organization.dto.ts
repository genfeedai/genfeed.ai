import { ApiProperty } from '@nestjs/swagger';
import { IsEntityId } from '@server/helpers/validation/entity-id.validator';

export class LinkOrganizationDto {
  @IsEntityId()
  @ApiProperty({ description: 'Organization to attach to the billing account' })
  readonly organizationId!: string;
}
