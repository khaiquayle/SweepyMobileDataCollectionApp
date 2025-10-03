import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const supabaseUrl = (Constants?.expoConfig as any)?.extra?.supabaseUrl || '';
const supabaseAnonKey = (Constants?.expoConfig as any)?.extra?.supabaseAnonKey || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // We don't need user authentication for this app
  },
});
