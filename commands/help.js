import { trLower } from '../lib/turkishWords.js'
import { makamRehberi } from '../lib/devlet.js'

// .help başlıkları ve sırası. Komut dosyasındaki `category` alanı buradaki kodlardan
// biri olmalı. `adlar`, `.help <kategori>` yazımlarıdır.
const KATEGORILER = [
  { kod: 'medya', baslik: '🖼️ *Medya*', adlar: ['medya'] },
  { kod: 'eğlence', baslik: '🎉 *Eğlence*', adlar: ['eğlence', 'eglence'] },
  { kod: 'grup', baslik: '👥 *Grup*', adlar: ['grup'] },
  { kod: 'istatistik', baslik: '📊 *İstatistik*', adlar: ['istatistik'] },
  { kod: 'araç', baslik: '🛠️ *Araçlar*', adlar: ['araç', 'arac', 'araçlar', 'araclar'] },
  { kod: 'oyun', baslik: '🎮 *Oyunlar*', adlar: ['oyun', 'oyunlar'] },
  { kod: 'kumar', baslik: '🎰 *Kumar*', adlar: ['kumar'] },
  { kod: 'ekonomi', baslik: '💰 *Ekonomi*', adlar: ['ekonomi'] },
  { kod: 'toplum', baslik: '🏘️ *Toplum*', adlar: ['toplum'] },
]
const TUM_LISTE = new Set(['tümü', 'tumu', 'hepsi', 'all'])

const adSirasi = (a, b) => a.name.localeCompare(b.name, 'tr')

export default {
  name: 'help',
  aliases: ['yardim', 'yardım', 'menu', 'komutlar'],
  description: 'Komut menüsünü, bir bölümü ya da tek komutun ayrıntısını gösterir',
  usage: '.help  —  .help oyun  —  .help sticker  —  .help başkan  —  .help tümü',
  category: 'araç',
  ownerOnly: false,

  async execute({ sock, msg, from, args, commands, isOwner }) {
    const prefix = process.env.PREFIX || '.'
    const botName = process.env.BOT_NAME || 'wp-bot'

    // ownerOnly komutlar, sahibi olmayana hiç gösterilmez. `hidden` komutlar
    // sahibe bile gösterilmez: sahip .help'i grupta yazınca herkes görür.
    const gizli = (c) => c.hidden || (c.ownerOnly && !isOwner)
    const visible = [...new Set(commands.values())].filter((c) => !gizli(c))

    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })
    const satir = (c) => `• \`${prefix}${c.name}\` — ${c.description}${c.ownerOnly ? ' _(sadece sahip)_' : ''}`
    const uyeleri = (kod) => visible.filter((c) => c.category === kod).toSorted(adSirasi)

    // Kategorisi unutulmuş komut listeden kaybolmasın: sona "Diğer" olarak düşer.
    const bilinen = new Set(KATEGORILER.map((k) => k.kod))
    const digerleri = visible.filter((c) => !bilinen.has(c.category)).toSorted(adSirasi)
    const bolumler = [
      ...KATEGORILER.map((k) => ({ ...k, komutlar: uyeleri(k.kod) })),
      { baslik: '📦 *Diğer*', adlar: [], komutlar: digerleri },
    ].filter((b) => b.komutlar.length)

    const istek = trLower(args[0] || '')

    if (TUM_LISTE.has(istek)) {
      await yaz(bolumler.flatMap((b) => [b.baslik, ...b.komutlar.map(satir), '']).join('\n').trim())
      return
    }

    // `.help grup` kategoridir, aynı adlı komut `.help .grup` ile açılır.
    const bolum = bolumler.find((b) => b.adlar.includes(istek))
    if (bolum) {
      const ayniAd = commands.get(istek)?.name === istek ? [`\`${prefix}${istek}\` komutu için: \`${prefix}help ${prefix}${istek}\``] : []
      await yaz([bolum.baslik, '', ...bolum.komutlar.map(satir), '', ...ayniAd, `Ayrıntı: \`${prefix}help <komut>\``].join('\n'))
      return
    }

    // Makam adı `.seçim`'in alias'ı olan `başkan`'ı ezer: makam sahibi görevini okusun (bot sahibinin isteği).
    const rehber = makamRehberi(istek)
    if (rehber) {
      await yaz(rehber)
      return
    }

    if (args[0]) {
      const wanted = args[0].toLowerCase().replace(prefix, '')
      const command = commands.get(wanted)

      if (!command || gizli(command)) {
        await yaz(`\`${wanted}\` diye bir komut yok. Listeyi görmek için \`${prefix}help\`.`)
        return
      }

      const digerAdlar = (command.aliases || []).map((a) => `${prefix}${a}`).join(', ')

      await yaz([
        `*${prefix}${command.name}*`,
        command.description,
        '',
        `Kullanım: \`${command.usage}\``,
        // Karmaşık komutlar örnekli açıklama taşır; basit komutlarda yoktur.
        ...(command.details?.length ? ['', ...command.details] : []),
        ...(digerAdlar ? ['', `Diğer adları: ${digerAdlar}`] : []),
      ].join('\n'))
      return
    }

    await yaz([
      `🤖 *${botName}* — ${visible.length} komut`,
      ...bolumler.flatMap((b) => ['', `${b.baslik} (${b.komutlar.length})`, b.komutlar.map((c) => `${prefix}${c.name}`).join('  ')]),
      '',
      `📖 Bir bölüm: \`${prefix}help oyun\``,
      `🔎 Bir komut: \`${prefix}help sticker\``,
      `📜 Açıklamalı liste: \`${prefix}help tümü\``,
    ].join('\n'))
  },
}
