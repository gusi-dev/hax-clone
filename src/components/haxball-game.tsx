'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

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
  const wsRef = useRef<WebSocket | null>(null)
  const keysPressed = useRef<Set<string>>(new Set())
  const lastUpdateTime = useRef<number>(Date.now())
  const interpolatedState = useRef<GameState>(gameState)

  useEffect(() => {
    wsRef.current = new WebSocket('ws://localhost:8080')

    wsRef.current.onopen = () => {
      console.log('Connected to server')
    }

    wsRef.current.onmessage = event => {
      const newGameState: GameState = JSON.parse(event.data)
      setGameState(prevState => {
        interpolatedState.current = { ...prevState }
        lastUpdateTime.current = Date.now()
        return newGameState
      })
    }

    wsRef.current.onclose = () => {
      console.log('Disconnected from server')
    }

    return () => {
      wsRef.current?.close()
    }
  }, [])

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
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'input',
          input: Array.from(keysPressed.current)
        })
      )
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const drawGame = () => {
      const now = Date.now()
      const delta = (now - lastUpdateTime.current) / (1000 / 30) // Assuming 30 FPS server updates

      // Interpolate game state
      Object.entries(gameState.players).forEach(([id, player]) => {
        if (!interpolatedState.current.players[id]) {
          interpolatedState.current.players[id] = { ...player }
        } else {
          interpolatedState.current.players[id].x += player.vx * delta
          interpolatedState.current.players[id].y += player.vy * delta
        }
      })

      interpolatedState.current.ball.x += gameState.ball.vx * delta
      interpolatedState.current.ball.y += gameState.ball.vy * delta

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

      // Draw players using interpolated state
      Object.values(interpolatedState.current.players).forEach(player => {
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

      // Draw ball using interpolated state
      ctx.fillStyle = 'white'
      ctx.beginPath()
      ctx.arc(
        interpolatedState.current.ball.x + PLAYER_RADIUS,
        interpolatedState.current.ball.y + PLAYER_RADIUS,
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
  }, [gameState])

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
