import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/** مسار server/.env الحقيقي مهما كان مجلد العمل (المشكلة السابقة: كان يُحمّل .env من جذر المشروع فيضيع كل المفاتيح) */
const envPath = join(dirname(dirname(fileURLToPath(import.meta.url))), '.env')
dotenv.config({ path: envPath })

export { envPath }