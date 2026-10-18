import { IsString, Length } from 'class-validator';

export class SwitchOrganizationDto {
  @IsString()
  @Length(1, 200)
  organizationId!: string;
}
