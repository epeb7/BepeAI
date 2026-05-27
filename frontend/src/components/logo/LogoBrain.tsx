// LogoBrain.tsx - Ícone do cérebro com conexões (a mesma logo que você enviou)
import React from 'react';

interface LogoBrainProps {
  className?: string;
  size?: number;
}

export const LogoBrain: React.FC<LogoBrainProps> = ({ className = '', size = 32 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="bgGrad" x1="0" y1="0" x2="512" y2="512">
          <stop offset="0%" stopColor="#5B3DF5" />
          <stop offset="100%" stopColor="#3B1DFF" />
        </linearGradient>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="10" stdDeviation="20" floodColor="#5B3DF5" floodOpacity="0.35" />
        </filter>
      </defs>
      <rect x="40" y="40" width="432" height="432" rx="90" fill="url(#bgGrad)" filter="url(#shadow)" />
      <g stroke="white" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M210 150 C170 150 145 180 145 215 C120 220 105 245 105 275 C105 310 130 335 160 338 C165 375 190 395 220 395" />
        <path d="M302 150 C342 150 367 180 367 215 C392 220 407 245 407 275 C407 310 382 335 352 338 C347 375 322 395 292 395" />
        <path d="M256 130 L256 395" />
        <line x1="175" y1="220" x2="220" y2="220" />
        <circle cx="165" cy="220" r="8" />
        <line x1="165" y1="275" x2="220" y2="275" />
        <circle cx="155" cy="275" r="8" />
        <line x1="180" y1="330" x2="220" y2="330" />
        <circle cx="170" cy="330" r="8" />
        <line x1="292" y1="220" x2="337" y2="220" />
        <circle cx="347" cy="220" r="8" />
        <line x1="292" y1="275" x2="347" y2="275" />
        <circle cx="357" cy="275" r="8" />
        <line x1="292" y1="330" x2="332" y2="330" />
        <circle cx="342" cy="330" r="8" />
      </g>
    </svg>
  );
};