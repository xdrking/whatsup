import { spawn } from 'node:child_process'

/**
 * Herhangi bir sesi WhatsApp sesli mesajı (ogg/opus) yapar. WhatsApp sesli
 * mesaj baloncuğu ogg/opus ister; MP3 gönderilirse dosya eki gibi görünür.
 * Dönüşüm diske yazmadan pipe üzerinden yapılır.
 *
 * @param {Buffer} input
 * @param {object} [options]
 * @param {string} [options.filter]      ffmpeg `-af` zinciri (efektler için)
 * @param {number} [options.maxSeconds]  girdinin yalnızca ilk N saniyesi işlenir
 */
export function toVoiceNote(input, { filter, maxSeconds } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-loglevel', 'error']
    // -t girdiden önce: areverse gibi tüm sesi belleğe alan filtreler uzun
    // kayıtta şişmesin.
    if (maxSeconds) args.push('-t', String(maxSeconds))
    args.push('-i', 'pipe:0')
    if (filter) args.push('-af', filter)
    args.push('-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', '-f', 'ogg', 'pipe:1')

    const ffmpeg = spawn('ffmpeg', args)

    const output = []
    const errors = []

    ffmpeg.stdout.on('data', (chunk) => output.push(chunk))
    ffmpeg.stderr.on('data', (chunk) => errors.push(chunk))
    ffmpeg.on('error', reject)
    // ffmpeg girdiyi okumadan çıkarsa stdin EPIPE atar; yakalanmazsa süreç düşer.
    ffmpeg.stdin.on('error', reject)

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(output))
        return
      }
      reject(new Error(`ffmpeg çıkış kodu ${code}: ${Buffer.concat(errors).toString().trim()}`))
    })

    ffmpeg.stdin.end(input)
  })
}
