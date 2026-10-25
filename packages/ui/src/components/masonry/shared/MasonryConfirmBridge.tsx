'use client';
import type {
  UpscaleConfirmData,
  VideoUpscaleSelection,
} from '@genfeedai/hooks/ui/ingredient/use-enhance-upscale/use-enhance-upscale';
import type {
  VideoExtendConfirmData,
  VideoExtendSelection,
} from '@genfeedai/hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import type { ModalConfirmProps } from '@genfeedai/props/modals/modal.props';
import VideoExtendConfirmControls, {
  getDefaultVideoExtendSelection,
} from '@ui/modals/ingredients/VideoExtendConfirmControls';
import VideoUpscaleConfirmControls, {
  getDefaultVideoUpscaleSelection,
} from '@ui/modals/ingredients/VideoUpscaleConfirmControls';
import ModalConfirm from '@ui/modals/system/confirm/ModalConfirm';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface MasonryConfirmBridgeProps {
  upscaleConfirmData: UpscaleConfirmData | null;
  executeUpscale: (selection?: VideoUpscaleSelection) => Promise<void>;
  clearUpscaleConfirm: () => void;
  extendConfirmData?: VideoExtendConfirmData | null;
  executeExtend?: (selection: VideoExtendSelection) => Promise<void>;
  clearExtendConfirm?: () => void;
}

/**
 * Opens the video upscale and extend dialogs, where the model, resolution and
 * duration are chosen. Image upscale and enhance start without a dialog.
 * Used by both MasonryImage and MasonryVideo
 */
export default function MasonryConfirmBridge({
  upscaleConfirmData,
  executeUpscale,
  clearUpscaleConfirm,
  extendConfirmData,
  executeExtend,
  clearExtendConfirm,
}: MasonryConfirmBridgeProps) {
  const [confirmConfig, setConfirmConfig] = useState<ModalConfirmProps | null>(
    null,
  );
  const [openKey, setOpenKey] = useState(0);

  // Track confirm data to prevent duplicate opens
  const lastUpscaleDataRef = useRef<{
    ingredientId: string | null;
    cost: number;
  } | null>(null);

  // Store callbacks in refs to avoid dependency issues
  const executeUpscaleRef = useRef(executeUpscale);
  const clearUpscaleConfirmRef = useRef(clearUpscaleConfirm);
  const videoUpscaleSelectionRef = useRef<VideoUpscaleSelection | undefined>(
    undefined,
  );
  const videoExtendSelectionRef = useRef<VideoExtendSelection | undefined>(
    undefined,
  );
  const executeExtendRef = useRef(executeExtend);
  const clearExtendConfirmRef = useRef(clearExtendConfirm);

  useEffect(() => {
    executeUpscaleRef.current = executeUpscale;
  }, [executeUpscale]);

  useEffect(() => {
    clearUpscaleConfirmRef.current = clearUpscaleConfirm;
  }, [clearUpscaleConfirm]);

  useEffect(() => {
    executeExtendRef.current = executeExtend;
  }, [executeExtend]);

  useEffect(() => {
    clearExtendConfirmRef.current = clearExtendConfirm;
  }, [clearExtendConfirm]);

  const closeConfirm = useCallback(() => {
    if (!confirmConfig) {
      return;
    }

    confirmConfig.onClose?.();
    setConfirmConfig(null);
  }, [confirmConfig]);

  const openConfirm = useCallback((config: ModalConfirmProps) => {
    setConfirmConfig(config);
    setOpenKey((current) => current + 1);
  }, []);

  // Upscale confirmation
  useEffect(() => {
    if (!upscaleConfirmData) {
      lastUpscaleDataRef.current = null;
      return;
    }

    const ingredientId = upscaleConfirmData.ingredient?.id || null;
    const cost = upscaleConfirmData.cost;

    // Only open if this is new/different confirm data
    if (
      lastUpscaleDataRef.current?.ingredientId === ingredientId &&
      lastUpscaleDataRef.current?.cost === cost
    ) {
      return;
    }

    lastUpscaleDataRef.current = { cost, ingredientId };

    const modelOptions = upscaleConfirmData.videoModelOptions ?? [];
    videoUpscaleSelectionRef.current =
      getDefaultVideoUpscaleSelection(modelOptions);

    openConfirm({
      cancelLabel: 'Cancel',
      confirmLabel: 'Upscale',
      label: 'Confirm Upscale',
      message:
        'Choose the model, output resolution, and frame rate. The source video remains unchanged.',
      children:
        modelOptions.length > 0 ? (
          <VideoUpscaleConfirmControls
            modelOptions={modelOptions}
            onChange={(selection) => {
              videoUpscaleSelectionRef.current = selection;
            }}
          />
        ) : undefined,
      onClose: () => {
        lastUpscaleDataRef.current = null;
        clearUpscaleConfirmRef.current();
      },
      onConfirm: async () => {
        await executeUpscaleRef.current(videoUpscaleSelectionRef.current);
      },
    });
  }, [upscaleConfirmData, openConfirm]);

  useEffect(() => {
    if (!extendConfirmData || !executeExtend || !clearExtendConfirm) {
      return;
    }
    const modelOptions = extendConfirmData.modelOptions;
    videoExtendSelectionRef.current =
      getDefaultVideoExtendSelection(modelOptions);
    openConfirm({
      cancelLabel: 'Cancel',
      children: (
        <VideoExtendConfirmControls
          modelOptions={modelOptions}
          onChange={(selection) => {
            videoExtendSelectionRef.current = selection;
          }}
        />
      ),
      confirmLabel: 'Extend',
      label: 'Extend Video',
      message:
        'The original stays unchanged. A generated continuation will be stitched into a new child video.',
      onClose: () => clearExtendConfirmRef.current?.(),
      onConfirm: async () => {
        if (videoExtendSelectionRef.current) {
          await executeExtendRef.current?.(videoExtendSelectionRef.current);
        }
      },
    });
  }, [clearExtendConfirm, executeExtend, extendConfirmData, openConfirm]);

  return confirmConfig ? (
    <ModalConfirm
      {...confirmConfig}
      isOpen
      openKey={openKey}
      onClose={closeConfirm}
      onConfirm={async () => {
        await confirmConfig.onConfirm();
        closeConfirm();
      }}
    />
  ) : null;
}
