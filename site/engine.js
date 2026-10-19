const TYPESCRIPT_VERSION = "5.6.3"
const PACKAGE_URL = `https://cdn.jsdelivr.net/npm/typescript@${TYPESCRIPT_VERSION}/lib`
const LIB_FILE = "lib.es5.d.ts"
const GAME_FILE = "game.ts"
const CHAIN_LINE_INDEX = 3
const BOARD_SEPARATOR = " │ "
const SCREEN_SEPARATOR = "  "
const FINAL_SCREEN = /^you (win|lose)! (.+)$/

importScripts(`${PACKAGE_URL}/typescript.js`)

const COMPILER_OPTIONS = {
  strict: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2020,
  lib: [LIB_FILE],
  types: [],
}

function parseTicTacToe(values) {
  const cells = [values.top, values.middle, values.bottom].flatMap((row) => row.split(BOARD_SEPARATOR))
  return { cells, status: values.status }
}

function parseHangman(values, previous) {
  const final = FINAL_SCREEN.exec(values.screen)
  if (final) {
    const result = final[1]
    const word = final[2]
    if (result === "win") return { slots: [...word], lives: previous().lives, result, word }
    return { slots: previous().slots, lives: 0, result, word }
  }
  const [slots, hearts] = values.screen.split(SCREEN_SEPARATOR)
  return { slots: slots.split(" "), lives: [...hearts].length, result: "playing" }
}

const GAMES = {
  "tic-tac-toe": {
    start: "ticTacToe()",
    method: "play",
    properties: ["top", "middle", "bottom", "status"],
    parse: parseTicTacToe,
    isOver: (state) => state.status !== "your move",
  },
  hangman: {
    start: "hangman()",
    method: "guess",
    properties: ["screen"],
    parse: parseHangman,
    isOver: (state) => state.result !== "playing",
  },
}

const textCache = new Map()
let libFile = null
let previousProgram

function fetchText(url) {
  if (!textCache.has(url)) {
    const request = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`)
      return response.text()
    })
    request.catch(() => textCache.delete(url))
    textCache.set(url, request)
  }
  return textCache.get(url)
}

async function loadLibFile() {
  const text = await fetchText(`${PACKAGE_URL}/${LIB_FILE}`)
  libFile ??= ts.createSourceFile(LIB_FILE, text, ts.ScriptTarget.ES2020)
}

function buildChain(spec, moves) {
  return `const game = ${spec.start}${moves.map((move) => `.${spec.method}(${JSON.stringify(move)})`).join("")}`
}

function withChain(source, chain) {
  const lines = source.split("\n")
  lines[CHAIN_LINE_INDEX] = chain
  return lines.join("\n")
}

function createHost(gameFile) {
  const files = new Map([[GAME_FILE, gameFile], [LIB_FILE, libFile]])
  return {
    getSourceFile: (name) => files.get(name),
    fileExists: (name) => files.has(name),
    readFile: (name) => files.get(name)?.text,
    getDefaultLibFileName: () => LIB_FILE,
    getCurrentDirectory: () => "",
    getCanonicalFileName: (name) => name,
    getNewLine: () => "\n",
    useCaseSensitiveFileNames: () => true,
    writeFile: () => {},
  }
}

function findGameDeclaration(file) {
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue
    const declaration = statement.declarationList.declarations[0]
    if (declaration.name.getText(file) === "game") return declaration
  }
  throw new Error("The game file has no game declaration")
}

function readStringProperty(checker, type, declaration, name) {
  const symbol = checker.getPropertyOfType(type, name)
  const propertyType = symbol && checker.getTypeOfSymbolAtLocation(symbol, declaration)
  if (!propertyType?.isStringLiteral()) throw new Error(`The compiler did not return a string for ${name}`)
  return propertyType.value
}

function chainDiagnostic(program, file) {
  return program
    .getSemanticDiagnostics(file)
    .find((diagnostic) => file.getLineAndCharacterOfPosition(diagnostic.start).line === CHAIN_LINE_INDEX)
}

function evaluate(spec, source, moves) {
  const chain = buildChain(spec, moves)
  const file = ts.createSourceFile(GAME_FILE, withChain(source, chain), ts.ScriptTarget.ES2020, true)
  const program = ts.createProgram({
    rootNames: [GAME_FILE],
    options: COMPILER_OPTIONS,
    host: createHost(file),
    oldProgram: previousProgram,
  })
  previousProgram = program
  const diagnostic = chainDiagnostic(program, file)
  if (diagnostic) return { chain, error: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n") }
  const checker = program.getTypeChecker()
  const declaration = findGameDeclaration(file)
  const type = checker.getTypeAtLocation(declaration)
  const reads = spec.properties.map((name) => ({
    name,
    value: readStringProperty(checker, type, declaration, name),
  }))
  return { chain, reads }
}

function parseReads(spec, source, moves, reads) {
  const values = Object.fromEntries(reads.map(({ name, value }) => [name, value]))
  const previous = () => {
    const earlier = evaluate(spec, source, moves.slice(0, -1))
    return parseReads(spec, source, moves.slice(0, -1), earlier.reads)
  }
  return spec.parse(values, previous)
}

async function respond({ id, game, moves }) {
  const spec = GAMES[game]
  if (!spec) throw new Error(`Unknown game: ${game}`)
  const [source] = await Promise.all([fetchText(`game/${game}.ts`), loadLibFile()])
  const started = performance.now()
  const outcome = evaluate(spec, source, moves)
  if (outcome.error) return { id, ok: false, error: outcome.error }
  const state = parseReads(spec, source, moves, outcome.reads)
  const ms = Math.round(performance.now() - started)
  return { id, ok: true, state, chain: outcome.chain, ms, over: spec.isOver(state), reads: outcome.reads }
}

self.onmessage = async ({ data }) => {
  try {
    self.postMessage(await respond(data))
  } catch (error) {
    self.postMessage({ id: data.id, ok: false, fatal: true, error: error.message })
  }
}
