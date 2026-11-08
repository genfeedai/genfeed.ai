import type { CreatorPostGridProps } from '@props/content/creator.props';
import CreatorPostCard from './CreatorPostCard';

export default function CreatorPostGrid({
  handle,
  posts,
}: CreatorPostGridProps): React.ReactElement | null {
  if (posts.length === 0) {
    return null;
  }

  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {posts.map((post) => (
        <li key={post.id}>
          <CreatorPostCard handle={handle} post={post} />
        </li>
      ))}
    </ul>
  );
}
