import { ElementDto } from '@api/shared/dto/element/element.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

/**
 * Create payload for element types that can be platform defaults (no
 * organization): style, mood, scene, camera, lens, lighting, camera movement
 * and sound. Blacklists stay organization-only and extend `ElementDto`.
 */
export class PlatformElementDto extends ElementDto {
  @ApiProperty({
    description:
      'Superadmin only. Create a platform default visible to every organization (default for superadmins) or, when false, an element owned by the caller organization.',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isPlatformDefault?: boolean;

  @ApiProperty({
    default: true,
    description: 'Whether the element is offered in pickers',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    default: 0,
    description: 'Curated display order, lowest first',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
