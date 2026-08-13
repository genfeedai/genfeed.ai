import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSocialWarmupEnrollmentDto {
  @ApiProperty({ description: 'Credential to enroll in guided social warm-up' })
  @IsEntityId()
  credentialId!: string;
}
