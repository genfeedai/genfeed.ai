import { PartialType } from '@nestjs/mapped-types';
import { CreateMoodBoardDto } from './create-mood-board.dto';

export class UpdateMoodBoardDto extends PartialType(CreateMoodBoardDto) {}
