/* NOVA SaaS Template — interactions */

// Mobile menu
const burger = document.getElementById('burger')
const menu = document.getElementById('menu')
burger.addEventListener('click', () => {
  menu.classList.toggle('open')
  document.querySelectorAll('.burger span').forEach((s, i) => {
    s.style.transform = menu.classList.contains('open')
      ? i === 0 ? 'rotate(45deg) translateY(7px)' : i === 2 ? 'rotate(-45deg) translateY(-7px)' : 'opacity 0'
      : ''
    s.style.opacity = i === 1 && menu.classList.contains('open') ? '0' : ''
  })
})
menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => menu.classList.remove('open')))

// Navbar shadow on scroll
const nav = document.getElementById('nav')
const onScroll = () => nav.style.boxShadow = scrollY > 10 ? '0 8px 30px rgba(0,0,0,.35)' : ''
addEventListener('scroll', onScroll, { passive: true })

// Back-to-top
const toTop = document.getElementById('toTop')
addEventListener('scroll', () => toTop.classList.toggle('show', scrollY > 600), { passive: true })
toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }))

// Scroll reveal
const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')), { threshold: .12 })
document.querySelectorAll('.reveal').forEach((el) => io.observe(el))
document.querySelectorAll('.card, .stat, .section > .container > .kicker').forEach((el) => el.classList.add('reveal'))

// Animated counters
const cio = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return
  cio.unobserve(e.target)
  const el = e.target
  const target = parseFloat(el.dataset.count)
  const dec = parseInt(el.dataset.dec || '0', 10)
  const dur = 1400, t0 = performance.now()
  const tick = (t) => {
    const p = Math.min((t - t0) / dur, 1)
    const eased = 1 - Math.pow(1 - p, 3)
    el.textContent = (target * eased).toFixed(dec)
    if (p < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}), { threshold: .5 })
document.querySelectorAll('[data-count]').forEach((el) => cio.observe(el))

// Card tilt
if (matchMedia('(pointer: fine)').matches) {
  document.querySelectorAll('.tilt').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - .5
      const y = (e.clientY - r.top) / r.height - .5
      card.style.transform = `translateY(-6px) rotateY(${x * 8}deg) rotateX(${y * -8}deg)`
    })
    card.addEventListener('mouseleave', () => { card.style.transform = '' })
  })
}

// Lead form
const form = document.getElementById('lead')
form.addEventListener('submit', (e) => {
  e.preventDefault()
  const email = form.querySelector('input').value
  form.innerHTML = `<p class="trust" style="color:#34d399">✓ تم استلام ${email} — سنرسل رابط البدء خلال دقائق.</p>`
})