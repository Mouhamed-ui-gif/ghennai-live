import { useEffect, useState } from 'react'

/**
 * محتوى الموقع القابل للتعديل يوميًا — يُضاف إلى public/editable.json ويُنشر
 * دون الحاجة لأي تغيير في الكود. كل القيم اختيارية: ما لم يوجد يبقى الافتراضي.
 */

export interface EditableAgent {
  mottoAr?: string
  mottoEn?: string
  taglineAr?: string
  taglineEn?: string
  skillsAr?: string[]
  skillsEn?: string[]
}

export interface EditableContent {
  updatedAt?: string
  site?: { name?: string }
  app?: { taglineAr?: string; taglineEn?: string; descAr?: string; descEn?: string }
  landing?: {
    hero?: {
      badgeAr?: string
      badgeEn?: string
      subAr?: string
      subEn?: string
      ctaAr?: string
      ctaEn?: string
      cta2Ar?: string
      cta2En?: string
      stats?: { value: string; labelAr: string; labelEn: string }[]
    }
    features?: {
      eyebrowAr?: string
      eyebrowEn?: string
      titleAr?: string
      titleEn?: string
      subAr?: string
      subEn?: string
      cards?: { titleAr?: string; titleEn?: string; descAr?: string; descEn?: string }[]
    }
    agentsShow?: {
      eyebrowAr?: string
      eyebrowEn?: string
      titleAr?: string
      titleEn?: string
      subAr?: string
      subEn?: string
      ctaAr?: string
      ctaEn?: string
    }
    how?: {
      eyebrowAr?: string
      eyebrowEn?: string
      titleAr?: string
      titleEn?: string
      steps?: { titleAr?: string; titleEn?: string; descAr?: string; descEn?: string }[]
    }
    download?: {
      eyebrowAr?: string
      eyebrowEn?: string
      titleAr?: string
      titleEn?: string
      subAr?: string
      subEn?: string
    }
    footer?: {
      rightsAr?: string
      rightsEn?: string
      privacyAr?: string
      privacyEn?: string
      opensourceAr?: string
      opensourceEn?: string
    }
  }
  agents?: Record<string, EditableAgent>
}

let cache: Promise<EditableContent> | null = null

export function loadEditable(): Promise<EditableContent> {
  if (!cache) {
    cache = fetch(`./editable.json?ts=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : {} as EditableContent))
      .catch(() => ({}) as EditableContent)
  }
  return cache
}

/** يُرجع المحتوى القابل للتعديل (يُقرأ مرة واحدة ويُشترك فيه كل المكوّنات) */
export function useEditable(): EditableContent {
  const [data, setData] = useState<EditableContent>({})
  useEffect(() => {
    let live = true
    loadEditable().then((d) => { if (live) setData(d) })
    const iv = setInterval(() => {
      loadEditable().then((d) => { if (live) setData(d) })
    }, 120000)
    return () => { live = false; clearInterval(iv) }
  }, [])
  return data
}

/** يختار نصًا بلغة المستخدم مع غياب القيمة → الإفالتي */
export function pickEditable(lang: 'ar' | 'en', ar?: string, en?: string, fallback = ''): string {
  const v = lang === 'ar' ? ar : en
  return v ?? fallback
}