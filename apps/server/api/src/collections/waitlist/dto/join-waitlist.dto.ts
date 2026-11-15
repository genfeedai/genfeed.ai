import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class JoinWaitlistDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  /** A site or social handle the operator can look at to qualify the lead. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  website?: string;

  /** What the lead makes. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  useCase?: string;
}
