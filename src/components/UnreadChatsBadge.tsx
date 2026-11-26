import { StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { colors } from '../theme';
import { useUnreadChatCount } from '../services/chatReads';

/** The number of unread chats, on the Chats icon in the tab bar (nothing when all are read). */
export default function UnreadChatsBadge() {
  const count = useUnreadChatCount();
  if (count === 0) return null;
  return (
    <View style={styles.badge} accessibilityLabel={`${count} unread ${count === 1 ? 'chat' : 'chats'}`}>
      <Text style={styles.text}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: colors.wine, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.background,
  },
  text: { color: colors.background, fontSize: 10, fontWeight: '800' },
});
