/* Restaurant Template — interactions */

// Mobile menu
const burger = document.getElementById('burger')
const menu = document.getElementById('menu')
burger.addEventListener('click', () => menu.classList.toggle('open'))
menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => menu.classList.remove('open')))

// Nav shadow
const nav = document.getElementById('nav')
addEventListener('scroll', () => { nav.style.boxShadow = scrollY > 10 ? '0 8px 30px rgba(0,0,0,.4)' : '' }, { passive: true })

// Back to top
const toTop = document.getElementById('toTop')
addEventListener('scroll', () => toTop.classList.toggle('show', scrollY > 600), { passive: true })
toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }))

// Menu category tabs
const tabs = document.querySelectorAll('.tab')
const dishes = document.querySelectorAll('.dish')
tabs.forEach((tab) => tab.addEventListener('click', () => {
  tabs.forEach((t) => t.classList.remove('active'))
  tab.classList.add('active')
  const cat = tab.dataset.cat
  dishes.forEach((d) => d.classList.toggle('hide', !cat || d.dataset.cat !== cat))
}))

// Reveal on scroll
const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')), { threshold: .12 })
document.querySelectorAll('.card, .stat, .glass, .tab').forEach((el) => { el.classList.add('reveal'); io.observe(el) })

// Animated counters
const cio = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return
  cio.unobserve(e.target)
  const el = e.target, target = +el.dataset.count, t0 = performance.now(), dur = 1300
  const tick = (t) => { const p = Math.min((t - t0) / dur, 1); el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))); p < 1 && requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
}), { threshold: .5 })
document.querySelectorAll('[data-count]').forEach((el) => cio.observe(el))

// Reservation form
const reserve = document.getElementById('reserveForm')
reserve.addEventListener('submit', (e) => {
  e.preventDefault()
  reserve.innerHTML = '<p style="text-align:center;color:#34d399;font-weight:800;padding:10px">✓ تم تأكيد حجزك بنجاح! سنرسل لك تأكيدًا عبر الجوال قريبًا.</p>'
})