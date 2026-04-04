import { CreateAvatarDto } from '@api/collections/avatars/dto/create-avatar.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateAvatarDto extends PartialType(CreateAvatarDto) {}
