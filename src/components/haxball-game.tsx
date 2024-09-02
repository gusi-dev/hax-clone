'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import * as protobuf from 'protobufjs'
import gameStateJSON from '../gameState.json'

const FIELD_WIDTH = 800
const FIELD_HEIGHT = 400
const PLAYER_RADIUS = 20
const BALL_RADIUS = 15
const GOAL_WIDTH = 100
const GOAL_HEIGHT = 150

const EXTENDED_FIELD_WIDTH = FIELD_WIDTH + PLAYER_RADIUS * 2
const EXTENDED_FIELD_HEIGHT = FIELD_HEIGHT + PLAYER_RADIUS * 2

interface GameObject {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
}

interface GameState {
  players: { [key: string]: GameObject & { team: string } }
  ball: GameObject
  score: { red: number; blue: number }
}

// Load the Protocol Buffer schema
const root = protobuf.Root.fromJSON(gameStateJSON)
const GameState = root.lookupType('GameState')

const FPS = 60
const INTERPOLATION_DELAY = 100 // ms

interface InterpolatedGameState extends GameState {
  lastUpdateTime: number
  serverTime: number
}

export function HaxballGame () {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<GameState>({
    players: {},
    ball: {
      x: FIELD_WIDTH / 2,
      y: FIELD_HEIGHT / 2,
      vx: 0,
      vy: 0,
      radius: BALL_RADIUS
    },
    score: { red: 0, blue: 0 }
  })
  const [interpolatedState, setInterpolatedState] =
    useState<InterpolatedGameState>({
      players: {},
      ball: {
        x: FIELD_WIDTH / 2,
        y: FIELD_HEIGHT / 2,
        vx: 0,
        vy: 0,
        radius: BALL_RADIUS
      },
      score: { red: 0, blue: 0 },
      lastUpdateTime: Date.now(),
      serverTime: Date.now()
    })
  const wsRef = useRef<WebSocket | null>(null)
  const playerIdRef = useRef<string | null>(null)
  const keysPressed = useRef<Set<string>>(new Set())
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const [serverTimeOffset, setServerTimeOffset] = useState(0)

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080')
    wsRef.current = ws

    ws.onopen = async () => {
      console.log('Connected to signaling server')
      await setupWebRTC()
    }

    ws.onmessage = async event => {
      const data = JSON.parse(event.data)

      if (data.type === 'offer') {
        await handleOffer(data.offer)
      } else if (data.type === 'answer') {
        await peerConnectionRef.current?.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        )
      } else if (data.type === 'ice-candidate') {
        await peerConnectionRef.current?.addIceCandidate(data.candidate)
      }
    }

    return () => {
      ws.close()
      peerConnectionRef.current?.close()
    }
  }, [])

  const setupWebRTC = async () => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    })
    peerConnectionRef.current = peerConnection

    peerConnection.onicecandidate = event => {
      if (event.candidate) {
        wsRef.current?.send(
          JSON.stringify({ type: 'ice-candidate', candidate: event.candidate })
        )
      }
    }

    const dataChannel = peerConnection.createDataChannel('gameState')
    dataChannelRef.current = dataChannel

    dataChannel.onopen = () => console.log('Data channel open')
    dataChannel.onclose = () => console.log('Data channel closed')
    dataChannel.onmessage = handleGameStateUpdate

    const offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)
    wsRef.current?.send(JSON.stringify({ type: 'offer', offer }))
  }

  const handleOffer = async (offer: RTCSessionDescriptionInit) => {
    await peerConnectionRef.current?.setRemoteDescription(
      new RTCSessionDescription(offer)
    )
    const answer = await peerConnectionRef.current?.createAnswer()
    await peerConnectionRef.current?.setLocalDescription(answer)
    wsRef.current?.send(JSON.stringify({ type: 'answer', answer }))
  }

  const handleGameStateUpdate = async (event: MessageEvent) => {
    let buffer: Uint8Array

    if (event.data instanceof ArrayBuffer) {
      buffer = new Uint8Array(event.data)
    } else if (event.data instanceof Blob) {
      const arrayBuffer = await event.data.arrayBuffer()
      buffer = new Uint8Array(arrayBuffer)
    } else if (typeof event.data === 'string') {
      try {
        const parsedData = JSON.parse(event.data)
        console.log('Received JSON data:', parsedData)
        // Handle JSON data if needed
        return
      } catch (error) {
        console.error('Error parsing JSON:', error)
        return
      }
    } else {
      console.error('Unsupported data type:', typeof event.data)
      return
    }

    try {
      const decodedMessage = GameState.decode(buffer)
      const receivedState = GameState.toObject(decodedMessage, {
        longs: String,
        enums: String,
        bytes: String
      })

      const serverTime = receivedState.timestamp
      const clientTime = Date.now()
      const newOffset = serverTime - clientTime
      setServerTimeOffset(prevOffset => (prevOffset + newOffset) / 2)

      const newGameState: GameState = {
        players: Object.entries(receivedState.players || {}).reduce(
          (acc, [id, player]) => {
            acc[id] = {
              x: player.object.position.x,
              y: player.object.position.y,
              vx: player.object.velocity.x,
              vy: player.object.velocity.y,
              radius: player.object.radius,
              team: player.team
            }
            return acc
          },
          {}
        ),
        ball: receivedState.ball
          ? {
              x: receivedState.ball.position.x,
              y: receivedState.ball.position.y,
              vx: receivedState.ball.velocity.x,
              vy: receivedState.ball.velocity.y,
              radius: receivedState.ball.radius
            }
          : gameState.ball,
        score: receivedState.score || gameState.score
      }

      setGameState(newGameState)
      setInterpolatedState(prevState => ({
        ...newGameState,
        lastUpdateTime: Date.now(),
        serverTime: serverTime
      }))
    } catch (error) {
      console.error('Error decoding message:', error)
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current.add(e.key.toLowerCase())
      sendInputToServer()
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.key.toLowerCase())
      sendInputToServer()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  const sendInputToServer = () => {
    if (dataChannelRef.current?.readyState === 'open') {
      dataChannelRef.current.send(
        JSON.stringify({
          type: 'input',
          input: Array.from(keysPressed.current)
        })
      )
    }
  }

  useEffect(() => {
    let animationFrameId: number

    const interpolate = () => {
      const now = Date.now()
      const serverNow = now + serverTimeOffset
      const renderTimestamp = serverNow - INTERPOLATION_DELAY

      const timeSinceLastUpdate = renderTimestamp - interpolatedState.serverTime
      const interpolationFactor = Math.min(
        timeSinceLastUpdate / (1000 / FPS),
        1
      )

      const newInterpolatedState = {
        players: Object.entries(gameState.players).reduce(
          (acc, [id, player]) => {
            const prevPlayer = interpolatedState.players[id]
            if (prevPlayer) {
              acc[id] = {
                x:
                  prevPlayer.x +
                  (player.x - prevPlayer.x) * interpolationFactor,
                y:
                  prevPlayer.y +
                  (player.y - prevPlayer.y) * interpolationFactor,
                vx: player.vx,
                vy: player.vy,
                radius: player.radius,
                team: player.team
              }
            } else {
              acc[id] = player
            }
            return acc
          },
          {}
        ),
        ball: {
          x:
            interpolatedState.ball.x +
            (gameState.ball.x - interpolatedState.ball.x) * interpolationFactor,
          y:
            interpolatedState.ball.y +
            (gameState.ball.y - interpolatedState.ball.y) * interpolationFactor,
          vx: gameState.ball.vx,
          vy: gameState.ball.vy,
          radius: gameState.ball.radius
        },
        score: gameState.score,
        lastUpdateTime: interpolatedState.lastUpdateTime,
        serverTime: interpolatedState.serverTime
      }

      setInterpolatedState(newInterpolatedState)
      animationFrameId = requestAnimationFrame(interpolate)
    }

    animationFrameId = requestAnimationFrame(interpolate)

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [gameState, interpolatedState, serverTimeOffset])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const drawGame = () => {
      // Clear and fill the entire canvas with green
      ctx.fillStyle = '#4CAF50'
      ctx.fillRect(0, 0, EXTENDED_FIELD_WIDTH, EXTENDED_FIELD_HEIGHT)

      // Draw the actual field boundaries
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 2
      ctx.strokeRect(PLAYER_RADIUS, PLAYER_RADIUS, FIELD_WIDTH, FIELD_HEIGHT)

      // Draw center line
      ctx.beginPath()
      ctx.moveTo(EXTENDED_FIELD_WIDTH / 2, PLAYER_RADIUS)
      ctx.lineTo(
        EXTENDED_FIELD_WIDTH / 2,
        EXTENDED_FIELD_HEIGHT - PLAYER_RADIUS
      )
      ctx.stroke()

      // Draw center circle
      ctx.beginPath()
      ctx.arc(
        EXTENDED_FIELD_WIDTH / 2,
        EXTENDED_FIELD_HEIGHT / 2,
        50,
        0,
        Math.PI * 2
      )
      ctx.stroke()

      // Draw goals
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 2

      // Left goal
      ctx.beginPath()
      ctx.moveTo(PLAYER_RADIUS, EXTENDED_FIELD_HEIGHT / 2 - GOAL_HEIGHT / 2)
      ctx.lineTo(0, EXTENDED_FIELD_HEIGHT / 2 - GOAL_HEIGHT / 2)
      ctx.lineTo(0, EXTENDED_FIELD_HEIGHT / 2 + GOAL_HEIGHT / 2)
      ctx.lineTo(PLAYER_RADIUS, EXTENDED_FIELD_HEIGHT / 2 + GOAL_HEIGHT / 2)
      ctx.stroke()

      // Right goal
      ctx.beginPath()
      ctx.moveTo(
        EXTENDED_FIELD_WIDTH - PLAYER_RADIUS,
        EXTENDED_FIELD_HEIGHT / 2 - GOAL_HEIGHT / 2
      )
      ctx.lineTo(
        EXTENDED_FIELD_WIDTH,
        EXTENDED_FIELD_HEIGHT / 2 - GOAL_HEIGHT / 2
      )
      ctx.lineTo(
        EXTENDED_FIELD_WIDTH,
        EXTENDED_FIELD_HEIGHT / 2 + GOAL_HEIGHT / 2
      )
      ctx.lineTo(
        EXTENDED_FIELD_WIDTH - PLAYER_RADIUS,
        EXTENDED_FIELD_HEIGHT / 2 + GOAL_HEIGHT / 2
      )
      ctx.stroke()

      // Draw players
      Object.entries(interpolatedState.players).forEach(([id, player]) => {
        ctx.fillStyle = player.team === 'red' ? 'red' : 'blue'
        ctx.beginPath()
        ctx.arc(
          player.x + PLAYER_RADIUS,
          player.y + PLAYER_RADIUS,
          PLAYER_RADIUS,
          0,
          Math.PI * 2
        )
        ctx.fill()
      })

      // Draw ball
      ctx.fillStyle = 'white'
      ctx.beginPath()
      ctx.arc(
        interpolatedState.ball.x + PLAYER_RADIUS,
        interpolatedState.ball.y + PLAYER_RADIUS,
        BALL_RADIUS,
        0,
        Math.PI * 2
      )
      ctx.fill()
    }

    const gameLoop = () => {
      drawGame()
      requestAnimationFrame(gameLoop)
    }

    gameLoop()
  }, [interpolatedState])

  return (
    <div className='flex flex-col items-center justify-center min-h-screen bg-gray-100'>
      <div className='mb-4 text-2xl font-bold'>
        Red {gameState.score.red} - {gameState.score.blue} Blue
      </div>
      <canvas
        ref={canvasRef}
        width={EXTENDED_FIELD_WIDTH}
        height={EXTENDED_FIELD_HEIGHT}
        className='border border-gray-300 shadow-lg'
      />
      <div className='mt-4 text-sm text-gray-600'>
        Red: WASD to move | Blue: Arrow keys to move
      </div>
    </div>
  )
}
