'use client';

import { IngredientCategory, MediaType } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { formatNumberWithCommas } from '@helpers/formatting/format/format.helper';
import type { ModalConfirmProps } from '@props/modals/modal.props';
import ModalConfirm from '@ui/modals/system/confirm/ModalConfirm';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface ConfirmData {
  ingredient: IIngredient | null;
  cost: number;
}

export interface MasonryConfirmBridgeProps {
  upscaleConfirmData: ConfirmData | null;
  executeUpscale: () => Promise<void>;
  clearUpscaleConfirm: () => void;
  enhanceConfirmData?: ConfirmData | null;
  executeEnhance?: () => Promise<void>;
  clearEnhanceConfirm?: () => void;
}

/**
 * Shared component for handling upscale/enhance confirmation dialogs
 * Used by both MasonryImage and MasonryVideo
 */
export default function MasonryConfirmBridge({
  upscaleConfirmData,
  executeUpscale,
  clearUpscaleConfirm,
  enhanceConfirmData,
  executeEnhance,
  clearEnhanceConfirm,
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

  const lastEnhanceDataRef = useRef<{
    ingredientId: string | null;
    cost: number;
  } | null>(null);

  // Store callbacks in refs to avoid dependency issues
  const executeUpscaleRef = useRef(executeUpscale);
  const clearUpscaleConfirmRef = useRef(clearUpscaleConfirm);
  const executeEnhanceRef = useRef(executeEnhance);
  const clearEnhanceConfirmRef = useRef(clearEnhanceConfirm);

  useEffect(() => {
    executeUpscaleRef.current = executeUpscale;
  }, [executeUpscale]);

  useEffect(() => {
    clearUpscaleConfirmRef.current = clearUpscaleConfirm;
  }, [clearUpscaleConfirm]);

  useEffect(() => {
    executeEnhanceRef.current = executeEnhance;
  }, [executeEnhance]);

  useEffect(() => {
    clearEnhanceConfirmRef.current = clearEnhanceConfirm;
  }, [clearEnhanceConfirm]);

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

    const category =
      upscaleConfirmData.ingredient?.category === IngredientCategory.VIDEO
        ? MediaType.VIDEO
        : MediaType.IMAGE;
    const message = `Upscale ${category} with Topaz AI?\n\nThis will cost ${formatNumberWithCommas(cost)} credits.`;

    openConfirm({
      cancelLabel: 'Cancel',
      confirmLabel: 'Upscale',
      label: 'Confirm Upscale',
      message,
      onClose: () => {
        lastUpscaleDataRef.current = null;
        clearUpscaleConfirmRef.current();
      },
      onConfirm: async () => {
        await executeUpscaleRef.current();
      },
    });
  }, [upscaleConfirmData, openConfirm]);

  // Enhance confirmation (optional)
  useEffect(() => {
    if (!enhanceConfirmData || !executeEnhance || !clearEnhanceConfirm) {
      lastEnhanceDataRef.current = null;
      return;
    }

    const ingredientId = enhanceConfirmData.ingredient?.id || null;
    const cost = enhanceConfirmData.cost;

    // Only open if this is new/different confirm data
    if (
      lastEnhanceDataRef.current?.ingredientId === ingredientId &&
      lastEnhanceDataRef.current?.cost === cost
    ) {
      return;
    }

    lastEnhanceDataRef.current = { cost, ingredientId };

    const category =
      enhanceConfirmData.ingredient?.category === IngredientCategory.VIDEO
        ? MediaType.VIDEO
        : MediaType.IMAGE;
    const message = `Enhance ${category} with Topaz AI upscaling?\n\nThis will cost ${formatNumberWithCommas(cost)} credits.`;

    openConfirm({
      cancelLabel: 'Cancel',
      confirmLabel: 'Enhance',
      label: 'Confirm Enhance',
      message,
      onClose: () => {
        lastEnhanceDataRef.current = null;
        clearEnhanceConfirmRef.current?.();
      },
      onConfirm: async () => {
        await executeEnhanceRef.current?.();
      },
    });
  }, [enhanceConfirmData, openConfirm, executeEnhance, clearEnhanceConfirm]);

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
