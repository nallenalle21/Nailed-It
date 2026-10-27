import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';

const wishlistItems = [
  { name: 'my wedding', count: '3 pins' },
  { name: 'birthday', count: '10 pins' },
  { name: 'faves', count: '8 pins' },
  { name: 'pink nails', count: '12 pins' },
  { name: 'portugal 2027', count: '6 pins' },
  { name: 'office vibe', count: '7 pins' },
];

const rows = [
  wishlistItems.slice(0, 2),
  wishlistItems.slice(2, 4),
  wishlistItems.slice(4, 6),
];

export default function WishlistCreator() {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>my wishlist</Text>

        <TouchableOpacity style={styles.editButton} activeOpacity={0.8}>
          <Text style={styles.editText}>edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {rows.map((row, rowIndex) => (
          <View key={`row-${rowIndex}`} style={styles.row}>
            {row.map((item) => (
              <View key={item.name} style={styles.card}>
                <View style={styles.placeholder}>
                  <Text style={styles.placeholderText}>saved</Text>
                </View>

                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemCount}>{item.count}</Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#faf9f6',
    paddingHorizontal: 18,
    paddingTop: 80,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 26,
    marginTop: 28,
  },
  title: {
    fontFamily: Platform.select({
      ios: 'Helvetica-Bold',
      android: 'sans-serif-medium',
    }),
    fontSize: 28,
    lineHeight: 34,
    color: '#151a17',
    textTransform: 'lowercase',
  },
  editButton: {
    borderWidth: 1,
    borderColor: '#151a17',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  editText: {
    fontFamily: Platform.select({
      ios: 'Helvetica',
      android: 'sans-serif',
    }),
    fontSize: 13,
    color: '#151a17',
    textTransform: 'lowercase',
  },
  content: {
    paddingBottom: 30,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  card: {
    width: '48%',
  },
  placeholder: {
    height: 170,
    borderRadius: 20,
    backgroundColor: '#f0ece5',
    borderWidth: 1,
    borderColor: '#e5dfd7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  placeholderText: {
    fontFamily: Platform.select({
      ios: 'Helvetica',
      android: 'sans-serif',
    }),
    fontSize: 14,
    color: '#151a17',
    opacity: 0.8,
    textTransform: 'lowercase',
  },
  itemName: {
    fontFamily: Platform.select({
      ios: 'Helvetica',
      android: 'sans-serif',
    }),
    fontSize: 15,
    lineHeight: 20,
    color: '#151a17',
    textTransform: 'lowercase',
    marginBottom: 2,
  },
  itemCount: {
    fontFamily: Platform.select({
      ios: 'Helvetica',
      android: 'sans-serif',
    }),
    fontSize: 12,
    lineHeight: 16,
    color: '#151a17',
    opacity: 0.7,
    textTransform: 'lowercase',
  },
});