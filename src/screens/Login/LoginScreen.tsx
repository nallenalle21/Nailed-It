import { useEffect, useRef, useState } from 'react';
import { Text } from '../../components/AppText';   // in src/components use './AppText'
import {
  View, TextInput, TouchableOpacity, Pressable, StyleSheet, Alert, findNodeHandle, Image,
  KeyboardAvoidingView, Platform, ScrollView, BackHandler, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SparkleStars, { type SparkleStarsHandle } from '../../components/SparkleStars';
import WelcomeCollage from '../../components/WelcomeCollage';
import OnboardingIntro from '../../components/onboarding/OnboardingIntro';
import VibePicker from '../../components/onboarding/VibePicker';
import { INTRO_SEEN_KEY, VIBE_PICKS_KEY } from '../../data/vibes';
import { supabase } from '../../services/supabase';
import { setStatusBarStyle } from 'expo-status-bar';
import { colors, fonts } from '../../theme';

const STAR = require('../../../assets/images/star.png');

// loading → (first install only: intro → vibe) → welcome → login / signup
type Mode = 'loading' | 'intro' | 'vibe' | 'welcome' | 'login' | 'signup';

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('loading');
  const isLogin = mode === 'login';
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();

  // Tap the background → a star pops there (same as the Inspiration page).
  // Taps on the fields, buttons or text don't count. The collage ignores touches, so
  // taps on the photos land on the background too.
  const sparkles = useRef<SparkleStarsHandle>(null);
  const containerRef = useRef<any>(null);
  const bodyRef = useRef<any>(null); // the form's empty space counts as background
  const touchStart = useRef<{ x: number; y: number; t: number; target: string } | null>(null);

  // Light clock/battery icons on the blue welcome page; back to dark after logging in.
  useEffect(() => {
    setStatusBarStyle('light');
    return () => setStatusBarStyle('dark');
  }, []);

  // The intro only shows on a fresh install.
  useEffect(() => {
    AsyncStorage.getItem(INTRO_SEEN_KEY)
      .then(seen => setMode(seen ? 'welcome' : 'intro'))
      .catch(() => setMode('welcome'));
  }, []);

  const markIntroSeen = () => { AsyncStorage.setItem(INTRO_SEEN_KEY, '1').catch(() => {}); };

  const finishVibe = (vibeIds: string[]) => {
    // Kept on the phone for now; can be saved to the profile after sign-up.
    AsyncStorage.setItem(VIBE_PICKS_KEY, JSON.stringify(vibeIds)).catch(() => {});
    markIntroSeen();
    setMode('welcome');
  };

  // "new here? get the intro" on the welcome page (and, while developing, long-press
  // "nailed it") plays the intro and vibe picker again.
  const replayIntro = () => {
    AsyncStorage.removeItem(INTRO_SEEN_KEY).catch(() => {});
    setMode('intro');
  };

  // Android back button: vibe → intro, form → welcome.
  useEffect(() => {
    const back: Partial<Record<Mode, Mode>> = { vibe: 'intro', login: 'welcome', signup: 'welcome' };
    const target = back[mode];
    if (!target) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setMode(target);
      return true;
    });
    return () => sub.remove();
  }, [mode]);

  if (mode === 'loading') return <View style={styles.container} />;

  if (mode === 'intro') {
    return (
      <OnboardingIntro
        onFindVibe={() => setMode('vibe')}
        onSkip={() => setMode('vibe')}
        onHaveAccount={() => { markIntroSeen(); setMode('login'); }}
      />
    );
  }

  if (mode === 'vibe') {
    return (
      <VibePicker
        onBack={() => setMode('intro')}
        onSkip={() => { markIntroSeen(); setMode('welcome'); }}
        onDone={finishVibe}
      />
    );
  }

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

  const isBackground = (target: string) =>
    [containerRef.current, bodyRef.current].some(r => r && String(findNodeHandle(r)) === target);

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
        if (isTap && isBackground(start.target)) sparkles.current?.popAt(pageX, pageY);
      }}
    >
      {mode === 'welcome' ? (
        <>
          <WelcomeCollage height={screenHeight * 0.66} />
          <View ref={bodyRef} style={[styles.welcomeBottom, { paddingBottom: insets.bottom + 12 }]}>
            <Pressable style={styles.wordmarkRow} onLongPress={__DEV__ ? replayIntro : undefined} delayLongPress={800}>
              <Text style={styles.wordmark} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>nailed it</Text>
              <Image source={STAR} style={styles.wordmarkStar} />
            </Pressable>
            <Text style={styles.tagline}>find the nail tech behind the nails you keep saving. book in a tap.</Text>

            <TouchableOpacity style={styles.primaryBtn} onPress={() => setMode('signup')} accessibilityRole="button">
              <Text style={styles.primaryBtnText}>create an account</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.outlineBtn} onPress={() => setMode('login')} accessibilityRole="button">
              <Text style={styles.outlineBtnText}>log in</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.introLink} onPress={replayIntro} accessibilityRole="button">
              <Text style={styles.introLinkText}>new here? <Text style={styles.introLinkBold}>get the intro</Text></Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <View ref={bodyRef} style={styles.form}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setMode('welcome')} accessibilityRole="button" accessibilityLabel="back">
                <Ionicons name="chevron-back" size={22} color={colors.background} />
              </TouchableOpacity>

              <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {isLogin ? 'Welcome Back' : 'Create Account'}
              </Text>

              {!isLogin && (
                <>
                  <Text style={styles.fieldLabel}>i'm here to…</Text>
                  <View style={styles.roleContainer} accessibilityRole="radiogroup">
                    <RoleCard title="book nails" sub="customer" selected={role === 'user'} onPress={() => setRole('user')} />
                    <RoleCard title="do nails" sub="freelancer / nail tech" selected={role === 'creator'} onPress={() => setRole('creator')} />
                  </View>
                </>
              )}

              {isLogin ? (
                <TextInput
                  style={styles.input}
                  placeholder="Email or Username"
                  placeholderTextColor={colors.inkMuted}
                  autoCapitalize="none"
                  autoComplete="username"
                  value={emailOrUsername}
                  onChangeText={setEmailOrUsername}
                />
              ) : (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Username"
                    placeholderTextColor={colors.inkMuted}
                    autoCapitalize="none"
                    autoComplete="username-new"
                    value={username}
                    onChangeText={setUsername}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor={colors.inkMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    value={email}
                    onChangeText={setEmail}
                  />
                </>
              )}

              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={colors.inkMuted}
                secureTextEntry
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                value={password}
                onChangeText={setPassword}
              />

              <View style={styles.formFooter}>
                <TouchableOpacity style={styles.button} onPress={handleAuth} accessibilityRole="button">
                  <Text style={styles.buttonText}>{isLogin ? 'Log In' : 'Sign Up'}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.toggleBtn} onPress={() => setMode(isLogin ? 'signup' : 'login')}>
                  <Text style={styles.toggleText}>
                    {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <SparkleStars ref={sparkles} shootingStars={false} />
    </View>
  );
}

