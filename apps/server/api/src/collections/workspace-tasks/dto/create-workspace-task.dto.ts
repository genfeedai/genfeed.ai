import { CreateTaskDto } from '@api/collections/tasks/dto/create-task.dto';

export class CreateWorkspaceTaskDto extends CreateTaskDto {
  brand?: string;
  organization?: string;
  user?: string;
}
