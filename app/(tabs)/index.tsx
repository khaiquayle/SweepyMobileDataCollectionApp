import React, { useState } from "react";
import { Text, View, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { Audio } from 'expo-av'; //sound playback + recording
import AsyncStorage from "@react-native-async-storage/async-storage"; //saving metadata
import { TextInput } from "react-native";
import { Picker } from "@react-native-picker/picker"; //dropdown menus

export default function Index() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [recording, setRecording] = useState(null);

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
      const { recording } = await Audio.Recording.createAsync(
        Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY
      );
      setRecording(recording);
      Alert.alert("Recording started...");
    } catch (err) {
      console.error("Failed to start recording", err);
    }
  };

  const stopRecording = async () => {
    try {
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

  const saveEntry = async (fileUri) => {
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
      entries.push(entry);
      await AsyncStorage.setItem("entries", JSON.stringify(entries));

      Alert.alert("Entry saved!");
    } catch (err) {
      console.error("Error saving entry", err);
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
        style = {[styles.recButton, { backgroundColor: "red" }]}
        onPress = {startRecording}
        disabled = {recording !== null}
      >
        <Text style={styles.buttonText}>Start Recording</Text>
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

      <Text style={styles.label}>Material:</Text>
      <Picker
        selectedValue={material}
        onValueChange={(val) => setMaterial(val)}
        style={styles.picker}
      >
        <Picker.Item label="Plastic" value="Plastic" />
        <Picker.Item label="Glass" value="Glass" />
        <Picker.Item label="Metal" value="Metal" />
        <Picker.Item label="Paper" value="Paper" />
      </Picker>

      <Text style={styles.label}>Size:</Text>
      <Picker
        selectedValue={size}
        onValueChange={(val) => setSize(val)}
        style={styles.picker}
      >
        <Picker.Item label="Small" value="Small" />
        <Picker.Item label="Medium" value="Medium" />
        <Picker.Item label="Large" value="Large" />
      </Picker>

      <Text style={styles.label}>Shape:</Text>
      <Picker
        selectedValue={shape}
        onValueChange={(val) => setShape(val)}
        style={styles.picker}
      >
        <Picker.Item label="Flat" value="Flat" />
        <Picker.Item label="Cylindrical" value="Cylindrical" />
        <Picker.Item label="Spherical" value="Spherical" />
        <Picker.Item label="Irregular" value="Irregular" />
      </Picker>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
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
  },
  textInput: {
  width: 200,
  height: 40,
  borderColor: "gray",
  borderWidth: 1,
  borderRadius: 5,
  paddingHorizontal: 10,
  marginTop: 10,
  backgroundColor: "white",
},
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
