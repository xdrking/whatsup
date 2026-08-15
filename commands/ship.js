import { fnv1a } from '../lib/hash.js'
import { digitsOf, mentionOf, resolveTargets } from '../lib/target.js'

// Yüzdeye göre yorum; ilk eşleşen kazanır, bu yüzden yüksekten alçağa sıralı.
const YORUMLAR = [
  [90, '💍 Bu iş bitmiş, düğün ne zaman?'],
  [75, '❤️‍🔥 Ciddi bir şeyler var burada.'],
  [55, '🙂 Fena değil, biraz emek ister.'],
  [35, '😅 Arkadaş kalın derim.'],
  [15, '🧊 Buz gibi.'],
  [0, '💀 Aynı gruba düşmeleri bile tesadüf.'],
]

function yorumla(percent) {
  return YORUMLAR.find(([esik]) => percent >= esik)[1]
}

function bar(percent) {
  const dolu = Math.round(percent / 10)
  return '█'.repeat(dolu) + '░'.repeat(10 - dolu)
}

// Sonuç iki JID'e sabitlenir: sıra değişse de, bot yeniden başlasa da aynı
// çift hep aynı yüzdeyi alır. Bu yüzden Math.random() kullanılmaz.
function uyumluluk(first, second) {
  const key = [digitsOf(first), digitsOf(second)].sort().join('|')
  return fnv1a(key) % 101
}

export default {
  name: 'ship',
  aliases: ['uyum', 'eşleştir', 'eslestir'],
  description: 'İki kişi arasında uyumluluk yüzdesi hesaplar (hep aynı sonucu verir)',
  usage: '.ship @kişi1 @kişi2  —  tek kişi etiketlersen seninle eşleştirir',
  ownerOnly: false,

  async execute({ sock, msg, from, args, parsed }) {
    const prefix = process.env.PREFIX || '.'
    const targets = resolveTargets(parsed, { args, limit: 2 })

    if (!targets.length) {
      await sock.sendMessage(
        from,
        { text: `Kimi kiminle eşleştireyim? \`${prefix}ship @kişi1 @kişi2\`` },
        { quoted: msg },
      )
      return
    }

    // Tek hedef verildiyse ikinci taraf komutu yazan kişidir.
    const [first, second] = targets.length === 1 ? [parsed.sender, targets[0]] : targets

    if (digitsOf(first) === digitsOf(second)) {
      await sock.sendMessage(
        from,
        { text: 'Aynı kişiyi kendisiyle eşleştiremem, iki farklı kişi lazım.' },
        { quoted: msg },
      )
      return
    }

    const percent = uyumluluk(first, second)

    await sock.sendMessage(
      from,
      {
        text: [
          `💘 ${mentionOf(first)} ❤️ ${mentionOf(second)}`,
          `${bar(percent)} %${percent}`,
          yorumla(percent),
        ].join('\n'),
        mentions: [first, second],
      },
      { quoted: msg },
    )
  },
}
