import { sureYaz } from './cark.js'
import { grupIdCoz, numaraCoz } from './xpver.js'
import { digerUyeler, groupMetadata } from '../lib/group.js'
import { HAPIS_SAATI } from '../lib/hapis.js'
import { MULKLER } from '../lib/mulk.js'
import { isMuted } from '../lib/mute.js'
import { nftBul } from '../lib/nft.js'
import { cokGrupMetni, HEDEF_YOK, ozelHedefler, ozelUyelikler } from '../lib/ozel.js'
import { binlik } from '../lib/sayi.js'
import { botGonderisi } from '../lib/sosyal.js'
import { botHesabiMi, fidyeKilitle, hackerlarim, hackYap, karaborsaDurumu } from '../lib/stats.js'
import { HACK_GUNLUK, HACK_KORUNMA_MS, hackerBul, urunKoduyla } from '../lib/sulymarket.js'
import { displayName, mentionOf } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import { FIDYE_MS, FIDYE_SANSI, FIDYE_YUZDESI } from '../lib/yeralti.js'
import { randomInt } from 'node:crypto'
import logger from '../lib/logger.js'

const KULLANIM = 'Kullanım (bota özelden): `.hack <numara ya da id> [çaylak|usta|kara|elit|zeroday]` ya da `.hack fidye <numara ya da id>`'

function engelMetni({ engel, bitis }) {
  const kalan = bitis ? sureYaz(bitis - Date.now()) : ''
  return {
    'hacker-yok': '💻 Elinde öyle bir hacker yok. `.sulymarket`',
    'fidye-yok': '🔒 Fidye yazılımın yok. `.sulymarket`',
    bot: '🤖 Hazinenin güvenlik duvarı aşılamıyor.',
    kendin: '💻 Kendini hackleyemezsin.',
    hapis: `🚔 Hapishanede internet yok, ${kalan} kaldı.`,
    hak: `💻 Bugünlük ${HACK_GUNLUK} hack hakkın bitti.`,
    duvar: `🧱 Hedefin güvenlik duvarı var (${kalan}). Bir şey harcanmadı. Duvarı elit ya da zero-day hacker deler.`,
    korunma: `🚨 Hedef yeni hacklendi, ${kalan} izleniyor. Bir şey harcanmadı.`,
    bos: '💻 Hedefte çalacak bir şey yok, bir şey harcanmadı.',
  }[engel]
}

function ganimet(s) {
  return [
    ...(s.para ? [`💰 ${binlik(s.para)} XP`] : []),
    ...(s.coin ? [`🪙 ${binlik(s.coin)} coin`] : []),
    ...s.mulkler.map((m) => `${MULKLER.find((x) => x.kod === m.kod)?.ad ?? m.kod} x${m.adet}`),
    ...(s.nft ? [`🖼️ ${nftBul(s.nft).ad} (#${s.nft})`] : []),
  ].join('  •  ')
}

/** Kimlik hırsızlığında duyuruda suçlanacak üye: saldırgan, kurban ve bot dışında rastgele biri. */
async function gunahKecisi(sock, chatJid, haric) {
  const adaylar = digerUyeler(await groupMetadata(sock, chatJid), '').filter((j) => !haric.includes(j) && !botHesabiMi(j))
  return adaylar.length ? adaylar[randomInt(adaylar.length)] : null
}

