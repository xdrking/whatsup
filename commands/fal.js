import { createDatasetCommand } from '../lib/dataset.js'

export default createDatasetCommand({
  name: 'fal',
  aliases: ['falbak', 'falim', 'falım'],
  description: 'Rastgele bir fal açar',
  usage: '.fal',
  file: 'fallar.json',
  // Havuzdaki satırlar zaten 🔮 ile başlıyor, ikinci emoji eklenmez.
})
