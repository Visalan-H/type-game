const ENGINE_URL = new URL("engine.js", import.meta.url)
const LZ_STRING_URL = "https://cdn.jsdelivr.net/npm/lz-string@1.5.0/+esm"
const PLAYGROUND_URL = "https://www.typescriptlang.org/play/#code/"
const CHAIN_LINE_INDEX = 3
const HASH_SEPARATOR = ","

const TYPESCRIPT_DOWNLOAD_ERROR = "Could not download TypeScript from the CDN. Check your connection and try again."
const WORKER_REPLY_ERROR = "The compiler sent a reply the page could not read."
const LZ_STRING_ERROR = "Could not download the Playground link library from the CDN."

let lzStringLoad = null

function loadLzString() {
  lzStringLoad ??= import(LZ_STRING_URL).then(
    (module) => module.default,
    () => {
      lzStringLoad = null
      throw new Error(LZ_STRING_ERROR)
    },
  )
  return lzStringLoad
}

export async function playgroundUrl(source, chain) {
  const lzString = await loadLzString()
  const lines = source.split("\n")
  lines[CHAIN_LINE_INDEX] = chain
  return PLAYGROUND_URL + lzString.compressToEncodedURIComponent(lines.join("\n"))
}

export function createEngine() {
  const worker = new Worker(ENGINE_URL)
  const pending = new Map()
  let nextId = 0
  let failure = null

  function fail(message) {
    failure = new Error(message)
    worker.terminate()
    for (const { reject } of pending.values()) reject(failure)
    pending.clear()
  }

  worker.addEventListener("message", ({ data }) => {
    const request = pending.get(data.id)
    if (!request) return
    pending.delete(data.id)
    if (data.fatal) request.reject(new Error(data.error))
    else request.resolve(data)
  })
  worker.addEventListener("error", () => fail(TYPESCRIPT_DOWNLOAD_ERROR))
  worker.addEventListener("messageerror", () => fail(WORKER_REPLY_ERROR))

  function run(game, moves) {
    if (failure) return Promise.reject(failure)
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      worker.postMessage({ id, game, moves })
    })
  }

  return { run, terminate: () => worker.terminate() }
}

async function fetchSource(game) {
  const response = await fetch(`game/${game}.ts`)
  if (!response.ok) throw new Error(`Could not load the ${game} source (${response.status})`)
  return response.text()
}

export function createSession({ game, allowed, root, present, render }) {
  const errorElement = root.querySelector("[data-error]")
  let engine = createEngine()
  let sourceLoad = null
  let ticket = 0
  let state = { phase: "loading", moves: [], result: null, pending: null, error: null }

  function setState(next) {
    state = next
    root.dataset.phase = state.phase
    errorElement.textContent = state.error ?? ""
    render(state)
  }

  function writeHash(moves) {
    const hash = moves.length ? `#${moves.join(HASH_SEPARATOR)}` : ""
    history.replaceState(null, "", location.pathname + location.search + hash)
  }

  function readHash() {
    const moves = location.hash.slice(1).split(HASH_SEPARATOR)
    const valid = moves.every((move) => allowed.includes(move)) && new Set(moves).size === moves.length
    return valid ? moves : []
  }

  function loadSource() {
    sourceLoad ??= fetchSource(game).catch((error) => {
      sourceLoad = null
      throw error
    })
    return sourceLoad
  }

  async function compile(moves) {
    const response = await engine.run(game, moves)
    if (!response.ok) return null
    const source = await loadSource()
    const href = await playgroundUrl(source, response.chain)
    const { state: gameState, chain, ms, over, reads } = response
    return { state: gameState, chain, ms, over, reads, href, source }
  }

  function commit(moves, result) {
    setState({ phase: result.over ? "over" : "idle", moves, result, pending: null, error: null })
    writeHash(moves)
  }

  function fail(error) {
    setState({ ...state, phase: "error", pending: null, error: error.message })
  }

  async function settle(moves, fallback) {
    const mine = ++ticket
    try {
      let result = await compile(moves)
      if (!result && fallback) {
        moves = fallback
        result = await compile(moves)
      }
      if (!result) throw new Error("The compiler rejected the move.")
      if (mine !== ticket) return
      await present(result)
      if (mine !== ticket) return
      commit(moves, result)
    } catch (error) {
      if (mine === ticket) fail(error)
    }
  }

  function start() {
    setState({ phase: "loading", moves: [], result: null, pending: null, error: null })
    return settle(readHash(), [])
  }

  function play(move) {
    const unavailable = state.phase !== "idle" || !allowed.includes(move) || state.moves.includes(move)
    if (unavailable) return Promise.resolve()
    setState({ ...state, phase: "thinking", pending: move })
    return settle([...state.moves, move])
  }

  async function cancel() {
    ticket++
    setState({ ...state, phase: state.result.over ? "over" : "idle", pending: null })
    try {
      await present(state.result)
    } catch (error) {
      fail(error)
    }
  }

  function rewind(moves) {
    setState({ ...state, phase: "thinking", pending: null })
    return settle(moves)
  }

  function undo() {
    if (state.phase === "thinking") return cancel()
    const settled = state.phase === "idle" || state.phase === "over"
    if (!settled || !state.moves.length) return Promise.resolve()
    return rewind(state.moves.slice(0, -1))
  }

  function reset() {
    const settled = state.phase === "idle" || state.phase === "over" || state.phase === "thinking"
    return settled ? rewind([]) : Promise.resolve()
  }

  function retry() {
    if (state.phase !== "error") return Promise.resolve()
    engine.terminate()
    engine = createEngine()
    return start()
  }

  const actions = { undo, reset, retry }

  root.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action
    actions[action]?.()
  })

  return { start, play }
}