/** Kurban ve grup olanı öğrensin; susturulmuş gruba yazılmaz. Başarıda saldırgan hiç yazılmaz. */
async function duyur(sock, { chatJid, userJid }, kurban, s) {
  const keci = s.sucluGoster ? await gunahKecisi(sock, chatJid, [userJid, kurban]) : null
  const iz = keci ? `🔎 İzler ${mentionOf(keci)} kişisini gösteriyor!` : '🕶️ Saldırganın kimliği bilinmiyor.'
  const metin = s.basarili && s.tutar
    ? `🔒 *FİDYE YAZILIMI*\n${mentionOf(kurban)} bankası ${FIDYE_MS / 3_600_000} saat kilitlendi.\nAçmak için: \`.fidye öde\` (${binlik(s.tutar)} XP)\n${iz}`
    : s.basarili
    ? `💻 *SİBER SALDIRI*\n${mentionOf(kurban)} hacklendi!\n${ganimet(s)}${s.soguk ? '\n🔐 Soğuk cüzdan coinleri ve NFT\'leri korudu.' : ''}\n${iz}`
    : s.gizli
      ? `🧑‍💻 ${mentionOf(kurban)} hesabına sızma girişimi püskürtüldü. Saldırgan VPN ardında kayboldu.`
      : `🚨 ${mentionOf(userJid)}, ${mentionOf(kurban)} hesabını hacklerken yakalandı!\n🚔 ${HAPIS_SAATI} saat hapis. Kefalet: ${binlik(s.hapis.kefalet)} XP (\`.kefalet\`)`
  if (s.basarili) botGonderisi(chatJid, `💻 ${displayName(kurban)} ${s.tutar ? 'fidye yazılımına yakalandı' : 'hacklendi'}. ${keci ? `İzler ${displayName(keci)} kişisini gösteriyor.` : 'Saldırganın kimliği bilinmiyor.'}`)
  if (isMuted(chatJid)) return
  try {
    await sock.sendMessage(chatJid, { text: metin, mentions: s.basarili || s.gizli ? [kurban, ...(keci ? [keci] : [])] : [userJid, kurban] })
  } catch (err) {
    logger.error({ err, chatJid }, '.hack duyurusu gönderilemedi')
  }
}

async function liste(sock, gruplar) {
  const satirlar = ['💻 *Hack terminali*', '']
  for (const { chatJid, userJid, hackerlar, fidye } of gruplar) {
    const metadata = await groupMetadata(sock, chatJid)
    satirlar.push(`*${metadata.subject || chatJid}*`, `🎒 ${[...hackerlar.map((h) => h.kod), ...(fidye ? ['fidye'] : [])].map((kod) => urunKoduyla(kod).ad).join(', ')}`)
    for (const jid of digerUyeler(metadata, userJid).filter((j) => !botHesabiMi(j))) {
      satirlar.push(`• ${displayName(jid)} — \`${jid.endsWith('@lid') ? jid : jid.split('@')[0]}\``)
    }
    satirlar.push('')
  }
  return [...satirlar, KULLANIM, 'Hacker yazmazsan elindeki en iyisi kullanılır.'].join('\n')
}

