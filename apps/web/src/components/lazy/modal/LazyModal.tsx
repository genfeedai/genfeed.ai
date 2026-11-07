'use client';

import type { ModalTrainingNewProps } from '@genfeedai/contracts/interfaces/training/modal-training-new.interface';
import type {
  ModalArticleProps,
  ModalAvatarProps,
  ModalBlacklistProps,
  ModalBrandCreateProps,
  ModalBrandGenerateProps,
  ModalBrandLinkProps,
  ModalConfirmProps,
  ModalCreateProps,
  ModalExportProps,
  ModalFolderProps,
  ModalGalleryProps,
  ModalGenerateIllustrationProps,
  ModalImageToVideoProps,
  ModalMemberProps,
  ModalModelProps,
  ModalNewsletterProps,
  ModalPostBatchProps,
  ModalPostProps,
  ModalPromptProps,
  ModalSoundProps,
  ModalTagProps,
  ModalTextOverlayProps,
  ModalTrimProps,
  ModalUploadProps,
} from '@genfeedai/props/modals/modal.props';
import type { ModalPostRepurposeProps } from '@genfeedai/props/modals/modal-post-repurpose.props';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import type { ElementCreateModalProps } from '@/features/admin/props/element-create-modal.props';
import type { ModalPostRemixProps } from '@/props/modals/modal-post-remix.props';

// Automation modals
export const LazyModalMember = dynamic(
  () => import('@/components/modals/members/invite/ModalMember'),
) as ComponentType<ModalMemberProps>;

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
export const LazyElementCreateModal = dynamic<ElementCreateModalProps>(
  () => import('@/components/modals/elements/shared/ElementCreateModal'),
  { ssr: false },
);

export const LazyModalBlacklist = dynamic(
  () => import('@/components/modals/elements/blacklist/ModalBlacklist'),
  { ssr: false },
) as ComponentType<ModalBlacklistProps>;

export const LazyModalPreset = dynamic(
  () => import('@/components/modals/elements/preset/ModalPreset'),
  { ssr: false },
) as ComponentType<ModalCreateProps>;

export const LazyModalSound = dynamic(
  () => import('@/components/modals/elements/sound/ModalSound'),
  { ssr: false },
) as ComponentType<ModalSoundProps>;

export const LazyModalStyle = dynamic(
  () => import('@/components/modals/elements/style/ModalStyle'),
  { ssr: false },
) as ComponentType<ModalCreateProps>;

export const LazyModalTag = dynamic(
  () => import('@/components/modals/elements/tag/ModalTag'),
  { ssr: false },
) as ComponentType<ModalTagProps>;

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

export const LazyModalFolder = dynamic(
  () => import('@/components/modals/content/folder/ModalFolder'),
  { ssr: false },
) as ComponentType<ModalFolderProps>;

export const LazyModalGallery = dynamic(
  () => import('@/components/modals/gallery/ModalGallery'),
  { ssr: false },
) as ComponentType<ModalGalleryProps>;

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

export const LazyModalTrainingNew = dynamic(
  () => import('@/components/modals/trainings/ModalTrainingNew'),
  { ssr: false },
) as ComponentType<ModalTrainingNewProps>;

export const LazyModalUpload = dynamic(
  () => import('@/components/modals/ingredients/upload/ModalUpload'),
  { ssr: false },
) as ComponentType<ModalUploadProps>;

export const LazyModalErrorDebug = dynamic(
  () => import('@ui/modals/system/error-debug/ModalErrorDebug'),
  { ssr: false },
);

export const LazyModalNewsletter = dynamic(
  () => import('@/components/modals/content/newsletter/ModalNewsletter'),
  { ssr: false },
) as ComponentType<ModalNewsletterProps>;
