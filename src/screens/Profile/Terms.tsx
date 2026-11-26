import { StyleSheet } from 'react-native';
import SubPage from '../../components/SubPage';
import { Text } from '../../components/AppText';
import { colors } from '../../theme';

/** Opened from Settings → About. The real terms come later. */
export default function Terms() {
  return (
    <SubPage title="Terms">
      <Text style={styles.heading}>Terms & conditions</Text>
      <Text style={styles.body}>
        Our terms and conditions are being written and will be published here soon.
        Questions in the meantime? Get in touch with the Nailed It team.
      </Text>
    </SubPage>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 17, fontWeight: '700', color: colors.ink, marginTop: 8, marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 22, color: colors.inkMuted },
});
