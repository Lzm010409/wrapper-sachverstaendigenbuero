/**
 * Ersatz für `server-only` in Tests.
 *
 * Das Paket wirft absichtlich, sobald es ausserhalb einer Server-Umgebung
 * geladen wird. In Vitest ist das der Fall, obwohl der geprüfte Code dort
 * völlig richtig läuft — siehe `vitest.config.ts`.
 */
export {}
