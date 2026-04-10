export const OPEN_TASK_COMPOSER_EVENT = 'workspace:open-task-composer';

export function dispatchOpenTaskComposer() {
  window.dispatchEvent(new Event(OPEN_TASK_COMPOSER_EVENT));
}
