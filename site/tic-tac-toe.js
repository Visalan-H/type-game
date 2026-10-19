import { createSession } from "./client.js"
import { createEditor } from "./editor.js"

const SVG_NS = "http://www.w3.org/2000/svg"
const CELL_COUNT = 9
const MOVES = Array.from({ length: CELL_COUNT }, (_, i) => String(i + 1))
const PLAYER_MARK = "X"
const MARKS = ["X", "O"]
const THINKING_TEXT = "TypeScript is thinking…"
const BOARD_SIZE = 300
const CELL_SIZE = BOARD_SIZE / 3
const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
]
const OUTCOME_TONES = {
  "you win": "win",
  "TypeScript wins": "lose",
  draw: "draw"
}

const root = document.querySelector(".game")
const board = root.querySelector(".board")
const statusText = root.querySelector(".status-text")
const banner = root.querySelector(".banner")

const editor = createEditor(document.getElementById("editor"), "tic-tac-toe.ts")

function svgElement(name, attributes) {
  const element = document.createElementNS(SVG_NS, name)
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value)
  }
  return element
}

function createMark(mark) {
  const svg = svgElement("svg", { viewBox: "0 0 100 100", class: "mark", "aria-hidden": "true" })
  if (mark === PLAYER_MARK) {
    svg.append(
      svgElement("path", { d: "M25 25L75 75", pathLength: "1" }),
      svgElement("path", { d: "M75 25L25 75", pathLength: "1" })
    )
  } else {
    svg.append(svgElement("circle", { cx: "50", cy: "50", r: "26" }))
  }
  return svg
}

function createStrike(line) {
  const center = (index) => [
    (index % 3) * CELL_SIZE + CELL_SIZE / 2,
    Math.floor(index / 3) * CELL_SIZE + CELL_SIZE / 2
  ]
  const [x1, y1] = center(line[0])
  const [x2, y2] = center(line[2])
  const svg = svgElement("svg", {
    viewBox: `0 0 ${BOARD_SIZE} ${BOARD_SIZE}`,
    class: "strike",
    "aria-hidden": "true"
  })
  svg.append(svgElement("line", { x1, y1, x2, y2, pathLength: "1" }))
  return svg
}

function createCells() {
  return MOVES.map((move) => {
    const cell = document.createElement("button")
    cell.type = "button"
    cell.className = "cell"
    cell.dataset.cell = move
    cell.dataset.mark = ""
    return cell
  })
}

const cells = createCells()
board.append(...cells)

function markAt(state, index) {
  const { phase, pending, result } = state
  const placed = result ? result.state.cells[index] : ""
  if (MARKS.includes(placed)) return placed
  if (phase === "thinking" && pending === MOVES[index]) return PLAYER_MARK
  return ""
}

function winningLine(marks) {
  return LINES.find((line) => MARKS.includes(marks[line[0]]) && line.every((i) => marks[i] === marks[line[0]]))
}

function outcomeTone(state) {
  if (state.phase !== "over") return ""
  return OUTCOME_TONES[state.result.state.status] ?? ""
}

function displayedLine(state, tone) {
  if (tone !== "win" && tone !== "lose") return null
  return winningLine(state.result.state.cells) ?? null
}

function renderCell(cell, index, state, line) {
  const mark = markAt(state, index)
  if (cell.dataset.mark !== mark) {
    cell.dataset.mark = mark
    cell.replaceChildren(...(mark ? [createMark(mark)] : []))
    cell.setAttribute("aria-label", `Cell ${index + 1}, ${mark || "free"}`)
  }
  cell.disabled = state.phase !== "idle" || mark !== ""
  cell.toggleAttribute("data-win", line !== null && line.includes(index))
}

function renderStrike(line) {
  const key = line ? line.join("") : ""
  if (board.dataset.line === key) return
  board.dataset.line = key
  board.querySelector(".strike")?.remove()
  if (line) board.append(createStrike(line))
}

function statusFor(state) {
  if (state.phase === "thinking") return THINKING_TEXT
  return state.result ? state.result.state.status : ""
}

function render(state) {
  const tone = outcomeTone(state)
  const line = displayedLine(state, tone)
  cells.forEach((cell, index) => renderCell(cell, index, state, line))
  renderStrike(line)
  board.dataset.tone = tone
  statusText.textContent = statusFor(state)
  banner.textContent = tone ? state.result.state.status : ""
  banner.dataset.tone = tone
}

const session = createSession({
  game: "tic-tac-toe",
  allowed: MOVES,
  root,
  present: (result) => editor.show(result),
  render
})

board.addEventListener("click", (event) => {
  const cell = event.target.closest("button[data-cell]")
  if (cell && !cell.disabled) session.play(cell.dataset.cell)
})

session.start()
