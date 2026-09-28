export type {
  SystemEvent,
  SystemEventType,
} from '@libs/interfaces/system-event.interface';

/**
 * Where system-event recording stands (#5468): `unresolved` while the
 * `system_events_recording` flag has no real answer yet — events are held and
 * judged against the window once it resolves, so none is lost.
 */
export type SystemEventRecording =
  | { state: 'disabled' }
  | { since: Date; state: 'enabled' }
  | { state: 'unresolved' };
