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
} from '@genfeedai/interfaces';
import type { ModalTrainingNewProps } from '@genfeedai/interfaces/training/modal-training-new.interface';
import type {
  BrandOverlayProps,
  IngredientOverlayProps,
  ModalArticleProps,
  ModalAvatarProps,
  ModalBlacklistProps,
  ModalBotProps,
  ModalBrandGenerateProps,
  ModalBrandInstagramProps,
  ModalBrandLinkProps,
  ModalConfirmProps,
  ModalCreateThreadProps,
  ModalCredentialProps,
  ModalCrudProps,
  ModalExportProps,
  ModalFolderProps,
  ModalGalleryProps,
  ModalGenerateIllustrationProps,
  ModalImageToVideoProps,
  ModalMemberProps,
  ModalMetadataProps,
  ModalModelProps,
  ModalMusicProps,
  ModalPostProps,
  ModalPromptProps,
  ModalSoundProps,
  ModalTagProps,
  ModalTextOverlayProps,
  ModalTrainingProps,
  ModalTrimProps,
  ModalUploadProps,
  ModalVideoProps,
  PostMetadataOverlayProps,
} from '@genfeedai/props/modals/modal.props';
import type { ModalPostRemixProps } from '@genfeedai/props/modals/modal-post-remix.props';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

// Automation modals
export const LazyModalMember = dynamic(
  () => import('@pages/members/invite/ModalMember'),
) as ComponentType<ModalMemberProps>;

export const LazyModalBot = dynamic(
  () => import('@ui/modals/automation/ModalBot'),
  { ssr: false },
) as ComponentType<ModalBotProps>;

// Account modals
export const LazyBrandOverlay = dynamic(
  () => import('@ui/modals/brands/brand/ModalBrand'),
  { ssr: false },
) as ComponentType<BrandOverlayProps>;

export const LazyModalBrandGenerate = dynamic(
  () => import('@ui/modals/brands/generate/ModalBrandGenerate'),
  { ssr: false },
) as ComponentType<ModalBrandGenerateProps>;

export const LazyModalBrandInstagram = dynamic(
  () => import('@ui/modals/brands/instagram/ModalBrandInstagram'),
  { ssr: false },
) as ComponentType<ModalBrandInstagramProps>;

export const LazyModalBrandLink = dynamic(
  () => import('@ui/modals/brands/link/ModalBrandLink'),
  { ssr: false },
) as ComponentType<ModalBrandLinkProps>;

// Ingredient modals
export const LazyModalAvatar = dynamic(
  () => import('@ui/modals/ingredients/avatar/ModalAvatar'),
  { ssr: false },
) as ComponentType<ModalAvatarProps>;

export const LazyIngredientOverlay = dynamic(
  () => import('@ui/modals/ingredients/ingredient/ModalIngredient'),
  { ssr: false },
) as ComponentType<IngredientOverlayProps>;

export const LazyModalImageToVideo = dynamic(
  () => import('@ui/modals/ingredients/image-to-video/ModalImageToVideo'),
  { ssr: false },
) as ComponentType<ModalImageToVideoProps>;

export const LazyModalMusic = dynamic(
  () => import('@ui/modals/ingredients/music/ModalMusic'),
  { ssr: false },
) as ComponentType<ModalMusicProps>;

export const LazyModalVideo = dynamic(
  () => import('@ui/modals/ingredients/video/ModalVideo'),
  { ssr: false },
) as ComponentType<ModalVideoProps>;

// Element modals
export const LazyModalBlacklist = dynamic(
  () => import('@ui/modals/elements/blacklist/ModalBlacklist'),
  { ssr: false },
) as ComponentType<ModalBlacklistProps>;

export const LazyModalCamera = dynamic(
  () => import('@ui/modals/elements/camera/ModalCamera'),
  { ssr: false },
) as ComponentType<ModalCrudProps<IElementCamera>>;

export const LazyModalCameraMovement = dynamic(
  () => import('@ui/modals/elements/camera-movement/ModalCameraMovement'),
  { ssr: false },
) as ComponentType<ModalCrudProps<IElementCameraMovement>>;

export const LazyModalFontFamily = dynamic(
  () => import('@ui/modals/elements/font/ModalFontFamily'),
  { ssr: false },
) as ComponentType<ModalCrudProps<IFontFamily>>;

export const LazyModalLens = dynamic(
  () => import('@ui/modals/elements/lens/ModalLens'),
  { ssr: false },
) as ComponentType<ModalCrudProps<IElementLens>>;

export const LazyModalLighting = dynamic(
  () => import('@ui/modals/elements/lighting/ModalLighting'),
  { ssr: false },
) as ComponentType<ModalCrudProps<IElementLighting>>;

export const LazyModalMood = dynamic(
  () => import('@ui/modals/elements/mood/ModalMood'),
  { ssr: false },
) as ComponentType<ModalCrudProps<IElementMood>>;

export const LazyModalPreset = dynamic(
  () => import('@ui/modals/elements/preset/ModalPreset'),
  { ssr: false },
) as ComponentType<ModalCrudProps<IPreset>>;

