import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { type ReactElement, useCallback, useState } from 'react';
import { HiCheck, HiSparkles } from 'react-icons/hi2';

interface BrandCreateCardProps {
  action: AgentUiAction;
  onCreate?: (payload: { name: string; description: string }) => void;
}

export function BrandCreateCard({
  action,
  onCreate,
}: BrandCreateCardProps): ReactElement {
  const [name, setName] = useState(action.brandName ?? '');
  const [description, setDescription] = useState(action.brandDescription ?? '');
  const [isCreated, setIsCreated] = useState(false);

  const handleCreate = useCallback(() => {
    if (!name.trim()) {
      return;
    }
    onCreate?.({ description, name });
    setIsCreated(true);
  }, [name, description, onCreate]);

  if (isCreated) {
    return (
      <div className="my-2 border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <HiCheck className="h-5 w-5" />
          <span className="text-sm font-medium">
            Brand &quot;{name}&quot; created
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-2 border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <HiSparkles className="h-5 w-5 text-pink-500" />
        <h3 className="text-sm font-semibold">
          {action.title || 'Create Brand'}
        </h3>
      </div>

      {action.description && (
        <p className="mb-3 text-xs text-muted-foreground">
          {action.description}
        </p>
      )}

      {/* Name input */}
      <div className="mb-3">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Brand Name
        </label>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter brand name..."
        />
      </div>

      {/* Description input */}
      <div className="mb-3">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Description
        </label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Describe your brand..."
          className="resize-none"
        />
      </div>

      {/* Create button */}
      <Button
        variant={ButtonVariant.DEFAULT}
        onClick={handleCreate}
        isDisabled={!name.trim()}
        icon={<HiSparkles className="h-4 w-4" />}
        className="w-full justify-center"
      >
        Create Brand
      </Button>
    </div>
  );
}
