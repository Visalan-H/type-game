// add .play("") to line 4, then press ctrl+space inside the quotes
// delete the last .play() to undo

const game = ticTacToe().play("5")

game.top
//   ^?
game.middle
//   ^?
game.bottom
//   ^?
game.status
//   ^?






























type Mark = "X" | "O"

type Board = string[]

type Start = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]

type Order = ["5", "1", "3", "7", "9", "2", "4", "6", "8"]

type Lines = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

type Other<M extends Mark> = M extends "X" ? "O" : "X"

type Free<B extends Board> = Exclude<B[number], Mark>

type Place<B extends Board, C, M extends Mark> = { [K in keyof B]: B[K] extends C ? M : B[K] }

type Line<B extends Board, L> =
  L extends [infer I extends number, infer J extends number, infer K extends number] ? [B[I], B[J], B[K]] : never

type Wins<B extends Board, M extends Mark> = [M, M, M] extends Line<B, Lines[number]> ? true : false

type Full<B extends Board> = [Free<B>] extends [never] ? true : false

type Outcome<B extends Board, M extends Mark, Stop = M> =
  Wins<B, Other<M>> extends true ? Other<M>
  : Full<B> extends true ? "draw"
  : Search<B, M, Stop>

type StopAt<M extends Mark, Best> = Best extends "draw" ? M | "draw" : M

type Search<B extends Board, M extends Mark, Stop, Left = Order, Best = Other<M>> =
  Left extends [infer C extends string, ...infer Rest]
    ? C extends Free<B>
      ? Outcome<Place<B, C, M>, Other<M>, StopAt<Other<M>, Best>> extends infer Result
        ? Result extends Stop ? Result : Search<B, M, Stop, Rest, Result extends "draw" ? "draw" : Best>
        : never
      : Search<B, M, Stop, Rest, Best>
    : Best

type Score<B extends Board> = Wins<B, "O"> extends true ? "win now" : Outcome<B, "X">

type CanWinNow<B extends Board, C = Free<B>> = C extends string ? Wins<Place<B, C, "O">, "O"> : never

type Goal<B extends Board> = true extends CanWinNow<B> ? "win now" : Outcome<B, "O">

type Reply<B extends Board, Target = Goal<B>, Left = Order> =
  Left extends [infer C extends string, ...infer Rest]
    ? C extends Free<B>
      ? Score<Place<B, C, "O">> extends Target ? C : Reply<B, Target, Rest>
      : Reply<B, Target, Rest>
    : never

type Status<B extends Board> =
  Wins<B, "X"> extends true ? "you win"
  : Wins<B, "O"> extends true ? "TypeScript wins"
  : Full<B> extends true ? "draw"
  : "your move"

type Moves<B extends Board> = Status<B> extends "your move" ? Free<B> : { gameOver: Status<B> }

type Respond<B extends Board> = Status<B> extends "your move" ? Place<B, Reply<B>, "O"> : B

type Turn<B extends Board, C> = [C] extends [never] ? B : Respond<Place<B, C, "X">>

type IsAny<T> = boolean extends (T extends never ? true : false) ? true : false

type OneCell<C, All = C> =
  IsAny<C> extends true ? never : C extends string ? ([All] extends [C] ? C : never) : never

type Row<B extends Board, I extends number, J extends number, K extends number> = `${B[I]} │ ${B[J]} │ ${B[K]}`

type Game<B extends Board> = {
  top: Row<B, 0, 1, 2>
  middle: Row<B, 3, 4, 5>
  bottom: Row<B, 6, 7, 8>
  status: Status<B>
  play<C extends Moves<B>>(cell: C): Game<Turn<B, OneCell<C>>>
}

declare function ticTacToe(): Game<Start>
