import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Card, EditScreen, Field, OptionRow, editErrorMessage } from '../../../components/EditKit';
import { ACCESSIBILITY_LABELS, fetchMySettings, updateMyProfile, type Accessibility } from '../../../services/profileSettings';

/** How easy the workplace is to get to (stairs, elevator, parking …), shown on the profile. */
export default function AccessibilityEdit({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Accessibility[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetchMySettings()
      .then((s) => { if (active) { setSelected(s.accessibility ?? []); setNote(s.accessibility_note ?? ''); } })
      .catch((e) => Alert.alert('Could not load', editErrorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await updateMyProfile({ accessibility: selected, accessibility_note: note });
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not save', editErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditScreen title="Accessibility" onBack={() => navigation.goBack()} loading={loading} onSave={save} saving={saving}
      intro="Help customers know what to expect when they arrive.">
      <Card>
        {(Object.keys(ACCESSIBILITY_LABELS) as Accessibility[]).map((k) => (
          <OptionRow key={k} label={ACCESSIBILITY_LABELS[k]} selected={selected.includes(k)}
            onPress={() => setSelected((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))} />
        ))}
        <Field label="Anything else?" value={note} onChangeText={setNote} maxLength={200} multiline
          placeholder="e.g. 3rd floor, small elevator. Free parking on the street after 18." />
      </Card>
    </EditScreen>
  );
}
