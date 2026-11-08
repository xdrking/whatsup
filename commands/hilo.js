import { requireGroup } from '../lib/group.js'
import { kumarEngeli, MIN_BAHIS, MIN_KUMAR_BAKIYESI, miktarCoz } from '../lib/kumar.js'
import { getStats, kumarYasagi } from '../lib/stats.js'
import { getGame } from '../games/gameManager.js'
import { HILO_TAVAN, hiloCarpani, start } from '../games/hilo.js'

const goster = (c) => Math.floor(c * 100) / 100

export default {
  name: 'hilo',
  aliases: ['hi-lo', 'yüksekdüşük', 'yuksekdusuk'],
  description: 'Sıradaki kart yüksek mi düşük mü — bildikçe çarpan büyür',
  usage: '.hilo <miktar|hepsi|yarısı>',
  details: [
    '🃏 *Nasıl oynanır*',
    '1. `.hilo <miktar>` yaz, bot bir kart açar.',
    '2. Botun mesajını yanıtlayarak sıradaki kartı tahmin et:',
    '   `yüksek` → gelecek kart aynı ya da büyük',
    '   `düşük` → gelecek kart aynı ya da küçük',
    '3. Bilirsen çarpan büyür ve yeni kartla devam edersin. Bilemezsen bahis yanar.',
    '4. İstediğin an `çek` yaz, o anki çarpanla kazancı al.',
    '⏭️ `geç`: kartı beğenmezsen çarpana dokunmadan yenisini aç.',
    '📊 *Çarpan*',
    `Bot her kartta iki seçeneğin çarpanını ve şansını yazar. Şansı az olan çok kazandırır: 3 kartında \`yüksek\` ${goster(hiloCarpani(3, 'yüksek'))}x, \`düşük\` ${goster(hiloCarpani(3, 'düşük'))}x.`,
    'Bildikçe çarpanlar çarpılır: önce 1.5x, sonra 2x bilirsen 3x olursun.',
    'Sıra: A en küçük, K en büyük. As\'ta `yüksek`, Papaz\'da `düşük` her zaman tuttuğu için oynanmaz.',
    '📝 *Örnek*: `.hilo 1000` → 4♠ açıldı → `yüksek` → 9♥ geldi ✅ → `çek`',
    `Yalnızca başlatan oynar. ${HILO_TAVAN}x\'te kazanç kendiliğinden çekilir.`,
    `Süre 3 dk, dolarsa kazanç otomatik çekilir. En az ${MIN_BAHIS} XP basılır, cüzdanda en az ${MIN_KUMAR_BAKIYESI} XP olmalı. Grupta aynı anda tek oyun.`,
  ],
  category: 'kumar',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })
    if (getGame(from)) return yaz('⚠️ Bu grupta zaten aktif bir oyun var.')

    const { xp } = getStats(from, sender)
    const engel = kumarEngeli(xp, kumarYasagi(from, sender))
    if (engel) return yaz(`🃏 ${engel}`)

    const cozum = miktarCoz(args[0], xp)
    if (cozum.hata) return yaz(`🃏 ${cozum.hata}`)

    await start({ sock, msg, from, sender, miktar: cozum.miktar })
  },
}
