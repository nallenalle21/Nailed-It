import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { TextInput } from '../../../components/AppTextInput';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../components/AppText';
import { Card, Chips, EditScreen, editErrorMessage } from '../../../components/EditKit';
import { colors } from '../../../theme';
import { fetchMySettings, fillWeeklySchedule, updateMyProfile, type ScheduleEntry } from '../../../services/profileSettings';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;
const pad = (t: string) => (t.length === 4 ? `0${t}` : t);
type Row = { on: boolean; start: string; end: string };

/**
 * Regular weekly hours as a template. "Fill" copies them into the calendar as normal
 * availability for the coming weeks, which can then be changed day by day in the Calendar.
 */
export default function ScheduleEdit({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>(() => DAYS.map((_, i) => ({ on: i < 5, start: '10:00', end: '18:00' })));
  const [weeks, setWeeks] = useState(4);
  const [saving, setSaving] = useState(false);
  const [filling, setFilling] = useState(false);

  useEffect(() => {
    let active = true;
    fetchMySettings()
      .then((s) => {
        if (!active || !s.weekly_schedule?.length) return;
        setRows(DAYS.map((_, i) => {
          const e = s.weekly_schedule.find((x) => x.day === i + 1);
          return e ? { on: true, start: e.start, end: e.end } : { on: false, start: '10:00', end: '18:00' };
        }));
      })
      .catch((e) => Alert.alert('Could not load', editErrorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const set = (i: number, patch: Partial<Row>) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  /** The template, or a message about what's wrong. */
  const template = (): ScheduleEntry[] | string => {
    const out: ScheduleEntry[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.on) continue;
      if (!TIME.test(r.start) || !TIME.test(r.end)) return `${DAYS[i]}: use the format HH:MM, e.g. 09:00.`;
      if (pad(r.start) >= pad(r.end)) return `${DAYS[i]}: the end time has to be after the start.`;
      out.push({ day: i + 1, start: pad(r.start), end: pad(r.end) });
    }
    return out;
  };

  const save = async (): Promise<boolean> => {
    const t = template();
    if (typeof t === 'string') {
      Alert.alert('Check your hours', t);
      return false;
    }
    setSaving(true);
    try {
      await updateMyProfile({ weekly_schedule: t });
      return true;
    } catch (e) {
      Alert.alert('Could not save', editErrorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const fill = async () => {
    if (!(await save())) return;
    setFilling(true);
    try {
      const n = await fillWeeklySchedule(weeks);
      Alert.alert(n ? 'Added to your calendar' : 'Nothing to add',
        n ? `${n} availability ${n === 1 ? 'slot was' : 'slots were'} added for the next ${weeks} weeks. Days you had already opened, and paused days, were left as they were.`
          : 'Your calendar already has availability on those days (or you’re on a break).');
    } catch (e) {
      Alert.alert('Could not fill the calendar', editErrorMessage(e));
    } finally {
      setFilling(false);
    }
  };

  return (
    <EditScreen title="Weekly hours" onBack={() => navigation.goBack()} loading={loading}
      onSave={async () => { if (await save()) navigation.goBack(); }} saving={saving}
      intro="Set your regular hours once, then add them to your calendar for the coming weeks. You can still change single days in the Calendar.">
      <Card>
        {rows.map((r, i) => (
          <View key={DAYS[i]} style={styles.day}>
            <Switch value={r.on} onValueChange={(on) => set(i, { on })} trackColor={{ false: colors.line, true: colors.blue }} />
            <Text style={[styles.dayName, !r.on && styles.off]}>{DAYS[i]}</Text>
            {r.on ? (
              <View style={styles.times}>
                <TextInput style={styles.time} value={r.start} onChangeText={(start) => set(i, { start })}
                  keyboardType="numbers-and-punctuation" maxLength={5} accessibilityLabel={`${DAYS[i]} start`} />
                <Text style={styles.dash}>–</Text>
                <TextInput style={styles.time} value={r.end} onChangeText={(end) => set(i, { end })}
                  keyboardType="numbers-and-punctuation" maxLength={5} accessibilityLabel={`${DAYS[i]} end`} />
              </View>
            ) : (
              <Text style={styles.closed}>Closed</Text>
            )}
          </View>
        ))}
      </Card>

      <Card title="Add to your calendar" note="Copies these hours into your calendar as bookable availability.">
        <Chips options={[2, 4, 8]} selected={[weeks]} onToggle={setWeeks} label={(w) => `Next ${w} weeks`} />
        <TouchableOpacity style={styles.fill} onPress={fill} disabled={filling}>
          {filling ? <ActivityIndicator color={colors.wine} /> : (
            <>
              <Ionicons name="calendar-outline" size={18} color={colors.wine} />
              <Text style={styles.fillText}>Fill the next {weeks} weeks</Text>
            </>
          )}
        </TouchableOpacity>
      </Card>
    </EditScreen>
  );
}

const styles = StyleSheet.create({
  day: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  dayName: { width: 92, fontSize: 15, color: colors.ink },
  off: { color: colors.inkMuted },
  times: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  time: { width: 64, textAlign: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 7, fontSize: 15, color: colors.ink },
  dash: { color: colors.inkMuted },
  closed: { flex: 1, textAlign: 'right', color: colors.inkMuted },
  fill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.pinkTint, borderWidth: 1, borderColor: colors.pink },
  fillText: { fontSize: 15, fontWeight: '700', color: colors.wine },
});
