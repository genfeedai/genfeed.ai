import type { NativeThemeColors } from '@genfeedai/ui/semantic/mobile';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  EmptyState,
  ErrorScreen,
  LoadingScreen,
} from '@/components/ScreenStates';
import { borderRadius } from '@/constants';
import { useIngredients } from '@/hooks/use-ingredients';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type {
  LibraryCategory,
  LibraryItem,
} from '@/services/api/ingredients.service';
import { formatRelativeDateVerbose } from '@/utils/format-date';
import {
  libraryCreatedAt,
  libraryDescription,
  libraryMediaUrl,
  libraryTitle,
} from '@/utils/library-item';
import { recoverableErrorCopy } from '@/utils/request-error';

function SectionHeader({ label }: { label: string }) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

interface MediaCardProps {
  item: LibraryItem;
  category: LibraryCategory;
  defaultTitle: string;
}

function MediaCard({
  item,
  category,
  defaultTitle,
}: MediaCardProps): ReactNode {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const thumbnail = libraryMediaUrl(item);
  const title = libraryTitle(item, defaultTitle);
  const description = libraryDescription(item);
  const createdAt = formatRelativeDateVerbose(libraryCreatedAt(item));
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

export default function Content() {
  const styles = useThemedStyles(createStyles);
  const videosQuery = useIngredients({ category: 'video', limit: 10 });
  const imagesQuery = useIngredients({ category: 'image', limit: 10 });
  const isLoading = videosQuery.isLoading || imagesQuery.isLoading;
  const loadError = videosQuery.error ?? imagesQuery.error;

  if (isLoading) {
    return <LoadingScreen message="Loading your content..." />;
  }

  if (loadError) {
    const copy = recoverableErrorCopy(loadError);
    return (
      <ErrorScreen
        message={copy.message}
        subMessage={copy.subMessage}
        onRetry={() => {
          void videosQuery.refetch();
          void imagesQuery.refetch();
        }}
      />
    );
  }

  const videos = videosQuery.ingredients;
  const images = imagesQuery.ingredients;

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
          View your generated images and videos.
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

      {videos.length === 0 && images.length === 0 && (
        <EmptyState
          title="No content yet"
          message="Your generated ingredients will appear here"
        />
      )}
    </ScrollView>
  );
}

const createStyles = (colors: NativeThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.bgTertiary,
      borderRadius: borderRadius.xxxl,
      flexDirection: 'row',
      gap: 16,
      padding: 16,
    },
    cardBody: {
      flex: 1,
      gap: 6,
    },
    cardDescription: {
      color: colors.textPrimary,
      fontSize: 14,
      lineHeight: 20,
    },
    cardMeta: {
      color: colors.textMuted,
      fontSize: 13,
    },
    cardPressed: {
      opacity: 0.8,
    },
    cardTitle: {
      color: colors.textPrimary,
      fontSize: 17,
      fontWeight: '600',
    },
    container: {
      backgroundColor: colors.bgSecondary,
      flex: 1,
    },
    contentContainer: {
      gap: 32,
      padding: 24,
      paddingBottom: 48,
    },
    hero: {
      backgroundColor: colors.bgTertiary,
      borderRadius: borderRadius.xxxl,
      gap: 12,
      padding: 24,
    },
    heroKicker: {
      color: colors.agent,
      fontSize: 14,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    heroSubtitle: {
      color: colors.textPrimary,
      fontSize: 15,
      lineHeight: 22,
    },
    heroTitle: {
      color: colors.textPrimary,
      fontSize: 24,
      fontWeight: '600',
    },
    placeholder: {
      alignItems: 'center',
      backgroundColor: colors.bgTertiary,
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
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: '600',
    },
    squareThumbnail: {
      borderRadius: borderRadius.xxl,
      height: 72,
      width: 72,
    },
    videoThumbnail: {
      borderRadius: borderRadius.xxl,
      height: 72,
      width: 128,
    },
  });
