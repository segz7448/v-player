import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import {
  LibraryEntry,
  clearHistory,
  getFavorites,
  getHistory,
  removeFavorite,
  removeHistoryEntry,
} from '@/utils/library';
import { resolveLink } from '@/utils/linkResolver';

type Props = NativeStackScreenProps<RootStackParamList, 'Library'>;
type Tab = 'favorites' | 'history';

function formatDuration(sec?: number): string | undefined {
  if (!sec || sec < 1) return undefined;
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  return `Resume at ${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function LibraryScreen({ navigation }: Props) {
  const [tab, setTab] = useState<Tab>('favorites');
  const [favorites, setFavorites] = useState<LibraryEntry[]>([]);
  const [history, setHistory] = useState<LibraryEntry[]>([]);

  const loadAll = useCallback(async () => {
    const [favs, hist] = await Promise.all([getFavorites(), getHistory()]);
    setFavorites(favs);
    setHistory(hist);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  function handlePlay(entry: LibraryEntry) {
    const resolved = resolveLink(entry.uri);
    if (!resolved.isValid) {
      Alert.alert('Invalid link', 'This saved link no longer looks valid.');
      return;
    }
    navigation.navigate('Player', {
      source: resolved,
      resumeAtSec: entry.lastPositionSec,
    });
  }

  async function handleRemove(entry: LibraryEntry) {
    if (tab === 'favorites') {
      const updated = await removeFavorite(entry.id);
      setFavorites(updated);
    } else {
      const updated = await removeHistoryEntry(entry.id);
      setHistory(updated);
    }
  }

  function handleClearHistory() {
    Alert.alert('Clear history?', 'This removes all recently played entries.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearHistory();
          setHistory([]);
        },
      },
    ]);
  }

  const data = tab === 'favorites' ? favorites : history;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Library</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabButton, tab === 'favorites' && styles.tabButtonActive]}
          onPress={() => setTab('favorites')}
        >
          <Text style={[styles.tabText, tab === 'favorites' && styles.tabTextActive]}>
            Favorites
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, tab === 'history' && styles.tabButtonActive]}
          onPress={() => setTab('history')}
        >
          <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>
            Recently played
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'history' && history.length > 0 && (
        <TouchableOpacity style={styles.clearButton} onPress={handleClearHistory}>
          <Text style={styles.clearButtonText}>Clear history</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {tab === 'favorites'
              ? 'No favorites yet. Tap the star while playing a video to save it here.'
              : 'Nothing played yet.'}
          </Text>
        }
        renderItem={({ item }) => {
          const resumeLabel = formatDuration(item.lastPositionSec);
          return (
            <TouchableOpacity style={styles.row} onPress={() => handlePlay(item)}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>
                  {item.type.toUpperCase()}
                  {resumeLabel ? ` \u00b7 ${resumeLabel}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => handleRemove(item)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.removeButtonText}>Remove</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B0B0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backLink: {
    color: '#4C6FFF',
    fontSize: 15,
    fontWeight: '600',
    width: 40,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1C1C24',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A35',
  },
  tabButtonActive: {
    backgroundColor: '#4C6FFF',
    borderColor: '#4C6FFF',
  },
  tabText: {
    color: '#B8B8C2',
    fontWeight: '600',
    fontSize: 13,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  clearButton: {
    alignSelf: 'flex-end',
    marginRight: 16,
    marginBottom: 8,
  },
  clearButtonText: {
    color: '#FF6B6B',
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  emptyText: {
    color: '#6B6B76',
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 24,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C24',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A2A35',
  },
  rowText: {
    flex: 1,
    marginRight: 8,
  },
  rowTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  rowSubtitle: {
    color: '#8A8A94',
    fontSize: 12,
  },
  removeButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  removeButtonText: {
    color: '#FF6B6B',
    fontSize: 12,
    fontWeight: '600',
  },
});
