import { createDatasetCommand } from '../lib/dataset.js'

export default createDatasetCommand({
  name: 'iltifat',
  aliases: ['ovgu', 'övgü', 'kompliman'],
  description: 'Etiketlenen ya da yanıtlanan kişiye iltifat eder',
  usage: '.iltifat @kişi  —  ya da bir mesajı yanıtlayarak .iltifat',
  file: 'iltifatlar.json',
  emoji: '💐',
  target: true,
})
