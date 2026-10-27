import type { ReactNode } from 'react';

/** 线性图标集，24×24 视框、1.6 描边，跟界面的克制风格一致 */
const ICONS: Record<string, ReactNode> = {
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  sort: (
    <>
      <path d="M3 6h9M3 11h6M3 16h4" />
      <path d="M17 5v13M14 15l3 3 3-3" />
    </>
  ),
  filter: <path d="M3 5h18l-7 8.2V20l-4-2.2v-4.6z" />,
  sliders: (
    <>
      <path d="M3 8h5M13 8h8M3 16h9M17 16h4" />
      <circle cx="10.5" cy="8" r="2.2" />
      <circle cx="14.5" cy="16" r="2.2" />
    </>
  ),
  trim: (
    <>
      <path d="M7 5l12 14M17 5L5 19" />
      <circle cx="4" cy="4.5" r="2.2" />
      <circle cx="4" cy="19.5" r="2.2" />
    </>
  ),
  case: <path d="M4 7V5.5h8V7M8 5.5V19M5.5 19h5M15 12.5V11h7v1.5M18.5 11v8M16.5 19h4" />,
  replace: <path d="M4 8h11l-3.2-3.2M20 16H9l3.2 3.2" />,
  tag: (
    <>
      <path d="M20.5 13.3l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V4a1 1 0 0 1 1-1h9z" />
      <circle cx="8" cy="8" r="1.6" />
    </>
  ),
  move: (
    <>
      <path d="M12 3v18M3 12h18" />
      <path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9.5 7V4.5h5V7" />
      <path d="M6.5 7l1 12.5h9L17.5 7" />
      <path d="M10 11v5.5M14 11v5.5" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </>
  ),
  grip: (
    <>
      <circle cx="9" cy="7" r="1.3" />
      <circle cx="15" cy="7" r="1.3" />
      <circle cx="9" cy="12" r="1.3" />
      <circle cx="15" cy="12" r="1.3" />
      <circle cx="9" cy="17" r="1.3" />
      <circle cx="15" cy="17" r="1.3" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4 4l16 16" />
      <path d="M9.5 6.4A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.6 3.4M6.3 8.2A17 17 0 0 0 2.5 12S6 18 12 18a9.9 9.9 0 0 0 3.4-.6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.4-4.4" />
    </>
  ),
  check: <path d="M4.5 12.5l4.5 4.5L19.5 6.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  undo: (
    <>
      <path d="M9 14.5L3.5 9 9 3.5" />
      <path d="M3.5 9h11a6 6 0 0 1 0 12h-4" />
    </>
  ),
  play: <path d="M7 4.5l12.5 7.5L7 19.5z" />,
  chevronDown: <path d="M6 9.5l6 6 6-6" />,
  chevronRight: <path d="M9.5 6l6 6-6 6" />,
  alert: (
    <>
      <path d="M12 3.2l9 16H3z" />
      <path d="M12 9.5v5M12 17.2v.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.8v.01" />
    </>
  ),
  download: <path d="M12 3.5v11M7.5 10.5l4.5 4.5 4.5-4.5M4 20h16" />,
  upload: <path d="M12 20.5v-11M7.5 13.5L12 9l4.5 4.5M4 4h16" />,
  file: (
    <>
      <path d="M6.5 3h7.5l4 4v14h-11.5z" />
      <path d="M14 3v4h4" />
    </>
  ),
  layers: <path d="M12 3l9 5-9 5-9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5" />,
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20 4v4.5h-4.5" />
    </>
  ),
  sparkle: <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" />,
};

export function Icon({
  name,
  size = 15,
  className,
  style,
}: {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const node = ICONS[name] ?? ICONS.file;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {node}
    </svg>
  );
}
