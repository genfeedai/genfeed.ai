import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { Platform, PostRepurposeMode } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export class RepurposePostDto {
  @IsEnum(Platform)
  @ApiProperty({
    description: 'Target channel the repurposed draft is created for',
    enum: Platform,
    enumName: 'Platform',
    required: true,
  })
  readonly platform!: Platform;

  @IsEnum(PostRepurposeMode)
  @ApiProperty({
    description:
      'deterministic adapts the caption through the channel capability catalog instantly; agent rewrites it with the content engine and routes the result through the review queue',
    enum: PostRepurposeMode,
    enumName: 'PostRepurposeMode',
    required: true,
  })
  readonly mode!: PostRepurposeMode;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description:
      'Optional connected credential for the target channel; resolved at scheduling time when omitted',
    required: false,
  })
  readonly credentialId?: string;
}
