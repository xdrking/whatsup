import { sureYaz } from './cark.js'
import { grupIdCoz, numaraCoz } from './xpver.js'
import { sulyYaz } from '../lib/kripto.js'
import { cokGrupMetni, HEDEF_YOK, ozelHedefler, ozelUyelikler } from '../lib/ozel.js'
import { binlik } from '../lib/sayi.js'
import { muhbirDosya, muhbirKim } from '../lib/stats.js'
import { urunKoduyla } from '../lib/sulymarket.js'
import { displayName } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import { MUHBIR_DOSYA, MUHBIR_KIM } from '../lib/yeralti.js'
import logger from '../lib/logger.js'

const KAPALI = '🐀 Muhbir gelmedi, sonra dene.'
const KULLANIM = [
  '🐀 *Muhbir* (yalnızca özelden)',
  '',
  `\`.muhbir kim\` — seni son hackleyeni söyler, en az ${MUHBIR_KIM} Suly`,
  `\`.muhbir dosya <numara ya da id>\` — offshore hesabı, hackerları, duvarı ve cephaneliği, en az ${MUHBIR_DOSYA} Suly`,
  '',
  '_Ücret SulyMarket fiyatlarıyla birlikte anlık değişir._',
].join('\n')

const yetersiz = ({ ucret, birim }) => `🐀 ${sulyYaz(ucret)} Suly istiyor, sende ${sulyYaz(birim)} var. \`.kripto al suly <miktar>\``
const urunler = (liste) => liste.map((e) => `${urunKoduyla(e.kod)?.ad ?? e.kod} x${binlik(e.adet)}`).join('  •  ')

function kimMetni(s) {
  if (!s) return KAPALI
  if (s.yok) return '🐀 Son bir haftada seni hackleyen olmamış. Para almadı.'
  if (s.vpn) return '🐀 "VPN kullanmış, ben de bulamadım." Para almadı.'
  if (s.yetersiz) return yetersiz(s)
  return `🐀 "${s.tur === 'fidye' ? 'Bankanı kilitleyen' : 'Seni soyan'}: *${displayName(s.saldiran)}*. Benden duymadın."\n🟠 Kalan: ${sulyYaz(s.birim)} Suly`
}

function dosyaMetni(ad, s) {
  return [
    `🐀 *${ad}* dosyası`,
    '',
    `🏝️ Offshore: ${s.offshore ? `${binlik(s.offshore.miktar)} XP, ${s.offshore.bitis > Date.now() ? `${sureYaz(s.offshore.bitis - Date.now())} kilitli` : 'kilidi açılmış'}` : 'yok'}`,
    `🎒 Envanter: ${s.envanter.length ? urunler(s.envanter) : 'boş'}`,
    `🧱 Güvenlik duvarı: ${s.duvar ? `${sureYaz(s.duvar - Date.now())} kaldı` : 'yok'}`,
    `🏴 Çete: ${s.cete ?? 'yok'}${s.silahlar.length ? `\n🔫 ${urunler(s.silahlar)}` : ''}`,
    '',
    `🟠 Kalan: ${sulyYaz(s.birim)} Suly`,
  ].join('\n')
}

export default {
  name: 'muhbir',
  aliases: ['ispiyon'],
  description: 'Suly karşılığı gizli bilgi satar (bota özelden)',
  usage: '.muhbir kim  —  .muhbir dosya <numara ya da id> (bota özelden)',
  details: [
    `\`.muhbir kim\` son 7 günde seni son hackleyeni söyler (en az ${MUHBIR_KIM} Suly). VPN kullandıysa bulamaz, para almaz.`,
    `\`.muhbir dosya 905551234567\` kişinin offshore hesabını, yeraltı envanterini ve çetesinin silahlarını yazar (en az ${MUHBIR_DOSYA} Suly). Ücret anlıktır, \`.sulymarket\` gibi.`,
    'Birden çok ortak grubun varsa sonuna grup id ekle. Ödenen Suly yanar.',
  ],
  category: 'toplum',
  cooldown: 8,
  ownerOnly: false,

  async execute({ sock, msg, from, args, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (parsed.isGroup) return await yaz('🤫 Muhbir kalabalıkta konuşmaz. Bota *özelden* yaz: `.muhbir`')

      const islem = trLower(args[0] || '')
      const grupArg = args.find((a) => a.endsWith('@g.us'))
      const grup = grupArg ? grupIdCoz(grupArg) : null
      const uyelikler = await ozelUyelikler(sock, parsed)
      if (!uyelikler.length) return await yaz('🚫 Botun olduğu hiçbir grupta değilsin.')

      if (islem === 'kim') {
        const adaylar = grup ? uyelikler.filter((u) => u.chatJid === grup) : uyelikler
        if (adaylar.length !== 1) return await yaz(`Hangi grup? Sonuna id ekle:\n${uyelikler.map((u) => `\`${u.chatJid}\``).join('\n')}`)
        return await yaz(kimMetni(muhbirKim(adaylar[0])))
      }

      if (islem === 'dosya') {
        const kimlik = numaraCoz(args.slice(1).filter((a) => a !== grupArg).join(' '))
        if (!kimlik) return await yaz(KULLANIM)
        const adaylar = await ozelHedefler(sock, uyelikler, kimlik, grup)
        if (!adaylar.length) return await yaz(HEDEF_YOK)
        if (adaylar.length > 1) return await yaz(cokGrupMetni(adaylar))

        const [a] = adaylar
        const s = muhbirDosya(a)
        if (!s) return await yaz(KAPALI)
        if (s.bot) return await yaz('🐀 "Hazineye bulaşmam." Para almadı.')
        if (s.yetersiz) return await yaz(yetersiz(s))
        return await yaz(dosyaMetni(displayName(a.hedef), s))
      }

      await yaz(KULLANIM)
    } catch (err) {
      logger.error({ err, from }, '.muhbir başarısız')
      await yaz('🐀 Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.muhbir hata mesajı gönderilemedi'))
    }
  },
}
