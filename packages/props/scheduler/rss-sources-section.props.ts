import type {
  CreateRssSourceInput,
  ICredential,
  IRssSource,
  UpdateRssSourceInput,
} from '@genfeedai/contracts/interfaces';

export interface PublishingRssSourcesSectionProps {
  brandId: string;
  credentials: ICredential[];
  timezone: string;
}

export interface RssSourceListItemProps {
  onDelete: (source: IRssSource) => void;
  onPollNow: (source: IRssSource) => void;
  onToggleEnabled: (source: IRssSource, isEnabled: boolean) => void;
  source: IRssSource;
}

export interface UseRssSourcesOptions {
  autoLoad?: boolean;
  brandId?: string;
}

export interface UseRssSourcesResult {
  create: (input: CreateRssSourceInput) => Promise<IRssSource>;
  error: Error | null;
  isLoading: boolean;
  pollNow: (id: string) => Promise<IRssSource>;
  refresh: () => void;
  remove: (id: string) => Promise<void>;
  sources: IRssSource[];
  update: (id: string, input: UpdateRssSourceInput) => Promise<IRssSource>;
}
