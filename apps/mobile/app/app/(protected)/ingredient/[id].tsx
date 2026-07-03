import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ErrorScreen, LoadingScreen } from '@/components/ScreenStates';
import { borderRadius, colors } from '@/constants';
import { useIngredient } from '@/hooks/use-ingredients';
import { formatFullDate } from '@/utils/format-date';

export default function IngredientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ingredient, isLoading, error } = useIngredient(id || null);

  if (isLoading) {
    return <LoadingScreen message="Loading ingredient..." />;
  }

  if (error || !ingredient) {
    return (
      <ErrorScreen
        message="Failed to load ingredient"
        subMessage={error?.message || 'Ingredient not found'}
      />
    );
  }

  const attrs = ingredient.attributes;
  const metadata = attrs.metadata || {};
  const thumbnail = attrs.ingredientUrl || metadata.thumbnailUrl;
  const title = metadata.title || 'Untitled';
  const description = metadata.description || '';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {thumbnail && (
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: thumbnail }}
            style={styles.image}
            contentFit="contain"
          />
        </View>
      )}

      <View style={styles.infoSection}>
        <Text style={styles.categoryBadge}>{attrs.category.toUpperCase()}</Text>
        <Text style={styles.title}>{title}</Text>
        {description ? (
          <Text style={styles.description}>{description}</Text>
        ) : null}

        <View style={styles.metaSection}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Status:</Text>
            <Text style={styles.metaValue}>{attrs.status}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Created:</Text>
            <Text style={styles.metaValue}>
              {formatFullDate(attrs.createdAt)}
            </Text>
          </View>
          {attrs.updatedAt !== attrs.createdAt && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Updated:</Text>
              <Text style={styles.metaValue}>
                {formatFullDate(attrs.updatedAt)}
              </Text>
            </View>
          )}
          {Number(metadata.width) > 0 && Number(metadata.height) > 0 && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Dimensions:</Text>
              <Text style={styles.metaValue}>
                {metadata.width} × {metadata.height}
              </Text>
            </View>
          )}
          {Number(metadata.duration) > 0 && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Duration:</Text>
              <Text style={styles.metaValue}>{metadata.duration}s</Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.agent,
    borderRadius: borderRadius.full,
    color: colors.bgSecondary,
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    textTransform: 'uppercase',
  },
  container: {
    backgroundColor: colors.bgSecondary,
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 48,
  },
  description: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  imageContainer: {
    alignItems: 'center',
    aspectRatio: 16 / 9,
    backgroundColor: colors.bgTertiary,
    justifyContent: 'center',
    width: '100%',
  },
  infoSection: {
    gap: 16,
    padding: 24,
  },
  metaLabel: {
    color: colors.textMuted,
    fontSize: 14,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaSection: {
    borderTopColor: colors.bgTertiary,
    borderTopWidth: 1,
    gap: 12,
    marginTop: 8,
    paddingTop: 16,
  },
  metaValue: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
  },
  title: {
    color: colors.white,
    fontSize: 24,
    fontWeight: '600',
  },
});
