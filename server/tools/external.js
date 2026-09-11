import { tools } from './registry.js'

const EXTERNAL_TIMEOUT = 12000

async function jsonFetch(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(EXTERNAL_TIMEOUT) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function textFetch(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(EXTERNAL_TIMEOUT) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

async function weather({ city = '', latitude, longitude }) {
  const coords = latLng(city)
  const lat = latitude || coords.lat
  const lon = longitude || coords.lon
  if (!lat || !lon) return { ok: false, error: 'لم أتعرف على المدينة — اذكرها بالإنجليزية أو مرر lat/lon' }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=temperature_2m,weathercode&timezone=auto`
  const data = await jsonFetch(url)
  const c = data.current_weather
  return {
    ok: true,
    data: {
      location: city || `${lat}, ${lon}`,
      temperature_c: c.temperature,
      wind_kmh: c.windspeed,
      weatherCode: c.weathercode,
      summary: weatherLabel(c.weathercode),
    },
  }
}

function latLng(city) {
  if (/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)/.test(city)) {
    const m = city.match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)/)
    return { lat: Number(m[1]), lon: Number(m[3]) }
  }
  const known = {
    'cairo': [30.04, 31.24], 'القاهرة': [30.04, 31.24], 'riyadh': [24.71, 46.68], 'الرياض': [24.71, 46.68],
    'london': [51.51, -0.13], 'باريس': [48.86, 2.35], 'paris': [48.86, 2.35], 'new york': [40.71, -74.01],
    'dubai': [25.2, 55.27], 'دبي': [25.2, 55.27], 'amman': [31.95, 35.93], 'عمّان': [31.95, 35.93],
    'berlin': [52.52, 13.4], 'tokyo': [35.68, 139.69], 'طوكيو': [35.68, 139.69],
  }
  const c = String(city).toLowerCase()
  return known[c] ? { lat: known[c][0], lon: known[c][1] } : { lat: null, lon: null }
}

function weatherLabel(code) {
  const map = { 0: 'صحو', 1: 'غائم جزئيًا', 2: 'غائم', 3: 'ملبد', 51: 'رذاذ خفيف', 61: 'مطر خفيف', 63: 'مطر', 65: 'مطر غزير', 71: 'ثلوج خفيفة', 80: 'زخات مطر', 95: 'عاصفة رعدية' }
  return map[Number(code)] ?? `رمز ${code}`
}

async function news({ query = '', limit = 5 }) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query || 'world news')}&hl=ar&gl=SA&ceid=SA:ar`
  const xml = await textFetch(url)
  const items = []
  const re = /<item>([\s\S]*?)<\/item>/g
  let m
  while ((m = re.exec(xml)) && items.length < limit) {
    const block = m[1]
    const title = (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1] || ''
    const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || ''
    const pub = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || ''
    items.push({ title: title.trim(), link, published: pub.trim() })
  }
  return items.length ? { ok: true, results: items } : { ok: false, error: 'لا أخبار الآن (قد تكون الشبكة غير متاحة)' }
}

export const external = {
  weather: { run: weather },
  news: { run: news },
  web_fetch: { run: (params) => tools.web_fetch.run(params) },
}

export default external