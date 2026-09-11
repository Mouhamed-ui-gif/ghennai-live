import React from 'react'
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

interface Block {
  kind: 'code' | 'table' | 'list' | 'olist' | 'quote' | 'p' | 'h' | 'hr'
  level?: number
  lang?: string
  rows?: string[][]
  items?: string[]
  lines?: string[]
}

function inline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let i = 0
  let key = 0
  const push = (n: React.ReactNode) => nodes.push(<React.Fragment key={`${keyBase}-${key++}`}>{n}</React.Fragment>)
  while (i < text.length) {
    const rest = text.slice(i)
    const code = rest.match(/^`([^`]+)`/)
    if (code) {
      push(<code className="inline">{code[1]}</code>)
      i += code[0].length
      continue
    }
    const link = rest.match(/^\[([^\]]+)\]\(([^)\s]+)\)/)
    if (link) {
      push(
        <a href={link[2]} target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      )
      i += link[0].length
      continue
    }
    const bold = rest.match(/^\*\*([^*]+)\*\*/)
    if (bold) {
      push(<strong>{inline(bold[1], `${keyBase}-b`)}</strong>)
      i += bold[0].length
      continue
    }
    const em = rest.match(/^\*([^*]+)\*/)
    if (em) {
      push(<em>{inline(em[1], `${keyBase}-e`)}</em>)
      i += em[0].length
      continue
    }
    push(rest[0])
    i += 1
  }
  return nodes
}

function Paragraph({ lines, keyBase }: { lines: string[]; keyBase: string }) {
  return (
    <p>
      {lines.map((l, idx) => (
        <React.Fragment key={`${keyBase}-p${idx}`}>
          {idx > 0 && <br />}
          {inline(l, `${keyBase}-${idx}`)}
        </React.Fragment>
      ))}
    </p>
  )
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch { /* noop */ }
  }
  return (
    <div className="my-2 overflow-hidden rounded-xl border border-white/10 bg-night-950/80" dir="ltr">
      <div className="md-block-hd text-slate-400">
        <span>{lang || 'code'}</span>
        <button
          onClick={copy}
          aria-label="Copy code"
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
        >
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[12px] leading-relaxed text-cyan-100">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function buildBlocks(text: string): Block[] {
  const lines = String(text).split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const fence = line.match(/^```\s*([\w+-]*)\s*$/)
    if (fence) {
      const lang = fence[1] || ''
      const buf: string[] = []
      i += 1
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i])
        i += 1
      }
      if (i < lines.length) i += 1
      blocks.push({ kind: 'code', lang, lines: buf })
      continue
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      blocks.push({ kind: 'h', level: h[1].length, lines: [h[2]] })
      i += 1
      continue
    }
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      blocks.push({ kind: 'quote', lines: buf })
      continue
    }
    if (/^(\s*[-*+]\s+)/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''))
        i += 1
      }
      blocks.push({ kind: 'list', items })
      continue
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''))
        i += 1
      }
      blocks.push({ kind: 'olist', items })
      continue
    }
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const parseRow = (r: string) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
      const rows: string[][] = []
      let r = i
      while (r < lines.length && lines[r].includes('|')) {
        rows.push(parseRow(lines[r]))
        r += 1
      }
      blocks.push({ kind: 'table', rows })
      i = r
      continue
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ kind: 'hr' })
      i += 1
      continue
    }
    const buf: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,4})\s/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^(-{3,}|\*{3,})\s*$/.test(lines[i])
    ) {
      buf.push(lines[i])
      i += 1
    }
    if (buf.length) blocks.push({ kind: 'p', lines: buf })
    if (lines[i]?.trim() === '') i += 1
  }
  return blocks
}

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const blocks = buildBlocks(text)
  return (
    <div className={`md-body ${className}`}>
      {blocks.map((b, i) => {
        const kb = `b${i}`
        switch (b.kind) {
          case 'code':
            return <CodeBlock key={kb} lang={b.lang || ''} code={(b.lines || []).join('\n')} />
          case 'h':
            if (b.level === 1) return <h1 key={kb}>{inline(String(b.lines?.[0] || ''), kb)}</h1>
            if (b.level === 2) return <h2 key={kb}>{inline(String(b.lines?.[0] || ''), kb)}</h2>
            if (b.level === 3) return <h3 key={kb}>{inline(String(b.lines?.[0] || ''), kb)}</h3>
            return <h4 key={kb}>{inline(String(b.lines?.[0] || ''), kb)}</h4>
          case 'quote':
            return (
              <blockquote key={kb}>
                {(b.lines || []).map((l, j) => (
                  <p key={`${kb}-q${j}`}>{inline(l, `${kb}-q${j}`)}</p>
                ))}
              </blockquote>
            )
          case 'list':
            return (
              <ul key={kb}>
                {(b.items || []).map((it, j) => (
                  <li key={`${kb}-l${j}`}>{inline(it, `${kb}-l${j}`)}</li>
                ))}
              </ul>
            )
          case 'olist':
            return (
              <ol key={kb}>
                {(b.items || []).map((it, j) => (
                  <li key={`${kb}-o${j}`}>{inline(it, `${kb}-o${j}`)}</li>
                ))}
              </ol>
            )
          case 'table':
            return (
              <div key={kb} className="md-table-wrap">
                <table>
                  <tbody>
                    {(b.rows || []).map((row, j) => (
                      <tr key={`${kb}-t${j}`}>
                        {row.map((cell, k) =>
                          j === 0 ? <th key={`${k}`}>{inline(cell, `${kb}-h${k}`)}</th> : <td key={`${k}`}>{inline(cell, `${kb}-d${k}`)}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'hr':
            return <hr key={kb} />
          default:
            return <Paragraph key={kb} lines={b.lines || []} keyBase={kb} />
        }
      })}
    </div>
  )
}