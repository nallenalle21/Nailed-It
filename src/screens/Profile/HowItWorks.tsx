import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SubPage from '../../components/SubPage';
import { Text } from '../../components/AppText';
import { colors, fonts } from '../../theme';

// The main things a customer does in the app, in the order they usually do them.
const STEPS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: 'compass-outline',
    title: 'Get inspired',
    body: 'Scroll the Feed on Explore for nail looks from local nail techs. Use the filter to see only the services, prices or dates you want, and the search icon to find a nail tech by username.',
  },
  {
    icon: 'heart-outline',
    title: 'Save what you love',
    body: 'Press and hold a photo to save it into a collection on your Inspiration page, or save a whole nail tech from their profile.',
  },
  {
    icon: 'calendar-outline',
    title: 'Book a time',
    body: 'Tap "Book this look" on a photo, or switch Explore to Book to see nail techs near you with their next free times. Pick your services and a time, and you’re booked.',
  },
  {
    icon: 'chatbubbles-outline',
    title: 'Chat with your nail tech',
    body: 'Questions about a design or the address? Message them under Chats. Some nail techs confirm requests by hand: you’ll be notified when they do.',
  },
  {
    icon: 'sparkles-outline',
    title: 'Get nailed',
    body: 'Your bookings are in Calendar, with a reminder before each one. Need to cancel? Do it from the booking in Calendar.',
  },
];

/** Opened from Settings → About and from the profile: a short step-by-step guide. */
export default function HowItWorks() {
  return (
    <SubPage title="How it works">
      {STEPS.map((step, i) => (
        <View key={step.title} style={styles.step}>
          {/* Number + a line down to the next step */}
          <View style={styles.rail}>
            <View style={styles.number}><Text style={styles.numberText}>{i + 1}</Text></View>
            {i < STEPS.length - 1 && <View style={styles.line} />}
          </View>
          <View style={styles.body}>
            <View style={styles.titleRow}>
              <Ionicons name={step.icon} size={18} color={colors.wine} />
              <Text style={styles.title}>{step.title}</Text>
            </View>
            <Text style={styles.text}>{step.body}</Text>
          </View>
        </View>
      ))}
    </SubPage>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: 14 },
  rail: { alignItems: 'center', width: 32 },
  number: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.pink, alignItems: 'center', justifyContent: 'center' },
  numberText: { color: colors.wine, fontWeight: '700', fontSize: 15 },
  line: { flex: 1, width: 2, backgroundColor: colors.line, marginVertical: 4 },
  body: { flex: 1, paddingBottom: 26 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 32 },
  title: { fontSize: 15, fontFamily: fonts.title, color: colors.ink },
  text: { fontSize: 15, lineHeight: 22, color: colors.inkMuted, marginTop: 2 },
});
