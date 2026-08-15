import { createDatasetCommand } from '../lib/dataset.js'

export default createDatasetCommand({
  name: 'kim',
  aliases: ['soru', 'kimsoru'],
  description: 'Gruba rastgele bir "bu grupta en çok kim..." sorusu sorar',
  usage: '.kim',
  file: 'sorular.json',
  emoji: '🤔',
})
