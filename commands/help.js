// .help listesindeki başlıklar ve sırası. Komut dosyasındaki `category` alanı
// buradaki kodlardan biri olmalı.
const KATEGORILER = [
  ['medya', '🖼️ *MEDYA*'],
  ['eğlence', '🎉 *EĞLENCE*'],
  ['grup', '👥 *GRUP*'],
  ['istatistik', '📊 *İSTATİSTİK*'],
  ['araç', '🛠️ *ARAÇLAR*'],
  ['oyun', '🎮 *OYUNLAR*'],
]

export default {
  name: 'help',
  aliases: ['yardim', 'yardım', 'menu', 'komutlar'],
  description: 'Komut listesini veya tek bir komutun ayrıntısını gösterir',
  usage: '.help  ya da  .help sticker',
  category: 'araç',
  ownerOnly: false,

  async execute({ sock, msg, from, args, commands, isOwner }) {
    const prefix = process.env.PREFIX || '.'
    const botName = process.env.BOT_NAME || 'wp-bot'

    // ownerOnly komutlar, sahibi olmayana hiç gösterilmez.
    const visible = [...new Set(commands.values())].filter((c) => !c.ownerOnly || isOwner)

    if (args[0]) {
      const wanted = args[0].toLowerCase().replace(prefix, '')
      const command = commands.get(wanted)

      if (!command || (command.ownerOnly && !isOwner)) {
        await sock.sendMessage(
          from,
          { text: `\`${wanted}\` diye bir komut yok. Listeyi görmek için \`${prefix}help\`.` },
          { quoted: msg },
        )
        return
      }

      const aliases = command.aliases?.length
        ? command.aliases.map((a) => `${prefix}${a}`).join(', ')
        : 'yok'

      await sock.sendMessage(
        from,
        {
          text: [
            `*${prefix}${command.name}*`,
            command.description,
            '',
            `Kullanım: \`${command.usage}\``,
            // Karmaşık komutlar örnekli açıklama taşır; basit komutlarda yoktur.
            ...(command.details?.length ? ['', ...command.details, ''] : []),
            `Diğer adları: ${aliases}`,
          ].join('\n'),
        },
        { quoted: msg },
      )
      return
    }

    const satir = (c) =>
      `• \`${prefix}${c.name}\` — ${c.description}${c.ownerOnly ? ' _(sadece sahip)_' : ''}`

    const sirala = (list) => list.sort((a, b) => a.name.localeCompare(b.name, 'tr')).map(satir)

    const bolumler = KATEGORILER.map(([kod, baslik]) => [
      baslik,
      sirala(visible.filter((c) => c.category === kod)),
    ])
    // Kategorisi unutulmuş komut listeden kaybolmasın: sona "Diğer" olarak düşer.
    const bilinen = new Set(KATEGORILER.map(([kod]) => kod))
    bolumler.push(['📦 *DİĞER*', sirala(visible.filter((c) => !bilinen.has(c.category)))])

    await sock.sendMessage(
      from,
      {
        text: [
          `*${botName}* — ${visible.length} komut`,
          ...bolumler
            .filter(([, satirlar]) => satirlar.length)
            .flatMap(([baslik, satirlar]) => ['', baslik, ...satirlar]),
          '',
          `Ayrıntı için: \`${prefix}help <komut>\``,
        ].join('\n'),
      },
      { quoted: msg },
    )
  },
}
