export interface GameObject {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
}

export interface GameState {
  players: { [key: string]: GameObject & { team: string; input: string[] } }
  ball: GameObject
  score: { red: number; blue: number }
  timestamp: number
}

export interface PlayerState {
  i: string
  x: number
  y: number
  vx: number
  vy: number
  t: string
}

export interface BallState {
  x: number
  y: number
  vx: number
  vy: number
}

export interface MinimalGameState {
  p: PlayerState[]
  b: BallState
  s: { red: number; blue: number }
  t: number
}
