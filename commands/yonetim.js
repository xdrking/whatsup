import logger from '../lib/logger.js'
import { trLower } from '../lib/turkishWords.js'
import { KOD_MS, kodUret, ROLLER, rolCoz, yoneticiGuncelle, yoneticiListesi } from '../lib/yonetim.js'

const KULLANIM = [
  '🛠️ *Yönetim paneli*',
  '',
  '`.yonetim kod` → kendi giriş kodun (👑 sahip)',
  '`.yonetim kod moderatör Ali` → Ali için moderatör kodu',
  '`.yonetim kod yönetici Ayşe` → Ayşe için yönetici kodu',
  '`.yonetim liste` → panele girebilenler',
  '`.yonetim kapat Ali` → Ali\'nin erişimini kapatır',
  '',
  `Kod tek kullanımlıktır, ${KOD_MS / 60_000} dakika geçerlidir. Panelde *Yönetim girişi*'ne yazılır.`,
].join('\n')

export default {
  name: 'yonetim',
  aliases: ['yönetim'],
  description: 'Bot sahibi: yönetim paneline giriş kodu verir',
  usage: '.yonetim kod [moderatör|yönetici] [ad]',
  category: 'araç',
  // Yalnızca sahip özelden kullanır; grupta yazılırsa iz bırakmadan düşer (bot sahibinin kararı).
  hidden: true,
  ownerOnly: true,
  cooldown: 0,
  details: KULLANIM.split('\n').filter(Boolean),

  async execute({ sock, msg, from, args, parsed }) {
    if (parsed.isGroup) {
      logger.info({ from }, '.yonetim grupta yazıldı, yok sayıldı')
      return
    }
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })
    try {
      const alt = trLower(args[0] ?? '')

      if (alt === 'kod') {
        const rol = args[1] ? rolCoz(args[1]) : 'sahip'
        const ad = args.slice(2).join(' ').trim().slice(0, 40)
        if (!rol) return await yaz('Rol `moderatör` ya da `yönetici` olmalı.\nÖrnek: `.yonetim kod moderatör Ali`')
        if (rol !== 'sahip' && !ad) return await yaz('Kime? Ad yaz: `.yonetim kod moderatör Ali`')
        if (rol !== 'sahip' && trLower(ad) === 'sahip') return await yaz('Bu ad sahibe ayrılmış, başka bir ad yaz.')
        const sonuc = kodUret(rol === 'sahip' ? {} : { rol, ad })
        if (!sonuc) return await yaz('❌ Kod üretilemedi, sonra dene.')
        const r = ROLLER[sonuc.yonetici.rol]
        return await yaz([
          `🔑 *Yönetim giriş kodu* · ${r.emoji} ${sonuc.yonetici.ad} (${r.ad})`,
          '',
          `\`${sonuc.kod}\``,
          '',
          `Tek kullanımlık, ${KOD_MS / 60_000} dakika geçerli. Panelde *Yönetim girişi*'ne yaz.`,
          ...(rol === 'sahip' ? [] : [`Kodu ${sonuc.yonetici.ad}'ye kendin ilet. Erişimi kapatmak için: \`.yonetim kapat ${sonuc.yonetici.ad}\``]),
        ].join('\n'))
      }

      if (alt === 'liste') {
        const liste = yoneticiListesi()
        if (!liste.length) return await yaz('Henüz kimse yok. `.yonetim kod` ile başla.')
        return await yaz(['🛠️ *Panele girebilenler*', '', ...liste.map((y) =>
          `${ROLLER[y.rol]?.emoji ?? '•'} ${y.ad} — ${ROLLER[y.rol]?.ad ?? y.rol}${y.aktif ? '' : ' · ⛔ kapalı'}`)].join('\n'))
      }

      if (alt === 'kapat') {
        const ad = args.slice(1).join(' ').trim()
        const y = yoneticiListesi().find((x) => x.rol !== 'sahip' && trLower(x.ad) === trLower(ad))
        if (!y) return await yaz('Bu adla biri yok. `.yonetim liste` ile bak.')
        if (!y.aktif) return await yaz(`${y.ad} zaten kapalı.`)
        if (!yoneticiGuncelle({ id: y.id, aktif: false })) return await yaz('❌ Kapatılamadı, sonra dene.')
        return await yaz(`⛔ ${y.ad}'nin erişimi kapandı, açık oturumu da düştü. Yeniden açmak için yeni kod ver.`)
      }

      return await yaz(KULLANIM)
    } catch (err) {
      logger.error({ err, from }, '.yonetim başarısız')
      await yaz('❌ Bir şeyler ters gitti.')
    }
  },
}
