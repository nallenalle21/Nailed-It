import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Card, Chips, EditScreen, Field, OptionRow, ToggleRow, editErrorMessage } from '../../../components/EditKit';
import { setAutoAcceptBookings } from '../../../services/bookingRequests';
import {
  CANCEL_NOTICE_LABELS,
  fetchMySettings,
  updateMyProfile,
  type CancelNotice,
} from '../../../services/profileSettings';

const NOTICES: CancelNotice[] = [0, 24, 48, 168];

/** How bookings work: approval, cancellation policy and deposit. Customers see the last two before booking. */
export default function BookingRulesEdit({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [autoAccept, setAutoAccept] = useState(true);
  const [notice, setNotice] = useState<CancelNotice>(0);
  const [deposit, setDeposit] = useState(false);
  const [depositType, setDepositType] = useState<'kr' | 'percent'>('kr');
  const [amount, setAmount] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetchMySettings()
      .then((s) => {
        if (!active) return;
        setAutoAccept(s.auto_accept_bookings ?? true);
        setNotice(s.cancel_notice_hours ?? 0);
        setDeposit(s.deposit_enabled);
        setDepositType(s.deposit_type ?? 'kr');
        setAmount(s.deposit_amount != null ? String(Number(s.deposit_amount)) : '');
        setInstructions(s.deposit_instructions ?? '');
      })
      .catch((e) => Alert.alert('Could not load', editErrorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const save = async () => {
    const value = Number(amount.replace(',', '.'));
    if (deposit && (!Number.isFinite(value) || value <= 0 || (depositType === 'percent' && value > 100))) {
      Alert.alert('Check the deposit', depositType === 'percent' ? 'Enter a percentage between 1 and 100.' : 'Enter an amount in kr.');
      return;
    }
    setSaving(true);
    try {
      await setAutoAcceptBookings(autoAccept);
      await updateMyProfile({
        cancel_notice_hours: notice,
        deposit_enabled: deposit,
        ...(deposit ? { deposit_type: depositType, deposit_amount: value, deposit_instructions: instructions } : {}),
      });
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not save', editErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditScreen title="Booking settings" onBack={() => navigation.goBack()} loading={loading} onSave={save} saving={saving}>
      <Card title="New bookings">
        <OptionRow radio label="Accept automatically" hint="Customers book free times directly." selected={autoAccept} onPress={() => setAutoAccept(true)} />
        <OptionRow radio label="I approve each booking" hint="Bookings arrive as requests in your Calendar; the time is held meanwhile."
          selected={!autoAccept} onPress={() => setAutoAccept(false)} />
      </Card>

      <Card title="Cancellation policy" note="Shown to customers before they book. Inside this time they can’t cancel in the app; they’re asked to message you instead. You can always cancel.">
        {NOTICES.map((h) => (
          <OptionRow key={h} radio label={CANCEL_NOTICE_LABELS[h]} selected={notice === h} onPress={() => setNotice(h)} />
        ))}
      </Card>

      <Card title="Deposit" note="Shown to customers when they book. Payment happens outside the app for now, e.g. Swish.">
        <ToggleRow label="Ask for a deposit" value={deposit} onChange={setDeposit} />
        {deposit && (
          <>
            <Chips options={['kr', 'percent'] as ('kr' | 'percent')[]} selected={[depositType]} onToggle={setDepositType}
              label={(t) => (t === 'kr' ? 'Fixed amount (kr)' : 'Percent of price')} />
            <Field label={depositType === 'kr' ? 'Amount (kr)' : 'Percent (%)'} value={amount} onChangeText={setAmount}
              keyboardType="decimal-pad" maxLength={6} placeholder={depositType === 'kr' ? '200' : '30'} />
            <Field label="How to pay" value={instructions} onChangeText={setInstructions} maxLength={200} multiline
              placeholder="e.g. Swish 070-123 45 67 within 24 h of booking, with your name." />
          </>
        )}
      </Card>
    </EditScreen>
  );
}
