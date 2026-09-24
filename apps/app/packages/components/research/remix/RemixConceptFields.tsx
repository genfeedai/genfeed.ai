'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { BRAND_REMIX_STORYBOARD_SCENE_LIMIT } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import type { ChangeEvent, ReactElement } from 'react';

export interface RemixStoryboardDraft {
  durationSeconds?: number;
  key: string;
  narration: string;
  visualIntent: string;
}

export interface RemixConceptFieldsProps {
  angle: string;
  hook: string;
  onAngleChange: (angle: string) => void;
  onHookChange: (hook: string) => void;
  onScriptChange: (script: string) => void;
  onStoryboardChange: (storyboard: RemixStoryboardDraft[]) => void;
  script: string;
  scriptHelp?: string;
  storyboard: RemixStoryboardDraft[];
}

export default function RemixConceptFields({
  angle,
  hook,
  onAngleChange,
  onHookChange,
  onScriptChange,
  onStoryboardChange,
  script,
  scriptHelp,
  storyboard,
}: RemixConceptFieldsProps): ReactElement {
  const translate = useTranslations('pages.remixBrief');
  const updateScene = (
    index: number,
    patch: Partial<RemixStoryboardDraft>,
  ): void => {
    onStoryboardChange(
      storyboard.map((scene, sceneIndex) =>
        sceneIndex === index ? { ...scene, ...patch } : scene,
      ),
    );
  };

  return (
    <section className="space-y-4 border-b border-border pb-6">
      <div>
        <p className="text-sm font-medium text-foreground">
          {translate('concept.title')}
        </p>
        <p className="text-xs text-muted-foreground">
          {translate('concept.help')}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={translate('concept.angle')}
          maxLength={1_000}
          onChange={(event) => onAngleChange(event.target.value)}
          value={angle}
        />
        <Input
          label={translate('concept.hook')}
          maxLength={1_000}
          onChange={(event) => onHookChange(event.target.value)}
          value={hook}
        />
      </div>
      <div>
        <Label htmlFor="remix-concept-script">
          {translate('concept.script')}
        </Label>
        {scriptHelp ? (
          <p className="mb-2 text-xs text-muted-foreground">{scriptHelp}</p>
        ) : null}
        <Textarea
          id="remix-concept-script"
          maxHeight={220}
          maxLength={10_000}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            onScriptChange(event.target.value)
          }
          rows={4}
          value={script}
        />
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-foreground">
            {translate('concept.storyboard')}
          </p>
          <Button
            isDisabled={storyboard.length >= BRAND_REMIX_STORYBOARD_SCENE_LIMIT}
            label={translate('concept.addScene')}
            onClick={() =>
              onStoryboardChange([
                ...storyboard,
                {
                  key: crypto.randomUUID(),
                  narration: '',
                  visualIntent: '',
                },
              ])
            }
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          />
        </div>
        {storyboard.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {translate('concept.incomplete')}
          </p>
        ) : null}
        {storyboard.map((scene, index) => (
          <div
            className="space-y-3 border-t border-border pt-3"
            key={scene.key}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-foreground">
                {translate('concept.scene', { ordinal: index + 1 })}
              </p>
              <Button
                label={translate('concept.removeScene')}
                onClick={() =>
                  onStoryboardChange(
                    storyboard.filter(
                      (candidate) => candidate.key !== scene.key,
                    ),
                  )
                }
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
              />
            </div>
            <Input
              label={translate('concept.visualIntent')}
              maxLength={1_000}
              onChange={(event) =>
                updateScene(index, { visualIntent: event.target.value })
              }
              value={scene.visualIntent}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label={translate('concept.narration')}
                maxLength={1_000}
                onChange={(event) =>
                  updateScene(index, { narration: event.target.value })
                }
                value={scene.narration}
              />
              <Input
                inputMode="decimal"
                label={translate('concept.duration')}
                onChange={(event) => {
                  const raw = event.target.value.trim();
                  if (!raw) {
                    updateScene(index, { durationSeconds: undefined });
                    return;
                  }
                  const durationSeconds = Number(raw);
                  if (
                    !Number.isFinite(durationSeconds) ||
                    durationSeconds <= 0 ||
                    durationSeconds > 60
                  ) {
                    return;
                  }
                  updateScene(index, { durationSeconds });
                }}
                value={
                  scene.durationSeconds === undefined
                    ? ''
                    : String(scene.durationSeconds)
                }
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
