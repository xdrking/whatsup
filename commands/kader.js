import { createDatasetCommand } from '../lib/dataset.js'

export default createDatasetCommand({
  name: 'kader',
  aliases: ['kismet', 'kısmet'],
  description: 'Rastgele bir kader mesajı gönderir',
  usage: '.kader',
  file: 'kader.json',
  emoji: '🪄',
})
