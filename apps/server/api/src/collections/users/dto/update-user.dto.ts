import { CreateUserDto } from '@api/collections/users/dto/create-user.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the user is marked as deleted',
    required: false,
  })
  readonly isDeleted!: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    default: false,
    description: 'Whether onboarding has been completed by the user',
    required: false,
  })
  readonly isOnboardingCompleted?: boolean;

  @IsOptional()
  @IsDateString()
  @ApiProperty({
    description: 'Timestamp for when onboarding started',
    required: false,
  })
  readonly onboardingStartedAt?: string | Date;

  @IsOptional()
  @IsDateString()
  @ApiProperty({
    description: 'Timestamp for when onboarding completed',
    required: false,
  })
  readonly onboardingCompletedAt?: string | Date;

  @IsOptional()
  @IsIn(['creator', 'organization'])
  @ApiProperty({
    description: 'Onboarding flow type',
    enum: ['creator', 'organization'],
    required: false,
  })
  readonly onboardingType?: 'creator' | 'organization';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    description: 'Completed onboarding step keys',
    required: false,
    type: [String],
  })
  readonly onboardingStepsCompleted?: string[];

  // The user's active organization id (DB-authoritative routing, epic #735
  // Phase C). Deliberately UNDECORATED so the ValidationPipe's whitelist strips
  // it from client `PATCH /me` input — it must not be settable from arbitrary
  // user JSON (no membership check there). It is written only by the
  // membership-validated org switch/select/create/onboarding endpoints via
  // `usersService.patch`; the resolvers re-validate it against live membership.
  // Kept on the DTO type so those internal calls remain type-safe.
  readonly lastUsedOrganizationId?: string | null;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description:
      'Active brand selection id for the current user. Send null to clear the brand selection and return to organization scope.',
    nullable: true,
    required: false,
  })
  readonly selectedBrandId?: string | null;
}
