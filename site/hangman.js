import { createEditor } from "./editor.js"
import { createSession } from "./client.js"

const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("")
const TOTAL_LIVES = 6
const HIDDEN_SLOT = "_"
const SCREEN_READ = "screen"
const CONFETTI_COUNT = 28
const CONFETTI_COLORS = ["var(--accent)", "var(--good)", "var(--bad)"]
const CONFETTI_SPREAD = 180
const CONFETTI_RISE = 150
const CONFETTI_DROP = 60
const CONFETTI_TURNS = 540

const root = document.querySelector("main.game")
const heartsEl = document.getElementById("hearts")
const slotsEl = document.getElementById("slots")
const keyboardEl = document.getElementById("keyboard")
const confettiEl = document.getElementById("confetti")
const banner = root.querySelector(".banner")
const editor = createEditor(document.getElementById("editor"), "hangman.ts")

function createElement(tag, className) {
  const element = document.createElement(tag)
  element.className = className
  return element
}

function buildKeyboard() {
  const keys = ALPHABET.map((letter) => {
    const key = createElement("button", "key")
    key.type = "button"
    key.textContent = letter
    key.dataset.letter = letter
    key.setAttribute("aria-label", `Guess ${letter}`)
    return key
  })
  keyboardEl.replaceChildren(...keys)
  return keys
}

const keys = buildKeyboard()

function buildSlots(count) {
  const slots = Array.from({ length: count }, () => createElement("span", "slot"))
  slotsEl.replaceChildren(...slots)
}

function paintSlot(slot, letter, isHit, animate) {
  const shown = letter === HIDDEN_SLOT ? "" : letter
  if (slot.textContent === shown) return
  slot.textContent = shown
  slot.dataset.state = !shown ? "hidden" : isHit ? "hit" : "revealed"
  slot.dataset.fresh = String(animate && shown !== "")
}

function renderSlots(state) {
  const letters = state.word ? state.word.split("") : state.slots
  const rebuilt = slotsEl.children.length !== letters.length
  if (rebuilt) buildSlots(letters.length)
  letters.forEach((letter, index) => {
    paintSlot(slotsEl.children[index], letter, state.slots[index] !== HIDDEN_SLOT, !rebuilt)
  })
}

function buildHearts() {
  const hearts = Array.from({ length: TOTAL_LIVES }, () => {
    const heart = createElement("span", "heart")
    heart.textContent = "♥"
    heart.dataset.state = "alive"
    return heart
  })
  heartsEl.replaceChildren(...hearts)
}

function lostState(current, animate) {
  if (current !== "alive") return current
  return animate ? "losing" : "lost"
}

function renderHearts(lives) {
  const rebuilt = heartsEl.children.length === 0
  if (rebuilt) buildHearts()
  Array.from(heartsEl.children).forEach((heart, index) => {
    heart.dataset.state = index >= lives ? lostState(heart.dataset.state, !rebuilt) : "alive"
  })
  heartsEl.setAttribute("aria-label", `${lives} lives left`)
}

function keyState(letter, played, slotLetters, pending) {
  if (pending === letter) return "pending"
  if (!played.has(letter)) return "open"
  return slotLetters.has(letter) ? "hit" : "miss"
}

function renderKeys({ moves, pending, phase, result }) {
  const played = new Set(moves)
  const slotLetters = new Set(result.state.slots)
  keys.forEach((key) => {
    const letter = key.dataset.letter
    key.dataset.state = keyState(letter, played, slotLetters, pending)
    key.disabled = key.dataset.state !== "open" || phase === "over"
  })
}

function renderBanner({ phase, result }) {
  const over = phase === "over"
  const screen = result.reads.find((read) => read.name === SCREEN_READ)
  banner.textContent = over ? screen.value : ""
  banner.dataset.tone = over ? result.state.result : ""
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function createPiece(index) {
  const piece = createElement("span", "confetti-piece")
  const angle = (index / CONFETTI_COUNT) * Math.PI
  piece.style.setProperty("--dx", `${Math.round(Math.cos(angle) * CONFETTI_SPREAD * (0.4 + Math.random() * 0.6))}px`)
  piece.style.setProperty("--dy", `${Math.round(CONFETTI_DROP - Math.sin(angle) * CONFETTI_RISE * (0.5 + Math.random() * 0.5))}px`)
  piece.style.setProperty("--turn", `${Math.round((Math.random() - 0.5) * CONFETTI_TURNS)}deg`)
  piece.style.setProperty("--color", CONFETTI_COLORS[index % CONFETTI_COLORS.length])
  piece.addEventListener("animationend", () => piece.remove(), { once: true })
  return piece
}

function renderConfetti({ phase, result }) {
  const won = phase === "over" && result.state.result === "win"
  if (!won) {
    confettiEl.replaceChildren()
    delete confettiEl.dataset.burst
    return
  }
  if (confettiEl.dataset.burst || prefersReducedMotion()) return
  confettiEl.dataset.burst = "true"
  confettiEl.replaceChildren(...Array.from({ length: CONFETTI_COUNT }, (_, index) => createPiece(index)))
}

function render(state) {
  if (!state.result) return
  renderSlots(state.result.state)
  renderHearts(state.result.state.lives)
  renderKeys(state)
  renderBanner(state)
  renderConfetti(state)
}

const session = createSession({
  game: "hangman",
  allowed: ALPHABET,
  root,
  present: (result) => editor.show(result),
  render,
})

keyboardEl.addEventListener("click", (event) => {
  const key = event.target.closest(".key")
  if (key) session.play(key.dataset.letter)
})

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
  const letter = event.key.toLowerCase()
  if (ALPHABET.includes(letter)) session.play(letter)
})

session.start()
