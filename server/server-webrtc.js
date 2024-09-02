const express = require('express')
const http = require('http')
const WebSocket = require('ws')
const { RTCPeerConnection, RTCSessionDescription } = require('wrtc')
const protobuf = require('protobufjs')
const path = require('path')

const app = express()
const server = http.createServer(app)
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

// Load the Protocol Buffer schema
const root = protobuf.loadSync(path.join(__dirname, '../src/gameState.json'))
const GameState = root.lookupType('GameState')

const peerConnections = {}

function createPeerConnection (playerId) {
  const peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  })

  peerConnection.onicecandidate = event => {
    if (event.candidate) {
      const ws = peerConnections[playerId].ws
      ws.send(
        JSON.stringify({ type: 'ice-candidate', candidate: event.candidate })
      )
    }
  }

  peerConnection.ondatachannel = event => {
    const dataChannel = event.channel
    setupDataChannel(dataChannel, playerId)
  }

  return peerConnection
}

function setupDataChannel (dataChannel, playerId) {
  dataChannel.onopen = () =>
    console.log(`Data channel open for player ${playerId}`)
  dataChannel.onclose = () =>
    console.log(`Data channel closed for player ${playerId}`)

  dataChannel.onmessage = event => {
    const data = JSON.parse(event.data)
    if (data.type === 'input') {
      gameState.players[playerId].input = new Set(data.input)
    }
  }

  peerConnections[playerId].dataChannel = dataChannel
}

wss.on('connection', ws => {
  console.log('Connection')
  const playerId = Date.now().toString()
  const team = Object.keys(gameState.players).length % 2 === 0 ? 'red' : 'blue'

  gameState.players[playerId] = {
    x: team === 'red' ? 100 : FIELD_WIDTH - 100,
    y: FIELD_HEIGHT / 2,
    vx: 0,
    vy: 0,
    radius: PLAYER_RADIUS,
    team,
    input: new Set()
  }

  const peerConnection = createPeerConnection(playerId)
  peerConnections[playerId] = { pc: peerConnection, ws }

  ws.on('message', async message => {
    const data = JSON.parse(message)
    console.log(data)

    if (data.type === 'offer') {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(data.offer)
      )
      const answer = await peerConnection.createAnswer()
      await peerConnection.setLocalDescription(answer)
      ws.send(JSON.stringify({ type: 'answer', answer }))
    } else if (data.type === 'ice-candidate') {
      await peerConnection.addIceCandidate(data.candidate)
    }
  })

  ws.on('close', () => {
    delete gameState.players[playerId]
    if (peerConnections[playerId]) {
      peerConnections[playerId].pc.close()
      delete peerConnections[playerId]
    }
  })
})

function updateGameState (deltaTime) {
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

    player.x = Math.max(
      PLAYER_RADIUS,
      Math.min(FIELD_WIDTH - PLAYER_RADIUS, player.x)
    )
    player.y = Math.max(
      PLAYER_RADIUS,
      Math.min(FIELD_HEIGHT - PLAYER_RADIUS, player.y)
    )
  })

  // Update ball position and check for collisions (implement these functions as in your original code)
  // updateBallPosition(deltaTime);
  // checkCollisions();
  // checkGoals();
}

function broadcastGameState () {
  const now = Date.now()
  const protoGameState = {
    players: Object.entries(gameState.players).reduce((acc, [id, player]) => {
      acc[id] = {
        object: {
          position: { x: player.x, y: player.y },
          velocity: { x: player.vx, y: player.vy },
          radius: player.radius
        },
        team: player.team,
        input: Array.from(player.input) // Include player input
      }
      return acc
    }, {}),
    ball: {
      position: { x: gameState.ball.x, y: gameState.ball.y },
      velocity: { x: gameState.ball.vx, y: gameState.ball.vy },
      radius: gameState.ball.radius
    },
    score: gameState.score,
    timestamp: now
  }

  const message = GameState.create(protoGameState)
  const buffer = GameState.encode(message).finish()

  Object.values(peerConnections).forEach(({ dataChannel }) => {
    if (dataChannel && dataChannel.readyState === 'open') {
      dataChannel.send(buffer) // Send the buffer directly
    }
  })
}

const FPS = 60 // Increase update rate
const INTERPOLATION_DELAY = 100 // ms

setInterval(() => {
  updateGameState(1000 / FPS)
  broadcastGameState()
}, 1000 / FPS)

server.listen(8080, () => {
  console.log('Server is listening on port 8080')
})