export const LazyModalScene = dynamic(
  () => import('@ui/modals/elements/scene/ModalScene'),
  { ssr: false },
) as ComponentType<ModalCrudProps<IElementScene>>;

export const LazyModalSound = dynamic(
  () => import('@ui/modals/elements/sound/ModalSound'),
  { ssr: false },
) as ComponentType<ModalSoundProps>;

export const LazyModalStyle = dynamic(
  () => import('@ui/modals/elements/style/ModalStyle'),
  { ssr: false },
) as ComponentType<ModalCrudProps<IElementStyle>>;

export const LazyModalTag = dynamic(
  () => import('@ui/modals/elements/tag/ModalTag'),
  { ssr: false },
) as ComponentType<ModalTagProps>;

export const LazyModalWorkflow = dynamic(
  () => import('@ui/modals/elements/workflow/ModalWorkflow'),
  { ssr: false },
) as ComponentType<ModalCrudProps<IWorkflow>>;

export const LazyModalConfirm = dynamic(
  () => import('@ui/modals/system/confirm/ModalConfirm'),
  { ssr: false },
) as ComponentType<ModalConfirmProps>;

export const LazyModalCredential = dynamic(
  () => import('@ui/modals/system/credential/ModalCredential'),
  { ssr: false },
) as ComponentType<ModalCredentialProps>;

export const LazyModalExport = dynamic(
  () => import('@ui/modals/system/export/ModalExport'),
  { ssr: false },
) as ComponentType<ModalExportProps>;

export const LazyModalArticle = dynamic(
  () => import('@ui/modals/content/article/ModalArticle'),
  { ssr: false },
) as ComponentType<ModalArticleProps>;

export const LazyModalGenerateIllustration = dynamic(
  () =>
    import(
      '@ui/modals/content/generate-illustration/ModalGenerateIllustration'
    ),
  { ssr: false },
) as ComponentType<ModalGenerateIllustrationProps>;

export const LazyModalTwitterThread = dynamic(
  () => import('@ui/modals/content/thread/ModalTwitterThread'),
  { ssr: false },
);

export const LazyModalFolder = dynamic(
  () => import('@ui/modals/content/folder/ModalFolder'),
  { ssr: false },
) as ComponentType<ModalFolderProps>;

export const LazyModalGallery = dynamic(
  () => import('@ui/modals/gallery/ModalGallery'),
  { ssr: false },
) as ComponentType<ModalGalleryProps>;

export const LazyModalMetadata = dynamic(
  () => import('@ui/modals/content/metadata/ModalMetadata'),
  { ssr: false },
) as ComponentType<ModalMetadataProps>;

export const LazyModalPrompt = dynamic(
  () => import('@ui/modals/content/prompt/ModalPrompt'),
  { ssr: false },
) as ComponentType<ModalPromptProps>;

export const LazyModalPost = dynamic(
  () => import('@ui/modals/content/post/ModalPost'),
  { ssr: false },
) as ComponentType<ModalPostProps>;

export const LazyModalPostRemix = dynamic(
  () => import('@ui/modals/content/remix/ModalPostRemix'),
  { ssr: false },
) as ComponentType<ModalPostRemixProps>;

export const LazyModalPostBatch = dynamic(
  () => import('@ui/modals/content/batch/ModalPostBatch'),
  { ssr: false },
) as ComponentType<ModalPostProps>;

export const LazyPostMetadataOverlay = dynamic(
  () => import('@ui/modals/content/post/ModalPostMetadata'),
  { ssr: false },
) as ComponentType<PostMetadataOverlayProps>;

export const LazyModalCreateThread = dynamic(
  () => import('@ui/modals/content/create-thread/ModalCreateThread'),
  { ssr: false },
) as ComponentType<ModalCreateThreadProps>;

export const LazyModalTextOverlay = dynamic(
  () => import('@ui/modals/content/overlay/ModalTextOverlay'),
  { ssr: false },
) as ComponentType<ModalTextOverlayProps>;

export const LazyModalTrim = dynamic(
  () => import('@ui/modals/ingredients/trim/ModalTrim'),
  { ssr: false },
) as ComponentType<ModalTrimProps>;

export const LazyModalModel = dynamic(
  () => import('@ui/modals/models/ModalModel'),
  { ssr: false },
) as ComponentType<ModalModelProps>;

export const LazyModalTraining = dynamic(
  () => import('@ui/modals/trainings/ModalTraining'),
  { ssr: false },
) as ComponentType<ModalTrainingProps>;

export const LazyModalTrainingNew = dynamic(
  () => import('@ui/modals/trainings/ModalTrainingNew'),
  { ssr: false },
) as ComponentType<ModalTrainingNewProps>;

export const LazyModalUpload = dynamic(
  () => import('@ui/modals/ingredients/upload/ModalUpload'),
  { ssr: false },
) as ComponentType<ModalUploadProps>;

export const LazyModalWatchlist = dynamic(
  () => import('@ui/modals/system/watchlist/ModalWatchlist'),
  { ssr: false },
);

export const LazyModalErrorDebug = dynamic(
  () => import('@ui/modals/system/error-debug/ModalErrorDebug'),
  { ssr: false },
);
