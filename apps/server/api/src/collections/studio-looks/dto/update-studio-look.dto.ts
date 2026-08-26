import { CreateStudioLookDto } from '@api/collections/studio-looks/dto/create-studio-look.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateStudioLookDto extends PartialType(CreateStudioLookDto) {}
