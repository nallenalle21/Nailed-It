import IntroCarousel, { type Slide } from './IntroCarousel';
import { colors } from '../../theme';

// Brand colours only: #3194b1, #0b150E, #FA89AB, #8C292E, #faf9f6.
const SLIDES: Slide[] = [
  {
    key: 'welcome',
    icon: null,
    title: 'welcome, freelancer',
    body: 'your nail business, all in one place. here is what nailed it can do for you.',
    bg: colors.ink, fg: colors.background, accent: colors.pink,
    tags: [],
  },
  {
    key: 'bookings',
    icon: 'calendar',
    title: 'manage bookings',
    body: 'every appointment in one calendar. keep track of your week and never double-book again.',
    bg: colors.blue, fg: colors.background, accent: colors.pink,
    tags: ['new booking', 'tue · 14:00', 'confirmed'],
  },
  {
    key: 'portfolio',
    icon: 'images',
    title: 'build your portfolio',
    body: 'show off your best sets. your photos become inspiration that clients save and come back to.',
    bg: colors.pink, fg: colors.ink, accent: colors.wine,
    tags: ['chrome french', 'gel extensions', '+24 saves'],
  },
  {
    key: 'clients',
    icon: 'people',
    title: 'find clients',
    body: 'get discovered on the map and in the feed by people looking for nails near you.',
    bg: colors.wine, fg: colors.background, accent: colors.pink,
    tags: ['near you', '★ 4.9', 'new client'],
  },
  {
    key: 'insights',
    icon: 'stats-chart',
    title: 'business insights',
    body: 'follow your income, services and bookkeeping to see what is growing your business.',
    bg: colors.background, fg: colors.ink, accent: colors.blue,
    tags: ['revenue', 'top service', 'this month ↑'],
  },
  {
    key: 'chat',
    icon: 'chatbubbles',
    title: 'chat',
    body: 'talk with clients before and after their appointment. ideas, photos and details in one place.',
    bg: colors.ink, fg: colors.background, accent: colors.pink,
    tags: ['is friday free?', 'yes! 15:00', 'see you then'],
  },
];

/** Shown to freelancers right after they log in. */
export default function FreelancerIntro({ onGetStarted }: { onGetStarted: () => void }) {
  return <IntroCarousel slides={SLIDES} onGetStarted={onGetStarted} />;
}
