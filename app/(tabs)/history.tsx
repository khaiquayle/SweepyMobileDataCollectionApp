import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

type Entry = {
  file?: string | null;
  fileName?: string;
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
    
    // Set audio mode for playback
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    });
    
    const { sound } = await Audio.Sound.createAsync({ uri: item.file });
    await sound.setVolumeAsync(1.0); // Set volume to maximum
    await sound.playAsync();
  };


  const shareLocal = async (item: Entry) => {
    if (item.file && (await Sharing.isAvailableAsync())) {
      // Use stored fileName or generate one from metadata
      const fileName = item.fileName ||
        `${item.material}_${item.size}_${item.shape}_${item.description || 'recording'}.m4a`;

      // Copy file to a temp location with the proper name for sharing
      const fileExtension = item.file.split('.').pop();
      const newUri = `${FileSystem.cacheDirectory}${fileName}`;

      try {
        await FileSystem.copyAsync({
          from: item.file,
          to: newUri,
        });

        await Sharing.shareAsync(newUri, {
          mimeType: 'audio/m4a',
          dialogTitle: 'Share Recording',
          UTI: 'public.audio',
        });

        // Clean up temp file after sharing
        await FileSystem.deleteAsync(newUri, { idempotent: true });
      } catch (error) {
        console.error('Failed to share file:', error);
        Alert.alert('Failed to share file');
      }
    } else {
      Alert.alert('Sharing not available or file missing.');
    }
  };

  const deleteEntry = async (indexInView: number, swipeableRef: any) => {
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
      // Close the swipe after deletion
      if (swipeableRef) {
        swipeableRef.close();
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Failed to delete');
    }
  };

  const renderRightActions = (index: number, swipeableRef: any) => (
    <TouchableOpacity style={styles.deleteAction} onPress={() => void deleteEntry(index, swipeableRef)}>
      <Text style={styles.deleteText}>Delete</Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item, index }: { item: Entry; index: number }) => (
    <Swipeable
      renderRightActions={(progress, dragX, swipeableRef) => renderRightActions(index, swipeableRef)}
    >
      <View style={styles.card}>
        <Text style={styles.title}>{item.description || `Recording ${entries.length - index}`}</Text>
        <Text style={styles.meta}>{item.material} • {item.size} • {item.shape}</Text>
        {item.fileName && <Text style={styles.fileName}>{item.fileName}</Text>}
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
    backgroundColor: '#F5F5F7',
  },
  header: {
    fontSize: 34,
    fontWeight: '700',
    marginTop: 60,
    marginBottom: 24,
    marginHorizontal: 24,
    color: '#1D1D1F',
    letterSpacing: -0.5,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    color: '#86868B',
    fontSize: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 24,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1D1D1F',
    marginBottom: 6,
  },
  meta: {
    marginTop: 4,
    color: '#86868B',
    fontSize: 14,
  },
  fileName: {
    marginTop: 6,
    color: '#007AFF',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  time: {
    marginTop: 6,
    color: '#86868B',
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  play: { backgroundColor: '#007AFF' },
  share: { backgroundColor: '#5856D6' },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 15,
  },
  deleteAction: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: 14,
    marginBottom: 12,
  },
  deleteText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 15,
  },
});


