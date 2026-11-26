import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import SubPage from '../../components/SubPage';
import { Text } from '../../components/AppText';
import { TextInput } from '../../components/AppTextInput';
import { colors, fonts } from '../../theme';
import {
  changeMyUsername,
  formatDayMonthYear,
  getMyAccount,
  getUsernameChangeStatus,
  saveMyCity,
  saveMyName,
  type MyAccount,
} from '../../services/account';

/** Settings → Account settings (customers): name, username (twice a week), location. */
export default function AccountSettings({ navigation }: any) {
  const [account, setAccount] = useState<MyAccount | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<{ left: number; nextAt: Date | null } | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [city, setCity] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getMyAccount()
      .then((me) => {
        if (!active || !me) return;
        setAccount(me);
        setName(me.name ?? '');
        setUsername(me.username);
        setCity(me.city ?? '');
      })
      .catch((e) => Alert.alert('Could not load your account', String(e?.message ?? e)));
    getUsernameChangeStatus().then((s) => active && setUsernameStatus(s)).catch(() => {});
    return () => { active = false; };
  }, []);

  if (!account) {
    return (
      <SubPage title="Account">
        <ActivityIndicator size="large" color={colors.wine} style={{ marginTop: 40 }} />
      </SubPage>
    );
  }

  const usernameChanged = username.trim() !== account.username;
  const nameChanged = name.trim() !== (account.name ?? '');
  const cityChanged = city.trim() !== (account.city ?? '');
  const canChangeUsername = !usernameStatus || usernameStatus.left > 0;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (nameChanged) await saveMyName(name);
      if (cityChanged) await saveMyCity(city);
      if (usernameChanged) await changeMyUsername(username.trim());
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Could not save', String(e?.message ?? e));
      // Some fields may already be saved: show what is stored now.
      getMyAccount().then((me) => me && setAccount(me)).catch(() => {});
      getUsernameChangeStatus().then(setUsernameStatus).catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  const usernameHint = !usernameStatus
    ? 'You can change your username twice a week.'
    : usernameStatus.left > 0
      ? `You can change your username twice a week · ${usernameStatus.left} ${usernameStatus.left === 1 ? 'change' : 'changes'} left`
      : `You’ve changed your username twice this week. Next change: ${usernameStatus.nextAt ? formatDayMonthYear(usernameStatus.nextAt) : 'in a few days'}.`;

  return (
    <SubPage title="Account">
      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        placeholderTextColor={colors.inkMuted}
        maxLength={50}
        autoCapitalize="words"
        textContentType="name"
      />
      <Text style={styles.hint}>Shown on your profile.</Text>

      <Text style={styles.label}>Username</Text>
      <View style={[styles.input, styles.usernameBox, !canChangeUsername && styles.inputDisabled]}>
        <Text style={styles.at}>@</Text>
        <TextInput
          style={styles.usernameInput}
          value={username}
          onChangeText={(t) => setUsername(t.replace(/\s/g, ''))}
          editable={canChangeUsername}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={30}
        />
      </View>
      <Text style={styles.hint}>{usernameHint}</Text>

      <Text style={styles.label}>Location</Text>
      <TextInput
        style={styles.input}
        value={city}
        onChangeText={setCity}
        placeholder="e.g. Södermalm, Stockholm"
        placeholderTextColor={colors.inkMuted}
        maxLength={60}
        textContentType="addressCity"
      />
      <Text style={styles.hint}>Shown under your username on your profile.</Text>

      <Text style={styles.label}>Email</Text>
      <View style={[styles.input, styles.inputDisabled]}>
        <Text style={styles.readOnly} numberOfLines={1}>{account.email ?? '–'}</Text>
      </View>

      <TouchableOpacity
        style={[styles.saveButton, (!(nameChanged || cityChanged || usernameChanged) || saving) && styles.saveDisabled]}
        disabled={!(nameChanged || cityChanged || usernameChanged) || saving}
        onPress={() => void save()}
      >
        <Text style={styles.saveText}>{saving ? 'saving…' : 'save'}</Text>
      </TouchableOpacity>
    </SubPage>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontFamily: fonts.title, color: colors.ink, marginTop: 14, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: colors.ink, backgroundColor: colors.background },
  inputDisabled: { opacity: 0.55 },
  usernameBox: { flexDirection: 'row', alignItems: 'center', paddingVertical: 0 },
  at: { fontSize: 16, color: colors.inkMuted, marginRight: 2 },
  usernameInput: { flex: 1, fontSize: 16, color: colors.ink, paddingVertical: 13 },
  readOnly: { fontSize: 16, color: colors.ink, textTransform: 'none' },
  hint: { fontSize: 12, color: colors.inkMuted, marginTop: 6, lineHeight: 17 },
  saveButton: { backgroundColor: colors.grey, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 28 },
  saveDisabled: { opacity: 0.4 },
  saveText: { color: colors.background, fontSize: 16, fontWeight: '700' },
});
