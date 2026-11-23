import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class DeletePostDto {
  @IsOptional()
  @IsEntityId()
  @ApiProperty({
    description:
      'Brand the post belongs to. When given, a post of another brand is not found.',
    required: false,
  })
  readonly brandId?: string;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    default: false,
    description:
      'Also delete the Library media attached to the post that no other post uses.',
    required: false,
  })
  readonly includeMedia?: boolean;
}
