import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RefreshStar, useStarRefresh } from '../../../components/SparkleStars';
import StarredTitle from '../../../components/StarredTitle';
import { Text } from '../../../components/AppText';
import { colors, fonts } from '../../../theme';
import { formatKr } from '../../../services/booking';
import { PERIOD_LABELS, fetchInsights, periodRange, type Insights as Data, type PeriodKey } from '../../../services/insights';

// Chart colors: brand blue nudged to pass the chart color checks (chroma/contrast/colour-blind
// separation against the app background), and wine as the second category.
const CHART = { primary: '#2B93B8', secondary: colors.wine, track: 'rgba(11,21,14,0.07)' };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PERIODS: PeriodKey[] = ['month', '30d', '3m', 'year', 'all'];

const pct = (rate: number | null | undefined) => (rate == null ? '–' : `${Math.round(rate * 100)}%`);
const hours = (minutes: number) => `${Math.round((minutes / 60) * 10) / 10} h`;
const shortDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' });
};

/** "↑ 12%" against the previous period; null when there is nothing to compare. */
function change(now: number | null | undefined, before: number | null | undefined) {
  if (now == null || before == null) return null;
  if (before === 0) return now === 0 ? null : { up: now > 0, text: 'new' };
  const diff = (now - before) / Math.abs(before);
  if (Math.abs(diff) < 0.005) return { up: true, text: '±0%', flat: true };
  return { up: diff > 0, text: `${Math.round(Math.abs(diff) * 100)}%` };
}

/** Business Insights: what a freelancer earns, loses, and how their clients and calendar behave. */
export default function Insights({ navigation }: any) {
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [reloadKey, setReloadKey] = useState(0);
  // Results belong to the period (and refresh) they were loaded for.
  const loadKey = `${period}|${reloadKey}`;
  const [loaded, setLoaded] = useState<{ key: string; now: Data | null; before: Data | null; error?: string } | null>(null);
  const loading = loaded?.key !== loadKey;

  const pull = useStarRefresh(() => setReloadKey((n) => n + 1));

  useEffect(() => {
    let active = true;
    const r = periodRange(period);
    Promise.all([
      fetchInsights(r.from, r.to),
      r.prevFrom ? fetchInsights(r.prevFrom, r.prevTo).catch(() => null) : Promise.resolve(null),
    ])
      .then(([now, before]) => active && setLoaded({ key: loadKey, now, before }))
      .catch((e) => active && setLoaded({ key: loadKey, now: null, before: null, error: e instanceof Error ? e.message : String(e?.message ?? e) }));
    return () => { active = false; };
  }, [loadKey]); // eslint-disable-line react-hooks/exhaustive-deps -- loadKey covers period and refresh

  const data = loaded?.now ?? null;
  const prev = loaded?.before ?? null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </TouchableOpacity>
        <StarredTitle style={styles.headerTitle}>Insights</StarredTitle>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periods} style={{ flexGrow: 0 }}>
        {PERIODS.map((p) => (
          <TouchableOpacity key={p} style={[styles.period, p === period && styles.periodActive]} onPress={() => setPeriod(p)}
            accessibilityState={{ selected: p === period }}>
            <Text style={[styles.periodText, p === period && styles.periodTextActive]}>{PERIOD_LABELS[p]}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView refreshControl={<RefreshControl {...pull.control} />} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading && !data ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.blue} size="large" />
        ) : loaded?.error ? (
          <Text style={styles.empty}>Could not load your insights: {loaded.error}</Text>
        ) : data ? (
          <Body data={data} prev={prev} periodLabel={PERIOD_LABELS[period]} />
        ) : null}
      </ScrollView>
      <RefreshStar refreshing={pull.refreshing} y={150} />
    </View>
  );
}

