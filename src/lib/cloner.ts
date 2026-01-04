export type CloneOptions = {
  removeScripts: boolean
  removeOriginalStyles: boolean
  useHostFetch: boolean
  addCsp: boolean
}

export type CloneResult = {
  html: string
  warnings: string[]
  title: string | null
}

type SerializedResult = {
  html: string
  warnings: string[]
}

export const sanitizeFileName = (value: string) =>
  value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-')

export const downloadHtml = (html: string, filename: string) =>
  new Promise<void>((resolve, reject) => {
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)

    chrome.downloads.download(
      { url, filename, saveAs: false, conflictAction: 'uniquify' },
      (downloadId) => {
        URL.revokeObjectURL(url)
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        if (!downloadId) {
          reject(new Error('Download failed to start.'))
          return
        }
        resolve()
      },
    )
  })

export const cloneActiveTab = async (options: CloneOptions): Promise<CloneResult> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) {
    throw new Error('No active tab detected.')
  }

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async (options: CloneOptions): Promise<SerializedResult> => {
      const { removeScripts, removeOriginalStyles, useHostFetch, addCsp } = options
      const inlineAssets = false
      const warnings: string[] = []

      const injectFreezeStyles = () => {
        const style = document.createElement('style')
        style.setAttribute('data-pc-freeze', 'true')
        style.textContent = `
* {
  animation: none !important;
  transition: none !important;
  scroll-behavior: auto !important;
  caret-color: auto !important;
}
html, body {
  scroll-behavior: auto !important;
}
`
        document.head?.appendChild(style)
        return () => {
          style.remove()
        }
      }

      const pauseMedia = () => {
        const media = document.querySelectorAll<HTMLMediaElement>('audio, video')
        media.forEach((el) => {
          try {
            el.pause()
          } catch {
            // Ignore media errors.
          }
        })
      }

      const waitForStableFrames = async (count: number) => {
        for (let i = 0; i < count; i += 1) {
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve())
          })
        }
      }

      const rewriteCssUrls = (cssText: string, baseUrl: string | null) => {
        if (!baseUrl) {
          return cssText
        }
        return cssText.replace(
          /url\\(\\s*(?:['"]?)([^'")]+)(?:['"]?)\\s*\\)/gi,
          (match, url) => {
            if (
              !url ||
              url.startsWith('data:') ||
              url.startsWith('blob:') ||
              url.startsWith('about:') ||
              url.startsWith('#')
            ) {
              return match
            }
            try {
              const absolute = new URL(url, baseUrl).href
              return `url("${absolute}")`
            } catch {
              return match
            }
          },
        )
      }

      const inlineCssUrls = async (
        cssText: string,
        baseUrl: string | null,
        inlineAssets: boolean,
      ) => {
        const rewritten = rewriteCssUrls(cssText, baseUrl)
        if (!inlineAssets) {
          return rewritten
        }
        return rewritten
      }

      const splitSelectors = (selectorText: string) => {
        const selectors: string[] = []
        let current = ''
        let depth = 0
        let quote: string | null = null
        for (let i = 0; i < selectorText.length; i += 1) {
          const char = selectorText[i]
          if (quote) {
            current += char
            if (char === quote && selectorText[i - 1] !== '\\') {
              quote = null
            }
            continue
          }
          if (char === '"' || char === "'") {
            quote = char
            current += char
            continue
          }
          if (char === '(' || char === '[') {
            depth += 1
            current += char
            continue
          }
          if (char === ')' || char === ']') {
            depth = Math.max(0, depth - 1)
            current += char
            continue
          }
          if (char === ',' && depth === 0) {
            const trimmed = current.trim()
            if (trimmed) {
              selectors.push(trimmed)
            }
            current = ''
            continue
          }
          current += char
        }
        const trimmed = current.trim()
        if (trimmed) {
          selectors.push(trimmed)
        }
        return selectors
      }

      const normalizeSelector = (selector: string) => {
        let normalized = selector
        normalized = normalized.replace(/::?before|::?after/gi, '')
        normalized = normalized.replace(/::[\\w-]+/g, '')
        normalized = normalized.replace(
          /:(hover|active|focus|focus-visible|focus-within|visited|link|checked|disabled|enabled|target)/gi,
          '',
        )
        return normalized.trim()
      }

      const selectorMatches = (selector: string) => {
        try {
          return document.querySelector(selector) !== null
        } catch {
          const normalized = normalizeSelector(selector)
          if (!normalized || normalized === selector) {
            return false
          }
          try {
            return document.querySelector(normalized) !== null
          } catch {
            return false
          }
        }
      }

      const fetchStylesheetText = async (href: string) => {
        if (useHostFetch && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          const response = await new Promise<{ ok: boolean; text?: string; error?: string }>(
            (resolve) => {
              let settled = false
              const timeout = setTimeout(() => {
                if (settled) {
                  return
                }
                settled = true
                resolve({ ok: false, error: 'Background fetch timeout' })
              }, 3000)
              try {
                chrome.runtime.sendMessage({ type: 'FETCH_CSS', url: href }, (result) => {
                  if (settled) {
                    return
                  }
                  settled = true
                  clearTimeout(timeout)
                  resolve(
                    result && typeof result === 'object'
                      ? (result as { ok: boolean; text?: string; error?: string })
                      : { ok: false, error: 'Background fetch failed' },
                  )
                })
              } catch (error) {
                if (settled) {
                  return
                }
                settled = true
                clearTimeout(timeout)
                const message = error instanceof Error ? error.message : 'Background fetch error'
                resolve({ ok: false, error: message })
              }
            },
          )
          if (!response.ok || !response.text) {
            return { text: null, error: response.error || 'Background fetch failed' }
          }
          return { text: response.text, error: null }
        }
        try {
          const response = await fetch(href, { credentials: 'include' })
          if (!response.ok) {
            return { text: null, error: `HTTP ${response.status}` }
          }
          const text = await response.text()
          return { text, error: null }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown fetch error'
          return { text: null, error: message }
        }
      }

      const collectUsedCss = async () => {
        const usedRules: string[] = []
        const fontFaces = new Set<string>()
        const keyframes = new Set<string>()
        const visitedSheets = new Set<CSSStyleSheet>()

        const parseRulesFromText = (cssText: string) => {
          const tempDoc = document.implementation.createHTMLDocument('')
          const styleEl = tempDoc.createElement('style')
          styleEl.textContent = cssText
          tempDoc.head.appendChild(styleEl)
          return styleEl.sheet?.cssRules ?? null
        }

        const collectRules = async (rules: CSSRuleList | null) => {
          if (!rules) {
            return []
          }
          const collected: string[] = []
          for (const rule of Array.from(rules)) {
            if (rule instanceof CSSStyleRule) {
              const selectors = splitSelectors(rule.selectorText)
              if (selectors.some(selectorMatches)) {
                collected.push(rule.cssText)
              }
              continue
            }
            if (rule instanceof CSSMediaRule) {
              const nested = await collectRules(rule.cssRules)
              if (nested.length > 0) {
                collected.push(`@media ${rule.conditionText}{${nested.join('')}}`)
              }
              continue
            }
            if (rule instanceof CSSSupportsRule) {
              if (!CSS.supports(rule.conditionText)) {
                continue
              }
              const nested = await collectRules(rule.cssRules)
              if (nested.length > 0) {
                collected.push(`@supports ${rule.conditionText}{${nested.join('')}}`)
              }
              continue
            }
            if (rule instanceof CSSKeyframesRule) {
              keyframes.add(rule.cssText)
              continue
            }
            if (rule instanceof CSSFontFaceRule) {
              fontFaces.add(rule.cssText)
              continue
            }
            if (rule instanceof CSSImportRule) {
              if (rule.styleSheet && !visitedSheets.has(rule.styleSheet)) {
                await collectFromStylesheet(rule.styleSheet)
              }
              continue
            }
            if ('cssRules' in rule) {
              const nested = await collectRules((rule as CSSGroupingRule).cssRules)
              if (nested.length > 0) {
                collected.push(rule.cssText)
              }
              continue
            }
          }
          return collected
        }

        const collectFromStylesheet = async (sheet: CSSStyleSheet) => {
          if (visitedSheets.has(sheet)) {
            return
          }
          visitedSheets.add(sheet)
          try {
            const nested = await collectRules(sheet.cssRules)
            usedRules.push(...nested)
          } catch {
            if (!sheet.href) {
              return
            }
            warnings.push(`cssRules blocked for stylesheet: ${sheet.href}`)
            const fallbackResult = await fetchStylesheetText(sheet.href)
            if (!fallbackResult.text) {
              warnings.push(
                `Failed to fetch stylesheet: ${sheet.href} (${fallbackResult.error})`,
              )
              return
            }
            const updatedCssText = await inlineCssUrls(
              fallbackResult.text,
              sheet.href,
              inlineAssets,
            )
            const parsedRules = parseRulesFromText(updatedCssText)
            const nested = await collectRules(parsedRules)
            usedRules.push(...nested)
          }
        }

        for (const sheet of Array.from(document.styleSheets)) {
          await collectFromStylesheet(sheet)
        }

        return [...fontFaces, ...keyframes, ...usedRules].join('\n')
      }

      const cleanupTasks: Array<() => void> = []
      cleanupTasks.push(injectFreezeStyles())
      pauseMedia()
      await waitForStableFrames(2)

      const extractedCss = removeOriginalStyles ? await collectUsedCss() : ''
      const cloneRoot = document.documentElement.cloneNode(true) as HTMLElement

      cloneRoot.querySelectorAll('base').forEach((base) => base.remove())
      cloneRoot.querySelectorAll('plasmo-csui, css-to-tailwind, browser-mcp-container').forEach(
        (node) => node.remove(),
      )
      cloneRoot.querySelectorAll('[data-extension-id]').forEach((node) => node.remove())

      if (removeScripts) {
        cloneRoot.querySelectorAll('script').forEach((script) => script.remove())
        cloneRoot
          .querySelectorAll('link[rel="modulepreload"], link[rel="preload"][as="script"]')
          .forEach((link) => link.remove())
      }

      if (removeOriginalStyles) {
        cloneRoot.querySelectorAll('style').forEach((styleNode) => styleNode.remove())
        cloneRoot.querySelectorAll('link[rel="stylesheet"]').forEach((link) => link.remove())
        cloneRoot
          .querySelectorAll('link[rel="preload"][as="style"]')
          .forEach((link) => link.remove())
      }

      const headTarget = cloneRoot.querySelector('head')
      if (headTarget && extractedCss) {
        const styleTag = document.createElement('style')
        styleTag.setAttribute('data-pc-extracted', 'true')
        styleTag.textContent = extractedCss
        headTarget.appendChild(styleTag)
      }
      if (headTarget && addCsp) {
        const meta = document.createElement('meta')
        meta.setAttribute('http-equiv', 'Content-Security-Policy')
        meta.setAttribute(
          'content',
          "default-src 'self' data:; script-src 'none'; object-src 'none'; base-uri 'none';",
        )
        headTarget.appendChild(meta)
      }

      const doctype = document.doctype
        ? `<!DOCTYPE ${document.doctype.name}>`
        : '<!DOCTYPE html>'

      cleanupTasks.forEach((task) => task())

      return { html: `${doctype}\n${cloneRoot.outerHTML}`, warnings }
    },
    args: [options],
  })

  if (!result) {
    throw new Error('Failed to serialize the page.')
  }
  const payload = typeof result === 'string' ? { html: result, warnings: [] } : result
  return { html: payload.html, warnings: payload.warnings, title: tab.title ?? null }
}
