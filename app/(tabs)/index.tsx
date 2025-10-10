import { supabase } from '@/lib/supabase';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Picker } from "@react-native-picker/picker";
import { decode } from 'base64-arraybuffer';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import React, { useRef, useState } from "react";
import { ActionSheetIOS, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function Index() {
  const [recording, setRecording] = useState<null | Audio.Recording>(null);
  const isRecordingRef = useRef(false);
  const autoStopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sweepSoundRef = useRef<Audio.Sound | null>(null);

  const [description, setDescription] = useState("");
  const [material, setMaterial] = useState("Plastic");
  const [size, setSize] = useState("Small");
  const [shape, setShape] = useState("Flat");

  const startRecordingWithSound = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Permission to access microphone is required!");
        return;
      }

      // CRITICAL: Load sweep sound FIRST before starting recording
      // This prevents "Only one recording can be prepared" error
      const { sound } = await Audio.Sound.createAsync(
        require('@/assets/sounds/audiocheck.net_sweep_10Hz_22000Hz_-3dBFS_1s.wav'),
        { shouldPlay: false, volume: 1.0 } // Preload at max volume, don't play yet
      );

      // Get sound duration for auto-stop timing
      const status = await sound.getStatusAsync();
      let soundDuration = 0;
      if (status.isLoaded && status.durationMillis) {
        soundDuration = status.durationMillis;
      }

      // Set audio mode for recording with maximum playback volume
      // DoNotMix (1) prevents other audio from reducing our sweep volume
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
        interruptionModeIOS: 1, // DoNotMix - full volume, no ducking
        interruptionModeAndroid: 1, // DoNotMix - full volume, no ducking
      });

      // Store sound reference for cleanup in stopRecording
      sweepSoundRef.current = sound;

      // Start recording AFTER sound is loaded
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      isRecordingRef.current = true;

      // Play the preloaded sweep sound at maximum volume
      await sound.setVolumeAsync(1.0);
      await sound.playAsync();

      Alert.alert("Recording with sweep sound...");

      // Auto-stop recording when sweep ends (with buffer for reflections)
      if (soundDuration > 0) {
        autoStopTimerRef.current = setTimeout(() => {
          if (isRecordingRef.current && recording) {
            stopRecording();
          }
          sound.unloadAsync();
        }, soundDuration + 500);
      }

      // Cleanup when sound finishes playing
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
        }
      });

    } catch (err) {
      console.error("Failed to start recording", err);
      Alert.alert("Failed to start recording", err.message);
    }
  };

  const stopRecording = async () => {
    try {
      if (!recording || !isRecordingRef.current) return;

      // Clear auto-stop timer if exists
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }

      // Stop and unload the sweep sound if it's still playing
      if (sweepSoundRef.current) {
        try {
          await sweepSoundRef.current.stopAsync();
          await sweepSoundRef.current.unloadAsync();
          sweepSoundRef.current = null;
        } catch (soundErr) {
          console.error("Error stopping sweep sound:", soundErr);
        }
      }

      isRecordingRef.current = false;
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      // Generate descriptive filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const fileName = `${material}_${size}_${shape}_${description || 'recording'}_${timestamp}.m4a`;

      Alert.alert("Recording saved!", fileName);

      // Save entry with metadata + file URI
      await saveEntry(uri, fileName);
    } catch (err) {
      console.error("Failed to stop recording", err);
      Alert.alert("Failed to stop recording");
    }
  };

  const uploadRecording = async (fileUri: string | null, fileName: string): Promise<string | null> => {
    try {
      if (!fileUri) return null;

      // Read file as base64
      const fileBase64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 to ArrayBuffer using proper method for React Native
      const arrayBuffer = decode(fileBase64);

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(fileName, arrayBuffer, {
          contentType: 'audio/m4a',
          upsert: false,
        });

      if (uploadError) {
        console.error('Supabase upload error:', uploadError);
        return null;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('recordings')
        .getPublicUrl(fileName);

      const publicUrl = urlData?.publicUrl || null;

      // Save metadata to database
      if (publicUrl) {
        const { error: dbError } = await supabase
          .from('recordings_metadata')
          .insert({
            file_name: fileName,
            file_url: publicUrl,
            description,
            material,
            size,
            shape,
            timestamp: new Date().toISOString(),
          });

        if (dbError) {
          console.error('Database insert error:', dbError);
        }
      }

      return publicUrl;
    } catch (e) {
      console.error('Upload failed:', e);
      return null;
    }
  };

  const saveEntry = async (fileUri: string | null, fileName: string) => {
    try {
      const entry = {
        file: fileUri,
        fileName,
        description,
        material,
        size,
        shape,
        timestamp: new Date().toISOString(),
      };

      const existing = await AsyncStorage.getItem("entries");
      const entries = existing ? JSON.parse(existing) : [];

      // Save locally first
      entries.push(entry);
      await AsyncStorage.setItem("entries", JSON.stringify(entries));

      // Try upload in background (non-blocking)
      uploadRecording(fileUri, fileName).then((cloudUrl) => {
        if (cloudUrl) {
          // Update entry with cloud URL
          const updatedEntries = entries.map((e: any, index: number) =>
            index === entries.length - 1 ? { ...e, cloudUrl } : e
          );
          AsyncStorage.setItem("entries", JSON.stringify(updatedEntries));
          Alert.alert("Recording uploaded to cloud!");
        }
      }).catch((err) => {
        console.error("Upload failed in background", err);
      });

    } catch (err) {
      console.error("Error saving entry", err);
      Alert.alert("Failed to save entry");
    }
  };
        

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>Data Collection</Text>

      <View style={styles.section}>
        <TouchableOpacity
          style={[
            styles.recordButton,
            recording !== null && styles.buttonActive
          ]}
          onPress={startRecordingWithSound}
          disabled={recording !== null}
        >
          <Text style={styles.buttonText}>
            {recording !== null ? '🔴 Recording...' : '▶ Record with Sweep'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.stopButton,
            recording === null && styles.buttonDisabled
          ]}
          onPress={stopRecording}
          disabled={recording === null}
        >
          <Text style={styles.buttonText}>■ Stop & Save</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Enter description..."
          placeholderTextColor="#86868B"
          value={description}
          onChangeText={setDescription}
        />

        <View style={styles.row}>
          <View style={styles.pickerGroup}>
            <Text style={styles.inlineLabel}>Material</Text>
            {Platform.OS === 'ios' ? (
              <TouchableOpacity
                style={styles.iosPickerButton}
                onPress={() => {
                  const options = ['Plastic', 'Glass', 'Metal', 'Paper', 'Cancel'];
                  ActionSheetIOS.showActionSheetWithOptions(
                    {
                      options,
                      cancelButtonIndex: options.length - 1,
                      title: 'Select Material',
                    },
                    (buttonIndex) => {
                      if (buttonIndex === options.length - 1) return;
                      setMaterial(options[buttonIndex]);
                    }
                  );
                }}
              >
                <Text style={styles.iosPickerText}>{material}</Text>
              </TouchableOpacity>
            ) : (
              <Picker
                selectedValue={material}
                onValueChange={(v) => setMaterial(String(v))}
                style={styles.picker}
                mode={'dropdown'}
                prompt="Select Material"
                dropdownIconColor="#1D1D1F"
              >
                <Picker.Item label="Plastic" value="Plastic" />
                <Picker.Item label="Glass" value="Glass" />
                <Picker.Item label="Metal" value="Metal" />
                <Picker.Item label="Paper" value="Paper" />
              </Picker>
            )}
          </View>

          <View style={styles.pickerGroup}>
            <Text style={styles.inlineLabel}>Size</Text>
            {Platform.OS === 'ios' ? (
              <TouchableOpacity
                style={styles.iosPickerButton}
                onPress={() => {
                  const options = ['Small', 'Medium', 'Large', 'Cancel'];
                  ActionSheetIOS.showActionSheetWithOptions(
                    {
                      options,
                      cancelButtonIndex: options.length - 1,
                      title: 'Select Size',
                    },
                    (buttonIndex) => {
                      if (buttonIndex === options.length - 1) return;
                      setSize(options[buttonIndex]);
                    }
                  );
                }}
              >
                <Text style={styles.iosPickerText}>{size}</Text>
              </TouchableOpacity>
            ) : (
              <Picker
                selectedValue={size}
                onValueChange={(v) => setSize(String(v))}
                style={styles.picker}
                mode={'dropdown'}
                prompt="Select Size"
                dropdownIconColor="#1D1D1F"
              >
                <Picker.Item label="Small" value="Small" />
                <Picker.Item label="Medium" value="Medium" />
                <Picker.Item label="Large" value="Large" />
              </Picker>
            )}
          </View>

          <View style={styles.pickerGroup}>
            <Text style={styles.inlineLabel}>Shape</Text>
            {Platform.OS === 'ios' ? (
              <TouchableOpacity
                style={styles.iosPickerButton}
                onPress={() => {
                  const options = ['Flat', 'Cylindrical', 'Spherical', 'Irregular', 'Cancel'];
                  ActionSheetIOS.showActionSheetWithOptions(
                    {
                      options,
                      cancelButtonIndex: options.length - 1,
                      title: 'Select Shape',
                    },
                    (buttonIndex) => {
                      if (buttonIndex === options.length - 1) return;
                      setShape(options[buttonIndex]);
                    }
                  );
                }}
              >
                <Text style={styles.iosPickerText}>{shape}</Text>
              </TouchableOpacity>
            ) : (
              <Picker
                selectedValue={shape}
                onValueChange={(v) => setShape(String(v))}
                style={styles.picker}
                mode={'dropdown'}
                prompt="Select Shape"
                dropdownIconColor="#1D1D1F"
              >
                <Picker.Item label="Flat" value="Flat" />
                <Picker.Item label="Cylindrical" value="Cylindrical" />
                <Picker.Item label="Spherical" value="Spherical" />
                <Picker.Item label="Irregular" value="Irregular" />
              </Picker>
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 32,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    marginTop: 60,
    marginBottom: 32,
    color: '#1D1D1F',
    letterSpacing: -0.5,
  },
  recordButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 20,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
    width: '100%',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  stopButton: {
    backgroundColor: '#34C759',
    paddingVertical: 18,
    borderRadius: 14,
    marginBottom: 12,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  textInput: {
    width: '100%',
    height: 52,
    borderColor: '#E5E5EA',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    backgroundColor: '#FFFFFF',
    fontSize: 16,
    color: '#1D1D1F',
  },
  buttonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  label: {
    marginTop: 8,
    marginBottom: 12,
    fontSize: 15,
    fontWeight: '600',
    color: '#1D1D1F',
    letterSpacing: -0.2,
  },
  inlineLabel: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#86868B',
    letterSpacing: -0.1,
    textTransform: 'uppercase',
  },
  picker: {
    height: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
  },
  row: {
    flexDirection: 'column',
    width: '100%',
    gap: 16,
    marginTop: 8,
  },
  pickerGroup: {
    width: '100%',
    flexDirection: 'column',
  },
  iosPickerButton: {
    height: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  iosPickerText: {
    fontSize: 16,
    color: '#1D1D1F',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonActive: {
    opacity: 0.8,
  },
});
