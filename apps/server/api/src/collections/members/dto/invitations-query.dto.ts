import { PageQueryDto } from '@api/helpers/dto/page-query.dto';
import {
  INVITATION_STATUSES,
  type InvitationStatus,
} from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class InvitationsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(INVITATION_STATUSES)
  @ApiProperty({
    description: 'Filter invitations by status',
    enum: INVITATION_STATUSES,
    required: false,
  })
  status?: InvitationStatus;
}
