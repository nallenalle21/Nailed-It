import { useEffect, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../components/AppText';
import { Card, Chips, EditScreen, Field, editErrorMessage } from '../../../components/EditKit';
import { colors } from '../../../theme';
import { effectivePrice, fetchCreatorServices, formatKr, type CreatorService } from '../../../services/booking';
import { addBundle, deleteBundle, fetchBundles, fetchMySettings, updateMyProfile, type Bundle } from '../../../services/profileSettings';

const DISCOUNTS = [0, 5, 10, 15, 20, 25];

/**
 * Returning-client discount and combined treatments (e.g. removal + new set). Both are shown
 * on the profile as information; bookings still use the normal service prices.
 */
export default function OffersEdit({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  const [services, setServices] = useState<CreatorService[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [saving, setSaving] = useState(false);
  // New combined treatment
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [duration, setDuration] = useState('');
  const [price, setPrice] = useState('');

  useEffect(() => {
    let active = true;
    fetchMySettings()
      .then(async (s) => {
        const [svc, list] = await Promise.all([fetchCreatorServices(s.id), fetchBundles(s.id)]);
        if (!active) return;
        setMyId(s.id);
        setDiscount(s.returning_discount_percent ?? 0);
        setServices(svc);
        setBundles(list);
      })
      .catch((e) => Alert.alert('Could not load', editErrorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const pickService = (id: string) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    setPicked(next);
    // Suggest the sum of the chosen services; they can change both.
    const chosen = services.filter((s) => next.includes(s.id));
    setDuration(chosen.length ? String(chosen.reduce((m, s) => m + s.duration_minutes, 0)) : '');
    setPrice(chosen.length ? String(chosen.reduce((m, s) => m + effectivePrice(s), 0)) : '');
  };

  const add = async () => {
    const minutes = Number(duration);
    const kr = Number(price.replace(',', '.'));
    if (name.trim().length < 2 || picked.length < 2 || !Number.isInteger(minutes) || minutes < 15 || !Number.isFinite(kr) || kr < 0) {
      Alert.alert('Almost there', 'Give it a name, choose at least two services, and set the total time (minutes) and price.');
      return;
    }
    try {
      await addBundle({ name: name.trim(), service_ids: picked, duration_minutes: minutes, price: kr });
      if (myId) setBundles(await fetchBundles(myId));
      setName(''); setPicked([]); setDuration(''); setPrice('');
    } catch (e) {
      Alert.alert('Could not add', editErrorMessage(e));
    }
  };

  const remove = (b: Bundle) =>
    Alert.alert('Remove combined treatment?', b.name, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await deleteBundle(b.id);
            setBundles((cur) => cur.filter((x) => x.id !== b.id));
          } catch (e) {
            Alert.alert('Could not remove', editErrorMessage(e));
          }
        },
      },
    ]);

  const saveDiscount = async () => {
    setSaving(true);
    try {
      await updateMyProfile({ returning_discount_percent: discount || null });
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not save', editErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const nameOf = (id: string) => services.find((s) => s.id === id)?.name ?? 'Removed service';

  return (
    <EditScreen title="Offers" onBack={() => navigation.goBack()} loading={loading} onSave={saveDiscount} saving={saving}
      intro="Shown on your profile. Bookings still use your normal service prices; give the discount when the client pays.">
      <Card title="Returning clients" note="Discount for clients who have booked you before.">
        <Chips options={DISCOUNTS} selected={[discount]} onToggle={setDiscount} label={(d) => (d === 0 ? 'Off' : `${d} %`)} />
      </Card>

      <Card title="Combined treatments" note="Services that are often done together, with their own price and total time.">
        {bundles.map((b) => (
          <View key={b.id} style={styles.bundle}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bundleName}>{b.name}</Text>
              <Text style={styles.bundleMeta}>{b.service_ids.map(nameOf).join(' + ')}</Text>
              <Text style={styles.bundleMeta}>{b.duration_minutes} min · {formatKr(b.price)}</Text>
            </View>
            <TouchableOpacity onPress={() => remove(b)} hitSlop={10} accessibilityLabel={`Remove ${b.name}`}>
              <Ionicons name="trash-outline" size={20} color={colors.wine} />
            </TouchableOpacity>
          </View>
        ))}

        {services.length < 2 ? (
          <Text style={styles.bundleMeta}>Add at least two services first (Services and prices).</Text>
        ) : (
          <>
            <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Removal + new set" maxLength={60} />
            <Text style={styles.pickLabel}>Included services</Text>
            <Chips options={services.map((s) => s.id)} selected={picked} onToggle={pickService} label={nameOf} />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Field label="Total time (min)" value={duration} onChangeText={setDuration} keyboardType="number-pad" maxLength={3} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Price (kr)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" maxLength={7} />
              </View>
            </View>
            <TouchableOpacity style={styles.add} onPress={add}>
              <Ionicons name="add" size={18} color={colors.wine} />
              <Text style={styles.addText}>Add combined treatment</Text>
            </TouchableOpacity>
          </>
        )}
      </Card>
    </EditScreen>
  );
}

const styles = StyleSheet.create({
  bundle: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  bundleName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  bundleMeta: { fontSize: 13, color: colors.inkMuted, marginTop: 2 },
  pickLabel: { fontSize: 13, fontWeight: '700', color: colors.ink, marginTop: 12 },
  row: { flexDirection: 'row', gap: 10 },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: colors.pink },
  addText: { fontSize: 14, fontWeight: '700', color: colors.wine },
});
