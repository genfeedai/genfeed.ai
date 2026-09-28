import { BillingAccountMemberRole } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class GrantBillingRoleDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'User receiving the billing role' })
  readonly userId!: string;

  @IsEnum(BillingAccountMemberRole)
  @ApiProperty({ enum: BillingAccountMemberRole })
  readonly role!: BillingAccountMemberRole;
}
