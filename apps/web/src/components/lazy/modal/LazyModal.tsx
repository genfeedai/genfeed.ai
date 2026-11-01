'use client';

import type {
  IElementCamera,
  IElementCameraMovement,
  IElementLens,
  IElementLighting,
  IElementMood,
  IElementScene,
  IElementStyle,
  IFontFamily,
  IPreset,
  IWorkflow,
} from '@genfeedai/contracts/interfaces';
import type { ModalTrainingNewProps } from '@genfeedai/contracts/interfaces/training/modal-training-new.interface';
import type {
  ModalArticleProps,
  ModalAvatarProps,
  ModalBlacklistProps,
  ModalBotProps,
  ModalBrandCreateProps,
  ModalBrandGenerateProps,
  ModalBrandLinkProps,
  ModalConfirmProps,
  ModalCrudProps,
  ModalExportProps,
  ModalFolderProps,
  ModalGalleryProps,
  ModalGenerateIllustrationProps,
  ModalImageToVideoProps,
  ModalMemberProps,
  ModalMetadataProps,
  ModalModelProps,
  ModalNewsletterProps,
  ModalPostBatchProps,
  ModalPostProps,
  ModalPromptProps,
  ModalSoundProps,
  ModalTagProps,
  ModalTextOverlayProps,
  ModalTrainingProps,
  ModalTrimProps,
  ModalUploadProps,
} from '@genfeedai/props/modals/modal.props';
import type { ModalPostRepurposeProps } from '@genfeedai/props/modals/modal-post-repurpose.props';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import type { ModalPostRemixProps } from '@/props/modals/modal-post-remix.props';

// Automation modals
export const LazyModalMember = dynamic(
  () => import('@/components/modals/members/invite/ModalMember'),
) as ComponentType<ModalMemberProps>;

export const LazyModalBot = dynamic(
  () => import('@/components/modals/automation/ModalBot'),
  { ssr: false },
) as ComponentType<ModalBotProps>;

// Account modals
export const LazyModalBrandCreate = dynamic(
  () => import('@/components/modals/brands/brand/ModalBrandCreate'),
  { ssr: false },
) as ComponentType<ModalBrandCreateProps>;

export const LazyModalBrandGenerate = dynamic(
  () => import('@/components/modals/brands/generate/ModalBrandGenerate'),
  { ssr: false },
) as ComponentType<ModalBrandGenerateProps>;

export const LazyModalBrandLink = dynamic(
  () => import('@/components/modals/brands/link/ModalBrandLink'),
  { ssr: false },
) as ComponentType<ModalBrandLinkProps>;

// Ingredient modals
export const LazyModalAvatar = dynamic(
  () => import('@/components/modals/ingredients/avatar/ModalAvatar'),
  { ssr: false },
) as ComponentType<ModalAvatarProps>;

export const LazyModalImageToVideo = dynamic(
  () =>
    import('@/components/modals/ingredients/image-to-video/ModalImageToVideo'),
  { ssr: false },
) as ComponentType<ModalImageToVideoProps>;

// Element modals
export const LazyModalBlacklist = dynamic(
  () => import('@/components/modals/elements/blacklist/ModalBlacklist'),
  { ssr: false },
) as ComponentType<ModalBlacklistProps>;

export const LazyModalCamera = dynamic(
  () => import('@/components/modals/elements/camera/ModalCamera'),
  { ssr: false },
) as ComponentType<ModalCrudProps<IElementCamera>>;

export const LazyModalCameraMovement = dynamic(
  () =>
    import('@/components/modals/elements/camera-movement/ModalCameraMovement'),
  { ssr: false },
) as ComponentType<ModalCrudProps<IElementCameraMovement>>;

export const LazyModalFontFamily = dynamic(
  () => import('@/components/modals/elements/font/ModalFontFamily'),
  { ssr: false },
) as ComponentType<ModalCrudProps<IFontFamily>>;

export const LazyModalLens = dynamic(
  () => import('@/components/modals/elements/lens/ModalLens'),
  { ssr: false },
) as ComponentType<ModalCrudProps<IElementLens>>;

export const LazyModalLighting = dynamic(
  () => import('@/components/modals/elements/lighting/ModalLighting'),
  { ssr: false },
) as ComponentType<ModalCrudProps<IElementLighting>>;

export const LazyModalMood = dynamic(
  () => import('@/components/modals/elements/mood/ModalMood'),
  { ssr: false },
) as ComponentType<ModalCrudProps<IElementMood>>;

export const LazyModalPreset = dynamic(
  () => import('@/components/modals/elements/preset/ModalPreset'),
  { ssr: false },
) as ComponentType<ModalCrudProps<IPreset>>;

export const LazyModalScene = dynamic(
  () => import('@/components/modals/elements/scene/ModalScene'),
  { ssr: false },
) as ComponentType<ModalCrudProps<IElementScene>>;

