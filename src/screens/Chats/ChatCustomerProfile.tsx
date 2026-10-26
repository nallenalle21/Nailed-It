import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/AppText';

// Mock data for the customer
const customerData = {
  id: '1',
  name: 'Anna Svensson',
  age: 26,
  avatar: 'https://i.pravatar.cc/150?u=anna',
  memberSince: 'March 2024',
  upcomingBooking: {
    id: 'b1',
    service: 'Gel Nails - New Set',
    date: 'Tuesday, 14:00',
    price: '650 SEK'
  },
  pastBookingsCount: 4,
  reviews: [
    {
      id: 'r1',
      creatorName: 'Lina (Lashes by Lina)',
      rating: 5,
      comment: 'Super friendly and arrived exactly on time. Highly recommend!',
      date: 'Oct 12, 2026'
    },
    {
      id: 'r2',
      creatorName: 'Studio Glow',
      rating: 5,
      comment: 'Great customer, easy to communicate with.',
      date: 'Sep 05, 2026'
    }
  ]
};

export default function CustomerProfile({ route, navigation }: any) {
  // If navigating from ChatRoom, we could grab the ID from route.params
  // const customerId = route?.params?.customerId;

  const renderStars = (rating: number) => {
    return (
      <View style={styles.starsContainer}>
        {[...Array(5)].map((_, index) => (
          <Ionicons 
            key={index} 
            name={index < rating ? "star" : "star-outline"} 
            size={16} 
            color="#FFD700" 
          />
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#191919" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Customer Profile</Text>
        <View style={{ width: 24 }} /> {/* Empty view for alignment */}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Profile Info Section */}
        <View style={styles.profileSection}>
          <Image source={{ uri: customerData.avatar }} style={styles.avatar} />
          <Text style={styles.name}>{customerData.name}, {customerData.age}</Text>
          <Text style={styles.subtext}>NailedIt Member since {customerData.memberSince}</Text>
          
          <TouchableOpacity style={styles.messageButton} onPress={() => navigation.navigate('ChatRoom', { customerName: customerData.name })}>
            <Ionicons name="chatbubble-outline" size={20} color="#fff" />
            <Text style={styles.messageButtonText}>Message</Text>
          </TouchableOpacity>
        </View>

        {/* Booking Overview Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Booking Overview</Text>
          
          <View style={styles.bookingCard}>
            <View style={styles.bookingHeaderRow}>
              <Text style={styles.bookingLabel}>Upcoming Booking</Text>
              <Text style={styles.bookingPrice}>{customerData.upcomingBooking.price}</Text>
            </View>
            <Text style={styles.bookingService}>{customerData.upcomingBooking.service}</Text>
            <View style={styles.dateRow}>
              <Ionicons name="calendar-outline" size={16} color="#716C83" />
              <Text style={styles.bookingDate}>{customerData.upcomingBooking.date}</Text>
            </View>
          </View>

          <View style={styles.pastBookingsRow}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#1D3979" />
            <Text style={styles.pastBookingsText}>
              <Text style={{ fontWeight: 'bold' }}>{customerData.pastBookingsCount}</Text> past successful bookings with you.
            </Text>
          </View>
        </View>

        {/* Reviews from other Creators */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reviews from Creators</Text>
          
          {customerData.reviews.map((review) => (
            <View key={review.id} style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewerName}>{review.creatorName}</Text>
                {renderStars(review.rating)}
              </View>
              <Text style={styles.reviewComment}>"{review.comment}"</Text>
              <Text style={styles.reviewDate}>{review.date}</Text>
            </View>
          ))}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9F9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backBtn: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#191919',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  profileSection: {
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 30,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    marginBottom: 15,
    backgroundColor: '#E0E0E0',
  },
  name: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#191919',
    marginBottom: 5,
  },
  subtext: {
    fontSize: 14,
    color: '#716C83',
    marginBottom: 20,
  },
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1D3979',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
  },
  messageButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 25,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#191919',
    marginBottom: 15,
  },
  bookingCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    marginBottom: 15,
  },
  bookingHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  bookingLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#BF0F46', // Accent color for upcoming
    textTransform: 'uppercase',
  },
  bookingPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#191919',
  },
  bookingService: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#191919',
    marginBottom: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bookingDate: {
    fontSize: 14,
    color: '#716C83',
    marginLeft: 6,
  },
  pastBookingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8EDF6', // Very light blue
    padding: 12,
    borderRadius: 10,
  },
  pastBookingsText: {
    fontSize: 14,
    color: '#1D3979',
    marginLeft: 10,
  },
  reviewCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    marginBottom: 15,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  reviewerName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#191919',
  },
  starsContainer: {
    flexDirection: 'row',
  },
  reviewComment: {
    fontSize: 14,
    color: '#4A4A4A',
    fontStyle: 'italic',
    lineHeight: 20,
    marginBottom: 10,
  },
  reviewDate: {
    fontSize: 12,
    color: '#A0AABF',
    alignSelf: 'flex-end',
  },
});