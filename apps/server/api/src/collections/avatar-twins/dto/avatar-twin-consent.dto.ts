import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AvatarTwinConsentDto {
  /** Where the provider sends the person after recording; must be our app. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  returnPath?: string;
}
