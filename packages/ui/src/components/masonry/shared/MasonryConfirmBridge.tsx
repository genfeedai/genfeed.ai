'use client';
import { formatNumberWithCommas } from '@genfeedai/helpers/formatting/format/format.helper';
import type {
  UpscaleConfirmData,
  VideoUpscaleSelection,
} from '@genfeedai/hooks/ui/ingredient/use-enhance-upscale/use-enhance-upscale';
import type {
  VideoExtendConfirmData,
  VideoExtendSelection,
} from '@genfeedai/hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import VideoTransformPopover from '@ui/masonry/shared/VideoTransformPopover';
import VideoExtendConfirmControls, {
  getDefaultVideoExtendSelection,
} from '@ui/modals/ingredients/VideoExtendConfirmControls';
import VideoUpscaleConfirmControls, {
  getDefaultVideoUpscaleSelection,
} from '@ui/modals/ingredients/VideoUpscaleConfirmControls';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export interface MasonryConfirmBridgeProps {
  upscaleConfirmData: UpscaleConfirmData | null;
  executeUpscale: (selection?: VideoUpscaleSelection) => Promise<void>;
  clearUpscaleConfirm: () => void;
  extendConfirmData?: VideoExtendConfirmData | null;
  executeExtend?: (selection: VideoExtendSelection) => Promise<void>;
  clearExtendConfirm?: () => void;
}

const confirmationKeys = new WeakMap<object, number>();
let lastConfirmationKey = 0;

/**
 * A key per confirmation object, so a replacement for the same ingredient
 * (a fresh quote, a second click) remounts the pickers with its own options.
 */
function getConfirmationKey(confirmation: object): number {
  const known = confirmationKeys.get(confirmation);
  if (known !== undefined) {
    return known;
  }
  lastConfirmationKey += 1;
  confirmationKeys.set(confirmation, lastConfirmationKey);
  return lastConfirmationKey;
}

interface UpscalePopoverProps {
  data: UpscaleConfirmData;
  execute: (selection?: VideoUpscaleSelection) => Promise<void>;
  clear: () => void;
}

function UpscalePopover({ data, execute, clear }: UpscalePopoverProps) {
  const translate = useTranslations('common.videoCreativeActions.upscale');
  const modelOptions = data.videoModelOptions ?? [];
  const [selection, setSelection] = useState(() =>
    getDefaultVideoUpscaleSelection(modelOptions),
  );
  const cost = selection?.cost ?? data.cost;

  return (
    <VideoTransformPopover
      anchorIngredientId={data.ingredient?.id}
      confirmLabel={translate('confirmAction', {
        cost: formatNumberWithCommas(cost),
      })}
      dialogLabel={translate('dialogLabel')}
      onClose={clear}
      onConfirm={async () => {
        await execute(selection);
        clear();
      }}
    >
      {modelOptions.length > 0 ? (
        <VideoUpscaleConfirmControls
          modelOptions={modelOptions}
          onChange={setSelection}
        />
      ) : null}
    </VideoTransformPopover>
  );
}

interface ExtendPopoverProps {
  data: VideoExtendConfirmData;
  execute: (selection: VideoExtendSelection) => Promise<void>;
  clear: () => void;
}

function ExtendPopover({ data, execute, clear }: ExtendPopoverProps) {
  const translate = useTranslations('common.videoCreativeActions.extend');
  const [selection, setSelection] = useState(() =>
    getDefaultVideoExtendSelection(data.modelOptions),
  );

  return (
    <VideoTransformPopover
      anchorIngredientId={data.ingredient?.id}
      confirmLabel={translate('confirmAction', {
        cost: formatNumberWithCommas(selection?.cost ?? 0),
      })}
      dialogLabel={translate('dialogLabel')}
      isConfirmDisabled={!selection}
      onClose={clear}
      onConfirm={async () => {
        if (!selection) {
          return;
        }
        await execute(selection);
        clear();
      }}
    >
      <VideoExtendConfirmControls
        modelOptions={data.modelOptions}
        onChange={setSelection}
      />
    </VideoTransformPopover>
  );
}

/**
 * Opens the video upscale and extend pickers inline, next to the tile they
 * act on. The price sits on the action button and the toast confirms it once
 * the job starts. Image upscale and enhance start without any picker.
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
  if (upscaleConfirmData) {
    return (
      <UpscalePopover
        key={getConfirmationKey(upscaleConfirmData)}
        data={upscaleConfirmData}
        execute={executeUpscale}
        clear={clearUpscaleConfirm}
      />
    );
  }

  if (extendConfirmData && executeExtend && clearExtendConfirm) {
    return (
      <ExtendPopover
        key={getConfirmationKey(extendConfirmData)}
        data={extendConfirmData}
        execute={executeExtend}
        clear={clearExtendConfirm}
      />
    );
  }

  return null;
}
