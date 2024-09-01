const WebSocket = require('ws')
const http = require('http')
const protobuf = require('protobufjs')
const path = require('path')

const server = http.createServer()
const wss = new WebSocket.Server({ server })

const FIELD_WIDTH = 800
const FIELD_HEIGHT = 400
const PLAYER_RADIUS = 20
const BALL_RADIUS = 15
const PLAYER_SPEED = 0.1
const FRICTION = 0.98
const BALL_WEIGHT = 0.2
const KICK_POWER = 2
const MAX_BALL_SPEED = 10
const BALL_PLAYER_RESTITUTION = 0.3

let gameState = {
  players: {},
  ball: {
    x: FIELD_WIDTH / 2,
    y: FIELD_HEIGHT / 2,
    vx: 0,
    vy: 0,
    radius: BALL_RADIUS
  },
  score: { red: 0, blue: 0 }
}

let lastSentState = JSON.parse(JSON.stringify(gameState))

// Load the Protocol Buffer schema
const root = protobuf.loadSync(path.join(__dirname, '../src/gameState.json'))
const GameState = root.lookupType('GameState')

function updateGameState (deltaTime) {
  // Update player positions
  Object.values(gameState.players).forEach(player => {
    player.x += player.vx * deltaTime
    player.y += player.vy * deltaTime

    // Apply boundary checks
    player.x = Math.max(
      PLAYER_RADIUS,
      Math.min(FIELD_WIDTH - PLAYER_RADIUS, player.x)
    )
    player.y = Math.max(
      PLAYER_RADIUS,
      Math.min(FIELD_HEIGHT - PLAYER_RADIUS, player.y)
    )

    // Apply friction
    player.vx *= FRICTION
    player.vy *= FRICTION
  })

  // Update ball position
  gameState.ball.x += gameState.ball.vx * deltaTime * BALL_WEIGHT
  gameState.ball.y += gameState.ball.vy * deltaTime * BALL_WEIGHT

  // Ball boundary checks
  if (
    gameState.ball.x - BALL_RADIUS < 0 ||
    gameState.ball.x + BALL_RADIUS > FIELD_WIDTH
  ) {
    gameState.ball.vx *= -0.5
    gameState.ball.x =
      gameState.ball.x - BALL_RADIUS < 0
        ? BALL_RADIUS
        : FIELD_WIDTH - BALL_RADIUS
  }
  if (
    gameState.ball.y - BALL_RADIUS < 0 ||
    gameState.ball.y + BALL_RADIUS > FIELD_HEIGHT
  ) {
    gameState.ball.vy *= -0.5
    gameState.ball.y =
      gameState.ball.y - BALL_RADIUS < 0
        ? BALL_RADIUS
        : FIELD_HEIGHT - BALL_RADIUS
  }

  // Apply friction to ball
  gameState.ball.vx *= FRICTION
  gameState.ball.vy *= FRICTION

  // Check for collisions
  checkCollisions()

  // Check for goals
  checkGoals()
}

function checkCollisions () {
  Object.values(gameState.players).forEach(player => {
    const dx = gameState.ball.x - player.x
    const dy = gameState.ball.y - player.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance < player.radius + gameState.ball.radius) {
      // Collision detected
      const angle = Math.atan2(dy, dx)
      const targetX =
        player.x + Math.cos(angle) * (player.radius + gameState.ball.radius)
      const targetY =
        player.y + Math.sin(angle) * (player.radius + gameState.ball.radius)

      // Move the ball outside of the player
      gameState.ball.x = targetX
      gameState.ball.y = targetY

      // Calculate player speed and direction
      const playerSpeed = Math.sqrt(
        player.vx * player.vx + player.vy * player.vy
      )
      const playerAngle = Math.atan2(player.vy, player.vx)

      // Apply kick
      gameState.ball.vx = player.vx + Math.cos(playerAngle) * KICK_POWER
      gameState.ball.vy = player.vy + Math.sin(playerAngle) * KICK_POWER

      // Apply restitution
      gameState.ball.vx *= BALL_PLAYER_RESTITUTION
      gameState.ball.vy *= BALL_PLAYER_RESTITUTION
    }
  })
}

function checkGoals () {
  if (gameState.ball.x - BALL_RADIUS <= 0) {
    gameState.score.blue++
    resetBall()
  } else if (gameState.ball.x + BALL_RADIUS >= FIELD_WIDTH) {
    gameState.score.red++
    resetBall()
  }
}

function resetBall () {
  gameState.ball = {
    x: FIELD_WIDTH / 2,
    y: FIELD_HEIGHT / 2,
    vx: 0,
    vy: 0,
    radius: BALL_RADIUS
  }
}

function broadcastGameState () {
  // Convert the full gameState to the format expected by Protocol Buffers
  const protoGameState = {
    players: Object.entries(gameState.players).reduce((acc, [id, player]) => {
      acc[id] = {
        object: {
          position: { x: player.x, y: player.y },
          velocity: { x: player.vx, y: player.vy },
          radius: player.radius
        },
        team: player.team
      }
      return acc
    }, {}),
    ball: {
      position: { x: gameState.ball.x, y: gameState.ball.y },
      velocity: { x: gameState.ball.vx, y: gameState.ball.vy },
      radius: gameState.ball.radius
    },
    score: gameState.score
  }

  console.log('Sending state:', protoGameState) // Add this line for debugging

  const message = GameState.create(protoGameState)
  const buffer = GameState.encode(message).finish()

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(buffer)
    }
  })

  lastSentState = JSON.parse(JSON.stringify(gameState))
}

function computeDelta (currentState, lastState) {
  // For simplicity, we'll always return the full state
  // This ensures that all clients always have the most up-to-date information
  return currentState
}

wss.on('connection', ws => {
  const playerId = Date.now().toString()
  const team = Object.keys(gameState.players).length % 2 === 0 ? 'red' : 'blue'

  gameState.players[playerId] = {
    x: team === 'red' ? 100 : FIELD_WIDTH - 100,
    y: FIELD_HEIGHT / 2,
    vx: 0,
    vy: 0,
    radius: PLAYER_RADIUS,
    team,
    input: new Set() // Add this to track player input
  }

  ws.on('message', message => {
    const data = JSON.parse(message)
    if (data.type === 'input') {
      gameState.players[playerId].input = new Set(data.input)
    }
  })

  ws.on('close', () => {
    delete gameState.players[playerId]
  })
})

function updateGameState (deltaTime) {
  // Update player positions based on their inputs
  Object.values(gameState.players).forEach(player => {
    player.vx = 0
    player.vy = 0
    if (player.input.has('w') || player.input.has('arrowup'))
      player.vy -= PLAYER_SPEED
    if (player.input.has('s') || player.input.has('arrowdown'))
      player.vy += PLAYER_SPEED
    if (player.input.has('a') || player.input.has('arrowleft'))
      player.vx -= PLAYER_SPEED
    if (player.input.has('d') || player.input.has('arrowright'))
      player.vx += PLAYER_SPEED

    player.x += player.vx * deltaTime
    player.y += player.vy * deltaTime

    // Apply boundary checks
    player.x = Math.max(
      PLAYER_RADIUS,
      Math.min(FIELD_WIDTH - PLAYER_RADIUS, player.x)
    )
    player.y = Math.max(
      PLAYER_RADIUS,
      Math.min(FIELD_HEIGHT - PLAYER_RADIUS, player.y)
    )
  })
}

const FPS = 30
setInterval(() => {
  updateGameState(1000 / FPS)
  broadcastGameState()
}, 1000 / FPS)

server.listen(8080, () => {
  console.log('Server is listening on port 8080')
})
