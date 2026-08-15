import { createDatasetCommand } from '../lib/dataset.js'

// Rastgele değil: seçim Türkiye takvim gününe sabitlenir, gün boyunca kaç kez
// çağrılırsa çağrılsın aynı söz döner (bkz. lib/dataset.js -> pickDaily).
export default createDatasetCommand({
  name: 'gününsözü',
  aliases: ['gununsozu', 'gunun', 'günün', 'soz', 'söz'],
  description: 'Günün sözü — gün boyunca değişmez',
  usage: '.gününsözü',
  file: 'sozler.json',
  emoji: '📜',
  daily: true,
})
