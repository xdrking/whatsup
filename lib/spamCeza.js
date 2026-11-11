// Susturulduğu halde yazmaya devam eden üye (bot sahibinin kararı): mesajları zaten silinir,
// UYARI_ESIGI'nci silinen mesajda özelden uyarılır, CEZA_ARALIGI kadar daha yazarsa bütün
// varlığının yarısına el konur. Sonra sayım sıfırlanır, devam ederse döngü baştan başlar.
// Bot kendiliğinden yazmaz kuralının istisnasıdır: mesajı kişinin kendi yazdığı mesaj tetikler.
import { MULKLER } from './mulk.js'
import { sulyYaz } from './kripto.js'
import { binlik } from './sayi.js'
import { spamElKoy } from './stats.js'
import { ihlalSay, ihlalSifirla } from './uyeSustur.js'
import logger from './logger.js'

export const UYARI_ESIGI = 3
export const CEZA_ARALIGI = 3
// 150 mesajlık spam 50 özel mesaj demekti: alıcının telefonu çözemeyip yeniden istedikçe Signal
// oturumları bozuldu, bot Bad MAC yüzünden hiçbir mesajı okuyamaz oldu. Kişi başı 10 dakikada tek özel mesaj.
export const DM_ARALIGI_MS = 10 * 60_000

const sonDm = new Map()

/** Aynı kişiye son özel mesajdan bu yana DM_ARALIGI_MS geçti mi; geçtiyse zamanı not eder. */
export function dmIzni(anahtar, simdi = Date.now()) {
  const son = sonDm.get(anahtar)
  if (son !== undefined && simdi - son < DM_ARALIGI_MS) return false
  sonDm.set(anahtar, simdi)
  return true
}

/** @returns {'uyari' | 'ceza' | null} bu silinen mesajdan sonra yapılacak iş */
export function ihlalAsamasi(sayi) {
  if (sayi === UYARI_ESIGI) return 'uyari'
  if (sayi === UYARI_ESIGI + CEZA_ARALIGI) return 'ceza'
  return null
}

/** LID'e özel mesaj her zaman ulaşmıyor (bkz. `.tabu`): numara biliniyorsa ona yazılır. */
const dmAdresi = (parsed) => (parsed.senderPn?.endsWith('@s.whatsapp.net') ? parsed.senderPn : parsed.sender)

export function cezaSatirlari(c) {
  const lines = []
  if (c.banka + c.cuzdan > 0) lines.push(`💰 ${binlik(c.banka + c.cuzdan)} XP (cüzdan ve banka)`)
  if (c.coin) lines.push(`🪙 ${c.coin} coin`)
  if (c.suly) lines.push(`₿ ${sulyYaz(c.suly)} Suly`)
  for (const m of c.mulkler) lines.push(`${MULKLER.find((x) => x.kod === m.kod)?.ad ?? m.kod} × ${m.adet}`)
  return lines
}

/**
 * Susturulan üyenin mesajı silindikten sonra çağrılır.
 * @param {string} kimlik  susturma listesinde eşleşen kimlik (sayaç anahtarı)
 */
export async function susturmaIhlali({ sock, parsed, kimlik }) {
  const asama = ihlalAsamasi(ihlalSay(parsed.from, kimlik))
  if (!asama) return

  const yaz = async (text) => {
    if (!dmIzni(`${parsed.from}|${kimlik}`)) {
      logger.info({ from: parsed.from, sender: parsed.sender, asama }, 'Susturma özel mesajı atlandı, 10 dk dolmadı')
      return
    }
    await sock.sendMessage(dmAdresi(parsed), { text })
  }

  if (asama === 'uyari') {
    await yaz([
      '🚨 *Susturuldun ama yazmaya devam ediyorsun.*',
      '',
      `${CEZA_ARALIGI} mesaj daha yazarsan tüm mal varlığının yarısına el koyarım.`,
    ].join('\n'))
    return
  }

  ihlalSifirla(parsed.from, kimlik)
  const c = spamElKoy({ chatJid: parsed.from, userJid: parsed.sender })
  if (!c) return
  logger.info({ from: parsed.from, sender: parsed.sender, ceza: c }, 'Susturmayı dinlemeyenin varlığına el konuldu')

  const satirlar = cezaSatirlari(c)
  await yaz([
    '⚖️ *Uyarıldın, dinlemedin.* Mal varlığının yarısına el konuldu:',
    '',
    ...(satirlar.length ? satirlar : ['Alınacak bir şeyin yokmuş.']),
    '',
    `Yazmaya devam edersen ${UYARI_ESIGI + CEZA_ARALIGI} mesaj sonra yine el konur.`,
  ].join('\n'))
}
