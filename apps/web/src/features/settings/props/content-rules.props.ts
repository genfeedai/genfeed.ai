import type {
  ICreateHarnessProfilePayload,
  IExpertPositioningScore,
  IHarnessProfile,
} from '@genfeedai/contracts/interfaces';

type HarnessDraftChange = <Key extends keyof IHarnessProfile>(
  key: Key,
  value: IHarnessProfile[Key],
) => void;

type HarnessVoiceChange = (
  key: keyof NonNullable<IHarnessProfile['voice']>,
  value: string | string[],
) => void;

type HarnessListChange = (
  section: 'examples' | 'structure' | 'thesis',
  key: string,
  value: string,
) => void;

type HarnessSplitLines = (value: string) => string[];

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

export interface HarnessPositioningScorecardProps {
  positioning: IExpertPositioningScore;
  /** Brand-scoped href to the positioning interview (`/settings/brand-kit/setup`). */
  interviewHref: string;
}

/** The profile last saved on the content rules page, for the brand it was saved under. */
export interface SavedProfileRef {
  brandId: string;
  id: string;
}
