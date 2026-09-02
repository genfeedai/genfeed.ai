'use client';

import {
  CAST_CAMERA_MOVEMENTS,
  CAST_PROMPT_FAMILIES,
  type CastCameraMovement,
  type CastPromptFamily,
  type CastPromptNodeData,
} from '@genfeedai/contracts/types';
import { Textarea } from '@genfeedai/ui';
import type { NodeProps } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import { memo, useCallback, useMemo } from 'react';
import { getAllPresets } from '../../../engine/presets/cinematic-presets';
import {
  getAllUgcPresets,
  getUgcPresetById,
  getUgcVocabularyLibrary,
} from '../../../engine/presets/ugc-presets';
import { useWorkflowStore } from '../../stores/workflow';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { Label } from '../../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { BaseNode } from '../BaseNode';

const FAMILY_LABELS: Record<CastPromptFamily, string> = {
  cinematic: 'Cinematic',
  ugc: 'UGC',
};

const CAMERA_MOVEMENT_LABELS: Record<CastCameraMovement, string> = {
  aerial: 'Aerial',
  crane: 'Crane',
  dolly: 'Dolly',
  handheld: 'Handheld',
  static: 'Static',
  steadicam: 'Steadicam',
  tracking: 'Tracking',
};

function CastPromptNodeComponent(props: NodeProps) {
  const translate = useTranslations('pages.workflows.castPrompt');
  const { id, data } = props;
  const nodeData = data as CastPromptNodeData;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  const family: CastPromptFamily =
    nodeData.family === 'cinematic' ? 'cinematic' : 'ugc';

  const ugcPresets = useMemo(() => getAllUgcPresets(), []);
  const cinematicPresets = useMemo(() => getAllPresets(), []);

  const selectedUgcPreset = useMemo(
    () => getUgcPresetById(nodeData.presetId),
    [nodeData.presetId],
  );

  const vocabulary = useMemo(() => {
    if (!selectedUgcPreset) {
      return [];
    }
    return getUgcVocabularyLibrary({
      hasStartFrameReference: nodeData.hasStartFrameReference === true,
      preset: selectedUgcPreset,
    });
  }, [nodeData.hasStartFrameReference, selectedUgcPreset]);

  const handleFamilyChange = useCallback(
    (nextFamily: CastPromptFamily) => {
      const nextPresetId =
        nextFamily === 'ugc' ? ugcPresets[0]?.id : cinematicPresets[0]?.id;
      updateNodeData<CastPromptNodeData>(id, {
        family: nextFamily,
        presetId: nextPresetId ?? nodeData.presetId,
      });
    },
    [cinematicPresets, id, nodeData.presetId, ugcPresets, updateNodeData],
  );

  const handlePresetChange = useCallback(
    (presetId: string) => {
      updateNodeData<CastPromptNodeData>(id, { presetId });
    },
    [id, updateNodeData],
  );

  const handleFieldChange = useCallback(
    (field: keyof CastPromptNodeData, value: string) => {
      updateNodeData<CastPromptNodeData>(id, { [field]: value });
    },
    [id, updateNodeData],
  );

  const handleStartFrameChange = useCallback(
    (checked: boolean) => {
      updateNodeData<CastPromptNodeData>(id, {
        hasStartFrameReference: checked,
      });
    },
    [id, updateNodeData],
  );

  const presets = family === 'ugc' ? ugcPresets : cinematicPresets;

  return (
    <BaseNode {...props}>
      <div className="space-y-3">
        <div className="flex gap-1">
          {CAST_PROMPT_FAMILIES.map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={family === item ? 'default' : 'ghost'}
              className="nodrag h-7 flex-1 text-xs"
              onClick={() => handleFamilyChange(item)}
            >
              {FAMILY_LABELS[item]}
            </Button>
          ))}
        </div>

        <div>
          <Label
            className="text-xs text-muted-foreground mb-1"
            htmlFor={`cast-preset-${id}`}
          >
            {translate('preset')}
          </Label>
          <Select value={nodeData.presetId} onValueChange={handlePresetChange}>
            <SelectTrigger
              id={`cast-preset-${id}`}
              className="nodrag h-8 w-full"
            >
              <SelectValue placeholder="Select a preset" />
            </SelectTrigger>
            <SelectContent>
              {presets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {preset.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {family === 'ugc' ? (
          <div>
            <div className="text-xs font-medium mb-2">
              {translate('vocabularyLibrary')}
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {vocabulary.map((entry) => (
                <div key={entry.kind} className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {entry.label}
                  </div>
                  <p className="text-xs leading-snug text-foreground/90">
                    {entry.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <Label
              className="text-xs text-muted-foreground mb-1"
              htmlFor={`cast-camera-move-${id}`}
            >
              {translate('cameraMovement')}
            </Label>
            <Select
              value={nodeData.cameraMovement}
              onValueChange={(value) =>
                handleFieldChange('cameraMovement', value as CastCameraMovement)
              }
            >
              <SelectTrigger
                id={`cast-camera-move-${id}`}
                className="nodrag h-8 w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAST_CAMERA_MOVEMENTS.map((movement) => (
                  <SelectItem key={movement} value={movement}>
                    {CAMERA_MOVEMENT_LABELS[movement]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Checkbox
            id={`cast-start-frame-${id}`}
            className="nodrag"
            checked={nodeData.hasStartFrameReference === true}
            onCheckedChange={(checked) =>
              handleStartFrameChange(checked === true)
            }
          />
          <Label
            className="text-xs text-muted-foreground"
            htmlFor={`cast-start-frame-${id}`}
          >
            {translate('startFrameReference')}
          </Label>
        </div>

        <div>
          <Label
            className="text-xs text-muted-foreground mb-1"
            htmlFor={`cast-action-${id}`}
          >
            {translate('action')}
          </Label>
          <Textarea
            id={`cast-action-${id}`}
            className="nodrag nopan min-h-12 resize-none text-xs"
            placeholder="creator talking to camera"
            value={nodeData.action ?? ''}
            onChange={(event) =>
              handleFieldChange('action', event.target.value)
            }
          />
        </div>

        <div>
          <Label
            className="text-xs text-muted-foreground mb-1"
            htmlFor={`cast-subject-${id}`}
          >
            {translate('subject')}
          </Label>
          <Textarea
            id={`cast-subject-${id}`}
            className="nodrag nopan min-h-12 resize-none text-xs"
            placeholder="young creator in a bedroom"
            value={nodeData.subject ?? ''}
            onChange={(event) =>
              handleFieldChange('subject', event.target.value)
            }
          />
        </div>
      </div>
    </BaseNode>
  );
}

export const CastPromptNode = memo(CastPromptNodeComponent);
