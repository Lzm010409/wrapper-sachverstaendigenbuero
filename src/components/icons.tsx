/** Piktogramme als Inline-SVG - keine Icon-Bibliothek, kein zusaetzlicher Download. */
type IconProps = { className?: string };

function Icon({ children, className }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export const IconAkte = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </Icon>
);

export const IconAufgaben = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </Icon>
);

export const IconKontakte = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </Icon>
);

export const IconRechnungen = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16 6.5A5 5 0 0 0 8.2 9m7.8 8.5A5 5 0 0 1 8.2 15" />
    <path d="M5 11h9M5 14h9" />
  </Icon>
);

export const IconAuswertung = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 19V11M12 19V5M19 19v-6" />
  </Icon>
);

export const IconEinstellungen = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10-1.4 1.4" />
  </Icon>
);

export const IconHilfe = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.8 9.3a2.2 2.2 0 1 1 3 2.05c-.5.25-.8.75-.8 1.3v.35" />
    <path d="M12 16.6h.01" />
  </Icon>
);

export const IconSuche = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-4.5-4.5" />
  </Icon>
);

export const IconChevron = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);
