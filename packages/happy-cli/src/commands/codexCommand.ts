import { authAndSetupMachineIfNeeded } from '@/ui/auth'
import { runCodex } from '@/codex/runCodex'
import { extractCodexResumeFlag } from '@/codex/cliArgs'
import { extractNoSandboxFlag } from '@/utils/sandboxFlags'
import { ensureDaemonRunning } from '@/daemon/ensureDaemonRunning'
import type { PermissionMode } from '@/api/types'
import type { ReasoningEffort } from '@/codex/codexAppServerTypes'

function splitLongOption(arg: string): { name: string; value: string | undefined } {
  const equalsIndex = arg.indexOf('=')
  if (equalsIndex === -1) {
    return { name: arg, value: undefined }
  }
  return {
    name: arg.slice(0, equalsIndex),
    value: arg.slice(equalsIndex + 1),
  }
}

export async function handleCodexCommand(args: string[]): Promise<void> {
  let startedBy: 'daemon' | 'terminal' | undefined = undefined
  let permissionMode: PermissionMode | undefined = undefined
  let model: string | undefined = undefined
  let effort: ReasoningEffort | undefined = undefined
  const sandboxArgs = extractNoSandboxFlag(args)
  const codexArgs = extractCodexResumeFlag(sandboxArgs.args)

  for (let i = 0; i < codexArgs.args.length; i++) {
    const option = splitLongOption(codexArgs.args[i])
    if (option.name === '--started-by') {
      startedBy = (option.value ?? codexArgs.args[++i]) as 'daemon' | 'terminal'
    } else if (option.name === '--permission-mode') {
      permissionMode = (option.value ?? codexArgs.args[++i]) as PermissionMode
    } else if (option.name === '--model') {
      model = option.value ?? codexArgs.args[++i]
    } else if (option.name === '--effort') {
      effort = (option.value ?? codexArgs.args[++i]) as ReasoningEffort
    } else if (option.name === '--yolo') {
      permissionMode = 'yolo'
    }
  }

  const { credentials } = await authAndSetupMachineIfNeeded()
  await ensureDaemonRunning()

  await runCodex({
    credentials,
    startedBy,
    noSandbox: sandboxArgs.noSandbox,
    resumeThreadId: codexArgs.resumeThreadId ?? undefined,
    permissionMode,
    model,
    effort,
  })
}
