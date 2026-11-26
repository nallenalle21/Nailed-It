import type { ComponentRef, ReactNode, Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import StarredTitle from './StarredTitle';

type Props = {
  /** A string shows as the standard HORIZON page title; pass a node for a decorated title. */
  title: ReactNode;
  /** Small buttons left of the title (e.g. back). */
  left?: ReactNode;
  /** Small buttons right of the title (e.g. search, filter, view menu). */
  right?: ReactNode;
  /** Show the little yellow star on a string title. */
  star?: boolean;
  ref?: Ref<ComponentRef<typeof View>>;
};

/**
 * The top of every main page (Explore, Inspiration, Calendar, Chats): title centred,
 * same size and same distance from the top everywhere. Put it inside a SafeAreaView
 * that covers the top edge.
 */
export default function PageHeader({ title, left, right, star = false, ref }: Props) {
  return (
    <View ref={ref} style={styles.header}>
      <View style={styles.side}>{left}</View>
      {typeof title === 'string' ? (
        <StarredTitle style={styles.title} star={star}>{title}</StarredTitle>
      ) : (
        title
      )}
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

/** Size of the page title, for decorated titles passed as a node. */
export const PAGE_TITLE_SIZE = 20;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 22, // breathing room between the title and the page
  },
  // Same height on every page (the calendar's view button is 34), so titles line up exactly.
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 34 },
  right: { justifyContent: 'flex-end' },
  title: { fontSize: PAGE_TITLE_SIZE },
});
