import React from 'react';
import Svg, { Rect, Path } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
}

export default function LockIcon({ size = 28, color = '#3ECFBF' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x="3" y="11" width="18" height="11" rx="2"
        stroke={color} strokeWidth={1.8}
        strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M7 11V7a5 5 0 0110 0v4"
        stroke={color} strokeWidth={1.8}
        strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}
