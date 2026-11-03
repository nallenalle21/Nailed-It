import { Platform } from 'react-native';

export const colors = {
  primary: '#c1e600',      // replaces 'tomato' (buttons, active icons, highlights)
  primarySoft: '#faf9f6',  // light tint (the "next up" card)
  background: '#faf9f6',
  surface: '#faf9f6',      // cards, inputs
  text: '#0B150E',
  textMuted: '#888888',
  border: '#dddddd',
  danger: '#716c13',       // remove buttons
  // moodboard palette
  inkMuted: 'rgba(11,21,14,0.6)',        // secondary text (#0B150E at 60%)
  line: 'rgba(250,137,171,0.4)',         // borders/dividers (#FA89AB at 40%)
  pinkTint: 'rgba(250,137,171,0.15)',    // soft highlight backgrounds
  blueTint: 'rgba(49,148,177,0.12)',     // soft highlight backgrounds
  wine: '#8C292E',         // map pins, hearts, hover-label background
  pink: '#FA89AB',         // hover-label text
  ink: '#0B150E',          // Horizon titles
  blue: '#3194B1',         // search icon, refresh icon
  blueMuted: '#3E8DA4',    // #3194B1 with 20% less saturation: Inspiration page background
  blueDeep: '#0E2025',     // same blue, much darker: INSPIRATION title, pin counts
  grey: '#15201F',
  yellow: '#ece38b',       // same yellow as the star images: filter dot
};

export const fonts = {
  regular: Platform.select({ ios: 'Helvetica', default: undefined }),
  bold: Platform.select({ ios: 'Helvetica-Bold', default: undefined }),
  title: 'Horizon', // loaded in App.tsx from assets/fonts/Horizon.otf
};