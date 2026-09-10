import { redirect } from 'next/navigation'
import { aktuellerBenutzer } from '@/auth/sitzung'
import { STARTSEITE } from '@/auth/startseite'

export default async function Start() {
  redirect((await aktuellerBenutzer()) ? STARTSEITE : '/anmelden')
}
