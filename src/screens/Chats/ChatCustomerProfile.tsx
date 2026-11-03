import React, { useEffect, useState } from 'react';
import { RefreshStar, useStarRefresh } from '../../components/SparkleStars';
import StarredTitle from '../../components/StarredTitle';
import { colors, fonts } from '../../theme';
import { handle } from '../../utils/handle';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/AppText';
import { supabase } from '../../services/supabase';

export default function CustomerProfile({ route, navigation }: any) {
  // Pull down to refresh: spinning star instead of the system spinner.
  const pull = useStarRefresh(() => fetchCustomerData());
  const { customerName, chatId } = route.params;
  const [loading, setLoading] = useState(true);
  const [customerInfo, setCustomerInfo] = useState<any>(null);
  const [pastBookingsCount, setPastBookingsCount] = useState(0);

  useEffect(() => {
    fetchCustomerData();
  }, []);

  const fetchCustomerData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !chatId) return;

    // Utvinn kundens ID från chattens ID
    const ids = chatId.split('_');
    const customerId = ids.find((id: string) => id !== user.id);

    if (customerId) {
      // 1. Hämta profilinformation
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', customerId)
        .single();

      if (profileData) {
        setCustomerInfo(profileData);
      }

      // 2. Hämta antal bokningar med detta företag
      const { count } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('chat_id', chatId);

      setPastBookingsCount(count || 0);
    }
    setLoading(false);
  };

  const renderStars = (rating: number) => {
    return (
      <View style={styles.starsContainer}>
        {[...Array(5)].map((_, index) => (
          <Ionicons key={index} name={index < rating ? "star" : "star-outline"} size={16} color={colors.yellow} />
        ))}
      </View>
    );
  };

  if (loading) {
    return <ActivityIndicator style={{ flex: 1, justifyContent: 'center' }} size="large" color={colors.blue} />;
  }

  // Om profil saknas (t.ex. raderad användare), visa fallback-namnet från chatten
  const displayName = customerInfo?.username || customerName;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </TouchableOpacity>
        <StarredTitle style={styles.headerTitle}>Customer Profile</StarredTitle>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView refreshControl={<RefreshControl {...pull.control} />} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* RIKTIG DATABAS-INFO */}
        <View style={styles.profileSection}>
          <View style={styles.avatarPlaceholder}>
             <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <Text style={styles.name}>{handle(displayName)}</Text>
          {customerInfo?.email && <Text style={styles.subtext}>{customerInfo.email}</Text>}

          <TouchableOpacity style={styles.messageButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chatbubble-outline" size={20} color={colors.background} />
            <Text style={styles.messageButtonText}>Message</Text>
          </TouchableOpacity>
        </View>

        {/* BOOKINGS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Booking History</Text>
          <View style={styles.pastBookingsRow}>
            <Ionicons name="checkmark-circle-outline" size={20} color={colors.blue} />
            <Text style={styles.pastBookingsText}>
              <Text style={{ fontWeight: 'bold' }}>{pastBookingsCount}</Text> past bookings with you.
            </Text>
          </View>
        </View>

        {/* MOCK REVIEWS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reviews from Creators</Text>
          <View style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <Text style={styles.reviewerName}>Lashes by Lina</Text>
              {renderStars(5)}
            </View>
            <Text style={styles.reviewComment}>"Super friendly and arrived exactly on time. Highly recommend!"</Text>
            <Text style={styles.reviewDate}>Oct 12, 2026</Text>
          </View>
        </View>

      </ScrollView>
      <RefreshStar refreshing={pull.refreshing} y={130} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingBottom: 15, paddingHorizontal: 20, backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.line },
  backBtn: { padding: 5 },
  headerTitle: { fontSize: 18, color: colors.ink, fontFamily: fonts.title },
  scrollContent: { paddingBottom: 40 },

  profileSection: { alignItems: 'center', backgroundColor: colors.background, paddingVertical: 30, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.line },
  avatarPlaceholder: { width: 90, height: 90, borderRadius: 45, backgroundColor: colors.pink, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  avatarText: { fontSize: 36, fontWeight: 'bold', color: colors.wine },
  name: { fontSize: 22, color: colors.ink, marginBottom: 5, fontFamily: fonts.title },
  subtext: { fontSize: 14, color: colors.inkMuted, marginBottom: 20 },

  messageButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.blue, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 25 },
  messageButtonText: { color: colors.background, fontWeight: 'bold', fontSize: 16, marginLeft: 8 },

  section: { paddingHorizontal: 20, paddingTop: 25 },
  sectionTitle: { fontSize: 18, color: colors.ink, marginBottom: 15, fontFamily: fonts.title },
  pastBookingsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.blueTint, padding: 12, borderRadius: 10 },
  pastBookingsText: { fontSize: 14, color: colors.blue, marginLeft: 10 },

  reviewCard: { backgroundColor: colors.background, padding: 15, borderRadius: 12, borderWidth: 1, borderColor: colors.line, marginBottom: 15 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  reviewerName: { fontSize: 15, fontWeight: 'bold', color: colors.ink },
  starsContainer: { flexDirection: 'row' },
  reviewComment: { fontSize: 14, color: colors.ink, fontStyle: 'italic', lineHeight: 20, marginBottom: 10 },
  reviewDate: { fontSize: 12, color: colors.inkMuted, alignSelf: 'flex-end' },
});