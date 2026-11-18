import type {
  CommunityNavProps,
  CommunitySection,
} from '@props/content/creator.props';
import { UnderlineNav } from '@ui/primitives/underline-nav';

const SECTIONS: ReadonlyArray<{
  href: string;
  label: string;
  section: CommunitySection;
}> = [
  { href: '/community', label: 'Discover', section: 'discover' },
  { href: '/community/creators', label: 'Creators', section: 'creators' },
  { href: '/community/videos', label: 'Videos', section: 'videos' },
  { href: '/community/images', label: 'Images', section: 'images' },
  { href: '/community/articles', label: 'Articles', section: 'articles' },
  { href: '/posts', label: 'Posts', section: 'posts' },
];

/** The community gallery's sections, as links to their own pages. */
export default function CommunityNav({
  active,
}: CommunityNavProps): React.ReactElement {
  return (
    <div className="mb-12">
      <UnderlineNav
        ariaLabel="Community"
        items={SECTIONS.map(({ href, label, section }) => ({
          href,
          isActive: section === active,
          label,
        }))}
      />
    </div>
  );
}
