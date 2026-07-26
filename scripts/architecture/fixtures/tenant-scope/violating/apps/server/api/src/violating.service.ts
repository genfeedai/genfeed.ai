export async function listUnscopedPosts(prisma: {
  post: {
    findMany: (args: unknown) => Promise<unknown>;
  };
}): Promise<unknown> {
  return prisma.post.findMany({
    where: {
      id: 'post-1',
    },
  });
}
