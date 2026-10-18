export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="y-face" x1="4" y1="2" x2="26" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#e9ffc8" />
          <stop offset="0.42" stopColor="#8cf26a" />
          <stop offset="1" stopColor="#2f8a2e" />
        </linearGradient>
        <linearGradient id="y-side" x1="16" y1="4" x2="20" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1c6424" />
          <stop offset="1" stopColor="#082810" />
        </linearGradient>
      </defs>
      <g strokeLinecap="round" strokeLinejoin="round">
        <g stroke="url(#y-side)" strokeWidth="6.1" transform="translate(0.85 1.25)">
          <path d="M16 27.2 V15.2" />
          <path d="M16 15.2 L6.4 5.2" />
          <path d="M16 15.2 L25.6 5.2" />
        </g>
        <g stroke="url(#y-face)" strokeWidth="5.15">
          <path d="M16 26.2 V14.6" />
          <path d="M16 14.6 L6.6 4.6" />
          <path d="M16 14.6 L25.4 4.6" />
        </g>
      </g>
    </svg>
  );
}
