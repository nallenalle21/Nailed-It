import { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../components/AppText';
import { Card, EditScreen, OptionRow, ToggleRow, editErrorMessage } from '../../../components/EditKit';
import { colors } from '../../../theme';
import { toDateKey } from '../../../services/booking';
import { fetchMySettings, updateMyProfile } from '../../../services/profileSettings';

const fromKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const label = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * Pause the profile (until turned back on) or plan a vacation (from–to). Paused dates can't be
 * booked and their free times disappear; existing bookings stay as they are.
 */
export default function PauseEdit({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState<'open' | 'dates'>('open');
  const [from, setFrom] = useState(new Date());
  const [until, setUntil] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 7); return d; });
  const [androidPicker, setAndroidPicker] = useState<'from' | 'until' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetchMySettings()
      .then((s) => {
        if (!active) return;
        setPaused(s.paused);
        if (s.pause_until) {
          setMode('dates');
          setUntil(fromKey(s.pause_until));
        }
        if (s.pause_from) setFrom(fromKey(s.pause_from));
      })
      .catch((e) => Alert.alert('Could not load', editErrorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const save = async () => {
    if (paused && mode === 'dates' && until < from) {
      Alert.alert('Check the dates', 'The break has to end after it starts.');
      return;
    }
    setSaving(true);
    try {
      await updateMyProfile(paused
        ? { paused: true, pause_from: mode === 'dates' ? toDateKey(from) : toDateKey(new Date()), pause_until: mode === 'dates' ? toDateKey(until) : null }
        : { paused: false });
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not save', editErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const dateField = (which: 'from' | 'until') => {
    const value = which === 'from' ? from : until;
    const set = which === 'from' ? setFrom : setUntil;
    return (
      <View style={styles.dateRow}>
        <Text style={styles.dateLabel}>{which === 'from' ? 'From' : 'Until (and including)'}</Text>
        {Platform.OS === 'ios' ? (
          <DateTimePicker value={value} mode="date" display="compact" minimumDate={which === 'until' ? from : new Date()}
            accentColor={colors.blue} onChange={(_, d) => d && set(d)} />
        ) : (
          <TouchableOpacity style={styles.dateButton} onPress={() => setAndroidPicker(which)}>
            <Ionicons name="calendar-outline" size={16} color={colors.ink} />
            <Text style={styles.dateText}>{label(value)}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <EditScreen title="Pause profile" onBack={() => navigation.goBack()} loading={loading} onSave={save} saving={saving}
      intro="While you’re on a break, customers can’t book you on those days and you don’t show up in Book. Bookings you already have stay as they are.">
      <Card>
        <ToggleRow label="Pause my profile" hint={paused ? 'You’re taking a break' : 'You’re taking bookings'} value={paused} onChange={setPaused} />
      </Card>
      {paused && (
        <Card title="How long?">
          <OptionRow radio label="Until I turn it back on" selected={mode === 'open'} onPress={() => setMode('open')} />
          <OptionRow radio label="Specific dates (vacation)" hint="Your profile comes back by itself afterwards."
            selected={mode === 'dates'} onPress={() => setMode('dates')} />
          {mode === 'dates' && (
            <>
              {dateField('from')}
              {dateField('until')}
            </>
          )}
        </Card>
      )}
      {androidPicker && (
        <DateTimePicker
          value={androidPicker === 'from' ? from : until}
          mode="date"
          minimumDate={androidPicker === 'until' ? from : new Date()}
          onChange={(e, d) => {
            const which = androidPicker;
            setAndroidPicker(null);
            if (e.type === 'set' && d) (which === 'from' ? setFrom : setUntil)(d);
          }}
        />
      )}
    </EditScreen>
  );
}

const styles = StyleSheet.create({
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  dateLabel: { fontSize: 15, color: colors.ink },
  dateButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.line },
  dateText: { fontSize: 14, color: colors.ink, fontWeight: '600' },
});
