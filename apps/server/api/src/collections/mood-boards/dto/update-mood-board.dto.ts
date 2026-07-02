import { CreateMoodBoardDto } from '@api/collections/mood-boards/dto/create-mood-board.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateMoodBoardDto extends PartialType(CreateMoodBoardDto) {}
