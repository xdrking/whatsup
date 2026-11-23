import { sureYaz } from './cark.js'
import { miktarCoz } from '../lib/kumar.js'
import { ozelUyelikler } from '../lib/ozel.js'
import { binlik } from '../lib/sayi.js'
import { offshoreCek, offshoreDurumu, offshoreYatir } from '../lib/stats.js'
import { trLower } from '../lib/turkishWords.js'
import { OFFSHORE_AZAMI_GUN, OFFSHORE_BASKIN_YUZDESI, OFFSHORE_KOMISYON, OFFSHORE_RISK } from '../lib/yeralti.js'
import logger from '../lib/logger.js'

const KAPALI = '🏝️ Adaya bağlanılamadı, sonra dene.'

function durumMetni(d) {
  return [
    '🏝️ *Offshore hesap*',
    '',
    d.hesap
      ? `🔐 ${binlik(d.hesap.miktar)} XP  •  ${d.hesap.bitis > Date.now() ? `${sureYaz(d.hesap.bitis - Date.now())} kilitli` : 'açıldı: `.offshore çek`'}`
      : 'Hesabın boş.',
    `👛 Cüzdan: ${binlik(d.xp)} XP`,
    '',
    `Yatırmak: \`.offshore yatır <miktar> [gün]\` (1-${OFFSHORE_AZAMI_GUN})`,
    `Komisyon %${OFFSHORE_KOMISYON}, gün başına %${OFFSHORE_RISK} baskın riski.`,
  ].join('\n')
}

export default {
  name: 'offshore',
  aliases: ['karapara', 'akla', 'ofşor'],
  description: 'Parayı vergiden, hackten ve hacizden saklar (riskli)',
  usage: '.offshore  —  .offshore yatır <miktar|hepsi> [gün]  —  .offshore çek',
  details: [
    `Cüzdandan 1-${OFFSHORE_AZAMI_GUN} gün kilitlersin, %${OFFSHORE_KOMISYON} komisyon yanar, faiz almaz. Süre dolmadan çekilmez.`,
    'Kilitliyken servet vergisi, `.hacizall`, hack, soygun ve darbe dokunamaz; `.servet`\'te görünmez.',
    `Her gün için %${OFFSHORE_RISK} baskın riski var. Baskın olduysa çekerken paranın %${OFFSHORE_BASKIN_YUZDESI}'si hazineye gider.`,
    'Borçlu yatıramaz, offshore hesabı doluyken `.iflas` edilemez. Bota özelden de yazabilirsin (tek ortak grubun varsa).',
  ],
  category: 'ekonomi',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      let kim = { chatJid: from, userJid: sender }
      if (!parsed.isGroup) {
        const uyelikler = await ozelUyelikler(sock, parsed)
        if (uyelikler.length !== 1) return await yaz('🏝️ Özelden yalnızca botla tek ortak grubun varsa çalışır. Grupta yaz.')
        kim = uyelikler[0]
      }

      const islem = trLower(args[0] || '')
      const d = offshoreDurumu(kim)
      if (!d) return await yaz(KAPALI)

      if (['yatır', 'yatir', 'sakla'].includes(islem)) {
        const gun = args[2] === undefined ? 1 : Number(args[2])
        if (!Number.isInteger(gun) || gun < 1 || gun > OFFSHORE_AZAMI_GUN) return await yaz(`🏝️ Gün 1 ile ${OFFSHORE_AZAMI_GUN} arası olmalı.`)
        const c = miktarCoz(args[1], d.xp)
        if (c.hata) return await yaz(c.hata)
        const s = offshoreYatir({ ...kim, miktar: c.miktar, gun })
        if (!s) return await yaz(KAPALI)
        if (s.acik) return await yaz('🏝️ Zaten kilitli hesabın var, tek hesap açılır.')
        if (s.borclu) return await yaz('🏝️ Borçluyken offshore hesap açılmaz. Önce `.kredi öde`.')
        if (s.yetersiz) return await yaz(`🏝️ O kadar XP'n yok: ${binlik(s.xp)}`)
        if (s.az) return await yaz('🏝️ Bu miktar komisyona bile yetmiyor.')
        return await yaz(`🏝️ *${binlik(s.net)} XP* ${gun} gün kilitlendi. Komisyon: ${binlik(s.komisyon)} XP\n👛 Cüzdan: ${binlik(s.xp)} XP`)
      }

      if (['çek', 'cek'].includes(islem)) {
        const s = offshoreCek(kim)
        if (!s) return await yaz(KAPALI)
        if (s.yok) return await yaz('🏝️ Offshore hesabın boş.')
        if (s.bekle) return await yaz(`🔐 Kilit açılmadı, ${sureYaz(s.bekle - Date.now())} kaldı.`)
        return await yaz([
          ...(s.elKonan ? [`🚨 Maliye adayı basmış! ${binlik(s.elKonan)} XP hazineye gitti.`] : ['✅ Para temiz çıktı.']),
          `💰 +${binlik(s.odeme)} XP  •  👛 Cüzdan: ${binlik(s.xp)} XP`,
        ].join('\n'))
      }

      // Kilitli tutar gizlidir: grupta yazılmaz.
      if (parsed.isGroup && d.hesap) {
        const acildi = d.hesap.bitis <= Date.now()
        return await yaz(`🏝️ Offshore hesabın ${acildi ? 'açıldı: `.offshore çek`' : `${sureYaz(d.hesap.bitis - Date.now())} kilitli`}. Tutar için özelden yaz.`)
      }
      await yaz(durumMetni(d))
    } catch (err) {
      logger.error({ err, from }, '.offshore başarısız')
      await yaz('🏝️ Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.offshore hata mesajı gönderilemedi'))
    }
  },
}
