import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { EmptyState, LoadingScreen } from '@/components/ScreenStates';
import { CONTENT_TYPE_LABELS } from '@/constants';
import {
  useApprovalActions,
  useApprovals,
  usePendingApprovalCount,
} from '@/hooks/use-approvals';
import type { Approval, ContentType } from '@/services/api/approvals.service';
import { formatRelativeDate } from '@/utils/format-date';

interface FilterChipProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
}

function FilterChip({ label, isActive, onPress }: FilterChipProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.filterChip,
        isActive && styles.filterChipActive,
        pressed && styles.filterChipPressed,
      ]}
      onPress={onPress}
    >
      <Text
        style={[styles.filterChipText, isActive && styles.filterChipTextActive]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

interface ApprovalCardProps {
  approval: Approval;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onPress: (id: string) => void;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  selectionMode: boolean;
}

function ApprovalCard({
  approval,
  onApprove,
  onReject,
  onPress,
  isSelected,
  onToggleSelect,
  selectionMode,
}: ApprovalCardProps) {
  const { attributes } = approval;

  const renderLeftActions = () => (
    <Pressable
      style={({ pressed }) => [
        styles.swipeAction,
        styles.approveAction,
        pressed && styles.swipeActionPressed,
      ]}
      onPress={() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onApprove(approval.id);
      }}
    >
      <Text style={styles.swipeActionText}>Approve</Text>
    </Pressable>
  );

  const renderRightActions = () => (
    <Pressable
      style={({ pressed }) => [
        styles.swipeAction,
        styles.rejectAction,
        pressed && styles.swipeActionPressed,
      ]}
      onPress={() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        onReject(approval.id);
      }}
    >
      <Text style={styles.swipeActionText}>Reject</Text>
    </Pressable>
  );

  const cardContent = (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        isSelected && styles.cardSelected,
        pressed && styles.cardPressed,
      ]}
      onPress={() =>
        selectionMode ? onToggleSelect(approval.id) : onPress(approval.id)
      }
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onToggleSelect(approval.id);
      }}
    >
      {selectionMode && (
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Text style={styles.checkmark}>✓</Text>}
        </View>
      )}
      {attributes.thumbnailUrl ? (
        <Image
          source={{ uri: attributes.thumbnailUrl }}
          style={styles.thumbnail}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
          placeholder={{ blurhash: 'LGF5]+Yk^6#M@-5c,FNH.Tt7R*WB' }}
        />
      ) : (
        <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
          <Text style={styles.thumbnailPlaceholderText}>
            {CONTENT_TYPE_LABELS[attributes.contentType].charAt(0)}
          </Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {CONTENT_TYPE_LABELS[attributes.contentType]}
            </Text>
          </View>
          <Text style={styles.cardDate}>
            {formatRelativeDate(attributes.createdAt)}
          </Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {attributes.title}
        </Text>
        {attributes.description && (
          <Text style={styles.cardDescription} numberOfLines={1}>
            {attributes.description}
          </Text>
        )}
        <Text style={styles.requestedBy}>
          Requested by {attributes.requestedBy.name}
        </Text>
      </View>
    </Pressable>
  );

  if (selectionMode) {
    return cardContent;
  }

  return (
    <Swipeable
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      overshootLeft={false}
      overshootRight={false}
    >
      {cardContent}
    </Swipeable>
  );
}

