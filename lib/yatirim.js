// .yatırım: para vade boyunca kilitlenir, sonuç baştan zarla belirlenir ve vadede açıklanır.
// Sonuçlar anaparanın yüzdesidir; [yüzde, ağırlık], ağırlık toplamı 100.
export const YATIRIM_SAATI = 6
export const MIN_YATIRIM = 1000

export const RISKLER = {
  dusuk: { ad: '🟢 Düşük risk', sonuclar: [[90, 20], [110, 50], [130, 30]] },
  orta: { ad: '🟡 Orta risk', sonuclar: [[50, 25], [120, 45], [200, 30]] },
  yuksek: { ad: '🔴 Yüksek risk', sonuclar: [[0, 40], [150, 35], [400, 25]] },
}

const RISK_ADLARI = { dusuk: 'dusuk', düşük: 'dusuk', orta: 'orta', yuksek: 'yuksek', yüksek: 'yuksek' }

export function riskCoz(kelime) {
  return RISK_ADLARI[kelime] ?? null
}

/**
 * Anaparanın kaç yüzdesinin döneceği. Olay etkisi yalnızca kâra ve zarara işler:
 * patlamada kâr büyür, krizde kâr küçülür; zarar ikisinde de değişmez.
 *
 * @param {number} zar 0-99
 * @param {number} olayYuzde 100 = etkisiz
 */
export function yatirimSonucu(risk, zar, olayYuzde = 100) {
  let r = zar
  let yuzde = RISKLER[risk].sonuclar.at(-1)[0]
  for (const [y, agirlik] of RISKLER[risk].sonuclar) {
    if (r < agirlik) { yuzde = y; break }
    r -= agirlik
  }
  return yuzde > 100 ? 100 + Math.round(((yuzde - 100) * olayYuzde) / 100) : yuzde
}
