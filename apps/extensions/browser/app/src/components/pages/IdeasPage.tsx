import { ButtonVariant } from '@genfeedai/contracts';
import { Storage } from '@plasmohq/storage';
import { Button } from '@ui/primitives/button';
import { useCallback, useEffect, useState } from 'react';
import {
  CloseIcon,
  EmptyState,
  ExternalLinkIcon,
  LoadingPage,
} from '~components/ui';
import { logger } from '~utils/logger.util';

const storage = new Storage();
const MAX_IDEAS = 50;

interface SavedIdea {
  id: string;
  url: string;
  title?: string;
  savedAt: string;
}

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<SavedIdea[] | null>(null);

  const loadIdeas = useCallback(async () => {
    try {
      const stored = (await storage.get('saved_ideas')) as SavedIdea[] | null;
      setIdeas(stored || []);
    } catch (err) {
      logger.error('Error loading ideas', err);
      setIdeas([]);
    }
  }, []);

  useEffect(() => {
    loadIdeas();
  }, [loadIdeas]);

  function saveCurrentTab(): void {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab?.url) {
        return;
      }

      const newIdea: SavedIdea = {
        id: `idea_${Date.now()}`,
        savedAt: new Date().toISOString(),
        title: tab.title,
        url: tab.url,
      };

      const updated = [newIdea, ...(ideas ?? [])].slice(0, MAX_IDEAS);
      await storage.set('saved_ideas', updated);
      setIdeas(updated);
    });
  }

  async function removeIdea(id: string): Promise<void> {
    const updated = (ideas ?? []).filter((idea) => idea.id !== id);
    await storage.set('saved_ideas', updated);
    setIdeas(updated);
  }

  const isLoading = ideas === null;

  if (isLoading) {
    return <LoadingPage />;
  }

  if (ideas.length === 0) {
    return (
      <EmptyState
        title="No saved ideas"
        description="Save interesting pages to use as video ideas later"
        action={
          <Button
            type="button"
            variant={ButtonVariant.DEFAULT}
            onClick={saveCurrentTab}
            className="shadow-sm"
          >
            Save current tab
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">
          Saved Ideas ({ideas.length})
        </h3>
        <Button
          type="button"
          variant={ButtonVariant.DEFAULT}
          onClick={saveCurrentTab}
        >
          Save current tab
        </Button>
      </div>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {ideas.map((idea) => (
          <div
            key={idea.id}
            className="border border-border p-3 transition-colors hover:border-foreground/30"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {idea.title && (
                  <p className="truncate text-sm font-medium text-foreground">
                    {idea.title}
                  </p>
                )}
                <p className="text-sm text-blue-600 truncate">{idea.url}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {idea.savedAt.split('T')[0]}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant={ButtonVariant.GHOST}
                  onClick={() => chrome.tabs.create({ url: idea.url })}
                  className="p-1.5 text-muted-foreground hover:bg-muted"
                  title="Open"
                >
                  <ExternalLinkIcon />
                </Button>
                <Button
                  type="button"
                  variant={ButtonVariant.GHOST}
                  onClick={() => removeIdea(idea.id)}
                  className="p-1.5 text-destructive hover:bg-destructive/10"
                  title="Remove"
                >
                  <CloseIcon />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
