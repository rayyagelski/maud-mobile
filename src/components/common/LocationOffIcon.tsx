import React from 'react';
import Svg, { Path, Circle, Line } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
}

export default function LocationOffIcon({ size = 28, color = '#3ECFBF' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2C8.13 2 5 5.13 5 9c0 2.61 1.4 5.14 3.07 7.28M12 22s7-7.75 7-13c0-3.87-3.13-7-7-7"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="9" r="2.5" stroke={color} strokeWidth={1.8} />
      {/* Diagonal slash */}
      <Path
        d="M3 3l18 18"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}
