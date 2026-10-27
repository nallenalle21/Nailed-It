import { Platform } from 'react-native';

export const colors = {
  primary: '#c1e600',      // replaces 'tomato' (buttons, active icons, highlights)
  primarySoft: '#faf9f6',  // light tint (the "next up" card)
  background: '#faf9f6',
  surface: '#faf9f6',      // cards, inputs
  text: '#151a17',
  textMuted: '#888888',
  border: '#dddddd',
  danger: '#716c13',       // remove buttons
};

export const fonts = {
  regular: Platform.select({ ios: 'Helvetica', default: undefined }),
  bold: Platform.select({ ios: 'Helvetica-Bold', default: undefined }),
};