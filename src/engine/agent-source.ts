import bundle from '../../build-agent/botguard-agent.js?raw'

import { AGENT_GLOBAL } from './agent-protocol'

/**
 * The agent bundle and the call that installs it for `appOrigin`, as one classic script for
 * `addScriptTag`, inside a function so the bundle's top-level `var` never lands on the window
 * BotGuard runs in. Loaded only behind the step flag, as its own chunk, so the build output of
 * `npm run build:agent` is needed by the build and by nothing that runs flag off.
 */
export const agentSource = (appOrigin: string) => `(() => {\n${bundle}\n${AGENT_GLOBAL}.install(${JSON.stringify(appOrigin)})\n})()\n`
