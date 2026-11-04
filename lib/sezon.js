// .sezon: haftalık yarış. Saf; yazma lib/stats.js'tedir.
import { istanbulDay } from './dataset.js'

// Sıraya göre ödül. Hafta bitince bot kendiliğinden yazmadığı için sezon,
// yeni haftadaki ilk `.sezon` çağrısında kapanır.
export const SEZON_ODULLERI = [1000, 500, 250]

/** Türkiye takvimine göre haftanın pazartesisi: "2026-11-02". */
export function haftaAnahtari(now = new Date()) {
  const gun = new Date(`${istanbulDay(now)}T00:00:00Z`)
  gun.setUTCDate(gun.getUTCDate() - ((gun.getUTCDay() + 6) % 7))
  return gun.toISOString().slice(0, 10)
}

/** Haftanın bittiği an (ms). */
export function haftaBitisi(hafta) {
  return Date.parse(`${hafta}T00:00:00+03:00`) + 7 * 86_400_000
}
