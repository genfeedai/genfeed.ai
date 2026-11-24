import type { CredentialMentionItem } from '@genfeedai/agent/services/agent-api.service';
import ConnectedAccountAvatar from '@ui/display/connected-account/ConnectedAccountAvatar';
import {
  SuggestionEmpty,
  SuggestionItem,
  SuggestionList,
} from '@ui/primitives/suggestion-list';
import {
  type ReactElement,
  type Ref,
  useImperativeHandle,
  useState,
} from 'react';

interface CredentialMentionListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface CredentialMentionListProps {
  items: CredentialMentionItem[];
  command: (item: CredentialMentionItem) => void;
  ref?: Ref<CredentialMentionListHandle>;
}

export function CredentialMentionList({
  items,
  command,
  ref,
}: CredentialMentionListProps): ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      // With nothing to pick, the popup must not swallow Enter: a message
      // containing `!word` still sends.
      if (items.length === 0) {
        return false;
      }
      if (event.key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % items.length);
        return true;
      }
      if (event.key === 'Enter') {
        const item = items[selectedIndex];
        if (item) {
          command(item);
        }
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <SuggestionList>
        <SuggestionEmpty>No connected accounts found</SuggestionEmpty>
      </SuggestionList>
    );
  }

  return (
    <SuggestionList>
      {items.map((item, index) => (
        <SuggestionItem
          isSelected={index === selectedIndex}
          key={item.id}
          onClick={() => command(item)}
        >
          <ConnectedAccountAvatar
            account={{
              avatarUrl: item.avatar,
              handle: item.handle,
              name: item.name,
              platform: item.platform,
            }}
            size="sm"
          />
          <div className="flex flex-col">
            <span className="font-medium">!{item.handle}</span>
            {item.name !== item.handle && (
              <span className="text-xs text-muted-foreground">{item.name}</span>
            )}
          </div>
        </SuggestionItem>
      ))}
    </SuggestionList>
  );
}
