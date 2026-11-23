import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import StarredTitle from '../../components/StarredTitle';
import { Text } from '../../components/AppText';
import { colors, fonts } from '../../theme';
import { fetchAutoAcceptBookings, setAutoAcceptBookings } from '../../services/bookingRequests';

/** Opened from the gear on the profile. Freelancers choose how new bookings are handled. */
export default function Settings({ navigation, route }: any) {
  const isCreator = route?.params?.role === 'creator';
  // null = still loading
  const [autoAccept, setAutoAccept] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isCreator) return;
    let active = true;
    fetchAutoAcceptBookings()
      .then((value) => active && setAutoAccept(value))
      .catch((e) => {
        if (!active) return;
        setAutoAccept(true);
        Alert.alert('Could not load your settings', e instanceof Error ? e.message : String(e?.message ?? e));
      });
    return () => { active = false; };
  }, [isCreator]);

  const changeAutoAccept = async (value: boolean) => {
    const previous = autoAccept;
    setAutoAccept(value); // show it right away
    setSaving(true);
    try {
      await setAutoAcceptBookings(value);
    } catch (e: any) {
      setAutoAccept(previous);
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </TouchableOpacity>
        <StarredTitle style={styles.headerTitle}>Settings</StarredTitle>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {isCreator ? (
          <>
            <Text style={styles.sectionTitle}>Bookings</Text>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.titleRow}>
                  <Ionicons name="flash-outline" size={22} color={colors.blue} style={{ marginRight: 10 }} />
                  <Text style={styles.cardTitle}>Accept bookings automatically</Text>
                </View>
                {autoAccept === null ? (
                  <ActivityIndicator color={colors.blue} />
                ) : (
                  <Switch
                    value={autoAccept}
                    onValueChange={changeAutoAccept}
                    disabled={saving}
                    trackColor={{ false: colors.line, true: colors.blue }}
                  />
                )}
              </View>
              <Text style={styles.cardSubtitle}>
                {autoAccept === false
                  ? 'Off: new bookings arrive as requests in your Calendar. You accept or decline each one; the time is held for the customer meanwhile.'
                  : 'On: customers book free times directly and the booking is confirmed straight away.'}
              </Text>
            </View>
          </>
        ) : (
          <Text style={styles.empty}>No settings here yet.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 60, marginBottom: 10, paddingHorizontal: 20 },
  backBtn: { padding: 5 },
  headerTitle: { fontSize: 22, color: colors.ink, fontFamily: fonts.title },
  content: { paddingHorizontal: 20 },
  sectionTitle: { fontSize: 15, fontFamily: fonts.title, color: colors.ink, marginTop: 16, marginBottom: 10 },
  card: { backgroundColor: colors.background, padding: 20, borderRadius: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  cardTitle: { fontSize: 15, color: colors.ink, fontFamily: fonts.title, flexShrink: 1 },
  cardSubtitle: { fontSize: 13, color: colors.inkMuted, lineHeight: 19 },
  empty: { color: colors.inkMuted, marginTop: 24, textAlign: 'center' },
});
