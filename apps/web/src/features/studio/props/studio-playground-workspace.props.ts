import type {
  IModel,
  KnowledgeSelection,
} from '@genfeedai/contracts/interfaces';
import type {
  StudioPlaygroundReferenceRole,
  StudioPlaygroundSettings,
  StudioPlaygroundType,
} from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import type {
  AttachmentItem,
  UseAttachmentsReturn,
} from '@genfeedai/props/ui/attachments.props';
import type { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { IngredientsService } from '@services/content/ingredients.service';
import type { NotificationsService } from '@services/core/notifications.service';
import type { JSONContent } from '@tiptap/core';
import type { useTranslations } from 'next-intl';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { UseStudioPlaygroundSettingsReturn } from '@/features/studio/playground/hooks/useStudioPlaygroundSettings';
import type { StudioContentReference } from '@/features/studio/playground/utils/studio-content-references';

/** `next-intl` translator scoped to the Studio Playground messages. */
export type StudioTranslate = ReturnType<
  typeof useTranslations<'pages.studioPlayground'>
>;

/** Lazily authenticated ingredients client shared by the playground hooks. */
export type StudioIngredientsServiceGetter = ReturnType<
  typeof useAuthedService<IngredientsService>
>;

/**
 * The slice of `StudioPlaygroundWorkspace` state that its extracted hooks
 * share. Each hook picks only the keys it reads, so a hook's parameter type
 * is the list of workspace values it depends on.
 */
export interface StudioWorkspaceScope {
  applyTypeSettings: UseStudioPlaygroundSettingsReturn['applyTypeSettings'];
  attachments: AttachmentItem[];
  brandId: string;
  clearAttachments: () => void;
  clearCrunRestore: () => void;
  contentReferences: StudioContentReference[];
  crunRestoreEpochRef: MutableRefObject<number>;
  crunRestoreScopeRef: MutableRefObject<string>;
  getAttachmentRole: (
    attachment: AttachmentItem,
  ) => StudioPlaygroundReferenceRole | undefined;
  getCompletedAttachments: UseAttachmentsReturn['getCompletedAttachments'];
  getIngredientsService: StudioIngredientsServiceGetter;
  isLoadingModels: boolean;
  isMountedRef: MutableRefObject<boolean>;
  knowledgeSelection: KnowledgeSelection;
  models: readonly IModel[];
  notificationsService: NotificationsService;
  organizationId: string;
  pendingRestoredUploadIds: string[] | null;
  prompt: string;
  promptDocumentRef: MutableRefObject<JSONContent | null>;
  removeAttachment: (id: string) => void;
  restoredAttachments: AttachmentItem[];
  restoredRolesRef: MutableRefObject<
    Map<string, StudioPlaygroundReferenceRole>
  >;
  setContentReferences: Dispatch<SetStateAction<StudioContentReference[]>>;
  setPendingRestoredUploadIds: Dispatch<SetStateAction<string[] | null>>;
  setPrompt: Dispatch<SetStateAction<string>>;
  setRestoredAttachments: Dispatch<SetStateAction<AttachmentItem[]>>;
  setType: (type: StudioPlaygroundType) => void;
  settings: StudioPlaygroundSettings;
  translate: StudioTranslate;
  type: StudioPlaygroundType;
  updateSettings: (patch: Partial<StudioPlaygroundSettings>) => void;
}
