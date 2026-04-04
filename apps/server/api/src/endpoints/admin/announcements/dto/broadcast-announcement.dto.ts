import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export type AnnouncementChannel = 'discord' | 'twitter';

export class BroadcastAnnouncementDto {
  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  tweetText?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(['discord', 'twitter'], { each: true })
  channels!: AnnouncementChannel[];

  @IsOptional()
  @IsString()
  discordChannelId?: string;
}
