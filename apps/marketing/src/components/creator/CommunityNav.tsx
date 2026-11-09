import type {
  CommunityNavProps,
  CommunitySection,
} from '@props/content/creator.props';
import Link from 'next/link';

const SECTIONS: ReadonlyArray<{
  href: string;
  label: string;
  section: CommunitySection;
}> = [
  { href: '/community', label: 'Discover', section: 'discover' },
  { href: '/community/creators', label: 'Creators', section: 'creators' },
  { href: '/community/videos', label: 'Videos', section: 'videos' },
  { href: '/community/images', label: 'Images', section: 'images' },
  { href: '/articles', label: 'Articles', section: 'articles' },
  { href: '/posts', label: 'Posts', section: 'posts' },
];

/** The community gallery's sections, as links to their own pages. */
export default function CommunityNav({
  active,
}: CommunityNavProps): React.ReactElement {
  return (
    <nav
      aria-label="Community"
      className="mb-12 flex gap-1 overflow-x-auto border-b border-foreground/10"
    >
      {SECTIONS.map(({ href, label, section }) => {
        const isActive = section === active;
        return (
          <Link
            aria-current={isActive ? 'page' : undefined}
            className={
              isActive
                ? '-mb-px shrink-0 border-b-2 border-primary px-3 py-2 text-sm font-medium text-foreground'
                : '-mb-px shrink-0 border-b-2 border-transparent px-3 py-2 text-sm text-foreground/60 hover:text-foreground'
            }
            href={href}
            key={section}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
