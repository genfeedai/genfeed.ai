import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export const INVITATION_STATUS_VALUES = [
  'accepted',
  'expired',
  'pending',
  'revoked',
] as const;

export type InvitationStatusFilter = (typeof INVITATION_STATUS_VALUES)[number];

export class InvitationsQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(INVITATION_STATUS_VALUES)
  @ApiProperty({
    description: 'Filter invitations by status',
    enum: INVITATION_STATUS_VALUES,
    required: false,
  })
  status?: InvitationStatusFilter;
}