export const LazyModalSound = dynamic(
  () => import('@/components/modals/elements/sound/ModalSound'),
  { ssr: false },
) as ComponentType<ModalSoundProps>;

export const LazyModalStyle = dynamic(
  () => import('@/components/modals/elements/style/ModalStyle'),
  { ssr: false },
) as ComponentType<ModalCrudProps<IElementStyle>>;

export const LazyModalTag = dynamic(
  () => import('@/components/modals/elements/tag/ModalTag'),
  { ssr: false },
) as ComponentType<ModalTagProps>;

export const LazyModalWorkflow = dynamic(
  () => import('@/components/modals/elements/workflow/ModalWorkflow'),
  { ssr: false },
) as ComponentType<ModalCrudProps<IWorkflow>>;

export const LazyModalConfirm = dynamic(
  () => import('@/components/modals/system/confirm/ModalConfirm'),
  { ssr: false },
) as ComponentType<ModalConfirmProps>;

export const LazyModalExport = dynamic(
  () => import('@/components/modals/system/export/ModalExport'),
  { ssr: false },
) as ComponentType<ModalExportProps>;

export const LazyModalArticle = dynamic(
  () => import('@/components/modals/content/article/ModalArticle'),
  { ssr: false },
) as ComponentType<ModalArticleProps>;

export const LazyModalGenerateIllustration = dynamic(
  () =>
    import(
      '@/components/modals/content/generate-illustration/ModalGenerateIllustration'
    ),
  { ssr: false },
) as ComponentType<ModalGenerateIllustrationProps>;

export const LazyModalTwitterThread = dynamic(
  () => import('@/components/modals/content/thread/ModalTwitterThread'),
  { ssr: false },
);

export const LazyModalFolder = dynamic(
  () => import('@/components/modals/content/folder/ModalFolder'),
  { ssr: false },
) as ComponentType<ModalFolderProps>;

export const LazyModalGallery = dynamic(
  () => import('@/components/modals/gallery/ModalGallery'),
  { ssr: false },
) as ComponentType<ModalGalleryProps>;

export const LazyModalMetadata = dynamic(
  () => import('@/components/modals/content/metadata/ModalMetadata'),
  { ssr: false },
) as ComponentType<ModalMetadataProps>;

export const LazyModalPrompt = dynamic(
  () => import('@/components/modals/content/prompt/ModalPrompt'),
  { ssr: false },
) as ComponentType<ModalPromptProps>;

export const LazyModalPost = dynamic(
  () => import('@/components/modals/content/post/ModalPost'),
  { ssr: false },
) as ComponentType<ModalPostProps>;

export const LazyModalPostRepurpose = dynamic(
  () => import('@/components/modals/content/repurpose/ModalPostRepurpose'),
  { ssr: false },
) as ComponentType<ModalPostRepurposeProps>;

export const LazyModalPostRemix = dynamic(
  () => import('@/components/modals/content/remix/ModalPostRemix'),
  { ssr: false },
) as ComponentType<ModalPostRemixProps>;

export const LazyModalPostBatch = dynamic(
  () => import('@/components/modals/content/batch/ModalPostBatch'),
  { ssr: false },
) as ComponentType<ModalPostBatchProps>;

export const LazyModalTextOverlay = dynamic(
  () => import('@/components/modals/content/overlay/ModalTextOverlay'),
  { ssr: false },
) as ComponentType<ModalTextOverlayProps>;

export const LazyModalTrim = dynamic(
  () => import('@/components/modals/ingredients/trim/ModalTrim'),
  { ssr: false },
) as ComponentType<ModalTrimProps>;

export const LazyModalModel = dynamic(
  () => import('@/components/modals/models/ModalModel'),
  { ssr: false },
) as ComponentType<ModalModelProps>;

export const LazyModalTraining = dynamic(
  () => import('@/components/modals/trainings/ModalTraining'),
  { ssr: false },
) as ComponentType<ModalTrainingProps>;

export const LazyModalTrainingNew = dynamic(
  () => import('@/components/modals/trainings/ModalTrainingNew'),
  { ssr: false },
) as ComponentType<ModalTrainingNewProps>;

export const LazyModalUpload = dynamic(
  () => import('@/components/modals/ingredients/upload/ModalUpload'),
  { ssr: false },
) as ComponentType<ModalUploadProps>;

export const LazyModalWatchlist = dynamic(
  () => import('@/components/modals/system/watchlist/ModalWatchlist'),
  { ssr: false },
);

export const LazyModalErrorDebug = dynamic(
  () => import('@ui/modals/system/error-debug/ModalErrorDebug'),
  { ssr: false },
);

export const LazyModalNewsletter = dynamic(
  () => import('@/components/modals/content/newsletter/ModalNewsletter'),
  { ssr: false },
) as ComponentType<ModalNewsletterProps>;
