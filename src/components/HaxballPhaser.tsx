'use client'

import React, { useEffect, useRef } from 'react'
import Phaser from 'phaser'

const FIELD_WIDTH = 800
const FIELD_HEIGHT = 400
const PLAYER_RADIUS = 20
const BALL_RADIUS = 15
const GOAL_WIDTH = 100
const GOAL_HEIGHT = 150
const GOAL_DEPTH = 50
const PLAYER_SPEED = 200
const BALL_SPEED = 400
const BALL_FRICTION = 0.99
const BALL_KICK_POWER = 200
const BALL_TOUCH_POWER = 50

class HaxballScene extends Phaser.Scene {
  player1!: Phaser.GameObjects.Arc
  player2!: Phaser.GameObjects.Arc
  ball!: Phaser.GameObjects.Arc
  cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  wasd!: {
    W: Phaser.Input.Keyboard.Key
    A: Phaser.Input.Keyboard.Key
    S: Phaser.Input.Keyboard.Key
    D: Phaser.Input.Keyboard.Key
  }
  scoreText!: Phaser.GameObjects.Text
  score = { red: 0, blue: 0 }

  constructor () {
    super('HaxballScene')
  }

  create () {
    // Create field
    this.add.rectangle(
      FIELD_WIDTH / 2,
      FIELD_HEIGHT / 2,
      FIELD_WIDTH,
      FIELD_HEIGHT,
      0x4caf50
    )
    this.add.line(FIELD_WIDTH / 2, 0, 0, 0, 0, FIELD_HEIGHT, 0xffffff)
    this.add
      .circle(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, 50)
      .setStrokeStyle(2, 0xffffff)

    // Create goals
    this.createGoal(0, FIELD_HEIGHT / 2, -1) // Left goal
    this.createGoal(FIELD_WIDTH, FIELD_HEIGHT / 2, 1) // Right goal

    // Create players
    this.player1 = this.add.circle(
      100,
      FIELD_HEIGHT / 2,
      PLAYER_RADIUS,
      0xff0000
    )
    this.player2 = this.add.circle(
      FIELD_WIDTH - 100,
      FIELD_HEIGHT / 2,
      PLAYER_RADIUS,
      0x0000ff
    )
    this.physics.add.existing(this.player1)
    this.physics.add.existing(this.player2)

    // Create ball
    this.ball = this.add.circle(
      FIELD_WIDTH / 2,
      FIELD_HEIGHT / 2,
      BALL_RADIUS,
      0xffffff
    )
    this.physics.add.existing(this.ball)

    // Modify ball physics
    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body
    ballBody.setCircle(BALL_RADIUS)
    ballBody.setBounce(0.5)
    ballBody.setFriction(50, 50)
    ballBody.setDamping(true)
    ballBody.setDrag(0.99)

    // Set up collisions
    this.physics.add.collider(this.player1, this.player2)
    this.physics.add.collider(
      this.player1,
      this.ball,
      this.handleBallCollision,
      undefined,
      this
    )
    this.physics.add.collider(
      this.player2,
      this.ball,
      this.handleBallCollision,
      undefined,
      this
    )

    // Set up input
    this.cursors = this.input.keyboard.createCursorKeys()
    this.wasd = this.input.keyboard.addKeys('W,A,S,D') as {
      W: Phaser.Input.Keyboard.Key
      A: Phaser.Input.Keyboard.Key
      S: Phaser.Input.Keyboard.Key
      D: Phaser.Input.Keyboard.Key
    }

    // Set up score text
    this.scoreText = this.add
      .text(FIELD_WIDTH / 2, 20, '0 - 0', { fontSize: '32px' })
      .setOrigin(0.5)

    // Set up world bounds
    this.physics.world.setBounds(0, 0, FIELD_WIDTH, FIELD_HEIGHT)
    ;(this.player1.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(
      true
    )
    ;(this.player2.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(
      true
    )
    ;(this.ball.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true)
    ;(this.ball.body as Phaser.Physics.Arcade.Body).setBounce(1)
  }

  createGoal (x: number, y: number, direction: number) {
    const points = [
      new Phaser.Math.Vector2(x, y - GOAL_HEIGHT / 2),
      new Phaser.Math.Vector2(x + direction * GOAL_DEPTH, y - GOAL_HEIGHT / 2),
      new Phaser.Math.Vector2(x + direction * GOAL_DEPTH, y + GOAL_HEIGHT / 2),
      new Phaser.Math.Vector2(x, y + GOAL_HEIGHT / 2)
    ]
    this.add.polygon(0, 0, points, 0x000000, 0).setStrokeStyle(2, 0xffffff)
  }

  handleBallCollision (
    player: Phaser.GameObjects.Arc,
    ball: Phaser.GameObjects.Arc
  ) {
    const playerBody = player.body as Phaser.Physics.Arcade.Body
    const ballBody = ball.body as Phaser.Physics.Arcade.Body

    const angle = Phaser.Math.Angle.Between(player.x, player.y, ball.x, ball.y)
    const playerSpeed = playerBody.velocity.length()

    if (playerSpeed > 10) {
      // Player is moving, apply a kick
      const kickPower = (playerSpeed * BALL_KICK_POWER) / 100
      ballBody.setVelocity(
        Math.cos(angle) * kickPower,
        Math.sin(angle) * kickPower
      )
    } else {
      // Player is not moving or moving very slowly, apply a slight touch
      ballBody.setVelocity(
        ballBody.velocity.x + Math.cos(angle) * BALL_TOUCH_POWER,
        ballBody.velocity.y + Math.sin(angle) * BALL_TOUCH_POWER - 20 // Slight upward movement
      )
    }
  }

  update () {
    // Player 1 movement
    if (this.wasd.A.isDown) {
      ;(this.player1.body as Phaser.Physics.Arcade.Body).setVelocityX(
        -PLAYER_SPEED
      )
    } else if (this.wasd.D.isDown) {
      ;(this.player1.body as Phaser.Physics.Arcade.Body).setVelocityX(
        PLAYER_SPEED
      )
    } else {
      ;(this.player1.body as Phaser.Physics.Arcade.Body).setVelocityX(0)
    }

    if (this.wasd.W.isDown) {
      ;(this.player1.body as Phaser.Physics.Arcade.Body).setVelocityY(
        -PLAYER_SPEED
      )
    } else if (this.wasd.S.isDown) {
      ;(this.player1.body as Phaser.Physics.Arcade.Body).setVelocityY(
        PLAYER_SPEED
      )
    } else {
      ;(this.player1.body as Phaser.Physics.Arcade.Body).setVelocityY(0)
    }

    // Player 2 movement
    if (this.cursors.left.isDown) {
      ;(this.player2.body as Phaser.Physics.Arcade.Body).setVelocityX(
        -PLAYER_SPEED
      )
    } else if (this.cursors.right.isDown) {
      ;(this.player2.body as Phaser.Physics.Arcade.Body).setVelocityX(
        PLAYER_SPEED
      )
    } else {
      ;(this.player2.body as Phaser.Physics.Arcade.Body).setVelocityX(0)
    }

    if (this.cursors.up.isDown) {
      ;(this.player2.body as Phaser.Physics.Arcade.Body).setVelocityY(
        -PLAYER_SPEED
      )
    } else if (this.cursors.down.isDown) {
      ;(this.player2.body as Phaser.Physics.Arcade.Body).setVelocityY(
        PLAYER_SPEED
      )
    } else {
      ;(this.player2.body as Phaser.Physics.Arcade.Body).setVelocityY(0)
    }

    // Check for goals
    if (
      this.ball.x <= 0 &&
      this.ball.y > FIELD_HEIGHT / 2 - GOAL_HEIGHT / 2 &&
      this.ball.y < FIELD_HEIGHT / 2 + GOAL_HEIGHT / 2
    ) {
      this.score.blue++
      this.resetBall()
    } else if (
      this.ball.x >= FIELD_WIDTH &&
      this.ball.y > FIELD_HEIGHT / 2 - GOAL_HEIGHT / 2 &&
      this.ball.y < FIELD_HEIGHT / 2 + GOAL_HEIGHT / 2
    ) {
      this.score.red++
      this.resetBall()
    }

    // Update score text
    this.scoreText.setText(`${this.score.red} - ${this.score.blue}`)

    // Apply friction to the ball
    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body
    ballBody.setVelocity(
      ballBody.velocity.x * BALL_FRICTION,
      ballBody.velocity.y * BALL_FRICTION
    )
  }

  resetBall () {
    this.ball.setPosition(FIELD_WIDTH / 2, FIELD_HEIGHT / 2)
    ;(this.ball.body as Phaser.Physics.Arcade.Body).setVelocity(0)
  }
}

export function HaxballPhaser () {
  const gameRef = useRef<Phaser.Game | null>(null)

  useEffect(() => {
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: FIELD_WIDTH,
      height: FIELD_HEIGHT,
      parent: 'game-container',
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { y: 0 },
          debug: false
        }
      },
      scene: HaxballScene
    }

    gameRef.current = new Phaser.Game(config)

    return () => {
      gameRef.current?.destroy(true)
    }
  }, [])

  return (
    <div className='flex flex-col items-center justify-center min-h-screen bg-gray-100'>
      <div id='game-container'></div>
      <div className='mt-4 text-sm text-gray-600'>
        Red: WASD to move | Blue: Arrow keys to move
      </div>
    </div>
  )
}
