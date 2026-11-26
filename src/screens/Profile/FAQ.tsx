import { StyleSheet } from 'react-native';
import SubPage from '../../components/SubPage';
import { Text } from '../../components/AppText';
import { colors } from '../../theme';

/** Opened from the bottom of Settings. Questions and answers come later. */
export default function FAQ() {
  return (
    <SubPage title="FAQ">
      <Text style={styles.empty}>No questions here yet.</Text>
    </SubPage>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.inkMuted, marginTop: 24, textAlign: 'center' },
});
