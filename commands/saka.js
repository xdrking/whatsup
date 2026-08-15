import { createDatasetCommand } from '../lib/dataset.js'

export default createDatasetCommand({
  name: 'saka',
  aliases: ['şaka', 'espri', 'fikra', 'fıkra'],
  description: 'Rastgele bir şaka gönderir',
  usage: '.saka',
  file: 'sakalar.json',
  emoji: '😄',
})
