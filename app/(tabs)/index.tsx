import AsyncStorage from "@react-native-async-storage/async-storage"; // saving metadata
import { Picker } from "@react-native-picker/picker"; // dropdown menus
import { Audio } from 'expo-av'; // sound playback + recording
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import React, { useRef, useState } from "react";
import { ActionSheetIOS, Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
const { FileSystemUploadType } = FileSystem as unknown as { FileSystemUploadType: any };

export default function Index() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [recording, setRecording] = useState<null | Audio.Recording>(null);
  const isRecordingRef = useRef(false);

  const [description, setDescription] = useState("");
  const [material, setMaterial] = useState("Plastic");
  const [size, setSize] = useState("Small");
  const [shape, setShape] = useState("Flat");

  const playSound = async () => {
    if (isPlaying) {
      Alert.alert('Sound is already playing!');
      return;
    }

    try {
      setIsPlaying(true);
      
      const { sound } = await Audio.Sound.createAsync(
        require('@/assets/sounds/beep.wav')
      );
      
      await sound.playAsync();
      
      // Wait for sound to finish
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
          sound.unloadAsync();
        }
      });
      
    } catch (error) {
      Alert.alert('Error playing sound:', String(error));
      setIsPlaying(false);
    }
  };

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Permission to access microphone is required!");
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      
      // Start recording first
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      isRecordingRef.current = true;
      
      // Play beep and auto-stop recording when beep ends
      try {
        const { sound } = await Audio.Sound.createAsync(
          require('@/assets/sounds/beep.wav')
        );
        
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            // Beep finished, stop recording automatically
            if (recording && isRecordingRef.current) {
              isRecordingRef.current = false;
              recording.stopAndUnloadAsync().then(() => {
                const uri = recording.getURI();
                setRecording(null);
                Alert.alert("Recording saved at: " + uri);
                saveEntry(uri);
              }).catch((err) => {
                console.error("Failed to stop recording", err);
              });
            }
            sound.unloadAsync();
          }
        });
        
        await sound.playAsync();
        Alert.alert("Recording started with beep...");
      } catch (beepError) {
        console.error("Beep failed, but recording continues", beepError);
        Alert.alert("Recording started...");
      }
    } catch (err) {
      console.error("Failed to start recording", err);
    }
  };

  const stopRecording = async () => {
    try {
      if (!recording || !isRecordingRef.current) return;
      isRecordingRef.current = false;
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI(); // file URI on phone
      setRecording(null);
      Alert.alert("Recording saved at: " + uri);

      // save entry with metadata + file URI
      await saveEntry(uri);
    } catch (err) {
      console.error("Failed to stop recording", err);
    }
  };

  const uploadRecording = async (fileUri: string | null): Promise<string | null> => {
    try {
      if (!fileUri) return null;
      const uploadUrl = (Constants?.expoConfig as any)?.extra?.uploadUrl;
      if (!uploadUrl) return null;

      const result = await FileSystem.uploadAsync(uploadUrl, fileUri, {
        httpMethod: 'POST',
        fieldName: 'file',
        uploadType: FileSystemUploadType.MULTIPART,
        parameters: {
          description,
          material,
          size,
          shape,
          timestamp: new Date().toISOString(),
        },
        headers: {
          Accept: 'application/json',
        },
      });

      if (result.status >= 200 && result.status < 300) {
        try {
          const body = JSON.parse(result.body);
          return body?.url || body?.fileUrl || null;
        } catch {
          return null;
        }
      }
      return null;
    } catch (e) {
      console.error('Upload failed', e);
      return null;
    }
  };

  const saveEntry = async (fileUri: string | null) => {
    try {
      const entry = {
        file: fileUri,     // path to recorded audio file
        description,       // free-text
        material,          // dropdown metadata
        size,              // dropdown metadata
        shape,             // dropdown metadata
        timestamp: new Date().toISOString(), // log time
      };

      const existing = await AsyncStorage.getItem("entries");
      const entries = existing ? JSON.parse(existing) : [];
      
      // Save locally first
      entries.push(entry);
      await AsyncStorage.setItem("entries", JSON.stringify(entries));
      
      Alert.alert("Entry saved locally!");
      
      // Try upload in background (non-blocking)
      uploadRecording(fileUri).then((cloudUrl) => {
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
    <View style={styles.container}>
      <Text style={styles.title}>Sound Recording App</Text>
      
      <TouchableOpacity 
        style={styles.playButton} 
        onPress={playSound}
        disabled={isPlaying}
      >
        <Text style={styles.buttonText}>
          {isPlaying ? 'Playing...' : 'Play Sound'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.recButton, { backgroundColor: "red" }]}
        onPress={startRecording}
        disabled={recording !== null}
      >
        <Text style={styles.buttonText}>
          {recording !== null ? 'Recording...' : 'Start Recording'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.recButton, { backgroundColor: "green" }]}
        onPress={stopRecording}
        disabled={recording === null}
      >
        <Text style={styles.buttonText}>Stop & Save</Text>
      </TouchableOpacity>

      {/* Metadata */}
      <Text style={styles.label}>Description:</Text>
      <TextInput
        style={styles.textInput}
        placeholder="Enter description..."
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
              dropdownIconColor="#000"
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
              dropdownIconColor="#000"
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
              dropdownIconColor="#000"
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: "#1a1a2e",
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    color: 'white',
  },
  playButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginVertical: 10,
  },
  recButton: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 10,
    marginVertical: 10,
    alignItems: 'center',
  },
  textInput: {
    width: 200,
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginTop: 10,
    backgroundColor: 'white',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  label: {
    marginTop: 20,
    fontSize: 16,
    fontWeight: "600",
    color: 'white',
  },
  inlineLabel: {
    marginRight: 8,
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  picker: {
    flex: 1,
    height: 44,
    backgroundColor: 'white',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    width: '100%',
    gap: 12,
    marginTop: 12,
  },
  pickerGroup: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iosPickerButton: {
    flex: 1,
    height: 44,
    backgroundColor: 'white',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ccc',
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  iosPickerText: {
    fontSize: 14,
    color: '#111',
  },
});
