import type {
  IChannelTarget,
  ICredential,
} from '@genfeedai/contracts/interfaces';
import type { Article } from '@genfeedai/models/content/article.model';
import type { Newsletter } from '@genfeedai/models/content/newsletter.model';

export type LongFormDeliveryHistoryProps = {
  credentials: ICredential[];
  targets: IChannelTarget[];
};

export type ExternalUrlFieldProps = {
  id: string;
  isSaving: boolean;
  onSave: (externalUrl: string | null) => Promise<void> | void;
  value?: string | null;
};

export type ArticleDeliveryCardProps = {
  article: Article;
  /** Saved article HTML; delivery always publishes the saved revision. */
  content: string;
  isDirty: boolean;
  isSavingExternalUrl: boolean;
  onDelivered: () => void;
  onSaveExternalUrl: (externalUrl: string | null) => Promise<void>;
};

export type NewsletterDeliveryCardProps = {
  isDirty: boolean;
  isSavingExternalUrl: boolean;
  newsletter: Newsletter;
  onDelivered: () => Promise<void> | void;
  onSaveExternalUrl: (externalUrl: string | null) => Promise<void>;
};
