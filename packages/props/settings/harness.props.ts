import type {
  ICreateHarnessProfilePayload,
  IHarnessProfile,
} from '@genfeedai/contracts/interfaces';

export type HarnessDraftChange = <Key extends keyof IHarnessProfile>(
  key: Key,
  value: IHarnessProfile[Key],
) => void;

export type HarnessVoiceChange = (
  key: keyof NonNullable<IHarnessProfile['voice']>,
  value: string | string[],
) => void;

export type HarnessListChange = (
  section: 'examples' | 'structure' | 'thesis',
  key: string,
  value: string,
) => void;

export type HarnessSplitLines = (value: string) => string[];

export interface HarnessIdentityTabProps {
  draft: ICreateHarnessProfilePayload;
  onDraftChange: HarnessDraftChange;
  splitLines: HarnessSplitLines;
}

export interface HarnessStructureTabProps {
  draft: ICreateHarnessProfilePayload;
  onListChange: HarnessListChange;
}

export interface HarnessDeliveryTabProps {
  voice: IHarnessProfile['voice'] | undefined;
  onVoiceChange: HarnessVoiceChange;
  splitLines: HarnessSplitLines;
}

export interface HarnessThesisTabProps {
  draft: ICreateHarnessProfilePayload;
  onListChange: HarnessListChange;
}

export interface HarnessExamplesTabProps {
  draft: ICreateHarnessProfilePayload;
  onListChange: HarnessListChange;
  onDraftChange: HarnessDraftChange;
  splitLines: HarnessSplitLines;
}
