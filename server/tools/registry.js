import terminal from './terminal.js'
import filesystem from './filesystem.js'

async function webFetch({ url }) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  const text = await res.text()
  return { ok: res.ok, status: res.status, url, content: text.slice(0, 20000) }
}

const tools = {
  terminal: {
    name: 'terminal',
    description: 'Run shell commands (bash/zsh) inside the user workspace. Returns stdout/stderr.',
    needs: ['command', 'cwd?'],
    run: (params) => terminal(params.command, params),
  },
  filesystem: {
    name: 'filesystem',
    description: 'Manage files inside the workspace: writeFile, readFile, appendFile, deleteFile, listDir, mkDir, tree.',
    needs: ['action', 'path', 'content?'],
    run: (params) => {
      const fn = filesystem[params.action]
      if (!fn) return Promise.resolve({ ok: false, error: `unknown filesystem action: ${params.action}` })
      return fn(params)
    },
  },
  web_fetch: {
    name: 'web_fetch',
    description: 'Fetch content of a URL (web scraping). Returns text up to 20k chars.',
    needs: ['url'],
    run: webFetch,
  },
}

export default tools
export { tools }