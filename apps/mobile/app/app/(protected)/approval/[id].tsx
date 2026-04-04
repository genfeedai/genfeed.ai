import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ErrorScreen, LoadingScreen } from '@/components/ScreenStates';
import { CONTENT_TYPE_LABELS } from '@/constants';
import { useApproval, useApprovalActions } from '@/hooks/use-approvals';
import { formatShortDate } from '@/utils/format-date';

export default function ApprovalDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { approval, isLoading, error } = useApproval(id || null);
  const { approve, reject, isSubmitting } = useApprovalActions();

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const handleApprove = () => {
    if (!id) {
      return;
    }

    Alert.alert(
      'Approve Content',
      'Are you sure you want to approve this content?',
      [
        { style: 'cancel', text: 'Cancel' },
        {
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            const success = await approve(id);
            if (success) {
              router.back();
            } else {
              Alert.alert(
                'Error',
                'Failed to approve content. Please try again.',
              );
            }
          },
          text: 'Approve',
        },
      ],
    );
  };

  const handleReject = async () => {
    if (!id || !rejectionReason.trim()) {
      Alert.alert('Error', 'Please provide a reason for rejection');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const success = await reject(id, rejectionReason.trim());
    if (success) {
      setShowRejectModal(false);
      router.back();
    } else {
      Alert.alert('Error', 'Failed to reject content. Please try again.');
    }
  };

  if (isLoading) {
    return <LoadingScreen message="Loading approval details..." />;
  }

  if (error || !approval) {
    return (
      <ErrorScreen
        message="Failed to load approval"
        onRetry={() => router.back()}
        retryLabel="Go Back"
      />
    );
  }

  const { attributes } = approval;

  return (
    <>
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: '#0f172a' },
          headerTintColor: '#f8fafc',
          title: 'Review',
        }}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
      >
        {attributes.thumbnailUrl && (
          <Image
            source={{ uri: attributes.thumbnailUrl }}
            style={styles.preview}
            contentFit="cover"
            transition={300}
            cachePolicy="memory-disk"
            placeholder={{ blurhash: 'LGF5]+Yk^6#M@-5c,FNH.Tt7R*WB' }}
          />
        )}

        <View style={styles.content}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {CONTENT_TYPE_LABELS[attributes.contentType]}
            </Text>
          </View>

          <Text style={styles.title}>{attributes.title}</Text>

          {attributes.description && (
            <Text style={styles.description}>{attributes.description}</Text>
          )}

          <View style={styles.metadata}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Requested by</Text>
              <Text style={styles.metaValue}>
                {attributes.requestedBy.name}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Email</Text>
              <Text style={styles.metaValue}>
                {attributes.requestedBy.email}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Submitted</Text>
              <Text style={styles.metaValue}>
                {formatShortDate(attributes.createdAt)}
              </Text>
            </View>
            {attributes.scheduledAt && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Scheduled for</Text>
                <Text style={styles.metaValue}>
                  {formatShortDate(attributes.scheduledAt)}
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            styles.rejectButton,
            pressed && styles.actionButtonPressed,
          ]}
          onPress={() => setShowRejectModal(true)}
          disabled={isSubmitting}
        >
          <Text style={styles.rejectButtonText}>Reject</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            styles.approveButton,
            pressed && styles.approveButtonPressed,
          ]}
          onPress={handleApprove}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#0f172a" />
          ) : (
            <Text style={styles.approveButtonText}>Approve</Text>
          )}
        </Pressable>
      </View>

      <Modal
        visible={showRejectModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRejectModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reject Content</Text>
            <Text style={styles.modalSubtitle}>
              Please provide a reason for rejection. This will be shared with
              the content creator.
            </Text>
            <TextInput
              value={rejectionReason}
              onChangeText={setRejectionReason}
              placeholder="Enter rejection reason..."
              placeholderTextColor="#64748b"
              style={styles.input}
              multiline
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.modalButton,
                  styles.cancelButton,
                  pressed && styles.modalButtonPressed,
                ]}
                onPress={() => {
                  setShowRejectModal(false);
                  setRejectionReason('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.modalButton,
                  styles.confirmRejectButton,
                  pressed && styles.confirmRejectButtonPressed,
                ]}
                onPress={handleReject}
                disabled={isSubmitting || !rejectionReason.trim()}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.confirmRejectButtonText}>Reject</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    paddingVertical: 16,
  },
  actionButtonPressed: {
    opacity: 0.8,
  },
  actions: {
    backgroundColor: '#020617',
    borderTopColor: '#1e293b',
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    gap: 16,
    left: 0,
    padding: 24,
    paddingBottom: 40,
    position: 'absolute',
    right: 0,
  },
  approveButton: {
    backgroundColor: '#22c55e',
  },
  approveButtonPressed: {
    opacity: 0.8,
  },
  approveButtonText: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '600',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  cancelButton: {
    backgroundColor: '#1e293b',
  },
  cancelButtonText: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '500',
  },
  confirmRejectButton: {
    backgroundColor: '#ef4444',
  },
  confirmRejectButtonPressed: {
    opacity: 0.8,
  },
  confirmRejectButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  container: {
    backgroundColor: '#020617',
    flex: 1,
  },
  content: {
    gap: 16,
    padding: 24,
  },
  contentContainer: {
    paddingBottom: 120,
  },
  description: {
    color: '#cbd5f5',
    fontSize: 15,
    lineHeight: 24,
  },
  input: {
    backgroundColor: '#020617',
    borderColor: '#1e293b',
    borderRadius: 14,
    borderWidth: 1,
    color: 'white',
    fontSize: 15,
    minHeight: 100,
    paddingHorizontal: 16,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
  metadata: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    gap: 12,
    marginTop: 8,
    padding: 16,
  },
  metaLabel: {
    color: '#64748b',
    fontSize: 14,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaValue: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  modalButton: {
    alignItems: 'center',
    borderRadius: 12,
    minWidth: 80,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  modalButtonPressed: {
    opacity: 0.8,
  },
  modalContent: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    gap: 16,
    maxWidth: 500,
    padding: 24,
    width: '100%',
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  modalSubtitle: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
  },
  modalTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '600',
  },
  preview: {
    aspectRatio: 16 / 9,
    backgroundColor: '#1e293b',
    width: '100%',
  },
  rejectButton: {
    backgroundColor: 'transparent',
    borderColor: '#ef4444',
    borderWidth: 2,
  },
  rejectButtonText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: 'white',
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 32,
  },
});
