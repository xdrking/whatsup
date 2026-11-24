import { oranYaz } from '../lib/banka.js'
import logger from '../lib/logger.js'
import { requireGroup } from '../lib/group.js'
import {
  BANKALAR, IFLAS_KREDI_YASAK_SAATI, KREDI_LIMITI, KREDI_URUNLERI, KUR_LIMIT_ORANI, krediBankasi, krediUrunu, MIN_KREDI,
  tahsisUcreti, vadeBorcu,
} from '../lib/kredi.js'
import { miktarCoz } from '../lib/kumar.js'
import { krediCek, krediDurumu, krediOde } from '../lib/stats.js'
import { trLower } from '../lib/turkishWords.js'
import { sureYaz } from './cark.js'

const sayi = new Intl.NumberFormat('tr-TR')
const kat = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 })
const KAPALI = '💳 Kredi servisi şu an kapalı, sonra dene.'
const KULLANIM = '💳 Kullanım: `.kredi çek <ürün no> <miktar|max> [vade saat]`  (ör. `.kredi çek 5 10m 6`)'

/** Banka adı ya da kodu: "ziraat", "garanti", "iş", "yapı kredi"… */
function bankaBul(kelimeler) {
  const yaz = trLower(kelimeler.join('')).replace(/[^a-zçğıöşü]/g, '')
  if (!yaz) return null
  return BANKALAR.find((b) => {
    const ad = trLower(b.ad).replace(/[^a-zçğıöşü]/g, '')
    return b.kod === yaz || ad.startsWith(yaz) || (yaz === 'iş' && b.kod === 'is')
  }) ?? null
}

function urunSatirlari(u) {
  const borcKati = vadeBorcu(1_000_000, u.vade[1], u.faiz) / 1_000_000
  return [
    `  *${u.no}. ${u.ad}*`,
    `   🏷️ Limit ${sayi.format(u.limit)} XP  •  📈 %${oranYaz(u.faiz)}/saat`,
    `   ⏰ Vade ${u.vade[0]}-${u.vade[1]} saat  •  🧾 ${u.ucret ? `Ücret %${oranYaz(u.ucret)}` : 'Ücretsiz'}  •  ${u.vade[1]} saatte borç ${kat.format(borcKati)} katı`,
  ]
}

function bankaSatirlari(banka, urunler) {
  return [
    `${banka.simge} *${banka.ad}* — _${banka.not}_`,
    ...urunler.filter((u) => u.banka === banka.kod).flatMap(urunSatirlari),
  ]
}

function borcSatirlari(d) {
  if (!d.kredi) return ['✅ Açık kredin yok.']
  const u = krediUrunu(d.kredi.urun)
  const b = krediBankasi(u?.banka)
  return [
    `🏦 ${b ? `${b.ad} · ${u.ad}` : 'Eski kredi'}`,
    `📉 Borç: ${sayi.format(d.kredi.borc)} XP${d.kredi.anapara ? `  (çekilen ${sayi.format(d.kredi.anapara)})` : ''}`,
    `📈 Saatlik faiz: %${oranYaz(d.kredi.faiz)}`,
    `⏰ Vadeye: ${sureYaz(d.kredi.vade - Date.now())}`,
  ]
}

