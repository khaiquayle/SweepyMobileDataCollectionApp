import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

type Entry = {
  file?: string | null;
  cloudUrl?: string | null;
  description?: string;
  material?: string;
  size?: string;
  shape?: string;
  timestamp?: string;
};

export default function HistoryScreen() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = setInterval(() => {
      // poll to reflect new saves when user returns
      void loadEntries();
    }, 1500);
    void loadEntries();
    return () => clearInterval(unsubscribe as unknown as number);
  }, []);

  const loadEntries = async () => {
    try {
      const json = await AsyncStorage.getItem('entries');
      const list: Entry[] = json ? JSON.parse(json) : [];
      setEntries(list.reverse());
    } catch (e) {
      console.error(e);
      Alert.alert('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const playLocal = async (item: Entry) => {
    if (!item.file) return;
    const { sound } = await Audio.Sound.createAsync({ uri: item.file });
    await sound.playAsync();
  };


  const shareLocal = async (item: Entry) => {
    if (item.file && (await Sharing.isAvailableAsync())) {
      const metadata = `${item.description || 'Recording'}_${item.material}_${item.size}_${item.shape}`;
      const fileName = `${metadata}.m4a`;
      
      await Sharing.shareAsync(item.file, {
        mimeType: 'audio/m4a',
        dialogTitle: 'Share Recording',
        UTI: 'public.audio',
      });
    } else {
      Alert.alert('Sharing not available or file missing.');
    }
  };

  const deleteEntry = async (indexInView: number) => {
    try {
      const json = await AsyncStorage.getItem('entries');
      const list: Entry[] = json ? JSON.parse(json) : [];
      // We reversed on load; map back to original index
      const originalIndex = list.length - 1 - indexInView;
      const toDelete = list[originalIndex];
      const updated = list.filter((_, i) => i !== originalIndex);
      await AsyncStorage.setItem('entries', JSON.stringify(updated));
      setEntries((prev) => prev.filter((_, i) => i !== indexInView));
      if (toDelete?.file) {
        try { await FileSystem.deleteAsync(toDelete.file, { idempotent: true }); } catch {}
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Failed to delete');
    }
  };

  const renderRightActions = (index: number) => (
    <TouchableOpacity style={styles.deleteAction} onPress={() => void deleteEntry(index)}>
      <Text style={styles.deleteText}>Delete</Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item, index }: { item: Entry; index: number }) => (
    <Swipeable renderRightActions={() => renderRightActions(index)}>
      <View style={styles.card}>
        <Text style={styles.title}>{item.description || `Recording ${entries.length - index}`}</Text>
        <Text style={styles.meta}>{item.material} • {item.size} • {item.shape}</Text>
        <Text style={styles.time}>{item.timestamp}</Text>
        <View style={styles.row}>
          <TouchableOpacity style={[styles.button, styles.play]} onPress={() => void playLocal(item)} disabled={!item.file}>
            <Text style={styles.buttonText}>Play</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.share]} onPress={() => void shareLocal(item)} disabled={!item.file}>
            <Text style={styles.buttonText}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Swipeable>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>History</Text>
      <FlatList
        data={entries}
        refreshing={loading}
        onRefresh={() => void loadEntries()}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderItem}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>No entries yet.</Text> : null}
        contentContainerStyle={entries.length === 0 ? styles.emptyContainer : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#1a1a2e',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    color: 'white',
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    color: '#ccc',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  meta: {
    marginTop: 6,
    color: '#555',
  },
  time: {
    marginTop: 4,
    color: '#777',
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  button: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  play: { backgroundColor: '#007AFF' },
  share: { backgroundColor: '#5856D6' },
  buttonText: { color: 'white', fontWeight: '700' },
  deleteAction: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
    borderRadius: 10,
    marginBottom: 12,
  },
  deleteText: {
    color: 'white',
    fontWeight: '700',
  },
});


