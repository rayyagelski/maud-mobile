import React from 'react';
import Svg, { Rect, Path } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
}

export default function MailIcon({ size = 28, color = '#3ECFBF' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x="2" y="4" width="20" height="16" rx="2"
        stroke={color} strokeWidth={1.8}
        strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M2 7l10 7 10-7"
        stroke={color} strokeWidth={1.8}
        strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}
