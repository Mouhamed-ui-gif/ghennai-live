import { providers } from '../lib/modelRouter.js'
import { userWorkspace } from '../lib/paths.js'
import { brainRequest, brainStatus } from './brain.js'

/** تدفّق الطلب عبر «عقل الوكلاء» — المنسّق المركزي */
async function* handleRequest(user, userMessage, requested, mode = {}) {
  yield* brainRequest(user, userMessage, requested, mode)
}

function status() {
  return { providers: providers(), tts: !!process.env.ELEVENLABS_API_KEY, workspace: userWorkspace('__status__') }
}

export { handleRequest, status, brainStatus }