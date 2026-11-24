import type { TeamMentionItem } from '@genfeedai/agent/types/mention.types';
import { Avatar } from '@ui/primitives/avatar';
import { Badge } from '@ui/primitives/badge';
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

interface TeamMentionListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface TeamMentionListProps {
  items: TeamMentionItem[];
  command: (item: TeamMentionItem) => void;
  ref?: Ref<TeamMentionListHandle>;
}

export function TeamMentionList({
  items,
  command,
  ref,
}: TeamMentionListProps): ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
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
        <SuggestionEmpty>No team members found</SuggestionEmpty>
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
          {item.avatar && (
            <Avatar
              alt={item.displayName}
              name={item.displayName}
              size="sm"
              src={item.avatar}
            />
          )}
          <div className="flex flex-col">
            <span className="font-medium">{item.displayName}</span>
          </div>
          <Badge
            casing="normal"
            className="ml-auto"
            shape="pill"
            variant={item.isAgent ? 'default' : 'success'}
          >
            {item.isAgent ? 'agent' : 'human'}
          </Badge>
        </SuggestionItem>
      ))}
    </SuggestionList>
  );
}
