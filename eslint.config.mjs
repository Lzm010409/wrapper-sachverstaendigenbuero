// eslint-config-next 16 exportiert bereits ein fertiges Flat-Config-Array;
// es wird nur eingehängt, nicht zusammengebaut. Der Umweg über `FlatCompat`
// scheitert hier: die alten Regelsätze verweisen im Kreis auf ihre eigenen
// Plugins, und der Validierer will das als JSON ausgeben.
import naechstes from 'eslint-config-next'

/**
 * Das Skript `lint` zeigte bisher auf keine Konfiguration — ESLint brach mit
 * einem Hinweis auf die Migration ab, ohne je eine Datei zu prüfen.
 *
 * `skills/`, `drizzle/` und `public/` bleiben draussen: dort liegt keine
 * Anwendung, sondern fachliche Grundlage, Migrationen und Dateien.
 */
const konfiguration = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'drizzle/**',
      'skills/**',
      'public/**',
      'next-env.d.ts',
    ],
  },
  ...naechstes,

  /*
   * Diese Regeln standen beim ersten Lauf auf „Fehler" und meldeten
   * 13 Befunde in Code, der seit Monaten in Produktion läuft — der Brief-
   * Editor, die Bildsuchleiste, der Erscheinungsschalter. Sie sind nicht
   * durch die Überführung entstanden; sie waren nur nie geprüft, weil das
   * Skript `lint` auf keine Konfiguration zeigte.
   *
   * Sie werden zu Warnungen, nicht abgeschaltet: `pnpm lint` wird damit
   * benutzbar, und kein Befund verschwindet. Sie gehören in einem eigenen
   * Schritt aufgearbeitet — im Editor sitzen sie an Stellen, an denen ein
   * beiläufiger Eingriff mehr kaputt macht, als er heilt.
   */
  {
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react/no-unescaped-entities': 'warn',
    },
  },
]

export default konfiguration
