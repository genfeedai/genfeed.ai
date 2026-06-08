'use client';

import { ButtonVariant, ComponentSize } from '@genfeedai/enums';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { HiOutlineMagnifyingGlass, HiOutlineSparkles } from 'react-icons/hi2';

interface ClipsInputFormProps {
  error: string | null;
  isSubmitting: boolean;
  maxClips: number;
  minViralityScore: number;
  onAnalyze: () => void;
  onSetMaxClips: (value: number) => void;
  onSetMinViralityScore: (value: number) => void;
  onSetYoutubeUrl: (value: string) => void;
  youtubeUrl: string;
}

export default function ClipsInputForm({
  error,
  isSubmitting,
  maxClips,
  minViralityScore,
  onAnalyze,
  onSetMaxClips,
  onSetMinViralityScore,
  onSetYoutubeUrl,
  youtubeUrl,
}: ClipsInputFormProps) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-8 text-center">
        <div className="mb-4 flex justify-center">
          <div className="rounded-2xl bg-primary/10 p-3">
            <HiOutlineSparkles className="size-8 text-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-semibold text-zinc-100">
          AI Clip Factory
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Drop a YouTube URL, review AI-detected highlights, generate avatar
          clips
        </p>
      </div>

      <div className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        {/* YouTube URL */}
        <div>
          <label
            htmlFor="youtube-url"
            className="mb-1.5 block text-sm font-medium text-zinc-300"
          >
            YouTube URL
          </label>
          <Input
            id="youtube-url"
            type="url"
            value={youtubeUrl}
            onChange={(e) => onSetYoutubeUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </div>

        {/* Max Clips Slider */}
        <div>
          <label
            htmlFor="max-clips"
            className="mb-1.5 flex items-center justify-between text-sm font-medium text-zinc-300"
          >
            <span>Max Clips</span>
            <span className="text-xs text-zinc-500">{maxClips}</span>
          </label>
          <Input
            id="max-clips"
            type="range"
            min={1}
            max={30}
            value={maxClips}
            onChange={(e) => onSetMaxClips(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
            <span>1</span>
            <span>15</span>
            <span>30</span>
          </div>
        </div>

        {/* Min Virality Score */}
        <div>
          <label
            htmlFor="min-virality"
            className="mb-1.5 flex items-center justify-between text-sm font-medium text-zinc-300"
          >
            <span>Min Virality Score</span>
            <span className="text-xs text-zinc-500">{minViralityScore}</span>
          </label>
          <Input
            id="min-virality"
            type="range"
            min={0}
            max={100}
            value={minViralityScore}
            onChange={(e) => onSetMinViralityScore(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Submit */}
        <Button
          variant={ButtonVariant.UNSTYLED}
          onClick={onAnalyze}
          isDisabled={isSubmitting || !youtubeUrl}
          isLoading={isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
          icon={
            isSubmitting ? (
              <Spinner size={ComponentSize.SM} className="text-white" />
            ) : (
              <HiOutlineMagnifyingGlass className="size-4" />
            )
          }
          label={isSubmitting ? 'Analyzing…' : 'Analyze Video'}
        />
      </div>
    </div>
  );
}
