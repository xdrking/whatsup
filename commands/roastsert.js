import { createDatasetCommand } from '../lib/dataset.js'

// Havuz ağır küfür içerir; komut bilerek ayrı tutulur ki `.roast` yazan
// kimse yanlışlıkla bu havuzdan satır almasın.
export default createDatasetCommand({
  name: 'roastsert',
  aliases: ['sertroast', 'agirroast', 'ağırroast'],
  description: 'Etiketlenen ya da yanıtlanan kişiyi ağır şekilde kızartır (küfürlü)',
  usage: '.roastsert @kişi  —  ya da bir mesajı yanıtlayarak .roastsert',
  file: 'roastsert.json',
  emoji: '☠️',
  target: true,
})
