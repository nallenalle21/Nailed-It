import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Platform,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import DateTimePicker from '@react-native-community/datetimepicker';

const SERVICES = [
  'Simple nail art',
  'Advanced nail art',
  'Gel nails',
  'Acrylic nails',
  'Manicure',
  'Pedicure',
];

const PRICE_RANGES = [
  { label: 'Any price', min: 0, max: Infinity },
  { label: 'Under 500 kr', min: 0, max: 499 },
  { label: '500–800 kr', min: 500, max: 800 },
  { label: '800+ kr', min: 801, max: Infinity },
];

type Tech = {
  id: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
  services: string[];
  price: number; // starting price in SEK
};

// Placeholder data, replace with real data later
const TECHS: Tech[] = [
  { id: '1', name: 'Nail Studio Sofia', area: 'Södermalm', lat: 59.3138, lng: 18.0710, services: ['Gel nails', 'Manicure'], price: 450 },
  { id: '2', name: 'Alina Nails', area: 'Vasastan', lat: 59.3425, lng: 18.0490, services: ['Advanced nail art', 'Gel nails'], price: 750 },
  { id: '3', name: 'Glow by Maja', area: 'Östermalm', lat: 59.3380, lng: 18.0890, services: ['Simple nail art', 'Manicure', 'Pedicure'], price: 400 },
  { id: '4', name: 'Studio Kitty', area: 'Kungsholmen', lat: 59.3330, lng: 18.0270, services: ['Acrylic nails', 'Advanced nail art'], price: 900 },
  { id: '5', name: 'Polish & Co', area: 'Gamla stan', lat: 59.3250, lng: 18.0710, services: ['Manicure', 'Pedicure', 'Gel nails'], price: 550 },
  { id: '6', name: 'Nails by Elin', area: 'Hornstull', lat: 59.3160, lng: 18.0340, services: ['Simple nail art', 'Gel nails'], price: 480 },
];

const STOCKHOLM = {
  latitude: 59.3293,
  longitude: 18.0686,
  latitudeDelta: 0.09,
  longitudeDelta: 0.09,
};

// Placeholder inspo tiles: different heights + pastel colors
const INSPO = [
  { id: 'a', h: 180, c: '#fde2e4' },
  { id: 'b', h: 240, c: '#e2ece9' },
  { id: 'c', h: 150, c: '#dfe7fd' },
  { id: 'd', h: 220, c: '#fff1e6' },
  { id: 'e', h: 270, c: '#f0efeb' },
  { id: 'f', h: 170, c: '#cddafd' },
  { id: 'g', h: 210, c: '#fad2e1' },
  { id: 'h', h: 160, c: '#d0f4de' },
  { id: 'i', h: 250, c: '#e4c1f9' },
  { id: 'j', h: 190, c: '#fcf6bd' },
];

const formatDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export default function ExploreUser() {
  const [query, setQuery] = useState('');
  const [service, setService] = useState<string | null>(null);
  const [priceIdx, setPriceIdx] = useState(0);
  const [date, setDate] = useState<Date | null>(null);

  const [serviceModal, setServiceModal] = useState(false);
  const [priceModal, setPriceModal] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const range = PRICE_RANGES[priceIdx];
    return TECHS.filter((t) => {
      if (service && !t.services.includes(service)) return false;
      if (t.price < range.min || t.price > range.max) return false;
      if (
        q &&
        !(
          t.name.toLowerCase().includes(q) ||
          t.area.toLowerCase().includes(q) ||
          t.services.some((s) => s.toLowerCase().includes(q))
        )
      )
        return false;
      return true;
    });
  }, [query, service, priceIdx]);

  const hasFilters = service || priceIdx !== 0 || date || query;
  const clearAll = () => {
    setQuery('');
    setService(null);
    setPriceIdx(0);
    setDate(null);
  };

  // Split inspo into two columns for the masonry layout
  const colA = INSPO.filter((_, i) => i % 2 === 0);
  const colB = INSPO.filter((_, i) => i % 2 === 1);

  const renderOptionModal = (
    visible: boolean,
    onClose: () => void,
    title: string,
    options: string[],
    selected: string | null,
    onSelect: (v: string | null) => void
  ) => (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{title}</Text>
          {options.map((opt, i) => {
            const active = selected === opt;
            return (
              <TouchableOpacity
                key={opt}
                style={styles.option}
                onPress={() => {
                  onSelect(i === 0 && title === 'Price range' ? null : opt);
                  onClose();
                }}
              >
                <Text style={[styles.optionText, active && styles.optionActive]}>{opt}</Text>
                {active && <Ionicons name="checkmark" size={20} color="tomato" />}
              </TouchableOpacity>
            );
          })}
          {title === 'Type of service' && (
            <TouchableOpacity
              style={styles.option}
              onPress={() => {
                setService(null);
                onClose();
              }}
            >
              <Text style={[styles.optionText, { color: '#888' }]}>Show all services</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* PART 1: search + filters */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#888" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search nail techs, areas, styles"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color="#bbb" />
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <FilterPill
            icon="brush-outline"
            label={service ?? 'Service'}
            active={!!service}
            onPress={() => setServiceModal(true)}
          />
          <FilterPill
            icon="cash-outline"
            label={priceIdx === 0 ? 'Price' : PRICE_RANGES[priceIdx].label}
            active={priceIdx !== 0}
            onPress={() => setPriceModal(true)}
          />
          <FilterPill
            icon="calendar-outline"
            label={date ? formatDate(date) : 'Date'}
            active={!!date}
            onPress={() => setDateOpen(true)}
          />
          {hasFilters ? (
            <TouchableOpacity style={styles.clear} onPress={clearAll}>
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>

        {/* PART 2: map */}
        <View style={styles.mapHeader}>
          <Text style={styles.sectionTitle}>Nail techs in Stockholm</Text>
          <Text style={styles.count}>{filtered.length} found</Text>
        </View>
        <View style={styles.mapWrap}>
          <MapView style={styles.map} initialRegion={STOCKHOLM}>
            {filtered.map((t) => (
              <Marker
                key={t.id}
                coordinate={{ latitude: t.lat, longitude: t.lng }}
                title={t.name}
                description={`${t.area} · from ${t.price} kr`}
                pinColor="tomato"
              />
            ))}
          </MapView>
        </View>

        {/* PART 3: inspo feed */}
        <Text style={[styles.sectionTitle, { marginHorizontal: 16, marginTop: 24 }]}>
          Inspiration
        </Text>
        <View style={styles.feed}>
          <View style={styles.feedCol}>
            {colA.map((item) => (
              <View key={item.id} style={[styles.tile, { height: item.h, backgroundColor: item.c }]}>
                <Ionicons name="image-outline" size={28} color="rgba(0,0,0,0.2)" />
              </View>
            ))}
          </View>
          <View style={styles.feedCol}>
            {colB.map((item) => (
              <View key={item.id} style={[styles.tile, { height: item.h, backgroundColor: item.c }]}>
                <Ionicons name="image-outline" size={28} color="rgba(0,0,0,0.2)" />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Service filter */}
      {renderOptionModal(serviceModal, () => setServiceModal(false), 'Type of service', SERVICES, service, setService)}

      {/* Price filter */}
      <Modal visible={priceModal} transparent animationType="slide" onRequestClose={() => setPriceModal(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setPriceModal(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Price range</Text>
            {PRICE_RANGES.map((r, i) => (
              <TouchableOpacity
                key={r.label}
                style={styles.option}
                onPress={() => {
                  setPriceIdx(i);
                  setPriceModal(false);
                }}
              >
                <Text style={[styles.optionText, priceIdx === i && styles.optionActive]}>{r.label}</Text>
                {priceIdx === i && <Ionicons name="checkmark" size={20} color="tomato" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Date filter */}
      {Platform.OS === 'ios' ? (
        <Modal visible={dateOpen} transparent animationType="slide" onRequestClose={() => setDateOpen(false)}>
          <View style={styles.backdrop}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Choose date</Text>
              <DateTimePicker
                value={date ?? new Date()}
                mode="date"
                display="inline"
                minimumDate={new Date()}
                accentColor="tomato"
                onChange={(_, d) => d && setDate(d)}
              />
              <View style={styles.dateButtons}>
                <TouchableOpacity
                  onPress={() => {
                    setDate(null);
                    setDateOpen(false);
                  }}
                >
                  <Text style={styles.cancel}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.doneButton}
                  onPress={() => {
                    if (!date) setDate(new Date());
                    setDateOpen(false);
                  }}
                >
                  <Text style={styles.doneText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : (
        dateOpen && (
          <DateTimePicker
            value={date ?? new Date()}
            mode="date"
            minimumDate={new Date()}
            onChange={(e, d) => {
              setDateOpen(false);
              if (e.type === 'set' && d) setDate(d);
            }}
          />
        )
      )}
    </SafeAreaView>
  );
}

function FilterPill({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.pill, active && styles.pillActive]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={16} color={active ? '#fff' : '#444'} />
      <Text style={[styles.pillText, active && { color: '#fff' }]}>{label}</Text>
      <Ionicons name="chevron-down" size={14} color={active ? '#fff' : '#888'} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#f2f2f2',
  },
  searchInput: { flex: 1, fontSize: 16 },
  filterRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  pillActive: { backgroundColor: 'tomato', borderColor: 'tomato' },
  pillText: { fontSize: 14, color: '#333', fontWeight: '500' },
  clear: { paddingHorizontal: 8 },
  clearText: { color: 'tomato', fontWeight: '600' },
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 20, fontWeight: '700' },
  count: { color: '#888', fontSize: 14 },
  mapWrap: { marginHorizontal: 16, borderRadius: 16, overflow: 'hidden', height: 280 },
  map: { flex: 1 },
  feed: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 12, gap: 8 },
  feedCol: { flex: 1, gap: 8 },
  tile: { borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  optionText: { fontSize: 16 },
  optionActive: { color: 'tomato', fontWeight: '600' },
  dateButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 20,
    marginTop: 8,
  },
  cancel: { fontSize: 16, color: '#666' },
  doneButton: { backgroundColor: 'tomato', paddingHorizontal: 22, paddingVertical: 9, borderRadius: 8 },
  doneText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
