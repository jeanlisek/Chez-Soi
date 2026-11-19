import type { SVGProps } from "react";

const PATHS = {
  back: <path d="M15 6l-6 6 6 6" />,
  menu: <path d="M5 8h14M5 12h14M5 16h14" />,
  bell: (<><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></>),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  share: (<><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4" /></>),
  filter: (<><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>),
  arrow: <path d="M9 6l6 6-6 6" />,
  lock: (<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  send: <path d="M4 12l16-8-6 16-2-7z" />,
  eye: (<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
  pause: <path d="M9 6v12M15 6v12" />,
  play: <path d="M8 5l11 7-11 7z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  ar: (<><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></>),
  rotate: (<><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v4h-4" /></>),
  compare: (<><path d="M12 4v16" /><rect x="3" y="7" width="6" height="10" rx="1.5" /><rect x="15" y="7" width="6" height="10" rx="1.5" /></>),
  camera: (<><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>),
  doc: (<><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  home: (<><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>),
  list: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  cal: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  mail: (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>),
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  police: (<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>),
  redo: (<><path d="M4 12a8 8 0 0 1 14-5.3" /><path d="M18 3v4h-4" /><path d="M20 12a8 8 0 0 1-14 5.3" /></>),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  upload: (<><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M12 11v6M9 14l3-3 3 3" /></>),
  refresh: (<><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 5v6h-6" /></>),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>),
  down: <path d="M6 9l6 6 6-6" />,
  image: (<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></>),
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  phone: (<><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>),
  sheet: (<><path d="M6 3h12v18H6z" /><path d="M9 7h6" /></>),
  pin: (<><path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></>),
  trash: (<><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>),
  edit: (<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></>),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className, strokeWidth = 2, ...rest }: { name: IconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={`flex-none ${className ?? ""}`} {...rest}>
      {PATHS[name]}
    </svg>
  );
}

/** Le curseur : identité visuelle de l'agent computer-use. */
export function Cursor({ size = 18, filled = true, className }: { size?: number; filled?: boolean; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className={`flex-none ${className ?? ""}`}>
      <path d="M5 3l14 7-6 2-2 6z" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

/** Formes codées des signaux : cercle (statut), triangle (attention), octogone (danger). */
export function Octagon({ size = 18, fill = "#B42332", mark = "#FFFFFF" }: { size?: number; fill?: string; mark?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className="flex-none">
      <path d="M8 2h8l6 6v8l-6 6H8l-6-6V8z" fill={fill} />
      <path d="M12 7v6M12 16.5v.3" stroke={mark} strokeWidth={2.6} strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Triangle({ size = 18, fill = "#B07400", mark = "#FFFFFF" }: { size?: number; fill?: string; mark?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className="flex-none">
      <path d="M12 2.5l10.5 18.5h-21z" fill={fill} />
      <path d="M12 9.5v5M12 17.5v.3" stroke={mark} strokeWidth={2.4} strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function CircleCheck({ size = 18, fill = "#1F7A55" }: { size?: number; fill?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className="flex-none">
      <circle cx="12" cy="12" r="10" fill={fill} />
      <path d="M7.5 12.5l3 3 6-6.5" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function CircleInfo({ size = 18, fill = "#2F5BB7" }: { size?: number; fill?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className="flex-none">
      <circle cx="12" cy="12" r="10" fill={fill} />
      <path d="M12 11v6M12 7.5v.5" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" fill="none" />
    </svg>
  );
}
