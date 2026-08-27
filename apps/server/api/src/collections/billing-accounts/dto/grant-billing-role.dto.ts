import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { BillingAccountMemberRole } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class GrantBillingRoleDto {
  @IsEntityId()
  @ApiProperty({ description: 'User receiving the billing role' })
  readonly userId!: string;

  @IsEnum(BillingAccountMemberRole)
  @ApiProperty({ enum: BillingAccountMemberRole })
  readonly role!: BillingAccountMemberRole;
}
