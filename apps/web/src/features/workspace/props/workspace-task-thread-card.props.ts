import type { TaskEvent } from '@services/management/tasks.service';

export interface WorkspaceTaskThreadCardProps {
  eventStream: TaskEvent[];
}
