import { StreamBg } from './StreamBg'

const UNIVERSE_IMAGES = [
  'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1920&q=70',
  'https://images.unsplash.com/photo-1483347756197-71ef80e95f73?auto=format&fit=crop&w=1920&q=70',
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1920&q=70',
  'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1920&q=70',
  'https://images.unsplash.com/photo-1509316785289-025f5b846b35?auto=format&fit=crop&w=1920&q=70',
  'https://images.unsplash.com/photo-1439405326854-014607f694d7?auto=format&fit=crop&w=1920&q=70',
]

/** خلفية ثابتة لكامل الصفحة: مشاهد طبيعية حقيقية تتبدّل بنعومة */
export function UniverseBg() {
  return (
    <div className="universe-bg" aria-hidden>
      <StreamBg
        images={UNIVERSE_IMAGES}
        opacity={0.88}
        cycleMs={9000}
        className="universe-video"
      >
        <div className="universe-grid" />
      </StreamBg>
      <div className="black-hole">
        <span className="black-hole-core" />
        <span className="black-hole-ring" />
        <span className="black-hole-ring black-hole-ring-2" />
        <span className="black-hole-lens" />
      </div>
      <div className="universe-stars" />
      <div className="universe-vignette" />
    </div>
  )
}