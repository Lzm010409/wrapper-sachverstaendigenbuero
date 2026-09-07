# ---------------------------------------------------------------------------
# Abhängigkeiten
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# pnpm wird direkt über npm installiert statt über corepack: dessen
# Signaturprüfung scheitert in Containern regelmäßig an neueren
# pnpm-Versionen, und der Fehler ist im Buildlog schwer zu erkennen.
ARG PNPM_VERSION=10.33.0
RUN npm install -g "pnpm@${PNPM_VERSION}" && pnpm --version

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Übersetzen
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

ARG PNPM_VERSION=10.33.0
RUN npm install -g "pnpm@${PNPM_VERSION}"

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next prüft beim Bauen keine Datenbankverbindung, braucht die Variable aber
# als gesetzt. Der echte Wert kommt zur Laufzeit aus Coolify.
ENV DATABASE_URL=postgres://build:build@127.0.0.1:5432/build
ENV NEXT_TELEMETRY_DISABLED=1
# Ein Next-Build sprengt den Standard-Heap auf kleineren Servern.
ENV NODE_OPTIONS=--max-old-space-size=2048

RUN pnpm build

# Die Startbefüllung der Bibliothek wird hier einmalig erzeugt. Zur Laufzeit
# liest der Startvorgang nur noch das Ergebnis — das Abbild braucht dadurch
# weder TypeScript-Werkzeuge noch den Parser.
RUN pnpm exec tsx scripts/bibliothek-seed-erzeugen.ts seed/bibliothek.json

# Next bündelt `postgres` in die Server-Chunks; im Standalone-Ordner liegt das
# Paket deshalb nicht. Der Startvorgang braucht es aber eigenständig, also
# wird es hier als echtes Verzeichnis herausgelöst (-L löst die
# pnpm-Verweise auf). `postgres` hat selbst keine Abhängigkeiten.
RUN mkdir -p /startdeps && cp -RL node_modules/postgres /startdeps/postgres

# ---------------------------------------------------------------------------
# Laufzeit
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# poppler-utils liefert pdftotext und pdftoppm. Beide werden für das Einlesen
# der Prüfberichte gebraucht — auch der Bildpfad für eingescannte Berichte.
RUN apt-get update && \
    apt-get install -y --no-install-recommends poppler-utils ca-certificates && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 werkbank && \
    useradd --system --uid 1001 --gid werkbank werkbank

# Standalone-Ausgabe: Next legt Server und die tatsächlich benötigten
# Abhängigkeiten selbst zusammen, das Abbild bleibt dadurch klein.
COPY --from=build --chown=werkbank:werkbank /app/.next/standalone ./
COPY --from=build --chown=werkbank:werkbank /app/.next/static ./.next/static
COPY --from=build --chown=werkbank:werkbank /app/public ./public

# Die Skills bleiben im Abbild: sie sind die fachliche Grundlage und werden
# für den Markdown-Rückexport gebraucht.
COPY --from=build --chown=werkbank:werkbank /app/skills ./skills

# Schema, Startbefüllung und die Abhängigkeit des Startvorgangs.
COPY --from=build --chown=werkbank:werkbank /app/drizzle ./drizzle
COPY --from=build --chown=werkbank:werkbank /app/seed ./seed
COPY --from=build --chown=werkbank:werkbank /startdeps/postgres ./node_modules/postgres
COPY --chown=werkbank:werkbank scripts/starten.mjs ./starten.mjs

USER werkbank
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/gesundheit').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "starten.mjs"]
