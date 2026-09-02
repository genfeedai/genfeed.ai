'use client';

import { ButtonVariant, WorkflowNodeStatus } from '@genfeedai/contracts';
import type {
  TweetInputNodeData,
  TweetInputNodeProps,
} from '@props/workflow/nodes.props';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { Link, LoaderCircle, Type } from 'lucide-react';
import { memo, useCallback, useState } from 'react';

export type { TweetInputNodeData, TweetInputNodeProps };

function TweetInputNodeComponent({ id, data, onUpdate }: TweetInputNodeProps) {
  const [isFetching, setIsFetching] = useState(false);

  const handleModeChange = useCallback(
    (mode: 'url' | 'text') => {
      onUpdate(id, { inputMode: mode });
    },
    [id, onUpdate],
  );

  const handleUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate(id, { tweetUrl: e.target.value });
    },
    [id, onUpdate],
  );

  const handleRawTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onUpdate(id, {
        extractedTweet: e.target.value,
        rawText: e.target.value,
      });
    },
    [id, onUpdate],
  );

  const handleFetchTweet = useCallback(async () => {
    if (!data.tweetUrl) {
      return;
    }

    setIsFetching(true);
    try {
      const response = await fetch('/v1/core/tweet/fetch', {
        body: JSON.stringify({ url: data.tweetUrl }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch tweet');
      }

      const { text, authorHandle } = await response.json();
      onUpdate(id, {
        authorHandle,
        extractedTweet: text,
        status: WorkflowNodeStatus.COMPLETE,
      });
    } catch (error) {
      onUpdate(id, {
        error: error instanceof Error ? error.message : 'Failed to fetch',
        status: WorkflowNodeStatus.ERROR,
      });
    } finally {
      setIsFetching(false);
    }
  }, [id, data.tweetUrl, onUpdate]);

  return (
    <div className="space-y-3">
      {/* Mode Toggle */}
      <div className="flex gap-1 p-1 bg-background">
        <Button
          onClick={() => handleModeChange('url')}
          type="button"
          variant={ButtonVariant.UNSTYLED}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium transition ${
            data.inputMode === 'url'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Link className="size-3" />
          URL
        </Button>
        <Button
          onClick={() => handleModeChange('text')}
          type="button"
          variant={ButtonVariant.UNSTYLED}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium transition ${
            data.inputMode === 'text'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Type className="size-3" />
          Text
        </Button>
      </div>

      {/* URL Input */}
      {data.inputMode === 'url' && (
        <div className="space-y-2">
          <Input
            type="url"
            value={data.tweetUrl || ''}
            onChange={handleUrlChange}
            placeholder="https://twitter.com/user/status/…"
          />
          <Button
            onClick={handleFetchTweet}
            isDisabled={!data.tweetUrl || isFetching}
            type="button"
            variant={ButtonVariant.UNSTYLED}
            className="flex w-full items-center justify-center gap-2 bg-primary py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {isFetching ? (
              <>
                <LoaderCircle className="size-3 animate-spin" />
                Fetching…
              </>
            ) : (
              'Fetch Tweet'
            )}
          </Button>
        </div>
      )}

      {/* Raw Text Input */}
      {data.inputMode === 'text' && (
        <Textarea
          value={data.rawText || ''}
          onChange={handleRawTextChange}
          placeholder="Paste tweet text here…"
          className="h-20 w-full resize-none border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      )}

      {/* Extracted Tweet Preview */}
      {data.extractedTweet && (
        <div className="border border-border bg-background p-2">
          {data.authorHandle && (
            <div className="text-xs text-muted-foreground mb-1">
              @{data.authorHandle}
            </div>
          )}
          <div className="text-sm text-foreground">{data.extractedTweet}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {data.extractedTweet.length} characters
          </div>
        </div>
      )}
    </div>
  );
}

export const TweetInputNode = memo(TweetInputNodeComponent);
