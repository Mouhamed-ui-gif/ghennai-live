/**
 * GET /api/providers — حالة المزودين الحقيقية (القسم 15+16).
 * الكشف حيّ في كل استدعاء (بكاش 30 ثانية): which + --version فعليًا.
 * لا توجد حالة "connected" محفوظة كاذبة — غير المتاح يظهر سببه الحقيقي.
 *
 * GET /api/providers/:name/health — فحص صحة حيّ لمزوّد واحد.
 */
import express from 'express'
import { requireAuth } from './auth.js'
import { detectAll, healthAll, get } from '../agent/providers/registry.js'

const router = express.Router()

router.get('/providers', requireAuth, async (req, res) => {
  try {
    const providers = await detectAll({ force: req.query.fresh === '1' })
    const out = []
    for (const p of providers) {
      const adapter = get(p.name)
      let auth = null
      try {
        auth = adapter ? await adapter.authentication() : null
      } catch (e) {
        auth = { configured: false, detail: String(e?.message || e) }
      }
      out.push({ ...p, auth })
    }
    res.json({ providers: out })
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})

router.get('/providers/:name/health', requireAuth, async (req, res) => {
  try {
    const adapter = get(req.params.name)
    if (!adapter) return res.status(404).json({ error: `unknown provider: ${req.params.name}` })
    res.json(await adapter.inspect())
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})

router.get('/providers/health/all', requireAuth, async (req, res) => {
  try {
    res.json({ providers: await healthAll() })
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})

export default router
