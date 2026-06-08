'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { HiPlus, HiTrash } from 'react-icons/hi2';

interface PostsWriteThreadEditorProps {
  characterLimit: number | null;
  draftSegments: string[];
  onAddSegment: () => void;
  onRemoveSegment: (index: number) => void;
  onUpdateSegment: (index: number, value: string) => void;
}

export default function PostsWriteThreadEditor({
  characterLimit,
  draftSegments,
  onAddSegment,
  onRemoveSegment,
  onUpdateSegment,
}: PostsWriteThreadEditorProps) {
  return (
    <div className="grid gap-3 text-sm text-foreground/75">
      <div className="flex items-center justify-between gap-3">
        <span>Thread draft</span>
        <Button
          type="button"
          variant={ButtonVariant.UNSTYLED}
          onClick={onAddSegment}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-white/[0.05]"
        >
          <HiPlus className="size-3.5" />
          Add post
        </Button>
      </div>
      <div className="grid gap-3">
        {draftSegments.map((segment, index) => {
          const count = segment.length;
          const isOverLimit = characterLimit !== null && count > characterLimit;

          return (
            <div
              key={`thread-segment-${index.toString()}`}
              className="rounded-xl border border-white/10 bg-black/20 p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-foreground">
                  Post {index + 1}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={
                      isOverLimit
                        ? 'text-xs text-red-400'
                        : 'text-xs text-foreground/45'
                    }
                  >
                    {characterLimit
                      ? `${count}/${characterLimit}`
                      : `${count} chars`}
                  </span>
                  {draftSegments.length > 1 ? (
                    <Button
                      type="button"
                      variant={ButtonVariant.UNSTYLED}
                      aria-label={`Remove post ${index + 1}`}
                      onClick={() => onRemoveSegment(index)}
                      className="inline-flex size-7 items-center justify-center rounded-lg text-foreground/45 transition hover:bg-white/[0.06] hover:text-foreground"
                    >
                      <HiTrash className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
              </div>
              <Textarea
                aria-label={`Thread post ${index + 1}`}
                value={segment}
                onChange={(event) => onUpdateSegment(index, event.target.value)}
                placeholder="Write this part of the thread..."
                className="min-h-28 border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-foreground/35 focus-visible:ring-0"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
