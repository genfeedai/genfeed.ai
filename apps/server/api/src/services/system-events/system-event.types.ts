export type {
  SystemEvent,
  SystemEventType,
} from '@libs/interfaces/system-event.interface';

/**
 * Where system-event recording stands (#5468): `unresolved` until this
 * process has read the platform settings — events are held and judged
 * against the window once it resolves, so none is lost.
 */
export type SystemEventRecording =
  | { state: 'disabled' }
  | { since: Date; state: 'enabled' }
  | { state: 'unresolved' };
