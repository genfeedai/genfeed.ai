import { BrandMentionList } from '@genfeedai/agent/components/BrandMentionList';
import { CharacterMentionList } from '@genfeedai/agent/components/CharacterMentionList';
import { CredentialMentionList } from '@genfeedai/agent/components/CredentialMentionList';
import { TeamMentionList } from '@genfeedai/agent/components/TeamMentionList';
import type { CredentialMentionItem } from '@genfeedai/agent/services/agent-api.service';
import type {
  BrandMentionItem,
  TeamMentionItem,
} from '@genfeedai/agent/types/mention.types';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    key === 'empty' ? 'No characters found' : key,
}));

interface MentionListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

function pressKey(ref: React.RefObject<MentionListHandle | null>, key: string) {
  let handled = false;
  act(() => {
    handled = Boolean(
      ref.current?.onKeyDown({ event: new KeyboardEvent('keydown', { key }) }),
    );
  });
  return handled;
}

const brands: BrandMentionItem[] = [
  { brandName: 'Acme', brandSlug: 'acme', id: 'brand-1' },
  { brandName: 'Globex', brandSlug: 'globex', id: 'brand-2' },
];

describe('BrandMentionList', () => {
  it('renders an empty state without items', () => {
    render(<BrandMentionList command={vi.fn()} items={[]} />);

    expect(screen.getByText('No brands found')).toBeInTheDocument();
  });

  it('renders brand names and invokes command on click', () => {
    const command = vi.fn();
    render(<BrandMentionList command={command} items={brands} />);

    fireEvent.click(screen.getByText('Globex'));

    expect(command).toHaveBeenCalledWith(brands[1]);
  });

  it('supports keyboard navigation and selection via the imperative handle', () => {
    const command = vi.fn();
    const ref = createRef<MentionListHandle>();
    render(<BrandMentionList command={command} items={brands} ref={ref} />);

    expect(pressKey(ref, 'ArrowDown')).toBe(true);
    expect(pressKey(ref, 'Enter')).toBe(true);
    expect(command).toHaveBeenCalledWith(brands[1]);

    expect(pressKey(ref, 'ArrowUp')).toBe(true);
    expect(pressKey(ref, 'Escape')).toBe(false);
  });
});

const credentials: CredentialMentionItem[] = [
  {
    avatar: 'https://cdn.test/avatar.png',
    handle: 'acme_official',
    id: 'cred-1',
    name: 'Acme Official',
    platform: 'instagram',
  },
  {
    avatar: null,
    handle: 'acme',
    id: 'cred-2',
    name: 'acme',
    platform: 'twitter',
  },
];

describe('CredentialMentionList', () => {
  it('renders an empty state without items', () => {
    render(<CredentialMentionList command={vi.fn()} items={[]} />);

    expect(screen.getByText('No connected accounts found')).toBeInTheDocument();
  });

  it('renders handles with platform labels and avatars', () => {
    render(<CredentialMentionList command={vi.fn()} items={credentials} />);

    expect(screen.getByText('!acme_official')).toBeInTheDocument();
    expect(screen.getByText('Acme Official')).toBeInTheDocument();
    expect(screen.getByText('instagram')).toBeInTheDocument();
    expect(screen.getByAltText('acme_official')).toBeInTheDocument();
    // Same name/handle renders only the handle line.
    expect(screen.getByText('!acme')).toBeInTheDocument();
  });

  it('selects via keyboard wrap-around', () => {
    const command = vi.fn();
    const ref = createRef<MentionListHandle>();
    render(
      <CredentialMentionList command={command} items={credentials} ref={ref} />,
    );

    pressKey(ref, 'ArrowUp');
    pressKey(ref, 'Enter');

    expect(command).toHaveBeenCalledWith(credentials[1]);
  });
});

const team: TeamMentionItem[] = [
  {
    avatar: 'https://cdn.test/human.png',
    displayName: 'Jamie',
    id: 'user-1',
    isAgent: false,
    role: 'admin',
  },
  {
    displayName: 'Scout',
    id: 'agent-1',
    isAgent: true,
    role: 'agent',
  },
];

describe('TeamMentionList', () => {
  it('renders an empty state without items', () => {
    render(<TeamMentionList command={vi.fn()} items={[]} />);

    expect(screen.getByText('No team members found')).toBeInTheDocument();
  });

  it('labels humans and agents and invokes command on click', () => {
    const command = vi.fn();
    render(<TeamMentionList command={command} items={team} />);

    expect(screen.getByText('human')).toBeInTheDocument();
    expect(screen.getByText('agent')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Scout'));
    expect(command).toHaveBeenCalledWith(team[1]);
  });

  it('supports keyboard selection', () => {
    const command = vi.fn();
    const ref = createRef<MentionListHandle>();
    render(<TeamMentionList command={command} items={team} ref={ref} />);

    pressKey(ref, 'ArrowDown');
    pressKey(ref, 'ArrowDown');
    pressKey(ref, 'Enter');

    expect(command).toHaveBeenCalledWith(team[0]);
  });
});

const characters = [
  {
    avatarIngredientId: 'img-1',
    handle: 'anna',
    hasReferenceImage: true,
    id: 'p1',
    label: 'Anna',
  },
  {
    avatarIngredientId: null,
    handle: 'ghost',
    hasReferenceImage: false,
    id: 'p2',
    label: 'Ghost',
  },
];

describe('CharacterMentionList', () => {
  it('renders an empty state without a team section', () => {
    render(<CharacterMentionList command={vi.fn()} items={[]} />);

    expect(screen.getByText('No characters found')).toBeInTheDocument();
    expect(screen.queryByText('No team members found')).not.toBeInTheDocument();
  });

  it('renders character labels and handles and invokes command on click', () => {
    const command = vi.fn();
    render(<CharacterMentionList command={command} items={characters} />);

    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('@anna')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ghost'));
    expect(command).toHaveBeenCalledWith(characters[1]);
  });

  it('supports keyboard selection', () => {
    const command = vi.fn();
    const ref = createRef<MentionListHandle>();
    render(
      <CharacterMentionList command={command} items={characters} ref={ref} />,
    );

    expect(pressKey(ref, 'ArrowDown')).toBe(true);
    expect(pressKey(ref, 'Enter')).toBe(true);
    expect(command).toHaveBeenCalledWith(characters[1]);
  });
});
