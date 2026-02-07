interface LogoProps {
  size?: number;
  className?: string;
}

export default function Logo({ size = 24, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Split square — diagonal divides filled (bottom-right) from outlined (top-left) */}
      <polygon
        points="88,12 88,88 12,88"
        fill="currentColor"
      />
      <polygon
        points="88,12 12,12 12,88"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
