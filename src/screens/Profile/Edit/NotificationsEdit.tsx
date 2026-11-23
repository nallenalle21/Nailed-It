import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Card, EditScreen, ToggleRow, editErrorMessage } from '../../../components/EditKit';
import { fetchNotificationSettings, saveNotificationSettings, type NotificationSettings } from '../../../services/profileSettings';

/** Which push notifications to get (freelancers and customers). Saved on every switch. */
export default function NotificationsEdit({ navigation, route }: any) {
  const isCreator = route?.params?.role === 'creator';
  const [settings, setSettings] = useState<NotificationSettings | null>(null);

  useEffect(() => {
    let active = true;
    fetchNotificationSettings()
      .then((s) => active && setSettings(s))
      .catch((e) => Alert.alert('Could not load', editErrorMessage(e)));
    return () => { active = false; };
  }, []);

  const change = async (key: keyof NotificationSettings, value: boolean) => {
    if (!settings) return;
    const previous = settings;
    const next = { ...settings, [key]: value };
    setSettings(next);
    try {
      await saveNotificationSettings(next);
    } catch (e) {
      setSettings(previous);
      Alert.alert('Could not save', editErrorMessage(e));
    }
  };

  return (
    <EditScreen title="Notifications" onBack={() => navigation.goBack()} loading={!settings}
      intro="Choose what you get notified about. You can also turn notifications off completely in your phone’s settings.">
      {settings && (
        <Card>
          <ToggleRow label={isCreator ? 'New bookings' : 'Booking confirmations'}
            hint={isCreator ? 'When a customer books you, or accepts your offer' : 'When a booking is confirmed or accepted'}
            value={settings.new_bookings} onChange={(v) => change('new_bookings', v)} />
          {isCreator && (
            <ToggleRow label="Booking requests" hint="When a customer asks for a time you need to approve"
              value={settings.booking_requests} onChange={(v) => change('booking_requests', v)} />
          )}
          <ToggleRow label="Cancellations" hint="Cancelled, declined or expired bookings and requests"
            value={settings.cancellations} onChange={(v) => change('cancellations', v)} />
          <ToggleRow label="Reminders" hint="Before an upcoming appointment"
            value={settings.reminders} onChange={(v) => change('reminders', v)} />
        </Card>
      )}
    </EditScreen>
  );
}
