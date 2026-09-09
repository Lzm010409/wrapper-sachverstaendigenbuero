import { ladeFotos } from '@/fotos/ansicht'
import { ladeAnalyse } from '@/fotos/analyse-ablage'
import { kiVerfuegbar } from '@/ki/client'
import { Meldung } from '@/app/teile/meldung'
import type { Gutachten } from '@/autoixpert/typen'
import { Fotoraster } from './fotos-raster'

/**
 * Der Reiter „Fotos".
 *
 * Diese Datei holt nur die Angaben; die Bilder selbst holt der Browser
 * einzeln, und zwar erst, wenn sie ins Blickfeld kommen. Siehe
 * `fotos-raster.tsx` für das Warum.
 */
export async function FotoReiter({ gutachten, fallId }: { gutachten: Gutachten; fallId: string }) {
  const [ansicht, analyse] = await Promise.all([ladeFotos(gutachten), ladeAnalyse(fallId)])

  if (ansicht.stand === 'nicht_eingerichtet') {
    return (
      <Meldung art="warnung">
        autoiXpert ist auf diesem Server nicht eingerichtet — <code>AUTOIXPERT_API_TOKEN</code>{' '}
        fehlt. Ohne ihn lassen sich die Fotos nicht abrufen.
      </Meldung>
    )
  }

  if (ansicht.stand === 'fehler') {
    return <Meldung art="fehler">Die Fotos liessen sich nicht laden: {ansicht.meldung}</Meldung>
  }

  if (ansicht.stand === 'ohne_fotos') {
    return (
      <div className="leer">
        <p style={{ margin: 0 }}>Zu diesem Gutachten sind in autoiXpert keine Fotos hinterlegt.</p>
      </div>
    )
  }

  return (
    <Fotoraster
      fallId={fallId}
      fotos={ansicht.fotos}
      schreibenErlaubt={ansicht.schreibenErlaubt}
      analyse={analyse}
      kiEingerichtet={kiVerfuegbar()}
    />
  )
}
