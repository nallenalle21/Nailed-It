import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://shnfqvwaemkamqudynjk.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNobmZxdndhZW1rYW1xdWR5bmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyOTM0ODAsImV4cCI6MjEwNjg2OTQ4MH0.c3CMP8NiuumacXvuElF9WrMBAS0B-i8ZHoIpnFCZGGU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});