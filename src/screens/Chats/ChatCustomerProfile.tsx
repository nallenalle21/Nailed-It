import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SubPage from '../../components/SubPage';
import CustomerProfileCard from '../../components/CustomerProfileCard';
import { Text } from '../../components/AppText';
import { colors } from '../../theme';
import { supabase } from '../../services/supabase';
import { getCustomerCard, type CustomerCard } from '../../services/account';
import { getVendorAvatarUrl } from '../../services/vendorAvatar';

/**
 * A customer's profile as a freelancer sees it (from a chat, etc.): the same card the customer
 * sees on "My profile" — name, @username, location, bookings, collections, member since.
 * Params: customerId, or chatId (the other person in the chat); customerName as a fallback.
 */
export default function CustomerProfile({ route, navigation }: any) {
  const { customerName, chatId, customerId: givenId } = route.params ?? {};
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<CustomerCard | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      let customerId: string | undefined = givenId;
      if (!customerId && chatId) {
        const { data: { user } } = await supabase.auth.getUser();
        customerId = String(chatId).split('_').find((id) => id !== user?.id);
      }
      if (!customerId) return;
      getVendorAvatarUrl(customerId).then(setPhotoUri).catch(() => setPhotoUri(null));
      setCard(await getCustomerCard(customerId));
    } catch (e) {
      // Before supabase/customer_card.sql has run: the card shows the username only.
      console.warn('[CustomerProfile] Could not load customer:', e);
    } finally {
      setLoading(false);
    }
  }, [givenId, chatId]);

  useEffect(() => {
    void load(); // eslint-disable-line react-hooks/set-state-in-effect -- loads data; state is set when it arrives
  }, [load]);

  return (
    <SubPage title="Profile">
      {loading ? (
        <ActivityIndicator size="large" color={colors.wine} style={{ marginTop: 40 }} />
      ) : (
        <>
          <CustomerProfileCard
            name={card?.name ?? null}
            username={card?.username || customerName || ''}
            city={card?.city ?? null}
            memberSince={card?.memberSince ?? null}
            bookings={card ? card.bookings : null}
            collections={card ? card.collections : null}
            photoUri={photoUri}
          />
          <TouchableOpacity style={styles.messageButton} onPress={() => navigation.goBack()} accessibilityRole="button">
            <Ionicons name="chatbubble-outline" size={18} color={colors.background} />
            <Text style={styles.messageButtonText}>Message</Text>
          </TouchableOpacity>
        </>
      )}
    </SubPage>
  );
}

const styles = StyleSheet.create({
  messageButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'center', backgroundColor: colors.grey, paddingVertical: 11, paddingHorizontal: 26, borderRadius: 22 },
  messageButtonText: { color: colors.background, fontWeight: '700', fontSize: 15 },
});