export default {
  name: 'hack',
  aliases: ['hackle'],
  description: 'Hacker\'la birinin parasına el koy (bota özelden)',
  usage: '.hack  —  .hack <numara ya da id> [çaylak|usta|kara|elit|zeroday]  —  .hack fidye <numara ya da id> (bota özelden)',
  details: [
    'Önce `.sulymarket`\'ten hacker al. Bota *özelden* `.hack` yazınca hedeflerin kimlikleri listelenir.',
    '`.hack 905551234567 usta` — para doğrudan senin *bankana* geçer, coin ve mülkler senin olur. Kimliğin gizli kalır.',
    `Başarısız olursan yakalanır, ${HAPIS_SAATI} saat hapse girersin. VPN her saldırıda harcanır: yakalanınca hapisten korur, başarıda izini siler.`,
    'VPN\'siz başarılı saldırının izini İçişleri Bakanı 24 saat sürebilir (`.izsür`).',
    `\`.hack fidye <kimlik>\` hedefin bankasını ${FIDYE_MS / 3_600_000} saat kilitler (başarı %${FIDYE_SANSI}); açmak isterse bankasının %${FIDYE_YUZDESI}'sini sana öder.`,
    `Günde ${HACK_GUNLUK} hack. Hacklenen kişi ${HACK_KORUNMA_MS / 3_600_000} saat korunur.`,
    'Güvenlik duvarını yalnızca zero-day kesin, elit %50 deler; delinen duvar çöker. Delemeyen hacker yanar, hak gider, hapis yok. Fidye duvarı delemez.',
  ],
  category: 'toplum',
  cooldown: 15,
  ownerOnly: false,

  async execute({ sock, msg, from, args, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (parsed.isGroup) return await yaz('🤫 Grupta hack mi planlanır? Bota *özelden* yaz: `.hack`')

      const gruplar = (await ozelUyelikler(sock, parsed))
        .map((u) => ({
          ...u,
          hackerlar: hackerlarim(u.chatJid, u.userJid),
          fidye: Boolean(karaborsaDurumu(u)?.envanter.some((e) => e.kod === 'fidye')),
        }))
        .filter((u) => u.hackerlar.length || u.fidye)
      if (!gruplar.length) return await yaz('💻 Elinde hacker ya da fidye yazılımı yok. `.sulymarket`\'ten al.')

      if (!args.length) return await yaz(await liste(sock, gruplar))

      const fidyeArg = args.find((a) => trLower(a) === 'fidye')
      const hackerArg = fidyeArg ?? args.find((a) => hackerBul(a))
      const grupArg = args.find((a) => a.endsWith('@g.us'))
      const kimlik = numaraCoz(args.filter((a) => a !== hackerArg && a !== grupArg).join(' '))
      if (!kimlik) return await yaz(KULLANIM)

      const adaylar = await ozelHedefler(sock, gruplar, kimlik, grupArg ? grupIdCoz(grupArg) : null)
      if (!adaylar.length) return await yaz(HEDEF_YOK)
      if (adaylar.length > 1) return await yaz(cokGrupMetni(adaylar))

      const [a] = adaylar
      const taraflar = { chatJid: a.chatJid, hacker: a.userJid, kurban: a.hedef, sans: (yuzde) => randomInt(100) < yuzde }
      const hacker = fidyeArg ? null : hackerArg ? hackerBul(hackerArg) : a.hackerlar[0]
      const s = fidyeArg ? fidyeKilitle(taraflar) : hackYap({ ...taraflar, kod: hacker?.kod })
      if (!s) return await yaz('💻 Bağlantı koptu, sonra dene.')
      if (s.engel) return await yaz(engelMetni(s))
      if (s.duvarDayandi) return await yaz(`🧱 Güvenlik duvarı dayandı! ${urunKoduyla(hacker.kod).ad} yandı, bugünkü bir hakkın gitti. Alarm çalmadı, iz yok.`)

      const ad = displayName(a.hedef)
      await yaz(s.basarili && s.tutar
        ? `✅ *KİLİTLENDİ* — ${ad}\n🔒 Fidye: ${binlik(s.tutar)} XP, öderse bankana gelir.`
        : s.basarili
        ? [`✅ *SIZMA BAŞARILI* — ${ad}`, ...(s.duvarDelindi ? ['🧱 Güvenlik duvarı delindi ve çöktü.'] : []), ...(s.soguk ? ['🔐 Soğuk cüzdanı vardı: coin ve NFT alınamadı.'] : []), ...(s.sucluGoster ? ['🎭 Kimlik hırsızlığı devrede: suç başkasına atılacak.'] : []), ganimet(s), `🏦 Bankan: ${binlik(s.banka)} XP`, s.vpn ? '🛰️ VPN harcandı, iz kalmadı.' : '🕶️ Kimliğin gizli, ama VPN yoktu: İçişleri Bakanı 24 saat izini sürebilir.'].join('\n')
        : s.gizli
          ? `❌ ${ad} hesabına sızılamadı. 🛰️ VPN seni sakladı (VPN harcandı).`
          : `🚨 Yakalandın! ${HAPIS_SAATI} saat hapis. Kefalet: ${binlik(s.hapis.kefalet)} XP`)
      await duyur(sock, a, a.hedef, s)
    } catch (err) {
      logger.error({ err, from }, '.hack başarısız')
      await yaz('💻 Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.hack hata mesajı gönderilemedi'))
    }
  },
}
