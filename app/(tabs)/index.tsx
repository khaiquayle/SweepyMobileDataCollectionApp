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
  const recordingRef = useRef<Audio.Recording | null>(null);
  const isRecordingRef = useRef(false);
  const autoStopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sweepSoundRef = useRef<Audio.Sound | null>(null);
  const recordingPhaseRef = useRef<'ambient' | 'sweep' | 'complete'>('ambient');
  const ambientStartTimeRef = useRef<number | null>(null);

  const [description, setDescription] = useState("");
  const [material, setMaterial] = useState("Plastic");
  const [size, setSize] = useState("Small");
  const [shape, setShape] = useState("Flat");
  const [recordingStatus, setRecordingStatus] = useState("Ready to record");

  const startRecordingWithSound = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Permission to access microphone is required!");
        return;
      }

      // Set audio mode for recording with maximum playback volume
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
        interruptionModeIOS: 1, // DoNotMix - full volume, no ducking
        interruptionModeAndroid: 1, // DoNotMix - full volume, no ducking
      });

      // Start recording immediately
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setRecording(recording);
      isRecordingRef.current = true;
      recordingPhaseRef.current = 'ambient';
      ambientStartTimeRef.current = Date.now();
      setRecordingStatus("Recording ambient noise...");

      // Wait 1.5 seconds for ambient noise collection
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Load and play sweep sound
      const { sound } = await Audio.Sound.createAsync(
        require('@/assets/sounds/audiocheck.net_sweep_10Hz_22000Hz_-3dBFS_1s.wav'),
        { shouldPlay: false, volume: 1.0 }
      );

      // Get sound duration for timing
      const status = await sound.getStatusAsync();
      const soundDuration = status.isLoaded && status.durationMillis ? status.durationMillis : 1000;

      // Store sound reference
      sweepSoundRef.current = sound;
      recordingPhaseRef.current = 'sweep';
      setRecordingStatus("Playing sweep...");

      // Play the sweep sound
      await sound.setVolumeAsync(1.0);
      await sound.playAsync();

      console.log(`Sweep duration: ${soundDuration}ms, setting auto-stop in ${soundDuration + 2000}ms`);

      // Auto-stop the recording after sweep finishes + 2 seconds for reflections
      // Note: We already waited 1.5s for ambient, so timer should be: sweep duration + 2s buffer
      const totalRecordingTime = soundDuration + 2000;
      
      autoStopTimerRef.current = setTimeout(() => {
        console.log("Auto-stop timer fired! isRecording:", isRecordingRef.current, "recording:", recordingRef.current);
        recordingPhaseRef.current = 'complete';
        stopRecording();
      }, totalRecordingTime) as unknown as NodeJS.Timeout;

    } catch (err) {
      console.error("Failed to start recording", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      Alert.alert("Failed to start recording", errorMessage);
      // Reset all state
      recordingRef.current = null;
      setRecording(null);
      isRecordingRef.current = false;
      setRecordingStatus("Ready to record");
    }
  };

  const stopRecording = async () => {
    try {
      console.log("stopRecording called - isRecording:", isRecordingRef.current, "recording:", recordingRef.current !== null);
      const currentRecording = recordingRef.current;
      if (!currentRecording || !isRecordingRef.current) {
        console.log("stopRecording: early return - no recording or not recording");
        return;
      }

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
      await currentRecording.stopAndUnloadAsync();
      const fullRecordingUri = currentRecording.getURI();
      recordingRef.current = null;
      setRecording(null);
      setRecordingStatus("Finished recording and saving...");

      // Generate descriptive filename base
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const baseName = `${material}_${size}_${shape}_${description || 'recording'}_${timestamp}`;
      
      // Filenames for the two recordings
      const fullFileName = `${baseName}_full.wav`;
      const ambientFileName = `${baseName}_ambient.wav`;

      // Copy the full recording to the new filename
      const fullDestUri = await copyRecordingFile(fullRecordingUri, fullFileName);
      
      // Show completion message
      Alert.alert("Finished recording!", `Saved as:\n${fullFileName}\n\nAmbient portion: first 1.5 seconds`);

      // Save entry with metadata + file URI
      await saveEntry(fullDestUri, fullFileName, ambientFileName);
    } catch (err) {
      console.error("Failed to stop recording", err);
      Alert.alert("Failed to stop recording");
      // Reset all state on error
      recordingRef.current = null;
      setRecording(null);
      isRecordingRef.current = false;
      setRecordingStatus("Ready to record");
    }
  };

  const copyRecordingFile = async (sourceUri: string | null, destFileName: string): Promise<string | null> => {
    if (!sourceUri) return null;
    
    try {
      // Get the destination directory
      const destUri = `${FileSystem.documentDirectory}${destFileName}`;
      
      // Copy the file
      await FileSystem.copyAsync({
        from: sourceUri,
        to: destUri,
      });
      
      return destUri;
    } catch (err) {
      console.error("Failed to copy recording file:", err);
      return sourceUri; // Return original if copy fails
    }
  };

  const uploadRecording = async (fileUri: string | null, fileName: string, ambientFileName: string): Promise<string | null> => {
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
          contentType: 'audio/wav',
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

      // Save metadata to database (now includes ambient metadata columns)
      if (publicUrl) {
        const { error: dbError } = await supabase
          .from('recordings_metadata')
          .insert({
            file_name: fileName,
            ambient_file_name: ambientFileName,
            ambient_duration_ms: 1500,
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

  const saveEntry = async (fileUri: string | null, fileName: string, ambientFileName: string) => {
    try {
      const entry = {
        file: fileUri,
        fileName,
        ambientFileName,
        ambientDurationMs: 1500, // First 1.5 seconds is ambient noise
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
      uploadRecording(fileUri, fileName, ambientFileName).then((cloudUrl) => {
        if (cloudUrl) {
          // Update entry with cloud URL
          const updatedEntries = entries.map((e: any, index: number) =>
            index === entries.length - 1 ? { ...e, cloudUrl } : e
          );
          AsyncStorage.setItem("entries", JSON.stringify(updatedEntries));
        }
      }).catch((err) => {
        console.error("Upload failed in background", err);
      });

      // Reset status back to ready
      setTimeout(() => {
        setRecordingStatus("Ready to record");
      }, 1000);

    } catch (err) {
      console.error("Error saving entry", err);
      Alert.alert("Failed to save entry");
      setRecordingStatus("Ready to record");
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
            styles.cancelButton,
            recording === null && styles.buttonDisabled
          ]}
          onPress={stopRecording}
          disabled={recording === null}
        >
          <Text style={styles.buttonText}>Cancel Recording</Text>
        </TouchableOpacity>

        <Text style={styles.statusText}>{recordingStatus}</Text>
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
  cancelButton: {
    backgroundColor: '#86868B',
    paddingVertical: 18,
    borderRadius: 14,
    marginBottom: 12,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#86868B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
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
  statusText: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: '#86868B',
    letterSpacing: -0.2,
  },
});
