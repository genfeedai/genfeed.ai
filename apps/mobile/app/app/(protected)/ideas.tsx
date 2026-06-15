import { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { EmptyState, ErrorScreen } from '@/components/ScreenStates';
import { colors } from '@/constants';
import { useIdeaActions, useIdeas } from '@/hooks/use-ideas';
import type { Idea } from '@/services/api/ideas.service';
import { formatRelativeDateVerbose } from '@/utils/format-date';

export default function Ideas() {
  const { ideas, isLoading, isRefreshing, error, refresh } = useIdeas();
  const { create, update, remove, isSubmitting } = useIdeaActions();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newIdeaText, setNewIdeaText] = useState('');
  const [editingIdea, setEditingIdea] = useState<Idea | null>(null);

  const handleSaveIdea = async () => {
    if (!newIdeaText.trim()) {
      Alert.alert('Error', 'Please enter an idea');
      return;
    }

    if (editingIdea) {
      const result = await update(editingIdea.id, { text: newIdeaText.trim() });
      if (result) {
        refresh();
      } else {
        Alert.alert('Error', 'Failed to update idea');
      }
    } else {
      const result = await create({ text: newIdeaText.trim() });
      if (result) {
        refresh();
      } else {
        Alert.alert('Error', 'Failed to save idea');
      }
    }

    setNewIdeaText('');
    setEditingIdea(null);
    setIsModalVisible(false);
  };

  const handleEdit = (idea: Idea) => {
    setEditingIdea(idea);
    setNewIdeaText(idea.attributes.text);
    setIsModalVisible(true);
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Idea', 'Are you sure you want to delete this idea?', [
      { style: 'cancel', text: 'Cancel' },
      {
        onPress: async () => {
          const success = await remove(id);
          if (success) {
            refresh();
          } else {
            Alert.alert('Error', 'Failed to delete idea');
          }
        },
        style: 'destructive',
        text: 'Delete',
      },
    ]);
  };

  const handleCancel = () => {
    setNewIdeaText('');
    setEditingIdea(null);
    setIsModalVisible(false);
  };

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={isRefreshing}
        onRefresh={refresh}
        tintColor={colors.agent}
      />
    ),
    [isRefreshing, refresh],
  );

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={refreshControl}
      >
        <View style={styles.header}>
          <Text style={styles.kicker}>Idea Lab</Text>
          <Text style={styles.title}>Save your creative ideas</Text>
          <Text style={styles.subtitle}>
            Capture ideas for future content generation. Ideas sync across all
            your devices.
          </Text>
        </View>

        <Pressable
          style={styles.addButton}
          onPress={() => setIsModalVisible(true)}
        >
          <Text style={styles.addButtonLabel}>+ Add New Idea</Text>
        </Pressable>

        {isLoading ? (
          <EmptyState title="Loading ideas..." />
        ) : error ? (
          <ErrorScreen
            message="Failed to load ideas"
            onRetry={refresh}
            retryLabel="Tap to retry"
          />
        ) : ideas.length === 0 ? (
          <EmptyState
            title="No ideas yet"
            message="Tap the button above to save your first idea"
          />
        ) : (
          <View style={styles.results}>
            {ideas.map((idea) => (
              <View key={idea.id} style={styles.ideaCard}>
                <Text style={styles.ideaText}>{idea.attributes.text}</Text>
                <View style={styles.ideaFooter}>
                  <Text style={styles.ideaDate}>
                    {formatRelativeDateVerbose(idea.attributes.createdAt)}
                  </Text>
                  <View style={styles.ideaActions}>
                    <Pressable
                      onPress={() => handleEdit(idea)}
                      style={styles.actionButton}
                    >
                      <Text style={styles.actionButtonText}>Edit</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleDelete(idea.id)}
                      style={[styles.actionButton, styles.deleteButton]}
                    >
                      <Text
                        style={[
                          styles.actionButtonText,
                          styles.deleteButtonText,
                        ]}
                      >
                        Delete
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={isModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCancel}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingIdea ? 'Edit Idea' : 'New Idea'}
            </Text>
            <TextInput
              value={newIdeaText}
              onChangeText={setNewIdeaText}
              placeholder="Enter your idea..."
              placeholderTextColor={colors.textSubtle}
              style={[styles.input, styles.inputMultiline]}
              multiline
              autoFocus
              editable={!isSubmitting}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={handleCancel}
                style={[styles.modalButton, styles.cancelButton]}
                disabled={isSubmitting}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveIdea}
                style={[
                  styles.modalButton,
                  styles.saveButton,
                  isSubmitting && styles.disabledButton,
                ]}
                disabled={isSubmitting}
              >
                <Text style={styles.saveButtonText}>
                  {isSubmitting ? 'Saving...' : 'Save'}
                </Text>
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
    backgroundColor: colors.bgTertiary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionButtonText: {
    color: colors.agent,
    fontSize: 12,
    fontWeight: '500',
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: colors.agent,
    borderRadius: 16,
    paddingVertical: 14,
  },
  addButtonLabel: {
    color: colors.bgSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: colors.bgTertiary,
  },
  cancelButtonText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '500',
  },
  container: {
    backgroundColor: colors.bgPrimary,
    flex: 1,
  },
  contentContainer: {
    gap: 24,
    padding: 24,
    paddingBottom: 64,
  },
  deleteButton: {
    backgroundColor: colors.transparent,
  },
  deleteButtonText: {
    color: colors.error,
  },
  disabledButton: {
    opacity: 0.6,
  },
  header: {
    gap: 12,
  },
  ideaActions: {
    flexDirection: 'row',
    gap: 8,
  },
  ideaCard: {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.bgTertiary,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  ideaDate: {
    color: colors.textMuted,
    fontSize: 12,
  },
  ideaFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  ideaText: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
  },
  input: {
    backgroundColor: colors.bgPrimary,
    borderColor: colors.bgTertiary,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.white,
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inputMultiline: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  kicker: {
    color: colors.agent,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
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
  modalContent: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 20,
    gap: 20,
    maxWidth: 500,
    padding: 24,
    width: '100%',
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: colors.overlayScrim,
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  modalTitle: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '600',
  },
  results: {
    gap: 12,
  },
  saveButton: {
    backgroundColor: colors.agent,
  },
  saveButtonText: {
    color: colors.bgSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  subtitle: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
  },
  title: {
    color: colors.white,
    fontSize: 26,
    fontWeight: '600',
  },
});
