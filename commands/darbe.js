import { groupMetadata, sahipUyeKimligi } from '../lib/group.js'
import { binlik } from '../lib/sayi.js'
import { darbeBaslat, darbeBitir } from '../lib/stats.js'
import { trLower } from '../lib/turkishWords.js'
import { darbeDuyur, darbeSuruyor } from '../games/darbe.js'
import { grupIdCoz } from './xpver.js'
import logger from '../lib/logger.js'

export default {
  name: 'darbe',
  aliases: [],
  description: 'Bot sahibi: gruba özelden darbe yapar',
  usage: '.darbe <grup id>  —  .darbe bitir <grup id>',
  category: 'toplum',
  // .help'te hiç görünmez, satılmaz; yalnızca sahip özelden kullanır (bot sahibinin kararı).
  hidden: true,
  ownerOnly: true,
  cooldown: 0,
  // Yalnızca sahip özelden `.help darbe` yazınca görünür (commands/help.js).
  details: [
    '🪖 *Darbe nasıl yapılır?*\n',
    '1️⃣ Grubun id\'sini öğren: grupta `.id` yaz, "...@g.us" ile biten satır.',
    '2️⃣ Bota *özelden* yaz: `.darbe <grup id>`',
    '   Örnek: `.darbe 120363012345678901@g.us`',
    '   Grupta yazarsan hiçbir şey olmaz, iz de kalmaz.\n',
    '⚡ *Hemen olanlar*',
    '• Başkanlık sana geçer, başkan seçimi askıya alınır. Bakanlıklar sürer.',
    '• Grupta herkes etiketlenir, her üyeye özelden duyuru gider (aralarında 3 sn).',
    '• Üyeler gruptaki darbe mesajına *destek* ya da *karşı* yanıtı verir, son yanıt geçerli.\n',
    '⏱️ *10 dakika sonra*',
    '• Destek verenlere hazineden 1 coin değerinde XP (hazine yetmezse azı).',
    '• Destek vermeyen herkesin (karşı ve sessiz) banka ve cüzdanının %60\'ı hazineye geçer,',
    '  coininin %60\'ı ve mülklerinin yarısı yanar. Sigorta ve kalkan korumaz.\n',
    '🕊️ *Bitirmek*: `.darbe bitir <grup id>`',
    '   Seçim yeniden açılır, yenisi seçilene kadar başkan sensin.\n',
    '⚠️ Bot o 10 dakikada yeniden başlarsa yönetim sende kalır ama ceza ve ödül işlenmez.',
    '⚠️ Herkese özelden mesaj gittiği için numaranın ban riski vardır.',
  ],

  async execute({ sock, msg, args, from, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    // Grupta yazılırsa iz bırakmadan düşer, .xpver gibi.
    if (parsed.isGroup) {
      logger.info({ from }, '.darbe grupta yazıldı, yok sayıldı')
      return
    }

    try {
      const bitirilecek = trLower(args[0] || '') === 'bitir'
      const grup = grupIdCoz(String((bitirilecek ? args[1] : args[0]) || '').replace(/`/g, ''))
      if (!grup) return await yaz('Kullanım: `.darbe <grup id>` ya da `.darbe bitir <grup id>`')

      if (bitirilecek) {
        const s = darbeBitir({ chatJid: grup })
        if (s === null) return await yaz('❌ Veritabanına ulaşılamadı.')
        return await yaz(s ? '🕊️ Darbe bitti: başkanlık sende kalır, seçimler yeniden açıldı.' : 'Bu grupta darbe yok.')
      }

      if (darbeSuruyor(grup)) return await yaz('🪖 Bu grupta darbe zaten sürüyor.')

      let metadata
      try {
        metadata = await groupMetadata(sock, grup)
      } catch (err) {
        logger.error({ err, grup }, '.darbe grup bilgisi alınamadı')
        return await yaz('❌ Grup bulunamadı ya da bot grupta değil.')
      }

      const sahip = sahipUyeKimligi(metadata)
      if (!sahip) return await yaz('❌ Sen bu grupta görünmüyorsun.')

      const s = darbeBaslat({ chatJid: grup, userJid: sahip })
      if (!s) return await yaz('❌ Darbe başlatılamadı (bot hesabı ya da veritabanı hazır değil).')

      const duyuruldu = await darbeDuyur({ sock, chatJid: grup, metadata, sahip, odul: s.odul })
      if (!duyuruldu) return await yaz('⚠️ Yönetim sana geçti ama grup duyurusu gönderilemedi, ceza ve ödül işlenmeyecek.')

      await yaz([
        `🪖 *${metadata.subject || 'Grup'}* düştü. Başkan sensin, seçim askıda.`,
        `Destekçi başı ödül: ${binlik(s.odul)} XP  •  Hazine: ${binlik(s.kasa)} XP`,
        'Sonuç 10 dakika sonra grupta. Bitirmek için: `.darbe bitir <grup id>`',
      ].join('\n'))
    } catch (err) {
      logger.error({ err }, '.darbe başarısız')
      await yaz('❌ Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.darbe hata mesajı gönderilemedi'))
    }
  },
}
