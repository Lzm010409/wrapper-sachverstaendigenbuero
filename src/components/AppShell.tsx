import Link from "next/link";
import {
  IconAkte,
  IconAufgaben,
  IconAuswertung,
  IconEinstellungen,
  IconHilfe,
  IconKontakte,
  IconRechnungen,
} from "./icons";

const railItems = [
  { href: "/faelle", label: "Fallakten", Icon: IconAkte },
  { href: "/aufgaben", label: "Aufgaben", Icon: IconAufgaben },
  { href: "/kontakte", label: "Kontakte", Icon: IconKontakte },
  { href: "/rechnungen", label: "Rechnungen", Icon: IconRechnungen },
  { href: "/auswertung", label: "Auswertung", Icon: IconAuswertung },
  { href: "/einstellungen", label: "Einstellungen", Icon: IconEinstellungen },
];

/**
 * Rahmen der Anwendung: schmale Icon-Leiste links, helle Kopfzeile oben.
 * Nachgebaut nach der autoiXpert-Oberflaeche, damit der Bedienfluss nicht bricht.
 */
export function AppShell({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <nav
        aria-label="Hauptnavigation"
        className="sticky top-0 hidden h-screen w-14 shrink-0 flex-col items-center gap-1 border-r border-ax-border bg-ax-rail py-3 sm:flex"
      >
        {railItems.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            title={label}
            className="flex size-11 items-center justify-center rounded-ax text-ax-label transition-colors hover:bg-ax-primary-soft hover:text-ax-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ax-primary"
          >
            <Icon className="size-5" />
            <span className="sr-only">{label}</span>
          </Link>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-ax-border bg-ax-surface px-4">
          <Link
            href="/faelle"
            className="text-xl font-semibold text-ax-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ax-primary"
            aria-label="Zur Fallübersicht"
          >
            ✕
          </Link>
          {badge ? (
            <span className="rounded-ax bg-ax-surface-muted px-2 py-1 font-mono text-xs tracking-tight text-ax-text-soft">
              {badge}
            </span>
          ) : null}
          <h1 className="truncate text-lg font-normal text-ax-text">{title}</h1>

          <div className="ml-auto flex items-center gap-3">
            <span
              className="size-2 rounded-full bg-ax-chip-green"
              title="Verbindung steht"
              aria-hidden="true"
            />
            <span className="hidden items-center gap-1.5 text-sm text-ax-text-soft sm:flex">
              <IconHilfe className="size-4" />
              Hilfe
            </span>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
