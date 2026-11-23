import type { CreatorWallProps } from '@props/content/creator.props';
import CreatorWallTile from './CreatorWallTile';

/** Every post across the creator's socials, newest first, as one grid. */
export default function CreatorWall({
  brand,
  handle,
  posts,
}: CreatorWallProps): React.ReactElement | null {
  if (posts.length === 0) {
    return null;
  }

  return (
    <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
      {posts.map((post) => (
        <li key={post.id}>
          <CreatorWallTile brand={brand} handle={handle} post={post} />
        </li>
      ))}
    </ul>
  );
}
