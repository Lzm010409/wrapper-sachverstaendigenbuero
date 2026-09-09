import { afterEach, describe, expect, it, vi } from 'vitest'

const listeNotizen = vi.fn()
const listeMails = vi.fn()

vi.mock('@/pipedrive/client', async () => {
  const echt = await vi.importActual<typeof import('@/pipedrive/client')>('@/pipedrive/client')
  return { ...echt, pipedrive: { listeNotizen, listeMails } }
})

const { ladeVorgangsschritte, pruefeMailGehoertZuDeal } = await import('./vorgangsschritte')

afterEach(() => {
  listeNotizen.mockReset()
  listeMails.mockReset()
})

describe('ladeVorgangsschritte', () => {
  it('mischt Notizen und Mails und zeigt sie neueste zuerst', async () => {
    listeNotizen.mockResolvedValueOnce([
      { id: 1, content: '<p>Gutachten besprochen.</p>', add_time: '2026-09-06 10:00:00' },
    ])
    listeMails.mockResolvedValueOnce([
      { id: 2, subject: 'Rückfrage Werkstatt', message_time: '2026-09-06 12:00:00', from: [{ name: 'Werkstatt' }] },
    ])

    const ergebnis = await ladeVorgangsschritte(1166)
    expect(ergebnis.schritte.map((s) => s.id)).toEqual([2, 1])
    expect(ergebnis.notizenFehler).toBeUndefined()
    expect(ergebnis.mailsFehler).toBeUndefined()
  })

  it('filtert Notizen heraus, die nur eine automatisierte Webhook-URL enthalten', async () => {
    listeNotizen.mockResolvedValueOnce([
      { id: 1, content: '<div>https://n8n-coolify.gollenstede.app/webhook/xyz?deal=1166</div>', add_time: '2026-09-06 10:00:00' },
      { id: 2, content: '<p>Rückruf erledigt, Kunde einverstanden.</p>', add_time: '2026-09-06 11:00:00' },
    ])
    listeMails.mockResolvedValueOnce([])

    const ergebnis = await ladeVorgangsschritte(1166)
    expect(ergebnis.schritte).toHaveLength(1)
    expect(ergebnis.schritte[0]).toMatchObject({ art: 'notiz', id: 2 })
  })

  it('zeigt Notizen weiter an, wenn nur der Mail-Abruf scheitert', async () => {
    listeNotizen.mockResolvedValueOnce([{ id: 1, content: '<p>Text</p>', add_time: '2026-09-06 10:00:00' }])
    listeMails.mockRejectedValueOnce(new Error('Pipedrive antwortete mit 502'))

    const ergebnis = await ladeVorgangsschritte(1166)
    expect(ergebnis.schritte).toHaveLength(1)
    expect(ergebnis.mailsFehler).toMatch(/E-Mails konnten nicht geladen werden \(Kennung .+\)\./)
    expect(ergebnis.notizenFehler).toBeUndefined()
  })

  it('zeigt Mails weiter an, wenn nur der Notiz-Abruf scheitert', async () => {
    listeNotizen.mockRejectedValueOnce(new Error('Zeitüberschreitung'))
    listeMails.mockResolvedValueOnce([{ id: 2, subject: 'Betreff', message_time: '2026-09-06 12:00:00' }])

    const ergebnis = await ladeVorgangsschritte(1166)
    expect(ergebnis.schritte).toHaveLength(1)
    expect(ergebnis.notizenFehler).toMatch(/Notizen konnten nicht geladen werden \(Kennung .+\)\./)
    expect(ergebnis.mailsFehler).toBeUndefined()
  })
})

describe('pruefeMailGehoertZuDeal', () => {
  it('lässt nur eine Mail-ID durch, die in der deal-gebundenen Liste steht', () => {
    const mailsDesDeals = [{ id: 24263 }, { id: 24264 }]
    expect(pruefeMailGehoertZuDeal(24263, mailsDesDeals)).toBe(true)
    expect(pruefeMailGehoertZuDeal(99999, mailsDesDeals)).toBe(false)
    expect(pruefeMailGehoertZuDeal(24263, [])).toBe(false)
  })
})
