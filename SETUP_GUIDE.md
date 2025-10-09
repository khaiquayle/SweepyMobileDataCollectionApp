# Sweepy Mobile Data Collection App - Setup Guide

## Overview
This React Native Expo application is designed for collecting acoustic data by playing sweep sounds, recording audio reflections, and organizing recordings with metadata labels.

## What's New

### ✅ Fixed Recording Workflow
- **Separated sound playback from recording**
  - Click "Play Sweep Sound" to emit the test sound
  - Click "Start Recording" to capture reflections (no sound plays during recording)
  - Recording auto-stops after the sweep duration + 500ms buffer
  - Manual stop also available

- **Fixed volume issues**
  - Audio mode properly switches between playback and recording
  - Full volume playback guaranteed

### ✅ Descriptive File Naming
- Files now use metadata-based names: `material_size_shape_description_timestamp.m4a`
- Example: `Plastic_Small_Spherical_test1_2025-10-03T14-30-45.m4a`
- Proper naming when sharing files

### ✅ Supabase Integration
- Cloud storage for recordings
- Database for metadata tracking
- Background upload (non-blocking)

### ✅ Modern Apple-Inspired UI
- Clean, minimalist design
- SF Pro-inspired typography
- Proper spacing and shadows
- Light mode color scheme (#F5F5F7 background)
- Smooth rounded corners (14px)
- Better button states (disabled/active)

## Supabase Setup Instructions

### 1. Create a Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Note your project URL and anon key

### 2. Create Storage Bucket
Run this SQL in the Supabase SQL Editor:

```sql
-- Create storage bucket for recordings
INSERT INTO storage.buckets (id, name, public)
VALUES ('recordings', 'recordings', true);

-- Set up storage policies
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'recordings');

CREATE POLICY "Authenticated Upload"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'recordings');
```

### 3. Create Database Table
Run this SQL to create the metadata table:

```sql
CREATE TABLE recordings_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  description TEXT,
  material TEXT,
  size TEXT,
  shape TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for faster queries
CREATE INDEX idx_recordings_timestamp ON recordings_metadata(timestamp DESC);

-- Enable Row Level Security (optional, adjust as needed)
ALTER TABLE recordings_metadata ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
CREATE POLICY "Public read access"
ON recordings_metadata FOR SELECT
USING (true);

-- Create policy for insert access
CREATE POLICY "Public insert access"
ON recordings_metadata FOR INSERT
WITH CHECK (true);
```

### 4. Update App Configuration
Edit `app.json` and add your Supabase credentials:

```json
"extra": {
  "uploadUrl": "https://example.com/upload",
  "supabaseUrl": "https://YOUR_PROJECT_ID.supabase.co",
  "supabaseAnonKey": "YOUR_ANON_KEY_HERE"
}
```

## File Structure

```
├── app/
│   ├── (tabs)/
│   │   ├── index.tsx          # Main recording screen
│   │   ├── history.tsx        # History/playback screen
│   │   └── _layout.tsx        # Tab navigation
│   └── _layout.tsx
├── lib/
│   └── supabase.ts            # Supabase client configuration
├── assets/
│   └── sounds/
│       └── beep.wav           # Sweep sound for testing
└── app.json                   # App configuration
```

## Installation & Running

```bash
# Install dependencies
npm install

# Start the development server
npx expo start

# Run on iOS
npx expo start --ios

# Run on Android
npx expo start --android
```

## Features

### Recording Screen
- **Play Sweep Sound**: Plays the test sound at full volume
- **Start Recording**: Captures audio reflections (auto-stops after sweep duration)
- **Stop & Save**: Manually stop and save recording
- **Metadata Fields**:
  - Description (text input)
  - Material (Plastic, Glass, Metal, Paper)
  - Size (Small, Medium, Large)
  - Shape (Flat, Cylindrical, Spherical, Irregular)

### History Screen
- View all recorded entries
- Play recordings locally
- Share recordings (with proper filename)
- Swipe-to-delete functionality
- Automatic polling for new entries

## Technical Notes

### Audio Configuration
- Uses `expo-av` for recording and playback
- High-quality recording preset (`.HIGH_QUALITY`)
- Proper audio mode switching prevents volume issues
- M4A format for recordings

### Data Flow
1. User fills metadata and plays sweep sound
2. User starts recording to capture reflections
3. Recording auto-stops or manually stopped
4. File saved locally with descriptive name
5. Entry saved to AsyncStorage
6. Background upload to Supabase (if configured)
7. Metadata saved to Supabase database

### Offline Support
- All recordings saved locally first
- AsyncStorage for metadata persistence
- Background upload doesn't block user actions
- Works offline, syncs when connected

## Dependencies

Core packages:
- `expo-av` - Audio recording/playback
- `@supabase/supabase-js` - Cloud storage/database
- `react-native-url-polyfill` - Required for Supabase
- `@react-native-async-storage/async-storage` - Local storage
- `expo-sharing` - Share files
- `react-native-gesture-handler` - Swipe gestures

## Troubleshooting

### Recording Not Working
- Ensure microphone permissions are granted
- Check that sound played before recording
- Verify audio mode is set correctly

### Upload Failing
- Check Supabase credentials in `app.json`
- Verify storage bucket exists and is public
- Check database table exists
- Review Supabase logs for errors

### UI Issues
- Clear app cache: `npx expo start --clear`
- Reinstall dependencies: `rm -rf node_modules && npm install`

## Next Steps

1. Configure Supabase (see instructions above)
2. Test recording workflow
3. Verify uploads to Supabase
4. Customize metadata options as needed
5. Deploy to TestFlight/Play Store

## Support

For issues or questions:
- Check the Expo documentation: https://docs.expo.dev
- Review Supabase docs: https://supabase.com/docs
- Check React Native docs: https://reactnative.dev
