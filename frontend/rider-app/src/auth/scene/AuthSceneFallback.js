import Svg, { Ellipse, Path, Rect, Circle, G } from 'react-native-svg';

export default function AuthSceneFallback() {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 440 280"
      accessibilityLabel="Delivery scooter carrying a tiffin box"
    >
      <Ellipse
        cx="220"
        cy="236"
        rx="170"
        ry="27"
        fill="#e8dfce"
      />
      <Ellipse
        cx="216"
        cy="226"
        rx="126"
        ry="13"
        fill="#b6aa95"
        opacity=".3"
      />
      <G
        stroke="#353a32"
        strokeWidth="12"
      >
        <Circle
          cx="126"
          cy="202"
          r="29"
          fill="#fff4df"
        />
        <Circle
          cx="314"
          cy="202"
          r="29"
          fill="#fff4df"
        />
      </G>
      <Path
        d="M91 179 Q87 135 124 132 L170 136 195 186 267 186 275 112 299 112 317 179 287 185 278 206 182 206 164 175Z"
        fill="#c2703d"
      />
      <Path
        d="M99 167 Q118 141 164 154 L178 181 100 185Z"
        fill="#d78a54"
      />
      <Rect
        x="134"
        y="125"
        width="67"
        height="14"
        rx="7"
        fill="#353a32"
      />
      <Path
        d="M288 115 282 77 260 73M282 77 307 73"
        fill="none"
        stroke="#353a32"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <Circle
        cx="303"
        cy="110"
        r="12"
        fill="#fff4df"
      />
      <Rect
        x="85"
        y="122"
        width="51"
        height="7"
        rx="3"
        fill="#75816a"
      />
      {[72, 89, 106].map((y) => (
        <Rect
          key={y}
          x="89"
          y={y}
          width="43"
          height="15"
          rx="5"
          fill="#fff4df"
          stroke="#d6c9b2"
          strokeWidth="2"
        />
      ))}
      <Path
        d="M110 72V122M102 69H118"
        stroke="#75816a"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <Path
        d="M357 102 Q328 66 357 57 Q386 66 357 102Z"
        fill="#c2703d"
      />
      <Circle
        cx="357"
        cy="73"
        r="5"
        fill="#fff4df"
      />
    </Svg>
  );
}
