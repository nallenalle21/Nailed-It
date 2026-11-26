import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { TextInput } from '../../components/AppTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/AppText';
import { colors, fonts } from '../../theme';
import {
  CATEGORY_LABELS,
  WORKPLACE_LABELS,
  completeOnboarding,
  getMyOnboarding,
  lookUpArea,
  saveOnboarding,
  type Category,
  type Onboarding,
  type OnboardingField,
  type WorkplaceType,
} from '../../services/onboarding';

const STEPS = ['Name', 'Category', 'Workplace', 'Contact', 'Terms'] as const;
const TRAVEL_KM = [5, 10, 15, 25, 50];
const CATEGORY_ICONS: Record<Category, keyof typeof Ionicons.glyphMap> = { nails: 'hand-left-outline', lashes: 'eye-outline', brows: 'happy-outline' };
const WORKPLACE_ICONS: Record<WorkplaceType, keyof typeof Ionicons.glyphMap> = { home_studio: 'home-outline', salon_chair: 'cut-outline', mobile: 'car-outline' };
/** Which step a missing field belongs to (1-based). */
const STEP_OF: Record<OnboardingField, number> = {
  display_name: 1, categories: 2, workplace_types: 3, travel_km: 3, address: 3, area: 3, phone: 4, contact_email: 4, terms: 5,
};

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as any).message) : String(e);

/**
 * Step-by-step setup every freelancer completes before customers can see them: display name,
 * categories, workplace (+ private address), private contact details, terms. Each step is
 * saved, so "Finish later" never loses anything; it reopens at the step they reached.
 * With route.params.mode === 'edit' (from Settings) it is used to change these details later.
 */