function RoleCard({ title, sub, selected, onPress }: { title: string; sub: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.roleBtn, selected && styles.activeRole]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      <Text style={styles.roleTitle}>{title}</Text>
      <Text style={styles.roleSub}>{sub}</Text>
    </TouchableOpacity>
  );
}

// Same muted blue background as the Inspiration page; text in off-white #faf9f6,
// buttons in #15201F.
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.blueMuted },

  // Welcome
  welcomeBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, gap: 10 },
  wordmarkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  wordmark: { fontFamily: fonts.title, fontSize: 44, color: colors.background, flexShrink: 1 },
  wordmarkStar: { width: 22, height: 22, marginTop: -6 },
  tagline: { fontSize: 17, lineHeight: 24, color: colors.background, maxWidth: 300, marginBottom: 14 },
  primaryBtn: { height: 54, borderRadius: 999, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: colors.grey, fontSize: 16, fontWeight: 'bold' },
  outlineBtn: { height: 54, borderRadius: 999, borderWidth: 1.5, borderColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  outlineBtnText: { color: colors.background, fontSize: 16, fontWeight: 'bold' },
  introLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  introLinkText: { color: colors.background, fontSize: 15 },
  introLinkBold: { color: colors.background, fontWeight: 'bold', textDecorationLine: 'underline' },

  // Log in / sign up
  form: { flex: 1, paddingHorizontal: 25 },
  backBtn: {
    width: 44, height: 44, borderRadius: 22, marginLeft: -9, marginBottom: 24,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(250,249,246,0.18)',
  },
  title: { fontSize: 30, fontFamily: fonts.title, color: colors.background, marginBottom: 24 },
  fieldLabel: { color: colors.background, fontSize: 13, fontWeight: 'bold', marginBottom: 8 },
  input: { padding: 15, borderRadius: 10, marginBottom: 15, backgroundColor: colors.background, color: colors.ink },
  roleContainer: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  roleBtn: { flex: 1, minHeight: 76, padding: 14, borderWidth: 1.5, borderColor: colors.background, borderRadius: 14, gap: 4 },
  activeRole: { backgroundColor: colors.grey, borderColor: colors.grey },
  roleTitle: { color: colors.background, fontSize: 16, fontWeight: 'bold' },
  roleSub: { color: colors.background, fontSize: 12, opacity: 0.8 },
  formFooter: { marginTop: 'auto', paddingTop: 16 },
  button: { backgroundColor: colors.grey, padding: 18, borderRadius: 999, alignItems: 'center' },
  buttonText: { color: colors.background, fontSize: 18, fontWeight: 'bold' },
  toggleBtn: { marginTop: 20, alignItems: 'center' },
  toggleText: { color: colors.background, fontSize: 16 },
});
