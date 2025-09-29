import React, { useState } from "react";
import { Text, View, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { Audio } from 'expo-av';

export default function Index() {
  const [isPlaying, setIsPlaying] = useState(false);

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
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
