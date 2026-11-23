import { useCallback, useRef, useState, type ComponentRef } from 'react';
import { RefreshStar, useStarRefresh } from '../../components/SparkleStars';
import StarredTitle from '../../components/StarredTitle';
import { handle } from '../../utils/handle';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { colors, fonts } from '../../theme';
import { Text } from '../../components/AppText';   // in src/components use './AppText'
import {
  View,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { bookedMessage, canCancel, cancelAppointment, fetchMyAppointments, formatKr, isRequestExpired, type Appointment } from '../../services/booking';
import BookingModal from '../../components/BookingModal';
import BookingDetailsModal from '../../components/BookingDetailsModal';
import ReasonDialog from '../../components/ReasonDialog';
import { syncBookingReminders } from '../../services/reminders';
import MonthGrid from '../../components/calendar/MonthGrid';
import DayTimeline, { HOUR_HEIGHT } from '../../components/calendar/DayTimeline';
import ViewMenu from '../../components/calendar/ViewMenu';
import { MONTH_VIEWS, eventsByDate, useCalendarView, type CalendarEvent } from '../../components/calendar/types';

const STAR = require('../../../assets/images/star.png');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const shortLabel = (key: string) => {
  const [, m, d] = key.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1].slice(0, 3)}`;
};
const longLabel = (key: string) => {
  const [, m, d] = key.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
};
const hhmm = (t: string) => t.slice(0, 5);

/** Label for anything that isn't a plain confirmed booking. */
const requestLabel = (a: Appointment) =>
  a.status === 'pending' && !isRequestExpired(a) ? { text: 'Waiting for approval', color: colors.blue }
  : a.status === 'declined' ? { text: 'Declined', color: colors.wine }
  : a.status === 'expired' || a.status === 'pending' ? { text: 'Request expired (no answer)', color: colors.inkMuted }
  : a.status === 'cancelled'
    ? { text: a.cancelled_by === a.customer_id ? 'You cancelled' : `Cancelled by ${handle(a.creator_name)}`, color: colors.wine }
  : null;

// How many nail techs to show under "Book Again".
const BOOK_AGAIN_MAX = 3;

export default function CalendarUser() {
  // Pull down to refresh: spinning star instead of the system spinner.
  const pull = useStarRefresh();
  const today = new Date();
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const nowTime = `${pad(today.getHours())}:${pad(today.getMinutes())}`;

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState(todayKey);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  // "Book again": opens the booking with the same nail tech and services ticked.
  const [rebook, setRebook] = useState<Appointment | null>(null);
  // "View": the booking card with service, nail tech, time, place and comment.
  const [viewing, setViewing] = useState<Appointment | null>(null);
  // Booking (or request) the customer is about to cancel, and the one being cancelled right now.
  const [cancelling, setCancelling] = useState<Appointment | null>(null);
  const [cancelBusyId, setCancelBusyId] = useState<string | null>(null);
  const navigation = useNavigation<any>();
  // Compact / Stacked / Details / Day, remembered on this phone.
  const [view, setView] = useCalendarView('calendarView.customer');
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  // Same as Explore: the public profile lives in the Vendors tab.
  const goToProfile = (vendorId: string) => {
    setViewing(null);
    navigation.navigate('Vendors', { screen: 'VendorProfile', params: { vendorId } });
  };

  // Reload on focus so a freshly confirmed booking shows up.
  useFocusEffect(useCallback(() => {
    let active = true;
    // Requests too: waiting ones, and answered ones that haven't happened yet.
    fetchMyAppointments('customer', ['confirmed', 'pending', 'declined', 'expired', 'cancelled'])
      .then((rows) => {
        if (!active) return;
        setAppointments(rows.filter((a) => a.status === 'confirmed' || a.status === 'pending' || a.appointment_date >= todayKey));
        setLoadError('');
      })
      .catch((e) => active && setLoadError(e instanceof Error ? e.message : String(e?.message ?? e)))
      .finally(() => { if (active) setLoading(false); pull.doneLoading(); });
    return () => { active = false; };
  }, [pull.refreshKey, reloadKey])); // eslint-disable-line react-hooks/exhaustive-deps

  // Latest booking with each nail tech (newest first), including ones just booked.
  const bookAgain: Appointment[] = [];
  for (const a of appointments.filter((x) => x.status === 'confirmed').sort((x, y) =>
    y.appointment_date.localeCompare(x.appointment_date) || y.start_time.localeCompare(x.start_time))) {
    if (bookAgain.length === BOOK_AGAIN_MAX) break;
    if (!bookAgain.some((b) => b.creator_id === a.creator_id)) bookAgain.push(a);
  }

  const nextUp =
    appointments
      .filter((a) => a.status === 'confirmed' || (a.status === 'pending' && !isRequestExpired(a)))
      .filter((a) => a.appointment_date > todayKey || (a.appointment_date === todayKey && hhmm(a.start_time) > nowTime))
      .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date) || a.start_time.localeCompare(b.start_time))[0] ?? null;
  const daySlots = appointments.filter((a) => a.appointment_date === selected);

  // What the calendar views draw: blue = booked, wine = waiting for approval, grey = not happening.
  const events: CalendarEvent[] = appointments.map((a) => ({
    id: a.id,
    date: a.appointment_date,
    start: hhmm(a.start_time),
    end: hhmm(a.end_time),
    title: handle(a.creator_name),
    subtitle: a.services.map((s) => s.name).join(', '),
    kind: a.status === 'confirmed' ? 'booked' : a.status === 'pending' && !isRequestExpired(a) ? 'request' : 'inactive',
  }));
  const byDate = eventsByDate(events);

  const changeMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  /** Pick a day; the month shown follows it (so Day view and the month stay in step). */
  const selectDay = (key: string) => {
    const [y, m] = key.split('-').map(Number);
    setSelected(key);
    setYear(y);
    setMonth(m - 1);
  };
  const changeDay = (delta: number) => {
    const [y, m, d] = selected.split('-').map(Number);
    const next = new Date(y, m - 1, d + delta);
    selectDay(dateKey(next.getFullYear(), next.getMonth(), next.getDate()));
  };
  // Pinch on the month: Compact ↔ Stacked ↔ Details.
  const pinchView = (direction: 1 | -1) => {
    const i = MONTH_VIEWS.indexOf(view);
    const next = MONTH_VIEWS[Math.min(MONTH_VIEWS.length - 1, Math.max(0, i + direction))];
    if (next !== view) setView(next);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerSide} />
        <StarredTitle style={styles.title} star={false}>Calendar</StarredTitle>
        <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
          <ViewMenu view={view} onChange={setView} />
        </View>
      </View>

      <ScrollView ref={scrollRef} refreshControl={<RefreshControl {...pull.control} />} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Next Up */}
        <View style={styles.nextUp}>
          <Text style={styles.nextUpLabel}>Next Booking</Text>
          {/* Row 1: date + time. Row 2 (smaller): service · nail tech */}
          <View style={styles.nextUpRow}>
            <Text style={styles.nextUpText}>
              {nextUp ? `${shortLabel(nextUp.appointment_date)} ${hhmm(nextUp.start_time)}–${hhmm(nextUp.end_time)}` : 'No upcoming bookings'}
            </Text>
            {nextUp && <Image source={STAR} style={styles.nextUpStar} />}
          </View>
          {nextUp && (
            <Text style={styles.nextUpDetail}>
              {nextUp.services.map((s) => s.name).join(', ')} · {handle(nextUp.creator_name)}
              {nextUp.status === 'pending' ? ' · waiting for approval' : ''}
            </Text>
          )}
        </View>

        {/* Book again: your latest booking with each nail tech */}
        {bookAgain.length > 0 && (
          <View style={styles.againSection}>
            <Text style={styles.slotsTitle}>Book Again</Text>
            {bookAgain.map((a) => (
              <View key={a.id} style={styles.againRow}>
                <Ionicons name="refresh" size={18} color={colors.ink} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.slotText} numberOfLines={1}>{handle(a.creator_name)}</Text>
                  <Text style={styles.slotService} numberOfLines={1}>{a.services.map((s) => s.name).join(', ')}</Text>
                </View>
                <TouchableOpacity style={styles.againButton} onPress={() => setRebook(a)} accessibilityLabel={`Book ${handle(a.creator_name)} again`}>
                  <Text style={styles.againButtonText}>Book Again</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {view === 'day' ? (
          // Opens scrolled to the morning.
          <View onLayout={(e) => scrollRef.current?.scrollTo({ y: e.nativeEvent.layout.y + 7.5 * HOUR_HEIGHT, animated: false })}>
            <DayTimeline
              dateKey={selected}
              todayKey={todayKey}
              events={byDate[selected] ?? []}
              onChangeDay={changeDay}
              onToday={() => selectDay(todayKey)}
              onEventPress={(e) => setViewing(appointments.find((a) => a.id === e.id) ?? null)}
            />
          </View>
        ) : (
          <MonthGrid
            view={view}
            year={year}
            month={month}
            onChangeMonth={changeMonth}
            todayKey={todayKey}
            selected={selected}
            onSelectDay={setSelected}
            events={byDate}
            starDate={nextUp?.appointment_date}
            onPinch={pinchView}
          />
        )}

        {/* Bookings for selected day */}
        {view !== 'day' && <>
        <View style={styles.slotsHeader}>
          <Text style={styles.slotsTitle}>my bookings<Text style={styles.titleDot}> • </Text>{longLabel(selected)}</Text>
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          {loadError ? <Text style={styles.error}>{loadError}</Text> : null}
          {daySlots.length === 0 && !loadError && (
            <Text style={styles.empty}>
              {loading ? 'Loading your bookings...' : 'No bookings this day. Find a creator in Explore to book one.'}
            </Text>
          )}
          {daySlots.map((a) => (
            <View key={a.id} style={styles.slotWrap}>
              <View style={styles.slot}>
                <Ionicons name="time-outline" size={18} color={colors.ink} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.slotText}>
                    {hhmm(a.start_time)} – {hhmm(a.end_time)} · {a.creator_name}
                  </Text>
                  <Text style={styles.slotService}>{a.services.map((s) => s.name).join(', ')}</Text>
                  <Text style={styles.slotService}>{a.total_minutes} min · {formatKr(a.total_price)}</Text>
                  {requestLabel(a) && (
                    <Text style={[styles.slotStatus, { color: requestLabel(a)!.color }]}>{requestLabel(a)!.text}</Text>
                  )}
                  {a.status === 'declined' && a.decline_reason ? (
                    <Text style={styles.slotService}>“{a.decline_reason}”</Text>
                  ) : null}
                  {a.status === 'cancelled' && a.cancel_reason ? (
                    <Text style={styles.slotService}>“{a.cancel_reason}”</Text>
                  ) : null}
                </View>
                <View style={styles.slotButtons}>
                  <TouchableOpacity style={styles.againButton} onPress={() => setViewing(a)} accessibilityLabel="View booking">
                    <Text style={styles.againButtonText}>View</Text>
                  </TouchableOpacity>
                  {canCancel(a) && (cancelBusyId === a.id ? (
                    <ActivityIndicator color={colors.wine} />
                  ) : (
                    <TouchableOpacity onPress={() => setCancelling(a)} hitSlop={8}
                      accessibilityLabel={a.status === 'pending' ? 'Withdraw request' : 'Cancel booking'}>
                      <Text style={styles.cancelLink}>{a.status === 'pending' ? 'Withdraw' : 'Cancel'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          ))}
        </View>
        </>}
      </ScrollView>
      <RefreshStar refreshing={pull.refreshing} y={120} />

      {cancelling && (
        <ReasonDialog
          title={cancelling.status === 'pending' ? 'Withdraw request' : 'Cancel booking'}
          subtitle={`${handle(cancelling.creator_name)} · ${longLabel(cancelling.appointment_date)} ${hhmm(cancelling.start_time)}`}
          confirmLabel={cancelling.status === 'pending' ? 'Withdraw' : 'Cancel booking'}
          placeholder="Message to your nail tech (optional)"
          onClose={() => setCancelling(null)}
          onConfirm={async (reason) => {
            const a = cancelling;
            setCancelling(null);
            setCancelBusyId(a.id);
            try {
              await cancelAppointment(a.id, reason);
              void syncBookingReminders(); // drop its 36 h / 2 h reminders
            } catch (e: any) {
              Alert.alert('Could not cancel', e instanceof Error ? e.message : String(e?.message ?? e));
            } finally {
              setCancelBusyId(null);
              setReloadKey((n) => n + 1);
            }
          }}
        />
      )}
      <BookingDetailsModal
        appointment={viewing}
        onClose={() => setViewing(null)}
        onViewProfile={goToProfile}
        onChanged={() => { setViewing(null); setReloadKey((n) => n + 1); }}
      />
      <BookingModal
        visible={rebook !== null}
        creator={rebook ? { id: rebook.creator_id, name: rebook.creator_name } : null}
        initialServiceIds={rebook?.services.map((s) => s.id) ?? null}
        onClose={() => setRebook(null)}
        onBooked={(a) => {
          setRebook(null);
          setReloadKey((n) => n + 1);
          const msg = bookedMessage(a);
          Alert.alert(msg.title, msg.body);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: { fontSize: 20 },
  headerSide: { flex: 1 },
  nextUp: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 20,
    padding: 18,
    borderRadius: 14,
    backgroundColor: colors.blue,
  },
  nextUpLabel: { fontSize: 12, fontFamily: fonts.title, color: colors.blueDeep, textTransform: 'uppercase' },
  nextUpText: { fontSize: 24, fontWeight: '700', marginTop: 6, color: colors.background },
  nextUpRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  nextUpStar: { width: 18, height: 18, alignSelf: 'flex-start', marginTop: -2, marginLeft: -5 }, // up and to the right of the date/time
  nextUpDetail: { fontSize: 15, marginTop: 4, color: colors.background }, // service · person
  slotsHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    marginTop: 8,
  },
  slotsTitle: { fontSize: 13, color: colors.ink, fontFamily: fonts.title },
  // HORIZON draws no visible dot, so the separator uses the regular font
  titleDot: { fontFamily: fonts.regular, fontWeight: 'normal', color: colors.ink },
  empty: { color: colors.inkMuted, paddingVertical: 8 },
  slotWrap: { marginBottom: 10, paddingTop: 8 },
  againSection: { marginHorizontal: 16, marginBottom: 12, gap: 8 },
  againRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.pinkTint },
  againButton: { backgroundColor: colors.pink, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  againButtonText: { color: colors.wine, fontSize: 14, fontWeight: '700' },
  slotButtons: { alignItems: 'center', gap: 8 },
  cancelLink: { fontSize: 13, color: colors.wine, fontWeight: '600', textDecorationLine: 'underline' },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    paddingRight: 28,
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  slotText: { fontSize: 16, fontWeight: '600' },
  slotService: { fontSize: 14, color: colors.inkMuted, marginTop: 2 },
  slotStatus: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  minus: {
    position: 'absolute',
    top: 0,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.wine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,21,14,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { backgroundColor: colors.background, borderRadius: 14, padding: 20 },
  modalTitle: { fontSize: 17, marginBottom: 12, color: colors.ink, fontFamily: fonts.title },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    marginBottom: 10,
  },
  error: { color: 'crimson', marginBottom: 8 },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 20,
    marginTop: 4,
  },
  cancel: { fontSize: 16, color: colors.inkMuted },
  saveButton: {
    backgroundColor: colors.wine,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveText: { color: colors.background, fontSize: 16, fontWeight: '600' },
});