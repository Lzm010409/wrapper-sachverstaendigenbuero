/**
 * Der Name des Sitzungscookies — bewusst in einer eigenen Datei.
 *
 * `sitzung.ts` importiert `server-only` und die Datenbank. Die Middleware
 * läuft in einer anderen Laufzeit und dürfte beides nicht anfassen; sie
 * braucht aber denselben Namen. Zwei Schreibweisen desselben Namens wären
 * ein Fehler, der erst auffällt, wenn niemand mehr hereinkommt.
 */
export const COOKIE_NAME = 'werkbank_sitzung'
