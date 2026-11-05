// Panel şifresi üretir. Şifre yalnızca burada görünür, .env'e özeti yazılır.
import { sifreHashle, sifreUret } from './guvenlik.js'

const sifre = sifreUret()
console.log(`\nŞifren (bir yere kaydet, bir daha gösterilmez):\n\n  ${sifre}\n`)
console.log(`.env dosyasına şu satırı ekle:\n\n  PANEL_SIFRE_HASH=${await sifreHashle(sifre)}\n`)
