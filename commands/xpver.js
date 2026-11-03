import { groupMetadata, uyeKimligiBul } from '../lib/group.js'
import { xpAyarla } from '../lib/stats.js'
import { lookupName } from '../lib/contacts.js'
import logger from '../lib/logger.js'

/**
 * "0555 123 45 67", "+90 555…" → "905551234567". `.id @kişi` çıktısındaki
 * "...@lid" kimliği olduğu gibi döner (numarayı göstermeyen gruplar için).
 * Anlaşılmazsa null.
 */
export function numaraCoz(arg) {
  const ham = String(arg || '').trim().replace(/`/g, '')
  if (/^\d+@lid$/.test(ham)) return ham
  let n = ham.replace(/\D/g, '')
  if (/^0\d{10}$/.test(n)) n = `9${n}`
  return /^\d{10,15}$/.test(n) ? n : null
}

/** "120363…@g.us" ya da yalnızca rakamlar → grup JID'i; anlaşılmazsa null. */
export function grupIdCoz(arg) {
  const g = String(arg || '').trim()
  if (/^[\d-]+@g\.us$/.test(g)) return g
  if (/^[\d-]{10,}$/.test(g)) return `${g}@g.us`
  return null
}

export default {
  name: 'xpver',
  aliases: ['xpekle'],
  description: 'Bot sahibi: gruptaki kişiye özelden XP verir/alır',
  usage: '.xpver <grup id> <numara ya da @lid id> <miktar>',
  category: 'istatistik',
  // .help'te hiç görünmez (sahibe de); kullanımı yalnızca README'de.
  hidden: true,
  ownerOnly: true,
  cooldown: 0,

  async execute({ sock, msg, args, from, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    // Grupta yazılırsa hiçbir iz bırakmadan düşer: kimin XP bastığı görünmesin.
    if (parsed.isGroup) {
      logger.info({ from }, '.xpver grupta yazıldı, yok sayıldı')
      return
    }

    try {
      const [grupArg, numaraArg, miktarArg] = args
      const grup = grupIdCoz(String(grupArg || '').replace(/`/g, ''))
      const numara = numaraCoz(numaraArg)
      const miktar = /^[+-]?\d+$/.test(miktarArg || '') ? Number(miktarArg) : NaN

      if (!grup || !numara || !Number.isSafeInteger(miktar) || miktar === 0) {
        await yaz('Kullanım: `.xpver <grup id> <numara ya da @lid id> <miktar>`\nÖrnek: `.xpver 120363012345678901@g.us 905551234567 100`')
        return
      }

      let metadata
      try {
        metadata = await groupMetadata(sock, grup)
      } catch (err) {
        logger.warn({ err, grup }, '.xpver: grup bilgisi alınamadı')
        await yaz('❌ Grup bulunamadı. Id doğru mu, bot o grupta mı?')
        return
      }

      const kimlik = uyeKimligiBul(metadata, numara)
      if (!kimlik) {
        await yaz(`❌ ${numara} bu grupta bulunamadı.\n(WhatsApp bazı gruplarda üyelerin numarasını göstermeyebilir.)`)
        return
      }

      const sonuc = xpAyarla({ chatJid: grup, userJid: kimlik, miktar })
      if (!sonuc) {
        await yaz('❌ Veritabanına yazılamadı.')
        return
      }

      const fark = sonuc.xp - sonuc.once
      await yaz([
        `✅ *${metadata.subject || grup}*`,
        `👤 ${lookupName(kimlik) || numara}: ${fark >= 0 ? '+' : ''}${fark} XP`,
        `💰 XP: ${sonuc.once} → ${sonuc.xp}`,
      ].join('\n'))
    } catch (err) {
      logger.error({ err }, '.xpver başarısız')
      await yaz('❌ Bir şeyler ters gitti.')
    }
  },
}
