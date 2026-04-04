import { CreateProfileDto } from '@api/collections/profiles/dto/create-profile.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateProfileDto extends PartialType(CreateProfileDto) {}
