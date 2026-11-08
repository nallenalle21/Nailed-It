import type { ImageSourcePropType } from 'react-native';

// The 9 looks on the "pick your vibe" screen (3 × 3). Photos live in assets/images/welcome/.
export type Vibe = { id: string; label: string; photo: ImageSourcePropType };

export const VIBES: Vibe[] = [
  { id: 'red-star-chrome', label: 'red star chrome', photo: require('../../assets/images/welcome/nails-01.jpg') },
  { id: 'chrome-stars', label: 'chrome stars', photo: require('../../assets/images/welcome/nails-02.jpg') },
  { id: 'aura-chrome', label: 'aura + chrome', photo: require('../../assets/images/welcome/nails-03.jpg') },
  { id: 'liquid-chrome', label: 'liquid chrome', photo: require('../../assets/images/welcome/nails-04.jpg') },
  { id: 'sage-pearl', label: 'sage pearl', photo: require('../../assets/images/welcome/nails-05.jpg') },
  { id: 'stripes-stars', label: 'stripes + stars', photo: require('../../assets/images/welcome/nails-06.jpg') },
  { id: 'cherry-ice', label: 'cherry ice', photo: require('../../assets/images/welcome/nails-07.jpg') },
  { id: 'milky-mix', label: 'milky mix', photo: require('../../assets/images/welcome/nails-08.jpg') },
  { id: 'dotted-stars', label: 'dotted stars', photo: require('../../assets/images/welcome/nails-09.jpg') },
];

/** Set once someone has been through the intro, so it only shows on a fresh install. */
export const INTRO_SEEN_KEY = 'nailedit:introSeen';
/** The vibe ids someone picked (JSON array), kept on the phone until it's used for Explore. */
export const VIBE_PICKS_KEY = 'nailedit:vibePicks';
