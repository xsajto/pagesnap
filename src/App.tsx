import { useState } from 'react'
import {
  AdjustmentsHorizontalIcon,
  ArrowDownTrayIcon,
  ClipboardDocumentIcon,
  EyeIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cloneActiveTab, downloadHtml, sanitizeFileName } from '@/lib/cloner'

const STATUS_IDLE = 'Ready to capture the current page.'

function App() {
  const [status, setStatus] = useState(STATUS_IDLE)
  const [isWorking, setIsWorking] = useState(false)
  const [removeScripts, setRemoveScripts] = useState(true)
  const [removeOriginalStyles, setRemoveOriginalStyles] = useState(true)
  const [useHostFetch, setUseHostFetch] = useState(true)
  const [addCsp, setAddCsp] = useState(false)
  const [cloneWarnings, setCloneWarnings] = useState<string[]>([])

  const runClone = async () => {
    setIsWorking(true)
    setStatus('Preparing the page snapshot...')
    setCloneWarnings([])

    try {
      const { html, warnings, title } = await cloneActiveTab({
        removeScripts,
        removeOriginalStyles,
        useHostFetch,
        addCsp,
      })

      const fileName = `${sanitizeFileName(title || 'pagesnap')}.html`
      setCloneWarnings(warnings)
      setStatus('Snapshot ready.')
      return { html, fileName }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.'
      setStatus(message)
      return null
    } finally {
      setIsWorking(false)
    }
  }

  const handleDownload = async () => {
    const snapshot = await runClone()
    if (!snapshot) {
      return
    }
    setStatus('Building download...')
    await downloadHtml(snapshot.html, snapshot.fileName)
    setStatus('Download ready. Check your downloads folder.')
  }

  const handleCopy = async () => {
    const snapshot = await runClone()
    if (!snapshot) {
      return
    }
    await navigator.clipboard.writeText(snapshot.html)
    setStatus('Snapshot copied to clipboard.')
  }

  const handlePreview = async () => {
    const snapshot = await runClone()
    if (!snapshot) {
      return
    }
    const blob = new Blob([snapshot.html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    chrome.tabs.create({ url }, () => {
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    })
  }

  return (
    <div className="flex min-h-full w-full items-stretch">
      <Card className="relative w-full rounded-[28px] border border-white/70 bg-white/80 px-5 py-6 shadow-2xl backdrop-blur-xl">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <img
                src="/logo.svg"
                alt="PageSnap logo"
                className="h-10 w-10 rounded-2xl border border-white/70 bg-white/80 p-1 shadow-sm"
              />
              <div>
                <CardTitle className="text-2xl text-slate-900">PageSnap</CardTitle>
                <CardDescription className="text-sm text-slate-600">
                  Capture the current page into a standalone HTML snapshot.
                </CardDescription>
              </div>
            </div>
            <div className="rounded-2xl bg-blue-600 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white shadow-sm">
              Beta
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                <AdjustmentsHorizontalIcon className="h-4 w-4 text-blue-600" aria-hidden="true" />
                <span>Options</span>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-blue-600"
                    checked={removeOriginalStyles}
                    onChange={(event) => setRemoveOriginalStyles(event.target.checked)}
                  />
                  Remove original styles (keep extracted CSS only)
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-blue-600"
                    checked={useHostFetch}
                    onChange={(event) => setUseHostFetch(event.target.checked)}
                  />
                  Use host-permissions CSS fetch
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-blue-600"
                    checked={removeScripts}
                    onChange={(event) => setRemoveScripts(event.target.checked)}
                  />
                  Remove scripts
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-blue-600"
                    checked={addCsp}
                    onChange={(event) => setAddCsp(event.target.checked)}
                  />
                  Add CSP (block scripts)
                </label>
              </div>
            </div>
            <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                <ArrowDownTrayIcon className="h-4 w-4 text-slate-700" aria-hidden="true" />
                <span>Actions</span>
              </div>
              <div className="mt-3 flex flex-col gap-3">
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    onClick={handleDownload}
                    disabled={isWorking}
                    className="h-11 rounded-2xl bg-blue-700 text-white hover:bg-blue-600"
                    aria-label="Download snapshot"
                  >
                    <ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    onClick={handleCopy}
                    disabled={isWorking}
                    variant="outline"
                    className="h-11 rounded-2xl"
                    aria-label="Copy snapshot to clipboard"
                  >
                    <ClipboardDocumentIcon className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    onClick={handlePreview}
                    disabled={isWorking}
                    variant="outline"
                    className="h-11 rounded-2xl"
                    aria-label="Preview snapshot"
                  >
                    <EyeIcon className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
                <p className="text-xs text-slate-600">{status}</p>
              </div>
            </div>
            {cloneWarnings.length > 0 ? (
              <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-800">
                <div className="flex items-center gap-2">
                  <ExclamationTriangleIcon className="h-4 w-4 text-amber-600" aria-hidden="true" />
                  <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Warning
                  </span>
                  <p>Some assets could not be fetched ({cloneWarnings.length}).</p>
                  <button
                    type="button"
                    className="ml-auto rounded-md border border-amber-300 bg-white/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800 hover:bg-white"
                    onClick={() => navigator.clipboard.writeText(cloneWarnings.join('\n'))}
                  >
                    Copy
                  </button>
                </div>
                <textarea
                  className="h-24 w-full resize-none rounded-md border border-amber-200 bg-white/90 p-2 font-mono text-[11px] text-amber-900"
                  readOnly
                  value={cloneWarnings.join('\n')}
                />
              </div>
            ) : null}
          </div>
        </CardContent>
        <div className="pointer-events-none absolute inset-0 rounded-[28px] border border-white/70" />
      </Card>
    </div>
  )
}

export default App
