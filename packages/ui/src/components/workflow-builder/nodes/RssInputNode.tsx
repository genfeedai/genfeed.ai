'use client';

import { ButtonVariant, WorkflowNodeStatus } from '@genfeedai/enums';
import type {
  RssFeedItem,
  RssInputNodeData,
  RssInputNodeProps,
} from '@props/workflow/nodes.props';
import Textarea from '@ui/inputs/textarea/Textarea';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { ChevronLeft, ChevronRight, Link, Loader2, Type } from 'lucide-react';
import { memo, useCallback, useState } from 'react';

export type { RssFeedItem, RssInputNodeData, RssInputNodeProps };

function RssInputNodeComponent({ id, data, onUpdate }: RssInputNodeProps) {
  const [isFetching, setIsFetching] = useState(false);

  const handleModeChange = useCallback(
    (mode: 'url' | 'text') => {
      onUpdate(id, { inputMode: mode });
    },
    [id, onUpdate],
  );

  const handleUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate(id, { feedUrl: e.target.value });
    },
    [id, onUpdate],
  );

  const handleRawXmlChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onUpdate(id, { rawXml: e.target.value });
    },
    [id, onUpdate],
  );

  const handleFetchFeed = useCallback(async () => {
    const url = data.inputMode === 'url' ? data.feedUrl : null;
    const xml = data.inputMode === 'text' ? data.rawXml : null;

    if (!url && !xml) {
      return;
    }

    setIsFetching(true);
    try {
      const response = await fetch('/v1/core/rss/fetch', {
        body: JSON.stringify({ url, xml }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch feed');
      }

      const { feedTitle, items } = await response.json();
      onUpdate(id, {
        feedItems: items,
        feedTitle,
        selectedItemIndex: 0,
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
  }, [id, data.feedUrl, data.rawXml, data.inputMode, onUpdate]);

  const handlePrevItem = useCallback(() => {
    if (!data.feedItems || data.selectedItemIndex <= 0) {
      return;
    }
    onUpdate(id, { selectedItemIndex: data.selectedItemIndex - 1 });
  }, [id, data.feedItems, data.selectedItemIndex, onUpdate]);

  const handleNextItem = useCallback(() => {
    if (
      !data.feedItems ||
      data.selectedItemIndex >= data.feedItems.length - 1
    ) {
      return;
    }
    onUpdate(id, { selectedItemIndex: data.selectedItemIndex + 1 });
  }, [id, data.feedItems, data.selectedItemIndex, onUpdate]);

  const selectedItem = data.feedItems?.[data.selectedItemIndex];

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
              ? 'bg-primary text-white'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Link className="w-3 h-3" />
          URL
        </Button>
        <Button
          onClick={() => handleModeChange('text')}
          type="button"
          variant={ButtonVariant.UNSTYLED}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium transition ${
            data.inputMode === 'text'
              ? 'bg-primary text-white'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Type className="w-3 h-3" />
          XML
        </Button>
      </div>

      {/* URL Input */}
      {data.inputMode === 'url' && (
        <div className="space-y-2">
          <Input
            type="url"
            value={data.feedUrl || ''}
            onChange={handleUrlChange}
            placeholder="https://example.com/feed.xml"
          />
          <Button
            onClick={handleFetchFeed}
            isDisabled={!data.feedUrl || isFetching}
            type="button"
            variant={ButtonVariant.UNSTYLED}
            className="w-full py-1.5 bg-primary text-white text-xs font-medium hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isFetching ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Fetching...
              </>
            ) : (
              'Fetch Feed'
            )}
          </Button>
        </div>
      )}

      {/* Raw XML Input */}
      {data.inputMode === 'text' && (
        <div className="space-y-2">
          <Textarea
            value={data.rawXml || ''}
            onChange={handleRawXmlChange}
            placeholder="Paste RSS XML here..."
            className="w-full h-20 px-2 py-1.5 text-sm bg-background border border-white/[0.08] resize-none focus:outline-none focus:ring-1 focus:ring-primary font-mono text-xs"
          />
          <Button
            onClick={handleFetchFeed}
            isDisabled={!data.rawXml || isFetching}
            type="button"
            variant={ButtonVariant.UNSTYLED}
            className="w-full py-1.5 bg-primary text-white text-xs font-medium hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isFetching ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Parsing...
              </>
            ) : (
              'Parse Feed'
            )}
          </Button>
        </div>
      )}

      {/* Feed Preview */}
      {data.feedItems && data.feedItems.length > 0 && (
        <div className="p-2 bg-background border border-white/[0.08] space-y-2">
          {/* Feed Title */}
          {data.feedTitle && (
            <div className="text-xs text-muted-foreground font-medium">
              {data.feedTitle}
            </div>
          )}

          {/* Item Navigation */}
          <div className="flex items-center justify-between">
            <Button
              onClick={handlePrevItem}
              isDisabled={data.selectedItemIndex <= 0}
              type="button"
              variant={ButtonVariant.UNSTYLED}
              className="p-1 hover:bg-border disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              {data.selectedItemIndex + 1} / {data.feedItems.length}
            </span>
            <Button
              onClick={handleNextItem}
              isDisabled={data.selectedItemIndex >= data.feedItems.length - 1}
              type="button"
              variant={ButtonVariant.UNSTYLED}
              className="p-1 hover:bg-border disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Selected Item */}
          {selectedItem && (
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground line-clamp-2">
                {selectedItem.title}
              </div>
              <div className="text-xs text-muted-foreground line-clamp-3">
                {selectedItem.description}
              </div>
              {selectedItem.pubDate && (
                <div className="text-xs text-muted-foreground">
                  {new Date(selectedItem.pubDate).toLocaleDateString()}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const RssInputNode = memo(RssInputNodeComponent);
