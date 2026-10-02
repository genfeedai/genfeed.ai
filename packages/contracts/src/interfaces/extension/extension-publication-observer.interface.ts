import type {
  ExtensionPublicationCaptureInput,
  ExtensionPublicationCaptureResult,
} from '@genfeedai/contracts/interfaces/content/extension-publication.interface';
export interface PublicationCaptureScope {
  userId: string;
  organizationId: string;
  brandId: string;
  revision: number;
}
export interface PublicationCaptureAttempt {
  id: string;
  scope: PublicationCaptureScope;
  startedAt: number;
  documentUrl: string;
  authorHandle: string;
  description: string;
  baselineIds: string[];
}
export interface PublicationCaptureObservation {
  attemptId: string;
  externalId: string;
  url: string;
  authorHandle: string;
  description: string;
  publicationDate: string;
}
export interface PublicationCapturePending {
  tabId: number;
  origin: string;
  attempt: PublicationCaptureAttempt;
}
export interface PublicationCaptureSenderBinding {
  tabId: number;
  origin: string;
}
export interface PublicationCaptureConfirmed {
  binding: PublicationCaptureSenderBinding;
  attempt: PublicationCaptureAttempt;
  observation: PublicationCaptureObservation;
  observedAt: number;
}
export interface PublicationStatusAction {
  label: 'Retry recording';
  onClick: () => void;
  disabled?: boolean;
}
export interface PublicationCaptureOutboxEntry {
  sourceBinding: PublicationCaptureSenderBinding;
  id: string;
  scope: PublicationCaptureScope;
  input: ExtensionPublicationCaptureInput;
  createdAt: number;
  status: 'queued' | 'recording' | 'failed';
  error?: string;
}
export interface PublicationCaptureView {
  id: string;
  status: 'queued' | 'recording' | 'failed';
  description: string;
  publicationDate: string;
  error?: string;
}
export type PublicationCaptureResponseData =
  | {
      kind: 'context';
      enabled: boolean;
      scope: PublicationCaptureScope | null;
      pending: PublicationCaptureAttempt | null;
      confirmed: PublicationCaptureConfirmed | null;
    }
  | { kind: 'armed'; attemptId: string }
  | {
      kind: 'recorded';
      attemptId: string;
      result: ExtensionPublicationCaptureResult;
    }
  | { kind: 'queued'; attemptId: string }
  | { kind: 'list'; entries: PublicationCaptureView[]; enabled: boolean }
  | { kind: 'cancelled'; attemptId: string }
  | { kind: 'dismissed'; id: string };
export type PublicationCaptureReply =
  | { success: true; data: PublicationCaptureResponseData }
  | { success: false; error: string };
export type PublicationCaptureRequest =
  | { event: 'publicationCaptureContext' }
  | { event: 'publicationCaptureBegin'; attempt: PublicationCaptureAttempt }
  | {
      event: 'publicationCaptureComplete';
      observation: PublicationCaptureObservation;
    }
  | { event: 'publicationCaptureCancel'; attemptId: string }
  | { event: 'publicationCaptureList' }
  | { event: 'publicationCaptureRetry'; id: string }
  | { event: 'publicationCaptureDismiss'; id: string };
export interface XPublicationCandidate {
  externalId: string;
  url: string;
  authorHandle: string;
  description: string;
  publicationDate: string;
}
export interface XPublicationComposer {
  root: Element;
  editor: HTMLElement;
  submit: HTMLElement;
}
