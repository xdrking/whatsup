import { createDatasetCommand } from '../lib/dataset.js'

export default createDatasetCommand({
  name: 'roast',
  aliases: ['kizart', 'kızart', 'gir', 'gır'],
  description: 'Etiketlenen ya da yanıtlanan kişiyi hafifçe kızartır',
  usage: '.roast @kişi  —  ya da bir mesajı yanıtlayarak .roast',
  file: 'roast.json',
  emoji: '🔥',
  target: true,
})
