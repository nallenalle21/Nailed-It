import IntroCarousel, { type Slide } from './IntroCarousel';
import { colors } from '../../theme';

// Brand colours only: #3194b1, #0b150E, #FA89AB, #8C292E, #faf9f6.
const SLIDES: Slide[] = [
  {
    key: 'welcome',
    icon: null,
    title: 'welcome to nailed it',
    body: 'find your next set and the nail tech to make it happen. here is what you can do.',
    bg: colors.ink, fg: colors.background, accent: colors.pink,
    tags: [],
  },
  {
    key: 'map',
    icon: 'map',
    title: 'find nail techs',
    body: 'use the map and filters to find nail techs near you by service, price and date.',
    bg: colors.blue, fg: colors.background, accent: colors.pink,
    tags: ['near you', 'gel nails', 'free friday'],
  },
  {
    key: 'explore',
    icon: 'compass',
    title: 'get inspired',
    body: 'scroll the explore feed for fresh nail art and ideas from real nail techs.',
    bg: colors.pink, fg: colors.ink, accent: colors.wine,
    tags: ['chrome', 'french tips', 'nail art'],
  },
  {
    key: 'collections',
    icon: 'heart',
    title: 'save to collections',
    body: 'save the looks you love into your own collections, so your next idea is always ready.',
    bg: colors.wine, fg: colors.background, accent: colors.pink,
    tags: ['summer nails', 'wedding', 'saved'],
  },
  {
    key: 'tech',
    icon: 'sparkles',
    title: 'from photo to nail tech',
    body: 'love a look? tap the image and go straight to the nail tech who made it.',
    bg: colors.background, fg: colors.ink, accent: colors.blue,
    tags: ['tap a photo', 'view profile', 'book'],
  },
  {
    key: 'calendar',
    icon: 'calendar',
    title: 'your calendar',
    body: 'all your nail appointments in one calendar, so you always know when your next set is.',
    bg: colors.blue, fg: colors.background, accent: colors.pink,
    tags: ['fri · 15:00', 'booked', 'next up'],
  },
  {
    key: 'chat',
    icon: 'chatbubbles',
    title: 'chat',
    body: 'message nail techs directly to ask questions, share ideas and plan your set.',
    bg: colors.ink, fg: colors.background, accent: colors.pink,
    tags: ['is friday free?', 'yes! 15:00', 'see you then'],
  },
];

/** Shown to customers right after they log in. */
export default function CustomerIntro({ onGetStarted }: { onGetStarted: () => void }) {
  return <IntroCarousel slides={SLIDES} onGetStarted={onGetStarted} />;
}
