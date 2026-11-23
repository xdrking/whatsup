import { sureYaz } from './cark.js'
import { requireGroup } from '../lib/group.js'
import { BAKAN_GUNLUK } from '../lib/devlet.js'
import { HAPIS_SAATI } from '../lib/hapis.js'
import { binlik } from '../lib/sayi.js'
import { izListesi, izSur } from '../lib/stats.js'
import { displayName, mentionOf } from '../lib/target.js'
import { IZ_SANSI, IZ_SURESI_MS } from '../lib/yeralti.js'
import logger from '../lib/logger.js'

function listeMetni(liste) {
  if (!liste.length) return '🕵️ Son 24 saatte çözülmemiş siber saldırı yok.'
  return [
    '🕵️ *Siber suç dosyaları*',
    '',
    ...liste.map((r) => `*${r.id}.* ${displayName(r.kurban)} — ${r.tur === 'fidye' ? 'fidye yazılımı' : `${binlik(r.para)} XP çalındı`}, ${sureYaz(Date.now() - r.zaman)} önce`),
    '',
    'İz sürmek (İçişleri Bakanı): `.izsür <dosya no>`',
  ].join('\n')
}

export default {
  name: 'izsür',
  aliases: ['izsur', 'siberpolis'],
  description: 'Siber polis: İçişleri Bakanı hackerın izini sürer',
  usage: '.izsür  —  .izsür <dosya no>',
  details: [
    `Son ${IZ_SURESI_MS / 3_600_000} saatin çözülmemiş saldırılarını listeler. \`.izsür <dosya no>\` yalnızca İçişleri Bakanı içindir.`,
    `VPN'siz saldırganı %${IZ_SANSI} olasılıkla bulur: ${HAPIS_SAATI} saat hapis, çalınanın yarısı saldırganın bankasından kurbana döner.`,
    `\`.bakan af\` ile aynı günlük hakkı harcar (günde ${BAKAN_GUNLUK}). VPN kullanıldıysa iz kaybolur, dosya kapanır.`,
  ],
  category: 'toplum',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return
      if (!args.length) return await yaz(listeMetni(izListesi(from)))

      const id = Number(args[0])
      if (!Number.isSafeInteger(id) || id < 1) return await yaz('Kullanım: `.izsür <dosya no>`')

      const s = izSur({ chatJid: from, userJid: sender, id })
      if (!s) return await yaz('🕵️ Siber suçlar kapalı, sonra dene.')
      if (s.degil) return await yaz('🚔 İzi yalnızca İçişleri Bakanı sürer.')
      if (s.bugunVar) return await yaz(`🚔 Bugünkü ${BAKAN_GUNLUK} hakkını kullandın, yarın tekrar.`)
      if (s.yok) return await yaz('🕵️ Böyle açık bir dosya yok. `.izsür`')

      const hak = `\n(Bugün kalan hakkın: ${s.kalan})`
      if (s.izKayip) return await yaz(`🛰️ İz VPN'de kayboldu, dosya kapandı.${hak}`)
      if (s.bulunamadi) return await yaz(`🕵️ Bu sefer ipucu çıkmadı, dosya açık.${hak}`)
      await yaz(
        `🚨 *FAİL BULUNDU*\n${mentionOf(s.kurban)} saldırısının arkasında ${mentionOf(s.saldiran)} varmış!\n` +
          `🚔 ${HAPIS_SAATI} saat hapis. Kefalet: ${binlik(s.kefalet)} XP${s.iade ? `\n💰 ${binlik(s.iade)} XP kurbana geri döndü.` : ''}${hak}`,
        [s.kurban, s.saldiran],
      )
    } catch (err) {
      logger.error({ err, from }, '.izsür başarısız')
      await yaz('🕵️ Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.izsür hata mesajı gönderilemedi'))
    }
  },
}