export default function Approvals() {
  const router = useRouter();
  const [filter, setFilter] = useState<ContentType | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { approvals, isLoading, isRefreshing, refresh } = useApprovals({
    contentType: filter || undefined,
    status: 'pending',
  });

  const { approve, reject, bulkApprove, isSubmitting } = useApprovalActions();
  const { count: pendingCount, refetch: refetchCount } =
    usePendingApprovalCount();

  const selectionMode = selectedIds.size > 0;

  const handleApprove = useCallback(
    async (id: string) => {
      const success = await approve(id);
      if (success) {
        refresh();
        refetchCount();
      }
    },
    [approve, refresh, refetchCount],
  );

  const handleReject = useCallback(
    (id: string) => {
      Alert.prompt(
        'Reject Content',
        'Please provide a reason for rejection:',
        async (reason) => {
          if (reason?.trim()) {
            const success = await reject(id, reason.trim());
            if (success) {
              refresh();
              refetchCount();
            }
          }
        },
        'plain-text',
      );
    },
    [refresh, refetchCount, reject],
  );

  const handlePress = useCallback(
    (id: string) => {
      router.push(`/approval/${id}`);
    },
    [router],
  );

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleBulkApprove = () => {
    if (selectedIds.size === 0) {
      return;
    }

    Alert.alert(
      'Bulk Approve',
      `Approve ${selectedIds.size} selected item${selectedIds.size > 1 ? 's' : ''}?`,
      [
        { style: 'cancel', text: 'Cancel' },
        {
          onPress: async () => {
            const result = await bulkApprove(Array.from(selectedIds));
            if (result) {
              setSelectedIds(new Set());
              refresh();
              refetchCount();
              Alert.alert(
                'Success',
                `${result.approved} item${result.approved !== 1 ? 's' : ''} approved`,
              );
            }
          },
          text: 'Approve All',
        },
      ],
    );
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const keyExtractor = useCallback((item: Approval) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: Approval }) => (
      <ApprovalCard
        approval={item}
        onApprove={handleApprove}
        onReject={handleReject}
        onPress={handlePress}
        isSelected={selectedIds.has(item.id)}
        onToggleSelect={handleToggleSelect}
        selectionMode={selectionMode}
      />
    ),
    [
      handleApprove,
      handleReject,
      handlePress,
      handleToggleSelect,
      selectedIds,
      selectionMode,
    ],
  );

  if (isLoading) {
    return <LoadingScreen message="Loading approvals..." />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Approval Queue</Text>
        <Text style={styles.title}>
          {pendingCount} pending {pendingCount === 1 ? 'item' : 'items'}
        </Text>
        <Text style={styles.subtitle}>
          Swipe right to approve, left to reject
        </Text>
      </View>

      <View style={styles.filters}>
        <FilterChip
          label="All"
          isActive={filter === null}
          onPress={() => setFilter(null)}
        />
        <FilterChip
          label="Images"
          isActive={filter === 'image'}
          onPress={() => setFilter('image')}
        />
        <FilterChip
          label="Videos"
          isActive={filter === 'video'}
          onPress={() => setFilter('video')}
        />
        <FilterChip
          label="Articles"
          isActive={filter === 'article'}
          onPress={() => setFilter('article')}
        />
      </View>

      {selectionMode && (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionText}>{selectedIds.size} selected</Text>
          <View style={styles.selectionActions}>
            <Pressable
              style={({ pressed }) => [
                styles.selectionButton,
                pressed && styles.selectionButtonPressed,
              ]}
              onPress={handleClearSelection}
            >
              <Text style={styles.selectionButtonText}>Clear</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.selectionButton,
                styles.approveButton,
                pressed && styles.approveButtonPressed,
              ]}
              onPress={handleBulkApprove}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#0f172a" />
              ) : (
                <Text style={styles.approveButtonText}>Approve All</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {approvals.length === 0 ? (
        <EmptyState
          emoji="🎉"
          title="All caught up!"
          message="No pending approvals at the moment"
        />
      ) : (
        <FlashList
          data={approvals}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor="#38bdf8"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  approveAction: {
    backgroundColor: '#22c55e',
  },
  approveButton: {
    backgroundColor: '#22c55e',
  },
  approveButtonPressed: {
    opacity: 0.8,
  },
  approveButtonText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '600',
  },
  badge: {
    backgroundColor: '#1e293b',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    padding: 16,
  },
  cardBody: {
    flex: 1,
    gap: 6,
  },
  cardDate: {
    color: '#64748b',
    fontSize: 12,
  },
  cardDescription: {
    color: '#94a3b8',
    fontSize: 13,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardPressed: {
    opacity: 0.8,
  },
  cardSelected: {
    backgroundColor: '#1e293b',
    borderColor: '#38bdf8',
  },
  cardTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  checkbox: {
    alignItems: 'center',
    borderColor: '#475569',
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  checkboxSelected: {
    backgroundColor: '#38bdf8',
    borderColor: '#38bdf8',
  },
  checkmark: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: 'bold',
  },
  container: {
    backgroundColor: '#020617',
    flex: 1,
  },
  filterChip: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: '#38bdf8',
  },
  filterChipPressed: {
    opacity: 0.8,
  },
  filterChipText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#0f172a',
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 16,
    paddingHorizontal: 24,
  },
  header: {
    gap: 8,
    padding: 24,
    paddingBottom: 16,
  },
  kicker: {
    color: '#38bdf8',
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  listContent: {
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  rejectAction: {
    backgroundColor: '#ef4444',
  },
  requestedBy: {
    color: '#64748b',
    fontSize: 12,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: 12,
  },
  selectionBar: {
    alignItems: 'center',
    backgroundColor: '#1e293b',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  selectionButton: {
    backgroundColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  selectionButtonPressed: {
    opacity: 0.8,
  },
  selectionButtonText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
  },
  selectionText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 14,
  },
  swipeAction: {
    alignItems: 'center',
    borderRadius: 16,
    justifyContent: 'center',
    marginBottom: 12,
    width: 80,
  },
  swipeActionPressed: {
    opacity: 0.8,
  },
  swipeActionText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  thumbnail: {
    borderRadius: 12,
    height: 64,
    width: 64,
  },
  thumbnailPlaceholder: {
    alignItems: 'center',
    backgroundColor: '#1e293b',
    justifyContent: 'center',
  },
  thumbnailPlaceholderText: {
    color: '#475569',
    fontSize: 24,
    fontWeight: 'bold',
  },
  title: {
    color: 'white',
    fontSize: 26,
    fontWeight: '600',
  },
});
