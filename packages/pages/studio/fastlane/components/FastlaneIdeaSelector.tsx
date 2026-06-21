'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import type { ChangeEvent } from 'react';
import { useState } from 'react';
import { FASTLANE_CREDIT_COSTS } from '../hooks/useFastlaneGeneration';
import type { FastlaneFormat, FastlaneIdea } from '../types';

const ALL_FORMATS: FastlaneFormat[] = ['image', 'video', 'avatar'];

const FORMAT_LABELS: Record<FastlaneFormat, string> = {
  image: 'Image',
  video: 'Video',
  avatar: 'Avatar',
};

// Keep in sync with FASTLANE_MIN_IDEAS / FASTLANE_MAX_IDEAS on the API DTO
// (generate-fastlane-ideas.dto.ts) — the server enforces these same bounds.
const MIN_COUNT = 3;
const MAX_COUNT = 9;

interface FastlaneIdeaSelectorProps {
  isAvatarConfigured: boolean;
  isLoading: boolean;
  ideas: FastlaneIdea[];
  error: string | null;
  onGenerate: (
    formats: FastlaneFormat[],
    count: number,
    angle?: string,
  ) => void;
  onStartGeneration: () => void;
}

export default function FastlaneIdeaSelector({
  isAvatarConfigured,
  isLoading,
  ideas,
  error,
  onGenerate,
  onStartGeneration,
}: FastlaneIdeaSelectorProps) {
  const [selectedFormats, setSelectedFormats] = useState<FastlaneFormat[]>([
    'image',
    'video',
  ]);
  const [count, setCount] = useState(6);
  const [angle, setAngle] = useState('');

  const creditEstimate = selectedFormats.reduce(
    (sum, fmt) => sum + FASTLANE_CREDIT_COSTS[fmt] * count,
    0,
  );

  function toggleFormat(format: FastlaneFormat) {
    setSelectedFormats((prev) =>
      prev.includes(format)
        ? prev.filter((f) => f !== format)
        : [...prev, format],
    );
  }

  function handleCountChange(delta: number) {
    setCount((c) => Math.min(MAX_COUNT, Math.max(MIN_COUNT, c + delta)));
  }

  function handleAngleChange(e: ChangeEvent<HTMLInputElement>) {
    setAngle(e.target.value);
  }

  function handleGenerate() {
    if (selectedFormats.length === 0) return;
    onGenerate(selectedFormats, count, angle.trim() || undefined);
  }

  const hasIdeas = ideas.length > 0;

  return (
    <div className="flex flex-col gap-6 max-w-xl mx-auto w-full">
      <div className="flex flex-col gap-3">
        <p className="gen-label-sm text-muted-foreground">Content formats</p>
        <div className="flex gap-2">
          {ALL_FORMATS.map((fmt) => {
            const isAvatar = fmt === 'avatar';
            const isDisabled = isAvatar && !isAvatarConfigured;
            const isSelected = selectedFormats.includes(fmt);

            const toggle = (
              <Button
                key={fmt}
                variant={
                  isSelected ? ButtonVariant.DEFAULT : ButtonVariant.OUTLINE
                }
                size={ButtonSize.SM}
                label={FORMAT_LABELS[fmt]}
                isDisabled={isDisabled}
                onClick={() => !isDisabled && toggleFormat(fmt)}
              />
            );

            if (isDisabled) {
              return (
                <SimpleTooltip
                  key={fmt}
                  label="Configure a default avatar in brand settings to unlock avatar generation"
                >
                  {toggle}
                </SimpleTooltip>
              );
            }

            return toggle;
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="gen-label-sm text-muted-foreground">Ideas per format</p>
        <div className="flex items-center gap-3">
          <Button
            variant={ButtonVariant.OUTLINE}
            size={ButtonSize.SM}
            label="-"
            isDisabled={count <= MIN_COUNT}
            onClick={() => handleCountChange(-1)}
          />
          <span className="text-lg font-semibold w-6 text-center">{count}</span>
          <Button
            variant={ButtonVariant.OUTLINE}
            size={ButtonSize.SM}
            label="+"
            isDisabled={count >= MAX_COUNT}
            onClick={() => handleCountChange(1)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="gen-label-sm text-muted-foreground">
          Angle <span className="text-xs font-normal">(optional)</span>
        </p>
        <Input
          label="e.g. Focus on summer vibes"
          value={angle}
          onChange={handleAngleChange}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="gen-label-sm text-muted-foreground">
            Estimated cost
          </span>
          <Badge variant="secondary">{creditEstimate} credits</Badge>
        </div>
        <Button
          variant={ButtonVariant.GENERATE}
          label="Generate ideas"
          isDisabled={selectedFormats.length === 0}
          isLoading={isLoading}
          onClick={handleGenerate}
        />
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
          {error}
        </p>
      )}

      {hasIdeas && !isLoading && (
        <div className="flex flex-col gap-4 mt-2">
          <div className="gen-divider" />
          <p className="gen-label text-muted-foreground">
            {ideas.length} idea{ideas.length !== 1 ? 's' : ''} generated
          </p>
          <div className="flex flex-col gap-3">
            {ideas.map((idea) => (
              <div
                key={idea.id}
                className="gen-glass rounded-lg p-4 flex flex-col gap-1"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {FORMAT_LABELS[idea.format]}
                  </Badge>
                  {idea.platformHints.map((hint: string) => (
                    <Badge key={hint} variant="outline" className="text-xs">
                      {hint}
                    </Badge>
                  ))}
                </div>
                <p className="text-sm font-medium">{idea.hook}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {idea.caption}
                </p>
              </div>
            ))}
          </div>
          <Button
            variant={ButtonVariant.DEFAULT}
            label="Start generating"
            onClick={onStartGeneration}
          />
        </div>
      )}
    </div>
  );
}
