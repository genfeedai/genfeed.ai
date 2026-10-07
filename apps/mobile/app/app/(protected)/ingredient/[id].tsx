import type { NativeThemeColors } from '@genfeedai/ui/semantic/mobile';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ErrorScreen, LoadingScreen } from '@/components/ScreenStates';
import { borderRadius } from '@/constants';
import { useIngredient } from '@/hooks/use-ingredients';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { DetailCategory } from '@/services/api/ingredients.service';
import { formatFullDate } from '@/utils/format-date';
import {
  libraryCreatedAt,
  libraryDescription,
  libraryDimensions,
  libraryDuration,
  libraryMediaUrl,
  libraryTitle,
} from '@/utils/library-item';
import { recoverableErrorCopy } from '@/utils/request-error';

function readParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.trim() !== '' ? raw : null;
}

function readCategory(
  value: string | string[] | undefined,
): DetailCategory | null {
  const raw = readParam(value);
  if (raw === 'image' || raw === 'video' || raw === 'article') {
    return raw;
  }

  return null;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

export default function IngredientDetail() {
  const styles = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{
    category?: string | string[];
    id: string | string[];
  }>();
  const id = readParam(params.id);
  const category = readCategory(params.category);
  const { detail, isLoading, error } = useIngredient(id, category);

  if (isLoading) {
    return <LoadingScreen message="Loading ingredient..." />;
  }

  if (error || !detail) {
    const copy = error
      ? recoverableErrorCopy(error)
      : {
          message: 'Not found',
          subMessage: 'That record was not found.',
        };

    return <ErrorScreen message={copy.message} subMessage={copy.subMessage} />;
  }

  if (detail.kind === 'article') {
    const item = detail.item;
    const createdAt = libraryCreatedAt(item);
    const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : '';
    const cover =
      typeof item.coverImageUrl === 'string' && item.coverImageUrl !== ''
        ? item.coverImageUrl
        : null;

    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
      >
        {cover ? (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: cover }}
              style={styles.image}
              contentFit="cover"
            />
          </View>
        ) : null}
        <View style={styles.infoSection}>
          <Text style={styles.categoryBadge}>Article</Text>
          <Text style={styles.title}>{item.label || 'Untitled'}</Text>
          {item.summary ? (
            <Text style={styles.description}>{item.summary}</Text>
          ) : null}
          <View style={styles.metaSection}>
            {item.status ? (
              <MetaRow label="Status:" value={String(item.status)} />
            ) : null}
            {createdAt ? (
              <MetaRow label="Created:" value={formatFullDate(createdAt)} />
            ) : null}
            {updatedAt && updatedAt !== createdAt ? (
              <MetaRow label="Updated:" value={formatFullDate(updatedAt)} />
            ) : null}
            {typeof item.wordCount === 'number' && item.wordCount > 0 ? (
              <MetaRow label="Words:" value={String(item.wordCount)} />
            ) : null}
            {typeof item.readingTime === 'number' && item.readingTime > 0 ? (
              <MetaRow
                label="Reading time:"
                value={`${item.readingTime} min`}
              />
            ) : null}
          </View>
        </View>
      </ScrollView>
    );
  }

  const item = detail.item;
  const thumbnail = libraryMediaUrl(item);
  const createdAt = libraryCreatedAt(item);
  const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : '';
  const description = libraryDescription(item);
  const dimensions = libraryDimensions(item);
  const duration = libraryDuration(item);
  const badge = category === 'video' ? 'Video' : 'Image';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {thumbnail ? (
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: thumbnail }}
            style={styles.image}
            contentFit="contain"
          />
        </View>
      ) : null}
      <View style={styles.infoSection}>
        <Text style={styles.categoryBadge}>{badge}</Text>
        <Text style={styles.title}>{libraryTitle(item, 'Untitled')}</Text>
        {description ? (
          <Text style={styles.description}>{description}</Text>
        ) : null}
        <View style={styles.metaSection}>
          {item.status ? (
            <MetaRow label="Status:" value={String(item.status)} />
          ) : null}
          {createdAt ? (
            <MetaRow label="Created:" value={formatFullDate(createdAt)} />
          ) : null}
          {updatedAt && updatedAt !== createdAt ? (
            <MetaRow label="Updated:" value={formatFullDate(updatedAt)} />
          ) : null}
          {dimensions ? (
            <MetaRow
              label="Dimensions:"
              value={`${dimensions.width} × ${dimensions.height}`}
            />
          ) : null}
          {duration ? (
            <MetaRow label="Duration:" value={`${duration}s`} />
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: NativeThemeColors) =>
  StyleSheet.create({
    categoryBadge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.agent,
      borderRadius: borderRadius.full,
      color: colors.agentForeground,
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
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '500',
    },
    title: {
      color: colors.textPrimary,
      fontSize: 24,
      fontWeight: '600',
    },
  });
