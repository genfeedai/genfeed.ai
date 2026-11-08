import { IsBoolean } from 'class-validator';

export class UpdateReferralCodeDto {
  @IsBoolean()
  isActive!: boolean;
}
