/* Portfolio Template — interactions */

// Mobile menu
const burger = document.getElementById('burger')
const menu = document.getElementById('menu')
burger.addEventListener('click', () => menu.classList.toggle('open'))
menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => menu.classList.remove('open')))

// Back to top
const toTop = document.getElementById('toTop')
addEventListener('scroll', () => toTop.classList.toggle('show', scrollY > 600), { passive: true })
toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }))

// Reveal on scroll
const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')), { threshold: .12 })
document.querySelectorAll('.reveal, .skill, .bio').forEach((el) => { el.classList.add('reveal'); io.observe(el) })

// Parallax avatar cards
if (matchMedia('(pointer: fine)').matches) {
  document.querySelectorAll('.tilt').forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect()
      el.style.transform = `rotateZ(${(((e.clientX - r.left) / r.width) - .5) * 10}deg) translateY(-4px)`
    })
    el.addEventListener('mouseleave', () => (el.style.transform = ''))
  })
}

// Contact form
const form = document.getElementById('contactForm')
form.addEventListener('submit', (e) => {
  e.preventDefault()
  form.innerHTML = '<p class="trust" style="text-align:center;color:#34d399;font-weight:700">✓ تم إرسال رسالتك. سأرد عليك قريبًا!</p>'
})