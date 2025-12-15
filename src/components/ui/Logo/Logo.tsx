'use client';

interface LogoProps {
  size?: number;
  className?: string;
  variant?: 'default' | 'inverted';
}

export function Logo({ size = 40, className, variant = 'default' }: LogoProps) {
  const primary = variant === 'inverted' ? '#FFFFFF' : '#1A1A1A';
  const secondary = variant === 'inverted' ? '#1A1A1A' : '#FAFAF8';

  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={className}
    >
      <path d="M20 6L7 34H13L15 29H25L27 34H33L20 6Z" fill={primary} />
      <path d="M20 14L17 24H23L20 14Z" fill={secondary} />
      <circle cx="11" cy="9" r="2" fill={primary} />
      <circle cx="20" cy="5" r="2" fill={primary} />
      <circle cx="29" cy="9" r="2" fill={primary} />
    </svg>
  );
}
