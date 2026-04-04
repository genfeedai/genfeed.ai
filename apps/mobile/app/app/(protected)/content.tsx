import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState, LoadingScreen } from '@/components/ScreenStates';
import { useIngredients } from '@/hooks/use-ingredients';
import type { Ingredient } from '@/services/api/ingredients.service';
import { formatRelativeDateVerbose } from '@/utils/format-date';

function SectionHeader({ label }: { label: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

interface MediaCardProps {
  item: Ingredient;
  category: 'video' | 'image';
  defaultTitle: string;
}

function MediaCard({
  item,
  category,
  defaultTitle,
}: MediaCardProps): ReactNode {
  const router = useRouter();
  const thumbnail =
    item.attributes.ingredientUrl || item.attributes.metadata?.thumbnailUrl;
  const title = item.attributes.metadata?.title || defaultTitle;
  const description = item.attributes.metadata?.description || '';
  const createdAt = formatRelativeDateVerbose(item.attributes.createdAt);
  const thumbnailStyle =
    category === 'video' ? styles.videoThumbnail : styles.squareThumbnail;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => router.push(`/ingredient/${item.id}?category=${category}`)}
    >
      {thumbnail ? (
        <Image
          source={{ uri: thumbnail }}
          style={thumbnailStyle}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
          placeholder={{ blurhash: 'LGF5]+Yk^6#M@-5c,FNH.Tt7R*WB' }}
        />
      ) : (
        <View style={[thumbnailStyle, styles.placeholder]} />
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardMeta}>{createdAt}</Text>
        {description ? (
          <Text style={styles.cardDescription}>{description}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function ArticleCard({ item }: { item: Ingredient }) {
  const router = useRouter();
  const title = item.attributes.metadata?.title || 'Untitled Article';
  const description = item.attributes.metadata?.description || '';
  const createdAt = formatRelativeDateVerbose(item.attributes.createdAt);
  const wordCount = item.attributes.metadata?.wordCount || 0;
  const readingTime =
    wordCount > 0 ? `${Math.ceil(wordCount / 200)} min read` : '';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.articleCard,
        pressed && styles.articleCardPressed,
      ]}
      onPress={() => router.push(`/ingredient/${item.id}?category=article`)}
    >
      {readingTime ? (
        <View style={styles.articleBadge}>
          <Text style={styles.articleBadgeText}>{readingTime}</Text>
        </View>
      ) : null}
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardMeta}>{createdAt}</Text>
      {description ? (
        <Text style={styles.cardDescription}>{description}</Text>
      ) : null}
    </Pressable>
  );
}

export default function Content() {
  const { ingredients: videos, isLoading: isLoadingVideos } = useIngredients({
    category: 'video',
    pageSize: 10,
  });
  const { ingredients: images, isLoading: isLoadingImages } = useIngredients({
    category: 'image',
    pageSize: 10,
  });
  const { ingredients: articles, isLoading: isLoadingArticles } =
    useIngredients({ category: 'article', pageSize: 10 });

  const isLoading = isLoadingVideos || isLoadingImages || isLoadingArticles;

  if (isLoading) {
    return <LoadingScreen message="Loading your content..." />;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      <View style={styles.hero}>
        <Text style={styles.heroKicker}>This week on Genfeed</Text>
        <Text style={styles.heroTitle}>
          Latest creations from your workspace
        </Text>
        <Text style={styles.heroSubtitle}>
          View your generated content and saved ideas.
        </Text>
      </View>

      {videos.length > 0 && (
        <View style={styles.section}>
          <SectionHeader label="Videos" />
          {videos.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              category="video"
              defaultTitle="Untitled Video"
            />
          ))}
        </View>
      )}

      {images.length > 0 && (
        <View style={styles.section}>
          <SectionHeader label="Images" />
          {images.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              category="image"
              defaultTitle="Untitled Image"
            />
          ))}
        </View>
      )}

      {articles.length > 0 && (
        <View style={styles.section}>
          <SectionHeader label="Articles" />
          {articles.map((item) => (
            <ArticleCard key={item.id} item={item} />
          ))}
        </View>
      )}

      {videos.length === 0 && images.length === 0 && articles.length === 0 && (
        <EmptyState
          title="No content yet"
          message="Your generated ingredients will appear here"
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  articleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#38bdf8',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  articleBadgeText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  articleCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    gap: 12,
    padding: 20,
  },
  articleCardPressed: {
    opacity: 0.8,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 16,
    padding: 16,
  },
  cardBody: {
    flex: 1,
    gap: 6,
  },
  cardDescription: {
    color: '#cbd5f5',
    fontSize: 14,
    lineHeight: 20,
  },
  cardMeta: {
    color: '#94a3b8',
    fontSize: 13,
  },
  cardPressed: {
    opacity: 0.8,
  },
  cardTitle: {
    color: 'white',
    fontSize: 17,
    fontWeight: '600',
  },
  container: {
    backgroundColor: '#0f172a',
    flex: 1,
  },
  contentContainer: {
    gap: 32,
    padding: 24,
    paddingBottom: 48,
  },
  hero: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    gap: 12,
    padding: 24,
  },
  heroKicker: {
    color: '#38bdf8',
    fontSize: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroSubtitle: {
    color: '#cbd5f5',
    fontSize: 15,
    lineHeight: 22,
  },
  heroTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: '600',
  },
  placeholder: {
    alignItems: 'center',
    backgroundColor: '#1e293b',
    justifyContent: 'center',
  },
  section: {
    gap: 16,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  squareThumbnail: {
    borderRadius: 12,
    height: 72,
    width: 72,
  },
  videoThumbnail: {
    borderRadius: 12,
    height: 72,
    width: 128,
  },
});
