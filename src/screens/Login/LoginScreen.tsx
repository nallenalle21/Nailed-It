import { useEffect, useRef, useState } from 'react';
import { Text } from '../../components/AppText';   // in src/components use './AppText'
import { View, TextInput, TouchableOpacity, StyleSheet, Alert, findNodeHandle } from 'react-native';
import SparkleStars, { type SparkleStarsHandle } from '../../components/SparkleStars';
import { supabase } from '../../services/supabase';
import { setStatusBarStyle } from 'expo-status-bar';
import { colors, fonts } from '../../theme';

export default function LoginScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user'); 

  // Tap the background → a star pops there (same as the Inspiration page).
  // Taps on the fields, buttons or text don't count.
  const sparkles = useRef<SparkleStarsHandle>(null);
  const containerRef = useRef<any>(null);
  const touchStart = useRef<{ x: number; y: number; t: number; target: string } | null>(null);

  // Light clock/battery icons on the blue welcome page; back to dark after logging in.
  useEffect(() => {
    setStatusBarStyle('light');
    return () => setStatusBarStyle('dark');
  }, []);

  const handleAuth = async () => {
    if (isLogin) {
      let loginEmail = emailOrUsername.trim();
      
      if (!loginEmail.includes('@')) {
        const { data, error } = await supabase.from('profiles').select('email').eq('username', loginEmail).single();
        if (error || !data) return Alert.alert('Error', 'User not found');
        loginEmail = data.email;
      }

      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (error) Alert.alert('Error', error.message);
    } else {
      if (!username) return Alert.alert('Error', 'Username is required');
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { username: username.trim(), role } }
      });
      if (error) Alert.alert('Error', error.message);
      else {
        Alert.alert('Success', 'Account created!');
      }
    }
  };

  return (
    <View
      ref={containerRef}
      style={styles.container}
      onTouchStart={e => {
        const { pageX, pageY, target } = e.nativeEvent;
        touchStart.current = { x: pageX, y: pageY, t: Date.now(), target: String(target) };
      }}
      onTouchEnd={e => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start) return;
        const { pageX, pageY } = e.nativeEvent;
        const isTap = Math.hypot(pageX - start.x, pageY - start.y) < 10 && Date.now() - start.t < 400;
        const onBackground = containerRef.current && String(findNodeHandle(containerRef.current)) === start.target;
        if (isTap && onBackground) sparkles.current?.popAt(pageX, pageY);
      }}
    >
      <SparkleStars ref={sparkles} shootingStars={false} />
      <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{isLogin ? 'Welcome Back' : 'Create Account'}</Text>
      
      {isLogin ? (
        <TextInput 
          style={styles.input} 
          placeholder="Email or Username" 
          placeholderTextColor={colors.inkMuted}
          autoCapitalize="none" 
          onChangeText={setEmailOrUsername} 
        />
      ) : (
        <>
          <TextInput 
            style={styles.input} 
            placeholder="Username" 
            placeholderTextColor={colors.inkMuted}
            autoCapitalize="none" 
            onChangeText={setUsername} 
          />
          <TextInput 
            style={styles.input} 
            placeholder="Email" 
            placeholderTextColor={colors.inkMuted}
            keyboardType="email-address"
            autoCapitalize="none" 
            onChangeText={setEmail} 
          />
        </>
      )}
      
      <TextInput 
        style={styles.input} 
        placeholder="Password" 
        placeholderTextColor={colors.inkMuted}
        secureTextEntry 
        onChangeText={setPassword} 
      />
      
      {!isLogin && (
        <View style={styles.roleContainer}>
          <TouchableOpacity 
            style={[styles.roleBtn, role === 'user' && styles.activeRole]} 
            onPress={() => setRole('user')}
          >
            <Text style={role === 'user' ? styles.activeText : styles.inactiveText}>Customer</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.roleBtn, role === 'creator' && styles.activeRole]} 
            onPress={() => setRole('creator')}
          >
            <Text style={role === 'creator' ? styles.activeText : styles.inactiveText}>Freelancer</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.button} onPress={handleAuth}>
        <Text style={styles.buttonText}>{isLogin ? 'Log In' : 'Sign Up'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.toggleBtn} onPress={() => setIsLogin(!isLogin)}>
        <Text style={styles.toggleText}>
          {isLogin ? "Don't have an account? Sign up" : "Already have an account? Log in"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// Same muted blue background as the Inspiration page; text in off-white #faf9f6,
// buttons in #15201F.
const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 25, backgroundColor: colors.blueMuted },
  title: { fontSize: 30, fontFamily: fonts.title, color: colors.background, marginBottom: 30, textAlign: 'center' },
  input: { padding: 15, borderRadius: 10, marginBottom: 15, backgroundColor: colors.background, color: colors.ink },
  roleContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  roleBtn: { flex: 1, padding: 15, borderWidth: 1, borderColor: colors.background, alignItems: 'center', borderRadius: 10, marginHorizontal: 5 },
  activeRole: { backgroundColor: colors.grey, borderColor: colors.grey },
  activeText: { color: colors.background, fontWeight: 'bold' },
  inactiveText: { color: colors.background },
  button: { backgroundColor: colors.grey, padding: 18, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: colors.background, fontSize: 18, fontWeight: 'bold' },
  toggleBtn: { marginTop: 20, alignItems: 'center' },
  toggleText: { color: colors.background, fontSize: 16 }
});
