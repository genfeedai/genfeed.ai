'use client';

import { ButtonVariant, WorkflowNodeStatus } from '@genfeedai/enums';
import Textarea from '@ui/inputs/textarea/Textarea';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { ExternalLink, Share2 } from 'lucide-react';
import { memo, useCallback } from 'react';

// Cloud-specific types (to be defined in workflow-saas)
export type SocialPlatform =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'twitter'
  | 'linkedin'
  | 'facebook'
  | 'threads';

export type SocialVisibility = 'public' | 'private' | 'unlisted';

export interface SocialPublishNodeData {
  label: string;
  status: WorkflowNodeStatus;
  inputVideo: string | null;
  platform: SocialPlatform;
  title: string;
  description: string;
  tags: string[];
  visibility: SocialVisibility;
  scheduledTime: string | null;
  publishedUrl: string | null;
  jobId: string | null;
}

interface SocialPublishNodeProps {
  id: string;
  data: SocialPublishNodeData;
  onUpdate: (id: string, data: Partial<SocialPublishNodeData>) => void;
  onExecute: (id: string) => void;
}

const PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { label: 'YouTube', value: 'youtube' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'X / Twitter', value: 'twitter' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'Facebook', value: 'facebook' },
  { label: 'Threads', value: 'threads' },
];

const VISIBILITY_OPTIONS: { value: SocialVisibility; label: string }[] = [
  { label: 'Public', value: 'public' },
  { label: 'Private', value: 'private' },
  { label: 'Unlisted', value: 'unlisted' },
];

function SocialPublishNodeComponent({
  id,
  data,
  onUpdate,
  onExecute,
}: SocialPublishNodeProps) {
  const handlePlatformChange = useCallback(
    (platform: SocialPlatform) => {
      onUpdate(id, { platform });
    },
    [id, onUpdate],
  );

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate(id, { title: e.target.value });
    },
    [id, onUpdate],
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onUpdate(id, { description: e.target.value });
    },
    [id, onUpdate],
  );

  const handleTagsChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const tags = e.target.value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      onUpdate(id, { tags });
    },
    [id, onUpdate],
  );

  const handlePublish = useCallback(() => {
    onExecute(id);
  }, [id, onExecute]);

  return (
    <div className="space-y-3">
      {/* Platform Selection */}
      <div className="grid grid-cols-4 gap-1 p-1 bg-background">
        {PLATFORMS.map((p) => (
          <Button
            key={p.value}
            onClick={() => handlePlatformChange(p.value)}
            type="button"
            variant={ButtonVariant.UNSTYLED}
            className={`py-1.5 px-1 text-xs transition ${
              data.platform === p.value
                ? 'bg-primary text-white'
                : 'text-muted-foreground hover:bg-border'
            }`}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* Title */}
      <div>
        <label className="text-xs text-muted-foreground">Title</label>
        <Input
          type="text"
          value={data.title}
          onChange={handleTitleChange}
          placeholder="Video title..."
          className="mt-1"
        />
      </div>

      {/* Description */}
      <div>
        <label className="text-xs text-muted-foreground">Description</label>
        <Textarea
          value={data.description}
          onChange={handleDescriptionChange}
          placeholder="Video description..."
          className="w-full h-16 px-2 py-1.5 text-sm bg-background border border-white/[0.08] resize-none focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Tags */}
      <div>
        <label className="text-xs text-muted-foreground">
          Tags (comma-separated)
        </label>
        <Input
          type="text"
          value={data.tags.join(', ')}
          onChange={handleTagsChange}
          placeholder="tag1, tag2, tag3"
          className="mt-1"
        />
      </div>

      {/* Visibility */}
      <div>
        <label className="text-xs text-muted-foreground">Visibility</label>
        <Select
          value={data.visibility}
          onValueChange={(value) =>
            onUpdate(id, { visibility: value as SocialVisibility })
          }
        >
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select visibility" />
          </SelectTrigger>
          <SelectContent>
            {VISIBILITY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Published URL */}
      {data.publishedUrl && (
        <a
          href={data.publishedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/20 text-green-400 text-sm hover:bg-green-500/20 transition"
        >
          <ExternalLink className="w-4 h-4" />
          View Published Video
        </a>
      )}

      {/* Publish Button */}
      {!data.publishedUrl && data.status !== WorkflowNodeStatus.PROCESSING && (
        <Button
          onClick={handlePublish}
          isDisabled={!data.inputVideo}
          type="button"
          variant={ButtonVariant.UNSTYLED}
          className="w-full py-2 bg-primary text-white text-sm font-medium hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Share2 className="w-4 h-4" />
          Publish to {PLATFORMS.find((p) => p.value === data.platform)?.label}
        </Button>
      )}

      {/* No Input Warning */}
      {!data.inputVideo && (
        <div className="text-xs text-muted-foreground text-center">
          Connect a video to publish
        </div>
      )}
    </div>
  );
}

export const SocialPublishNode = memo(SocialPublishNodeComponent);
