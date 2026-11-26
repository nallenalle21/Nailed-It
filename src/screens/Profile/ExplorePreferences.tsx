import { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SubPage from '../../components/SubPage';
import { Text } from '../../components/AppText';
import { colors, fonts } from '../../theme';
import { DEFAULT_EXPLORE_PREFS, SERVICES, getExplorePrefs, saveExplorePrefs, type ExplorePrefs } from '../../services/explorePrefs';

/** Settings → Explore preferences: services Explore is always filtered by, and where it opens. Saved as you tap. */
export default function ExplorePreferences() {
  const [prefs, setPrefs] = useState<ExplorePrefs | null>(null);

  useEffect(() => {
    let active = true;
    getExplorePrefs().then((p) => active && setPrefs(p));
    return () => { active = false; };
  }, []);

  const update = (next: ExplorePrefs) => {
    setPrefs(next);
    void saveExplorePrefs(next);
  };

  const current = prefs ?? DEFAULT_EXPLORE_PREFS;
  const allOn = SERVICES.every((s) => current.services.includes(s));
  const toggleService = (service: string) => update({
    ...current,
    services: current.services.includes(service)
      ? current.services.filter((s) => s !== service)
      : [...current.services, service],
  });

  return (
    <SubPage title="Explore">
      <Text style={styles.sectionTitle}>Always show</Text>
      <Text style={styles.hint}>
        Explore opens already filtered by these services, so you don’t have to filter every time.
      </Text>
      <View style={styles.chips}>
        {/* "see all": marks every service (tap again to clear) */}
        <TouchableOpacity
          style={[styles.allChip, allOn && styles.allChipOn]}
          onPress={() => update({ ...current, services: allOn ? [] : [...SERVICES] })}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: allOn }}
          accessibilityLabel="See all services"
        >
          <Ionicons name={allOn ? 'checkmark-done' : 'apps-outline'} size={15} color={allOn ? colors.background : colors.grey} />
          <Text style={[styles.allChipText, allOn && styles.allChipTextOn]}>see all</Text>
        </TouchableOpacity>
        {SERVICES.map((service) => {
          const on = current.services.includes(service);
          return (
            <TouchableOpacity
              key={service}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => toggleService(service)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
            >
              {on && <Ionicons name="checkmark" size={15} color={colors.wine} />}
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{service}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>Open Explore on</Text>
      <View style={styles.toggle}>
        {(['inspire', 'book'] as const).map((m) => {
          const on = current.startIn === m;
          return (
            <TouchableOpacity
              key={m}
              style={[styles.toggleOption, on && styles.toggleOptionOn]}
              onPress={() => update({ ...current, startIn: m })}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <Ionicons name={m === 'inspire' ? 'sparkles-outline' : 'calendar-outline'} size={16} color={on ? colors.wine : colors.ink} />
              <Text style={[styles.toggleText, on && styles.chipTextOn]}>{m === 'inspire' ? 'Feed' : 'Book'}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.hint}>Saved on this phone.</Text>
    </SubPage>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 15, fontFamily: fonts.title, color: colors.ink, marginTop: 12, marginBottom: 6 },
  hint: { fontSize: 13, color: colors.inkMuted, lineHeight: 19, marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.pink, borderColor: colors.pink },
  chipText: { fontSize: 14, color: colors.ink },
  // Set apart from the services: off-black outline, filled when everything is marked
  allChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 1.5, borderColor: colors.grey },
  allChipOn: { backgroundColor: colors.grey },
  allChipText: { fontSize: 14, color: colors.grey, fontWeight: '700' },
  allChipTextOn: { color: colors.background },
  chipTextOn: { color: colors.wine, fontWeight: '700' },
  toggle: { flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: '#f2f2f2', marginBottom: 10 },
  toggleOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 12 },
  toggleOptionOn: { backgroundColor: colors.pink },
  toggleText: { fontSize: 14, fontWeight: '600', color: colors.ink },
});
