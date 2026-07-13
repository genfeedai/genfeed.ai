import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/**
 * First-asset unlock gate — per-user "explore anyway" escape hatch.
 * Setting `hasDismissedAssetGate` true permanently clears the locked/teaser nav
 * state for this user even before their org has generated its first asset.
 */
export class UpdateAssetGateDto {
  @IsBoolean()
  @ApiProperty({
    default: true,
    description:
      'Whether the user has dismissed the first-asset unlock gate ("explore anyway").',
  })
  readonly hasDismissedAssetGate!: boolean;
}