export default function FreelancerOnboarding({ navigation, route }: any) {
  const editing = route?.params?.mode === 'edit';
  // Editing one detail from the profile page: open that step only, and go back when saved.
  const onlyStep: number | undefined = editing ? route?.params?.step : undefined;
  const [loaded, setLoaded] = useState<Onboarding | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Form fields (filled from what's saved)
  const [displayName, setDisplayName] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [workplaces, setWorkplaces] = useState<WorkplaceType[]>([]);
  const [address, setAddress] = useState('');
  const [area, setArea] = useState('');
  const [points, setPoints] = useState<{ address: { lat: number; lng: number } | null; area: { lat: number; lng: number } | null }>({ address: null, area: null });
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [travelKm, setTravelKm] = useState<number | null>(null);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptGuidelines, setAcceptGuidelines] = useState(false);
  const [reading, setReading] = useState<'terms' | 'guidelines' | null>(null);

  useEffect(() => {
    let active = true;
    getMyOnboarding()
      .then((o) => {
        if (!active || !o) return;
        setLoaded(o);
        setDisplayName(o.display_name ?? '');
        setCategories(o.categories ?? []);
        setWorkplaces(o.workplace_types ?? []);
        setAddress(o.address ?? '');
        setArea(o.area ?? '');
        setPoints({
          address: o.address_lat != null && o.address_lng != null ? { lat: o.address_lat, lng: o.address_lng } : null,
          area: o.area_lat != null && o.area_lng != null ? { lat: o.area_lat, lng: o.area_lng } : null,
        });
        setTravelKm(o.travel_km);
        setPhone(o.phone ?? '');
        setEmail(o.contact_email ?? '');
        setAcceptTerms(o.terms_accepted);
        setAcceptGuidelines(o.terms_accepted);
        // Continue where they left off (editing starts at the beginning).
        setStep(onlyStep ?? (editing || o.completed ? 1 : Math.min(STEPS.length, Math.max(1, o.step + 1))));
      })
      .catch((e) => active && setLoadError(errorMessage(e)));
    return () => { active = false; };
  }, [editing, onlyStep]);

  const leave = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.reset({ index: 0, routes: [{ name: 'CreatorTabs' }] });
  };

  const findArea = async () => {
    if (address.trim().length < 5) {
      setLookupNote('Type your full address first.');
      return;
    }
    setLookingUp(true);
    setLookupNote(null);
    try {
      const found = await lookUpArea(address.trim());
      setPoints({ address: found.address, area: found.areaPoint });
      if (found.area) setArea(found.area);
      else setLookupNote('We found the address but not the area name. Please type it below.');
    } catch (e) {
      setPoints({ address: null, area: null });
      setLookupNote(`${errorMessage(e)} You can type the area yourself below.`);
    } finally {
      setLookingUp(false);
    }
  };

  /** What this step saves, or a message about what's missing. */
  const stepData = (): Record<string, unknown> | string => {
    switch (step) {
      case 1:
        return displayName.trim().length >= 2 ? { display_name: displayName.trim() } : 'Add a display name (at least 2 characters).';
      case 2:
        return categories.length ? { categories } : 'Choose at least one category.';
      case 3:
        if (!workplaces.length) return 'Choose at least one type of workplace.';
        if (address.trim().length < 5) return 'Add your full address.';
        if (area.trim().length < 2) return 'Add the area customers will see, e.g. Södermalm.';
        if (workplaces.includes('mobile') && !travelKm) return 'Choose how far you travel.';
        return {
          workplace_types: workplaces,
          travel_km: workplaces.includes('mobile') ? travelKm : null,
          address: address.trim(),
          address_lat: points.address?.lat ?? null,
          address_lng: points.address?.lng ?? null,
          area: area.trim(),
          area_lat: points.area?.lat ?? null,
          area_lng: points.area?.lng ?? null,
        };
      case 4:
        if (!/^\+?[0-9][0-9 ()-]{6,19}$/.test(phone.trim())) return 'Add a valid phone number.';
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return 'Add a valid email address.';
        return { phone: phone.trim(), contact_email: email.trim() };
      default:
        return acceptTerms && acceptGuidelines ? { accept_terms: true } : 'Accept the terms and the community guidelines to continue.';
    }
  };

  const next = async () => {
    // Address typed but area not looked up yet: look it up and let them check it first.
    if (step === 3 && !area.trim() && address.trim().length >= 5 && !lookingUp) {
      await findArea();
      return;
    }
    const data = stepData();
    if (typeof data === 'string') {
      Alert.alert('Almost there', data);
      return;
    }
    setSaving(true);
    try {
      const saved = await saveOnboarding(step, data);
      setLoaded(saved);
      if (onlyStep) {
        leave();
        return;
      }
      if (step < STEPS.length) {
        setStep(step + 1);
        return;
      }
      const result = await completeOnboarding();
      if (result.live) {
        setDone(true);
      } else {
        const first = Math.min(...result.missing.map((f) => STEP_OF[f] ?? 1));
        Alert.alert('A few things are missing', 'Please complete the highlighted step.');
        setStep(first);
      }
    } catch (e) {
      Alert.alert('Could not save', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const back = () => (step > 1 && !onlyStep ? setStep(step - 1) : leave());

  if (loadError) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.error}>Could not load your setup: {loadError}</Text>
        <TouchableOpacity onPress={leave}><Text style={styles.link}>Back</Text></TouchableOpacity>
      </SafeAreaView>
    );
  }
  if (!loaded) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.blue} />
      </SafeAreaView>
    );
  }

  if (done) {
    return (
      <SafeAreaView style={[styles.container, styles.doneWrap]}>
        <Ionicons name="sparkles" size={48} color={colors.wine} />
        <Text style={styles.doneTitle}>{editing || loaded.completed ? 'Saved' : 'You’re live!'}</Text>
        <Text style={styles.doneText}>
          Customers can now find {displayName.trim()} in Explore. Add services and availability so they can book you.
        </Text>
        <TouchableOpacity style={styles.primary} onPress={leave}>
          <Text style={styles.primaryText}>{editing ? 'Done' : 'Go to Nailed It'}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Top: back, progress, finish later */}
        <View style={styles.top}>
          <TouchableOpacity onPress={back} hitSlop={10} accessibilityLabel={step > 1 ? 'Previous step' : 'Close'}>
            <Ionicons name={step > 1 ? 'arrow-back' : 'close'} size={24} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.stepText}>{onlyStep ? STEPS[step - 1] : `Step ${step} of ${STEPS.length}`}</Text>
          {!editing && !loaded.completed ? (
            <TouchableOpacity onPress={leave} hitSlop={10}>
              <Text style={styles.later}>Finish later</Text>
            </TouchableOpacity>
          ) : <View style={{ width: 24 }} />}
        </View>
        <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: STEPS.length, now: step }}>
          {STEPS.map((label, i) => (
            <View key={label} style={[styles.progressPart, i < step && styles.progressDone]} />
          ))}
        </View>
        {!loaded.completed && (
          <Text style={styles.hiddenNote}>Your profile stays hidden from customers until all steps are done.</Text>
        )}

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {step === 1 && (
            <>
              <Text style={styles.title}>What should customers call you?</Text>
              <Text style={styles.lead}>Your display name is shown on your profile and in Explore. Your username @{loaded.username} stays your handle.</Text>
              <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder="e.g. Anna’s Nail Studio"
                placeholderTextColor={colors.inkMuted} maxLength={40} autoFocus />
            </>
          )}

          {step === 2 && (
            <>
              <Text style={styles.title}>What do you offer?</Text>
              <Text style={styles.lead}>Choose one or more.</Text>
              {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                <Choice key={c} icon={CATEGORY_ICONS[c]} label={CATEGORY_LABELS[c]} selected={categories.includes(c)}
                  onPress={() => setCategories((cur) => toggle(cur, c))} />
              ))}
            </>
          )}

          {step === 3 && (
            <>
              <Text style={styles.title}>Where do you work?</Text>
              <Text style={styles.lead}>Choose one or more.</Text>
              {(Object.keys(WORKPLACE_LABELS) as WorkplaceType[]).map((w) => (
                <Choice key={w} icon={WORKPLACE_ICONS[w]} label={WORKPLACE_LABELS[w]} selected={workplaces.includes(w)}
                  onPress={() => setWorkplaces((cur) => toggle(cur, w))} />
              ))}

              {workplaces.includes('mobile') && (
                <>
                  <Text style={styles.label}>How far do you travel?</Text>
                  <View style={styles.chips}>
                    {TRAVEL_KM.map((km) => (
                      <TouchableOpacity key={km} style={[styles.chip, travelKm === km && styles.chipActive]} onPress={() => setTravelKm(km)}>
                        <Text style={[styles.chipText, travelKm === km && styles.chipTextActive]}>{km} km</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <Text style={styles.label}>
                {workplaces.length === 1 && workplaces[0] === 'mobile' ? 'Your base address' : 'Your address'}
              </Text>
              <TextInput
                style={styles.input}
                value={address}
                onChangeText={(t) => { setAddress(t); setPoints({ address: null, area: null }); }}
                onEndEditing={() => { if (!area.trim() && address.trim().length >= 5) void findArea(); }}
                placeholder="Street, number, city"
                placeholderTextColor={colors.inkMuted}
                maxLength={200}
              />
              <View style={styles.privacy}>
                <Ionicons name="lock-closed-outline" size={15} color={colors.inkMuted} />
                <Text style={styles.privacyText}>
                  Private. Customers only see the area. The exact address is shared with a customer once their booking is confirmed.
                </Text>
              </View>
              <TouchableOpacity style={styles.secondary} onPress={findArea} disabled={lookingUp}>
                {lookingUp ? <ActivityIndicator color={colors.wine} /> : (
                  <>
                    <Ionicons name="locate-outline" size={16} color={colors.wine} />
                    <Text style={styles.secondaryText}>Find my area</Text>
                  </>
                )}
              </TouchableOpacity>
              {lookupNote ? <Text style={styles.note}>{lookupNote}</Text> : null}

              <Text style={styles.label}>Customers will see</Text>
              <TextInput style={styles.input} value={area} onChangeText={setArea} placeholder="e.g. Södermalm"
                placeholderTextColor={colors.inkMuted} maxLength={60} />
              {workplaces.includes('mobile') && area.trim() && travelKm ? (
                <Text style={styles.note}>Shown as: Travels to you · within {travelKm} km of {area.trim()}</Text>
              ) : null}
            </>
          )}

          {step === 4 && (
            <>
              <Text style={styles.title}>How can we reach you?</Text>
              <Text style={styles.lead}>Never shown on your profile. Nailed It uses these to contact you about your account and bookings.</Text>
              <Text style={styles.label}>Phone number</Text>
              <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="+46 70 123 45 67"
                placeholderTextColor={colors.inkMuted} keyboardType="phone-pad" maxLength={20} />
              <Text style={styles.label}>Email</Text>
              <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com"
                placeholderTextColor={colors.inkMuted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={120} />
            </>
          )}

          {step === 5 && (
            <>
              <Text style={styles.title}>Last step</Text>
              <Text style={styles.lead}>Please read and accept these to go live.</Text>
              <Check label="I accept the Terms and conditions" checked={acceptTerms} onToggle={() => setAcceptTerms((v) => !v)} onRead={() => setReading('terms')} />
              <Check label="I accept the Community guidelines" checked={acceptGuidelines} onToggle={() => setAcceptGuidelines((v) => !v)} onRead={() => setReading('guidelines')} />
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={[styles.primary, saving && { opacity: 0.6 }]} onPress={next} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.wine} /> : (
              <Text style={styles.primaryText}>
                {onlyStep ? 'Save' : step < STEPS.length ? 'Next' : loaded.completed ? 'Save' : 'Go live'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={reading !== null} animationType="slide" onRequestClose={() => setReading(null)}>
        <SafeAreaView style={styles.container}>
          <View style={styles.top}>
            <View style={{ width: 24 }} />
            <Text style={styles.stepText}>{reading === 'terms' ? 'Terms and conditions' : 'Community guidelines'}</Text>
            <TouchableOpacity onPress={() => setReading(null)} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={colors.ink} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.draft}>Draft: the final text will replace this before launch.</Text>
            <Text style={styles.lead}>{reading === 'terms' ? TERMS_DRAFT : GUIDELINES_DRAFT}</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function Choice({ icon, label, selected, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.choice, selected && styles.choiceActive]} onPress={onPress}
      accessibilityRole="checkbox" accessibilityState={{ checked: selected }}>
      <Ionicons name={icon} size={22} color={selected ? colors.wine : colors.ink} />
      <Text style={[styles.choiceText, selected && styles.choiceTextActive]}>{label}</Text>
      <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? colors.wine : colors.inkMuted} />
    </TouchableOpacity>
  );
}

function Check({ label, checked, onToggle, onRead }: { label: string; checked: boolean; onToggle: () => void; onRead: () => void }) {
  return (
    <View style={styles.check}>
      <TouchableOpacity style={styles.checkRow} onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked }}>
        <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={checked ? colors.wine : colors.ink} />
        <Text style={styles.checkText}>{label}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onRead} hitSlop={8}>
        <Text style={styles.link}>Read</Text>
      </TouchableOpacity>
    </View>
  );
}

const TERMS_DRAFT = [
  '1. You offer your services as an independent professional. Nailed It connects you with customers and handles bookings.',
  '2. The information you give must be true and kept up to date, including your services, prices and availability.',
  '3. You honour confirmed bookings, or cancel in good time through the app.',
  '4. Your phone number, email and exact address are private. Your address is shared only with customers who have a confirmed booking with you.',
  '5. Fees and payments will be described here once they are decided.',
].join('\n\n');

const GUIDELINES_DRAFT = [
  '• Be kind and respectful to customers and other freelancers.',
  '• Only post photos of your own work, and only with your customers’ consent.',
  '• Keep a clean, safe and hygienic workplace.',
  '• Communicate through the app and keep customers informed about changes.',
  '• No discrimination, harassment or misleading information.',
].join('\n');

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  stepText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  later: { fontSize: 14, color: colors.wine, fontWeight: '600' },
  progressTrack: { flexDirection: 'row', gap: 4, paddingHorizontal: 20 },
  progressPart: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(11,21,14,0.08)' },
  progressDone: { backgroundColor: colors.pink },
  hiddenNote: { fontSize: 12, color: colors.inkMuted, paddingHorizontal: 20, marginTop: 8 },
  body: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontFamily: fonts.title, color: colors.ink, marginTop: 8 },
  lead: { fontSize: 15, color: colors.inkMuted, marginTop: 8, marginBottom: 16, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: '700', color: colors.ink, marginTop: 18, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, fontSize: 16, color: colors.ink, backgroundColor: '#fff' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', marginBottom: 10 },
  choiceActive: { borderColor: colors.pink, backgroundColor: colors.pinkTint },
  choiceText: { flex: 1, fontSize: 16, color: colors.ink },
  choiceTextActive: { color: colors.wine, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff' },
  chipActive: { backgroundColor: colors.pink, borderColor: colors.pink },
  chipText: { fontSize: 14, color: colors.ink, fontWeight: '600' },
  chipTextActive: { color: colors.wine },
  privacy: { flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'flex-start' },
  privacyText: { flex: 1, fontSize: 12, color: colors.inkMuted, lineHeight: 17 },
  secondary: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: colors.pink, minWidth: 140, justifyContent: 'center' },
  secondaryText: { fontSize: 14, fontWeight: '600', color: colors.wine },
  note: { fontSize: 12, color: colors.inkMuted, marginTop: 8 },
  check: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  checkText: { flex: 1, fontSize: 15, color: colors.ink },
  link: { fontSize: 14, color: colors.blue, fontWeight: '600', textDecorationLine: 'underline' },
  footer: { padding: 20, paddingTop: 8 },
  primary: { backgroundColor: colors.pink, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: colors.wine, fontSize: 16, fontWeight: '700' },
  doneWrap: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  doneTitle: { fontSize: 26, fontFamily: fonts.title, color: colors.ink },
  doneText: { fontSize: 15, color: colors.inkMuted, textAlign: 'center', lineHeight: 21, marginBottom: 12 },
  draft: { fontSize: 12, color: colors.wine, fontWeight: '700', marginBottom: 8 },
  error: { color: colors.wine, margin: 20 },
});
