import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Card, Chips, EditScreen, Field, editErrorMessage } from '../../../components/EditKit';
import { LANGUAGE_OPTIONS, fetchMySettings, updateMyProfile } from '../../../services/profileSettings';

/** Short bio and languages spoken, shown on the public profile. */
export default function AboutEdit({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [bio, setBio] = useState('');
  const [languages, setLanguages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetchMySettings()
      .then((s) => { if (active) { setBio(s.bio ?? ''); setLanguages(s.languages ?? []); } })
      .catch((e) => Alert.alert('Could not load', editErrorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await updateMyProfile({ bio, languages });
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not save', editErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  // Keep any saved language that isn't in the list (still shown and removable).
  const options = [...LANGUAGE_OPTIONS, ...languages.filter((l) => !LANGUAGE_OPTIONS.includes(l))];

  return (
    <EditScreen title="About you" onBack={() => navigation.goBack()} loading={loading} onSave={save} saving={saving}
      intro="Shown at the top of your profile. A few lines about your style and experience help customers choose you.">
      <Card>
        <Field label="Short bio" value={bio} onChangeText={setBio} multiline maxLength={300}
          placeholder="e.g. Gel and hand-painted nail art, 6 years’ experience. Cosy home studio on Södermalm."
          hint={`${bio.length}/300`} />
      </Card>
      <Card title="Languages you speak" note="Choose all that apply.">
        <Chips options={options} selected={languages}
          onToggle={(l) => setLanguages((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]))} />
      </Card>
    </EditScreen>
  );
}
