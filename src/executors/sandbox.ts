import ivm from 'isolated-vm'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load vendor bundles once at startup
const lodashBundle = fs.readFileSync(path.join(__dirname, '../../vendor/lodash.min.js'), 'utf8')
const dayjsBundle = fs.readFileSync(path.join(__dirname, '../../vendor/dayjs.min.js'), 'utf8')

export async function runInSandbox(code: string, input: any): Promise<any> {
    const isolate = new ivm.Isolate({ memoryLimit: 128 })
    const context = await isolate.createContext()

    try {
        // Inject input into the isolate
        await context.global.set('__input', new ivm.ExternalCopy(input).copyInto())

        // Pre-inject lodash and dayjs so user code can use _ and dayjs
        await (await isolate.compileScript(lodashBundle)).run(context)
        await (await isolate.compileScript(dayjsBundle)).run(context)

        // Run user code + call run(__input)
        const script = await isolate.compileScript(`
      ${code}
      JSON.stringify(run(__input))
    `)
        const result = await script.run(context, { timeout: 5000 })
        return JSON.parse(result as string)
    } finally {
        isolate.dispose()
    }
}
