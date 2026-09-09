import { afterEach, describe, expect, it, vi } from 'vitest'
import { aktenzeichenschluessel, holeRechnungen, inCent, zuRechnung } from './client'

vi.mock('server-only', () => ({}))

const ALT = process.env.SEVDESK_API_TOKEN
afterEach(() => {
  if (ALT === undefined) delete process.env.SEVDESK_API_TOKEN
  else process.env.SEVDESK_API_TOKEN = ALT
})

function roh(mehr: Record<string, unknown> = {}) {
  return {
    id: '59029785',
    invoiceNumber: '0926/2081TG01',
    status: '200',
    sumGross: '1534.21',
    paidAmount: 0,
    invoiceDate: '2026-09-08T00:00:00+02:00',
    payDate: null,
    timeToPay: '30',
    dunningLevel: null,
    update: '2026-09-08T22:37:25+02:00',
    ...mehr,
  }
}

describe('aktenzeichenschluessel', () => {
  it('findet Rechnung und Akte zueinander', () => {
    // So sieht es am echten Konto aus: Akte 0926/2081TG, Rechnung …TG01.
    expect(aktenzeichenschluessel('0926/2081TG01')).toBe(aktenzeichenschluessel('0926/2081TG'))
  })

  it('verträgt die alte Schreibweise mit Unterstrich', () => {
    expect(aktenzeichenschluessel('1222_693TG01')).toBe(aktenzeichenschluessel('1222/693TG'))
  })

  it('hält verschiedene Akten auseinander', () => {
    expect(aktenzeichenschluessel('0926/2081TG01')).not.toBe(aktenzeichenschluessel('0926/2082TG'))
    expect(aktenzeichenschluessel('0926/208TG')).not.toBe(aktenzeichenschluessel('0926/2081TG01'))
  })
})

describe('inCent', () => {
  it('rechnet die Zeichenkette von sevDesk in Cent', () => {
    expect(inCent('1247.42')).toBe(124742)
    expect(inCent('261.8')).toBe(26180)
    expect(inCent(0)).toBe(0)
  })

  it('macht aus Unsinn eine Null statt NaN', () => {
    expect(inCent(null)).toBe(0)
    expect(inCent('—')).toBe(0)
  })
})

describe('zuRechnung', () => {
  it('liest eine Rechnung, wie sie wirklich kommt', () => {
    const r = zuRechnung(roh())
    expect(r?.nummer).toBe('0926/2081TG01')
    expect(r?.status).toBe(200)
    expect(r?.bruttoCent).toBe(153421)
    expect(r?.zahlungszielTage).toBe(30)
  })

  it('lässt eine Rechnung ohne Nummer aus — sie gehört zu keinem Fall', () => {
    expect(zuRechnung(roh({ invoiceNumber: null }))).toBeNull()
  })

  it('lässt eine Rechnung ohne sevDesk-Kennung aus', () => {
    // Ohne sie liesse sich der Spiegel nicht fortschreiben, und zwei
    // Rechnungen mit derselben Nummer wären nicht auseinanderzuhalten.
    expect(zuRechnung(roh({ id: null }))).toBeNull()
  })

  it('nimmt die sevDesk-Kennung auch als Zahl entgegen', () => {
    expect(zuRechnung(roh({ id: 59029785 }))?.sevdeskId).toBe('59029785')
  })

  it('lässt eine Rechnung ohne Änderungszeitpunkt aus — sonst stockt der Abgleich', () => {
    expect(zuRechnung(roh({ update: null }))).toBeNull()
  })
})

describe('holeRechnungen', () => {
  function antwort(objects: unknown[]) {
    return { ok: true, status: 200, json: async () => ({ objects }) } as unknown as Response
  }

  it('bricht ab, sobald eine Rechnung älter als das Wasserzeichen ist', async () => {
    process.env.SEVDESK_API_TOKEN = 'test'
    const hole = vi.fn(async () =>
      antwort([
        roh({ id: '1', invoiceNumber: 'neu01', update: '2026-09-09T10:00:00+02:00' }),
        roh({ id: '2', invoiceNumber: 'alt01', update: '2026-09-01T10:00:00+02:00' }),
      ]),
    )

    const ergebnis = await holeRechnungen(new Date('2026-09-05T00:00:00+02:00'), hole as never)

    expect(ergebnis.map((r) => r.nummer)).toEqual(['neu01'])
    // Eine Seite genügt: was danach kommt, ist noch älter.
    expect(hole).toHaveBeenCalledTimes(1)
  })

  it('holt beim ersten Lauf alles', async () => {
    process.env.SEVDESK_API_TOKEN = 'test'
    const hole = vi.fn(async () =>
      antwort([roh({ id: '1', invoiceNumber: 'a01' }), roh({ id: '2', invoiceNumber: 'b01' })]),
    )

    expect((await holeRechnungen(null, hole as never)).map((r) => r.nummer)).toEqual(['a01', 'b01'])
  })

  it('sagt es, statt still nichts zu liefern, wenn sevDesk ablehnt', async () => {
    process.env.SEVDESK_API_TOKEN = 'test'
    const hole = vi.fn(async () => ({ ok: false, status: 401 }) as unknown as Response)

    await expect(holeRechnungen(null, hole as never)).rejects.toThrow('401')
  })

  it('fragt gar nicht erst ohne Token', async () => {
    delete process.env.SEVDESK_API_TOKEN
    const hole = vi.fn()
    await expect(holeRechnungen(null, hole as never)).rejects.toThrow('nicht eingerichtet')
    expect(hole).not.toHaveBeenCalled()
  })
})
