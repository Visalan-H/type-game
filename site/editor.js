const CHAIN_LINE_INDEX = 3
const CHAR_DELAY_MS = 25
const HINT_MARKER = /^\s*\/\/\s*\^\?/
const KEYWORDS = new Set(["const", "let", "var", "function", "return", "if", "else", "new", "type", "interface", "extends"])
const TOKEN_PATTERN = /(\/\/.*)|("(?:[^"\\]|\\.)*(?:"|$))|([A-Za-z_$][\w$]*)|(\s+)|([^])/gy
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"

function tokenize(line) {
  return [...line.matchAll(TOKEN_PATTERN)].map((match) => {
    const [text, comment, string, word] = match
    const before = line.slice(0, match.index)
    const after = line.slice(match.index + text.length)
    return { type: classify({ comment, string, word, before, after }), text }
  })
}

function classify({ comment, string, word, before, after }) {
  if (comment) return "comment"
  if (string) return "string"
  if (!word) return "plain"
  if (before.trimEnd().endsWith(".") || after.startsWith("(")) return "method"
  return KEYWORDS.has(word) ? "keyword" : "plain"
}

function sourceView(source) {
  const lines = source.split("\n")
  const lastMarker = lines.findLastIndex((line) => HINT_MARKER.test(line))
  const visible = lines.slice(0, lastMarker + 1)
  const hintAfter = visible.flatMap((line, index) => (HINT_MARKER.test(line) ? [index] : []))
  return { lines: visible, hintAfter }
}

function stepToward(displayed, target) {
  if (target.startsWith(displayed)) return target.slice(0, displayed.length + 1)
  if (displayed.startsWith(target)) return displayed.slice(0, -1)
  return target
}

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function restartFlash(node) {
  node.classList.remove("is-flash")
  void node.offsetWidth
  node.classList.add("is-flash")
}

function setText(node, text, flash) {
  if (node.textContent === text) return
  node.textContent = text
  if (flash) restartFlash(node)
}

function tokenNodes(line) {
  return tokenize(line).map(({ type, text }) => (type === "plain" ? document.createTextNode(text) : element("span", `tok-${type}`, text)))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildTabs(file) {
  const tabs = element("div", "editor-tabs")
  tabs.append(element("span", "editor-tab", file))
  return tabs
}

function buildFooter() {
  const footer = element("div", "editor-footer")
  const link = element("a", "editor-link", "Open in TypeScript Playground")
  link.target = "_blank"
  link.rel = "noopener"
  const summary = element("div", "editor-summary")
  const ms = element("span", "editor-ms")
  summary.append(element("span", "editor-label", "Compiled by TypeScript"), ms)
  const chain = element("code", "editor-chain")
  footer.append(summary, chain, link)
  return { footer, chain, ms, link }
}

function buildHint(name) {
  const hint = element("span", "hint")
  const value = element("span", "tok-string")
  hint.append("(property) ", element("span", "hint-name", name), ": ", value)
  return { hint, value }
}

function buildCode(result) {
  const { lines, hintAfter } = sourceView(result.source)
  const code = element("div", "editor-code")
  code.tabIndex = 0
  code.setAttribute("role", "region")
  code.setAttribute("aria-label", "Source code")
  const hints = []
  let chainText = null
  lines.forEach((line, index) => {
    const text = element("span", "code-text")
    const row = element("div", "code-row")
    row.append(element("span", "line-no", String(index + 1)), text)
    code.append(row)
    if (index === CHAIN_LINE_INDEX) chainText = text
    else text.append(...tokenNodes(line))
    const readIndex = hintAfter.indexOf(index)
    if (readIndex >= 0 && result.reads[readIndex]) {
      const { hint, value } = buildHint(result.reads[readIndex].name)
      const hintRow = element("div", "hint-row")
      hintRow.append(hint)
      code.append(hintRow)
      hints.push({ hint, value, readIndex })
    }
  })
  return { code, chainText, hints }
}

export function createEditor(el, file) {
  const body = element("div", "editor-body")
  const footer = buildFooter()
  el.replaceChildren(buildTabs(file), body, footer.footer)

  let view = null
  let displayed = ""
  let ticket = 0

  function renderChain() {
    view.chainText.replaceChildren(...tokenNodes(displayed), element("span", "caret"))
  }

  function renderResult(result, flash) {
    for (const { hint, value, readIndex } of view.hints) {
      const before = value.textContent
      setText(value, `"${result.reads[readIndex].value}"`, false)
      if (flash && before !== value.textContent) restartFlash(hint)
    }
    setText(footer.ms, `${result.ms} ms`, flash)
    setText(footer.chain, result.chain, flash)
    footer.link.href = result.href
  }

  function renderSource(result) {
    view = { source: result.source, ...buildCode(result) }
    body.replaceChildren(view.code)
    displayed = result.chain
    renderChain()
    renderResult(result, false)
  }

  async function typeToward(result, current) {
    while (displayed !== result.chain) {
      const next = stepToward(displayed, result.chain)
      const gradual = Math.abs(next.length - displayed.length) === 1
      displayed = next
      renderChain()
      if (gradual) await sleep(CHAR_DELAY_MS)
      if (current !== ticket) return false
    }
    return true
  }

  async function show(result) {
    const current = ++ticket
    if (!view || view.source !== result.source) return renderSource(result)
    if (matchMedia(REDUCED_MOTION).matches) {
      displayed = result.chain
      renderChain()
      return renderResult(result, false)
    }
    if (await typeToward(result, current)) renderResult(result, true)
  }

  return { show }
}