export default {
  name: 'kredi',
  aliases: ['borç', 'borc', 'loan'],
  description: 'Bankalardan faizli kredi çeker (hepsi merkez hazineye bağlı)',
  usage: '.kredi  —  .kredi <banka>  —  .kredi çek <ürün no> <miktar> [saat]  —  .kredi hesapla <no> <miktar> [saat]  —  .kredi öde <miktar|hepsi>',
  details: [
    `Ziraat, Garanti BBVA, TEB, İş Bankası, Akbank ve Yapı Kredi'nin ${KREDI_URUNLERI.length} kredisi var. Hepsi merkez hazineden verir, ödemeler hazineye döner.`,
    `Limit anlık kurla (enflasyonla) büyür: taban limit kurun %${KUR_LIMIT_ORANI * 100}'i, en az ${sayi.format(KREDI_LIMITI)} XP. Ürünün limiti tabanın katıdır, tek kredi hazinenin yarısını geçemez.`,
    'Vadeyi sen seçersin (1-12 saat, her ürünün kendi aralığı). Faiz saatlik bileşiktir, banka faizinin ürüne göre 1,5-7 puan üstündedir. Tahsis ücreti peşin kesilir.',
    `\`.kredi çek 5 10m 6\` → TEB Mega Kredi'den 10 milyon, 6 saat vade. \`max\` limitin tamamıdır. En az ${MIN_KREDI} XP, aynı anda tek kredi.`,
    'Borç varken `.banka yatır` önce borcu keser, `.devret` kapalıdır. Vade dolunca borç cüzdandan, sonra bankadan alınır, kalanı cüzdana eksi yazılır.',
    `Eksi bakiye oyun ve görev XP'siyle kapanır ya da \`.iflas\` ile silinir, iflastan sonra ${IFLAS_KREDI_YASAK_SAATI} saat kredi çekilemez.`,
  ],
  category: 'ekonomi',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const durum = krediDurumu({ chatJid: from, userJid: sender })
      if (!durum) return await yaz(KAPALI)

      const islem = trLower(args[0] || '')

      if (['çek', 'cek', 'al', 'hesapla', 'hesap'].includes(islem)) {
        const hesapla = islem.startsWith('hesap')
        const urun = durum.urunler.find((u) => u.no === Number(args[1]))
        if (!urun || !args[2]) return await yaz(hesapla ? KULLANIM.replace('çek', 'hesapla') : KULLANIM)

        const maks = ['max', 'maks', 'hepsi', 'limit'].includes(trLower(args[2]))
        const miktar = maks ? urun.limit : Number(args[2])
        if (!Number.isSafeInteger(miktar) || miktar < MIN_KREDI) {
          return await yaz(maks ? '💳 Hazinede bu ürün için kredi verecek kadar XP yok.' : `💳 En az ${MIN_KREDI} XP çekilir.`)
        }
        const vade = args[3] === undefined ? urun.vade[1] : Number(args[3])
        if (!Number.isInteger(vade) || vade < urun.vade[0] || vade > urun.vade[1]) {
          return await yaz(`💳 ${urun.ad} vadesi ${urun.vade[0]}-${urun.vade[1]} saat arasında seçilir.`)
        }
        const banka = krediBankasi(urun.banka)

        if (hesapla) {
          const ucret = tahsisUcreti(urun, miktar)
          const borc = vadeBorcu(miktar, vade, urun.faiz)
          return await yaz([
            `🧮 *${banka.ad} · ${urun.ad}*`,
            `💰 Çekilen: ${sayi.format(miktar)} XP`,
            `🧾 Tahsis ücreti: ${sayi.format(ucret)} XP  →  eline geçen ${sayi.format(miktar - ucret)} XP`,
            `📈 %${oranYaz(urun.faiz)}/saat × ${vade} saat`,
            `📉 Vadede borç: ${sayi.format(borc)} XP  (faiz ${sayi.format(borc - miktar)} XP)`,
            miktar > urun.limit ? `⚠️ Şu an limitin ${sayi.format(urun.limit)} XP.` : `\`.kredi çek ${urun.no} ${miktar} ${vade}\``,
          ].join('\n'))
        }

        const s = krediCek({ chatJid: from, userJid: sender, miktar, urun: urun.no, vade })
        if (!s || s.kapali) return await yaz(KAPALI)
        if (s.acik) return await yaz(`💳 Önce mevcut borcunu kapat: ${sayi.format(s.borc)} XP`)
        if (s.eksi) return await yaz(`💳 Cüzdanın ekside, kredi verilmez: ${sayi.format(s.xp)} XP`)
        if (s.limit) return await yaz(`💳 ${urun.ad} limiti ${sayi.format(s.limit)} XP.`)
        if (s.yasak) return await yaz(`💳 İflas ettiğin için kredi yasağın var, ${sureYaz(s.yasak - Date.now())} kaldı.`)
        if (s.kasaLimit !== undefined) {
          return await yaz(s.kasaLimit < MIN_KREDI
            ? '💳 Hazinede kredi verecek kadar XP yok.'
            : `💳 Hazine az, bu üründen en çok ${sayi.format(s.kasaLimit)} XP çekebilirsin.`)
        }
        if (s.vadeHata) return await yaz(`💳 Vade ${s.vadeHata[0]}-${s.vadeHata[1]} saat arasında seçilir.`)
        if (s.urunYok) return await yaz(KULLANIM)

        return await yaz([
          `💳 *${banka.ad} · ${urun.ad}*`,
          `💰 ${sayi.format(miktar)} XP kredi çekildi${s.ucret ? `, ${sayi.format(s.ucret)} XP tahsis ücreti kesildi` : ''}.`,
          `⏰ Vade: ${s.vade} saat  •  📈 Saatlik faiz: %${oranYaz(s.faiz)}`,
          `📉 Vadede borç: ${sayi.format(vadeBorcu(miktar, s.vade, s.faiz))} XP`,
          `👛 Cüzdan: ${sayi.format(s.xp)} XP`,
        ].join('\n'))
      }

      if (['öde', 'ode', 'kapat'].includes(islem)) {
        if (!durum.borc) return await yaz('💳 Borcun yok.')

        const hepsi = ['hepsi', 'all', 'hep'].includes(trLower(args[1] || ''))
        const c = hepsi ? { miktar: durum.xp } : miktarCoz(args[1], durum.xp)
        if (c.hata) return await yaz(`💳 ${c.hata}`)

        const s = krediOde({ chatJid: from, userJid: sender, miktar: c.miktar })
        if (!s) return await yaz(KAPALI)
        if (s.yetersiz) return await yaz(`💳 Ödeyecek XP'n yok. Senin XP'n: ${sayi.format(s.xp)}`)

        return await yaz([
          `💳 ${sayi.format(s.odenen)} XP ödendi.`,
          s.borc ? `📉 Kalan borç: ${sayi.format(s.borc)} XP` : '✅ Borcun bitti.',
          `👛 Cüzdan: ${sayi.format(s.xp)} XP`,
        ].join('\n'))
      }

      const tekBanka = args.length ? bankaBul(args) : null
      if (args.length && !tekBanka) return await yaz(`💳 Böyle bir banka yok. Bankalar: ${BANKALAR.map((b) => b.ad).join(', ')}`)

      const lines = ['💳 *Kredi*', '', ...borcSatirlari(durum)]
      lines.push(
        `👛 Cüzdan: ${sayi.format(durum.xp)} XP`,
        '',
        `📊 Taban limit: ${sayi.format(durum.tabanLimit)} XP (coin kuru ${sayi.format(durum.kur)} XP, enflasyonla büyür)`,
        `🏛️ Merkez hazine: ${sayi.format(durum.kasa)} XP  •  tek kredi en çok ${sayi.format(Math.floor(durum.kasa / 2))} XP`,
        `📈 Banka faizi: %${oranYaz(durum.bankaFaizi)}/saat`,
        '',
      )
      for (const b of tekBanka ? [tekBanka] : BANKALAR) lines.push(...bankaSatirlari(b, durum.urunler), '')
      if (durum.xp < 0) lines.push('🔴 Cüzdanın ekside. Oyun ve görevlerden XP kazanarak kapat ya da `.iflas` yaz.', '')
      lines.push('`.kredi çek 5 10m 6`  •  `.kredi hesapla 5 10m 6`  •  `.kredi öde hepsi`')

      await yaz(lines.join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.kredi başarısız')
      await yaz('💳 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.kredi hata mesajı gönderilemedi'),
      )
    }
  },
}
