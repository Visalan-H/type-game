const game = hangman()
//    ^?

type Letters = [
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
  "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
]

type Letter = Letters[number]

type ShiftBack<C extends string, L extends string[] = Letters> =
  L extends [infer Before, infer After extends string, ...infer Rest extends string[]]
    ? After extends C ? Before : ShiftBack<C, [After, ...Rest]>
    : "z"

type Unscramble<W extends string> =
  W extends `${infer C}${infer Rest}` ? `${ShiftBack<C>}${Unscramble<Rest>}` : ""

type Reveal<Word extends string, Guessed extends string> =
  Word extends `${infer C}${infer Rest}`
    ? `${C extends Guessed ? C : "_"}${Rest extends "" ? "" : " "}${Reveal<Rest, Guessed>}`
    : ""

type LettersOf<Word extends string> =
  Word extends `${infer C}${infer Rest}` ? C | LettersOf<Rest> : never

type Tuple<N extends number, Acc extends unknown[] = []> =
  Acc["length"] extends N ? Acc : Tuple<N, [...Acc, unknown]>

type LoseOne<Left extends unknown[]> = Left extends [unknown, ...infer Rest] ? Rest : []

type Lives<Word extends string, Guessed extends string, L extends string[] = Letters, Left extends unknown[] = Tuple<6>> =
  L extends [infer C extends string, ...infer Rest extends string[]]
    ? C extends Guessed
      ? C extends LettersOf<Word> ? Lives<Word, Guessed, Rest, Left> : Lives<Word, Guessed, Rest, LoseOne<Left>>
      : Lives<Word, Guessed, Rest, Left>
    : Left

type Hearts<L extends unknown[]> =
  L extends [unknown, ...infer Rest] ? `♥${Hearts<Rest>}` : ""

type Display<Word extends string, Guessed extends string> =
  Lives<Word, Guessed> extends [] ? `you lose! ${Word}`
  : Reveal<Word, Guessed> extends `${string}_${string}` ? `${Reveal<Word, Guessed>}  ${Hearts<Lives<Word, Guessed>>}`
  : `you win! ${Word}`

type Choices<Word extends string, Guessed extends string> =
  Display<Word, Guessed> extends `${string}_${string}` ? Exclude<Letter, Guessed> : Display<Word, Guessed>

type IsAny<T> = boolean extends (T extends never ? true : false) ? true : false

type OneLetter<L, All = L> =
  IsAny<L> extends true ? never : L extends unknown ? ([All] extends [L] ? L : never) : never

interface Game<View extends string, Guessed extends string, Scrambled extends string> {
  screen: View
  guess<L extends Choices<Unscramble<Scrambled>, Guessed>>(
    letter: L,
  ): Game<
    Display<Unscramble<Scrambled>, Guessed | OneLetter<L>>,
    Guessed | OneLetter<L>,
    Scrambled
  >
}

declare function hangman(): Game<Display<Unscramble<"lfzcpbse">, never>, never, "lfzcpbse">