function Body({ data: d, prev: p, periodLabel }: { data: Data; prev: Data | null; periodLabel: string }) {
  const m = d.money;
  const [serviceSort, setServiceSort] = useState<'bookings' | 'revenue'>('bookings');
  const services = [...d.services].sort((a, b) => (serviceSort === 'bookings'
    ? b.bookings - a.bookings || b.revenue - a.revenue
    : b.revenue - a.revenue || b.bookings - a.bookings)).slice(0, 5);
  // Hours shown: the usual working day, widened to any hour that had bookings.
  const busy = d.hours.map((n, h) => (n > 0 ? h : -1)).filter((h) => h >= 0);
  const firstHour = Math.min(8, ...busy);
  const lastHour = Math.max(20, ...busy);
  const hourRange = Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i);

  return (
    <>
      {/* ---- Money ---- */}
      <Section title="Money" note={periodLabel}>
        <View style={styles.tiles}>
          <Tile wide label="Revenue" value={formatKr(m.revenue)} delta={change(m.revenue, p?.money.revenue)}
            hint={`${m.completed} completed ${m.completed === 1 ? 'booking' : 'bookings'}`} />
          <Tile label="After Nailed It fees" value={m.earnings_after_fees != null ? formatKr(m.earnings_after_fees) : '–'}
            hint={m.fee_set ? `Fees: ${formatKr(m.fees ?? 0)}` : 'Fees not set yet'} delta={change(m.earnings_after_fees, p?.money.earnings_after_fees)} />
          <Tile label="Average booking" value={m.avg_value != null ? formatKr(m.avg_value) : '–'} delta={change(m.avg_value, p?.money.avg_value)}
            hint="Revenue per completed booking" />
          <Tile label="Booked, next 7 days" value={formatKr(d.upcoming.next_7_days)} hint={`${d.upcoming.next_7_days_bookings} bookings`} />
          <Tile label="Booked, next 30 days" value={formatKr(d.upcoming.next_30_days)} hint={`${d.upcoming.next_30_days_bookings} bookings`} />
        </View>
      </Section>

      <Section title={`Earnings per ${d.series_unit}`} note="Completed bookings">
        <BarChart
          values={d.series.map((s) => s.revenue)}
          labels={d.series.map((s) => (d.series_unit === 'week' ? shortDate(s.start) : monthLabel(s.start)))}
          describe={(i) => `${d.series_unit === 'week' ? `Week of ${shortDate(d.series[i].start)}` : monthLabel(d.series[i].start)}: ${formatKr(d.series[i].revenue)} · ${d.series[i].bookings} bookings`}
          format={(v) => formatKr(v)}
          labelEvery={Math.ceil(d.series.length / 6)}
        />
      </Section>

      {/* ---- Cancellations & no-shows ---- */}
      <Section title="Cancellations & no-shows">
        <View style={styles.tiles}>
          <Tile wide label="Money lost" value={formatKr(m.money_lost)} delta={change(m.money_lost, p?.money.money_lost)}
            hint="No-shows + client cancellations less than 24 h before" />
          <Tile label="No-shows" value={`${m.no_shows}`} hint={`${pct(m.no_show_rate)} of bookings · ${formatKr(m.no_show_value)}`}
            delta={change(m.no_shows, p?.money.no_shows)} />
          <Tile label="Cancellations" value={`${m.cancelled}`} hint={`${pct(m.cancellation_rate)} of bookings`}
            delta={change(m.cancelled, p?.money.cancelled)} />
          <Tile label="Late (< 24 h)" value={`${m.late_cancels}`} hint={formatKr(m.late_cancel_value)} />
          <Tile label="Who cancelled" value={`${m.cancelled_by_client} / ${m.cancelled_by_you}`} hint="Clients / you" />
        </View>
        <Text style={styles.footnote}>Mark a no-show from a past booking in your Calendar.</Text>
      </Section>

      {/* ---- Clients ---- */}
      <Section title="Clients">
        <View style={styles.tiles}>
          <Tile label="Clients" value={`${d.clients.clients}`} delta={change(d.clients.clients, p?.clients.clients)} hint="With a completed booking" />
          <Tile label="Rebook" value={pct(d.clients.rebook_rate)} hint="Have booked you more than once" />
          <Tile wide label="Time between visits" value={d.clients.avg_days_between_visits != null ? `${d.clients.avg_days_between_visits} days` : '–'}
            hint="On average, for clients who come back" />
        </View>
        <SplitBar
          parts={[
            { label: 'New', value: d.clients.new, color: CHART.primary },
            { label: 'Returning', value: d.clients.returning, color: CHART.secondary },
          ]}
        />
      </Section>

      {/* ---- Services ---- */}
      <Section
        title="Top services"
        right={
          <View style={styles.toggle}>
            {(['bookings', 'revenue'] as const).map((k) => (
              <TouchableOpacity key={k} style={[styles.toggleOption, serviceSort === k && styles.toggleActive]} onPress={() => setServiceSort(k)}>
                <Text style={[styles.toggleText, serviceSort === k && styles.toggleTextActive]}>{k === 'bookings' ? 'Bookings' : 'Revenue'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        }
      >
        {services.length === 0 ? <Text style={styles.empty}>No completed bookings in this period.</Text> : (
          <HBars
            rows={services.map((s) => ({
              label: s.name,
              value: serviceSort === 'bookings' ? s.bookings : s.revenue,
              text: serviceSort === 'bookings' ? `${s.bookings}` : formatKr(s.revenue),
            }))}
          />
        )}
      </Section>

      {/* ---- Time ---- */}
      <Section title="Busiest times of day" note="Bookings by start time">
        <BarChart
          values={hourRange.map((h) => d.hours[h])}
          labels={hourRange.map((h) => String(h).padStart(2, '0'))}
          describe={(i) => `${String(hourRange[i]).padStart(2, '0')}:00–${String(hourRange[i] + 1).padStart(2, '0')}:00: ${d.hours[hourRange[i]]} bookings`}
          format={(v) => `${v}`}
          labelEvery={3}
        />
      </Section>

      <Section title="Busiest weekdays">
        <BarChart
          values={d.weekdays}
          labels={WEEKDAYS}
          describe={(i) => `${WEEKDAYS[i]}: ${d.weekdays[i]} bookings`}
          format={(v) => `${v}`}
          labelEvery={1}
        />
      </Section>

      <Section title="How full your calendar is">
        <View style={styles.fullRow}>
          <Text style={styles.hero}>{pct(d.fullness.rate)}</Text>
          {change(d.fullness.rate, p?.fullness.rate) && <Delta delta={change(d.fullness.rate, p?.fullness.rate)!} />}
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.min(100, Math.round((d.fullness.rate ?? 0) * 100))}%` }]} />
        </View>
        <Text style={styles.hint}>
          {d.fullness.available_minutes > 0
            ? `${hours(d.fullness.booked_in_availability_minutes)} booked of ${hours(d.fullness.available_minutes)} you were available`
            : 'You had no availability in this period.'}
          {d.fullness.booked_minutes > d.fullness.booked_in_availability_minutes
            ? ` · ${hours(d.fullness.booked_minutes - d.fullness.booked_in_availability_minutes)} booked outside it`
            : ''}
        </Text>
      </Section>

      <Section title="How far ahead clients book" note={d.lead_time.median_days != null ? `Typically ${Math.round(d.lead_time.median_days)} days ahead` : undefined}>
        <HBars
          rows={[
            { label: 'Same day', value: d.lead_time.same_day, text: `${d.lead_time.same_day}` },
            { label: '1–7 days', value: d.lead_time.within_week, text: `${d.lead_time.within_week}` },
            { label: '8–30 days', value: d.lead_time.within_month, text: `${d.lead_time.within_month}` },
            { label: '30+ days', value: d.lead_time.later, text: `${d.lead_time.later}` },
          ]}
        />
      </Section>

      {/* ---- Requests (manual approval) ---- */}
      <Section title="Booking requests" note="When you approve bookings yourself">
        {d.requests.total === 0 ? (
          <Text style={styles.empty}>No booking requests in this period. Turn on manual approval in Settings to get requests.</Text>
        ) : (
          <View style={styles.tiles}>
            <Tile label="Accepted" value={pct(d.requests.acceptance_rate)} hint={`${d.requests.accepted} of ${d.requests.accepted + d.requests.declined + d.requests.expired} answered`} />
            <Tile label="Answer time" value={d.requests.avg_response_minutes != null ? responseTime(d.requests.avg_response_minutes) : '–'} hint="On average" />
            <Tile wide label="Declined · expired · withdrawn" value={`${d.requests.declined} · ${d.requests.expired} · ${d.requests.withdrawn}`}
              hint={d.requests.waiting ? `${d.requests.waiting} waiting for your answer` : 'Expired = not answered in time'} />
          </View>
        )}
      </Section>
    </>
  );
}

const responseTime = (min: number) => (min < 60 ? `${min} min` : min < 48 * 60 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} days`);

/* ---------- small building blocks ---------- */

function Section({ title, note, right, children }: { title: string; note?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {note ? <Text style={styles.sectionNote}>{note}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

type DeltaInfo = { up: boolean; text: string; flat?: boolean };

function Delta({ delta }: { delta: DeltaInfo }) {
  return (
    <View style={styles.delta}>
      {!delta.flat && <Ionicons name={delta.up ? 'arrow-up' : 'arrow-down'} size={12} color={colors.inkMuted} />}
      <Text style={styles.deltaText}>{delta.text}</Text>
    </View>
  );
}

function Tile({ label, value, hint, delta, wide }: { label: string; value: string; hint?: string; delta?: DeltaInfo | null; wide?: boolean }) {
  return (
    <View style={[styles.tile, wide && styles.tileWide]}>
      <Text style={styles.tileLabel}>{label}</Text>
      <View style={styles.tileValueRow}>
        <Text style={[styles.tileValue, wide && styles.tileValueWide]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        {delta && <Delta delta={delta} />}
      </View>
      {hint ? <Text style={styles.tileHint} numberOfLines={2}>{hint}</Text> : null}
    </View>
  );
}

/**
 * Vertical bars for one series. The tallest bar is labeled; tapping a bar shows its value
 * above the chart (the touch version of a hover tooltip).
 */
function BarChart({ values, labels, describe, format, labelEvery }: {
  values: number[];
  labels: string[];
  describe: (i: number) => string;
  format: (v: number) => string;
  labelEvery: number;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(0, ...values);
  const peak = max > 0 ? values.indexOf(max) : -1;
  const pick = useCallback((i: number) => setSelected((cur) => (cur === i ? null : i)), []);

  if (max === 0) return <Text style={styles.empty}>Nothing booked in this period yet.</Text>;
  return (
    <View>
      <Text style={styles.readout} numberOfLines={1}>{selected != null ? describe(selected) : 'Tap a bar for details'}</Text>
      <View style={styles.chart}>
        {values.map((v, i) => (
          <TouchableOpacity key={i} style={styles.barSlot} onPress={() => pick(i)} accessibilityLabel={describe(i)}>
            {i === peak && selected == null ? <Text style={styles.barLabel} numberOfLines={1}>{format(v)}</Text> : null}
            <View style={[styles.bar, {
              height: `${Math.max(v > 0 ? 3 : 0, (v / max) * 100)}%`,
              backgroundColor: CHART.primary,
              opacity: selected == null || selected === i ? 1 : 0.35,
            }]} />
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.axis}>
        {labels.map((l, i) => (
          <Text key={i} style={styles.axisLabel} numberOfLines={1}>{i % labelEvery === 0 ? l : ''}</Text>
        ))}
      </View>
    </View>
  );
}

/** Horizontal bars with the value written at the end of each (one series). */
function HBars({ rows }: { rows: { label: string; value: number; text: string }[] }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <View style={{ gap: 10 }}>
      {rows.map((r) => (
        <View key={r.label}>
          <View style={styles.hbarHead}>
            <Text style={styles.hbarLabel} numberOfLines={1}>{r.label}</Text>
            <Text style={styles.hbarValue}>{r.text}</Text>
          </View>
          <View style={styles.hbarTrack}>
            <View style={[styles.hbarFill, { width: `${max > 0 ? Math.max(r.value > 0 ? 2 : 0, (r.value / max) * 100) : 0}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** One bar split into parts (e.g. new vs returning), with a legend that also carries the numbers. */
function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((sum, x) => sum + x.value, 0);
  if (total === 0) return null;
  return (
    <View style={{ marginTop: 14 }}>
      <View style={styles.split}>
        {parts.filter((x) => x.value > 0).map((x) => (
          <View key={x.label} style={{ flex: x.value, backgroundColor: x.color, borderRadius: 4 }} />
        ))}
      </View>
      <View style={styles.legend}>
        {parts.map((x) => (
          <View key={x.label} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: x.color }]} />
            <Text style={styles.legendText}>{x.label} {x.value} ({Math.round((x.value / total) * 100)}%)</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 60, marginBottom: 10, paddingHorizontal: 20 },
  backBtn: { padding: 5 },
  headerTitle: { fontSize: 22, color: colors.ink, fontFamily: fonts.title },
  periods: { gap: 8, paddingHorizontal: 20, paddingVertical: 8 },
  period: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff' },
  periodActive: { backgroundColor: colors.pink, borderColor: colors.pink },
  periodText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  periodTextActive: { color: colors.wine },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  empty: { color: colors.inkMuted, textAlign: 'center', marginVertical: 16 },
  section: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginTop: 14, borderWidth: 1, borderColor: colors.line },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 8 },
  sectionTitle: { fontSize: 15, fontFamily: fonts.title, color: colors.ink },
  sectionNote: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '47%', flexGrow: 1, padding: 12, borderRadius: 14, backgroundColor: colors.background },
  tileWide: { flexBasis: '100%' },
  tileLabel: { fontSize: 12, color: colors.inkMuted, fontWeight: '600' },
  tileValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  tileValue: { fontSize: 20, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  tileValueWide: { fontSize: 28 },
  tileHint: { fontSize: 12, color: colors.inkMuted, marginTop: 3 },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: CHART.track },
  deltaText: { fontSize: 11, fontWeight: '700', color: colors.inkMuted },
  footnote: { fontSize: 12, color: colors.inkMuted, marginTop: 10 },
  readout: { fontSize: 12, color: colors.inkMuted, marginBottom: 6 },
  chart: { height: 130, flexDirection: 'row', alignItems: 'flex-end', gap: 2, borderBottomWidth: 1, borderBottomColor: CHART.track },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '100%', maxWidth: 22, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barLabel: { fontSize: 10, fontWeight: '700', color: colors.ink, marginBottom: 2, width: 70, textAlign: 'center' },
  axis: { flexDirection: 'row', gap: 2, marginTop: 4 },
  axisLabel: { flex: 1, fontSize: 9, color: colors.inkMuted, textAlign: 'center', overflow: 'visible' },
  hbarHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, gap: 8 },
  hbarLabel: { flex: 1, fontSize: 13, color: colors.ink },
  hbarValue: { fontSize: 13, fontWeight: '700', color: colors.ink },
  hbarTrack: { height: 8, borderRadius: 4, backgroundColor: CHART.track, overflow: 'hidden' },
  hbarFill: { height: '100%', borderRadius: 4, backgroundColor: CHART.primary },
  split: { flexDirection: 'row', height: 12, gap: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 13, color: colors.ink },
  fullRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hero: { fontSize: 32, fontWeight: '700', color: colors.ink },
  track: { height: 12, borderRadius: 6, backgroundColor: CHART.track, overflow: 'hidden', marginTop: 8 },
  fill: { height: '100%', borderRadius: 6, backgroundColor: CHART.primary },
  hint: { fontSize: 12, color: colors.inkMuted, marginTop: 8 },
  toggle: { flexDirection: 'row', padding: 3, borderRadius: 10, backgroundColor: colors.background },
  toggleOption: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  toggleActive: { backgroundColor: colors.pink },
  toggleText: { fontSize: 12, fontWeight: '600', color: colors.ink },
  toggleTextActive: { color: colors.wine },
});
