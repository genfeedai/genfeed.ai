import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Body of `POST /organizations`. Ownership, selection, slug and the default
 * brand are derived server-side from the authenticated user, so the client
 * only names the workspace.
 */
export class CreateOrganizationRequestDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The display name of the organization',
    required: true,
  })
  readonly label!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Description seeded into the default brand',
    required: false,
  })
  readonly description?: string;
}
