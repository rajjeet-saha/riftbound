import * as THREE from 'three'
import { Arena } from './Arena'
import { Player } from '../components/Player'
import { RiftBoundRoom, RoomState } from '../multiplayer/GameRoom'

export class GameScene {
  private arena: Arena
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private players: Map<string, Player> = new Map()
  private player: Player | null = null
  private keyboard: { [key: string]: boolean } = {}
  private mouse = { x: 0, y: 0, locked: false }
  private dimensionShiftKey = false
  private lastDimensionShift = 0
  private showUI = true
  private matchTime = 180 // 3 minutes in seconds
  private matchStartTime = 0
  private gamePaused = false
  private hitFeedback = 0

  constructor() {
    // Initialize Three.js
    this.arena = new Arena()
    this.camera = this.arena.getCamera()
    this.renderer = this.arena.getRenderer()

    // Handle window resize
    window.addEventListener('resize', () => this.onResize())

    // Handle keyboard input
    window.addEventListener('keydown', (e) => this.onKeyDown(e))
    window.addEventListener('keyup', (e) => this.onKeyUp(e))

    // Handle mouse input
    window.addEventListener('mousemove', (e) => this.onMouseMove(e))
    window.addEventListener('mousedown', (e) => this.onMouseDown(e))
    window.addEventListener('mouseup', (e) => this.onMouseUp(e))

    // Try to lock mouse for FPS mode
    this.requestMouseLock()

    // Initialize Colyseus room
    this.initMultiplayer()

    // Start game loop
    this.animate()
  }

  private initMultiplayer(): void {
    // Connect to Colyseus room
    // In production, would use a real server URL
    const room = new RiftBoundRoom()

    room.onJoin = (client: any, options: any) => {
      console.log('Player joined room:', client.sessionId)
    }

    room.onMessage = (client: any, message: any) => {
      this.handleServerMessage(client, message)
    }

    room.onError = (error: any) => {
      console.error('Colyseus error:', error)
      // Fallback to local practice mode
      this.showFallbackUI('Multiplayer connection failed. Starting local practice mode.')
    }

    room.onLeave = (client: any) => {
      console.log('Player left room')
    }

    room.onDispose = () => {
      console.log('Room disposed')
    }

    // Join or create a room
    // In a full implementation, would handle room creation/codes here
    room.joinOrCreate('riftbound-match', {}).then(() => {
      console.log('Connected to room:', room.roomId)
    }).catch((error: any) => {
      console.error('Failed to join room:', error)
      this.showFallbackUI('Could not connect to multiplayer. Starting local practice.')
    })
  }

  private handleServerMessage(client: any, message: any): void {
    switch (message.type) {
      case 'playerJoined':
        this.onPlayerJoined(message.playerId, message.position, message.dimension)
        break
      case 'playerMoved':
        this.onPlayerMoved(message.playerId, new THREE.Vector3(...message.position))
        break
      case 'playerAttacked':
        this.onPlayerAttacked(message.playerId)
        break
      case 'playerDefended':
        this.onPlayerDefended(message.playerId)
        break
      case 'dimensionChanged':
        this.onDimensionChanged(message.playerId, message.dimension)
        break
      case 'playerReady':
        this.onPlayerReady(message.playerId, message.ready)
        break
      case 'matchStarted':
        this.onMatchStarted(message.matchId, message.dimension)
        break
      case 'matchTimeUpdate':
        this.matchTime = message.timeLeft
        this.updateMatchUI()
        break
      case 'matchResult':
        this.showMatchResult(message)
        break
      case 'matchReset':
        this.resetMatch()
        break
      case 'playerLeft':
        this.onPlayerLeft(message.playerId)
        break
    }
  }

  private onPlayerJoined(playerId: string, position: THREE.Vector3, dimension: string): void {
    const player = new Player(playerId, position, dimension as 'material' | 'rift')
    this.players.set(playerId, player)
    
    // If this is the first local player, make them the controlled player
    if (!this.player) {
      this.player = player
      this.setupPlayerControls(player)
    }
  }

  private onPlayerMoved(playerId: string, position: THREE.Vector3): void {
    const player = this.players.get(playerId)
    if (player) {
      player.mesh.position.copy(position)
    }
  }

  private onPlayerAttacked(playerId: string): void {
    const player = this.players.get(playerId)
    if (player) {
      player.takeDamage(20)
      this.hitFeedback = 1 // Trigger damage flash
    }
  }

  private onPlayerDefended(playerId: string): void {
    // Visual indicator that player is defending
    const player = this.players.get(playerId)
    if (player) {
      // Could add shield effect
    }
  }

  private onDimensionChanged(playerId: string, dimension: string): void {
    const player = this.players.get(playerId)
    if (player) {
      player.setDimension(dimension as 'material' | 'rift')
    }
  }

  private onPlayerReady(playerId: string, ready: boolean): void {
    // Update ready state UI
  }

  private onMatchStarted(matchId: string, dimension: string): void {
    this.matchStartTime = performance.now()
    this.showUI = false // Hide UI during active match
    this.arena.setDimension(dimension as 'material' | 'rift')
    
    // Camera already positioned, just ensure proper setup
    this.arena.resize()
  }

  private onPlayerLeft(playerId: string): void {
    this.players.delete(playerId)
    // Show message but keep game running if we have enough players
    if (this.players.size < 2 && this.player) {
      this.showFallbackUI('Waiting for another player...')
    }
  }

  private setupPlayerControls(player: Player): void {
    this.player = player
    
    // Store reference to player for input handling
    // Keyboard controls
    const moveSpeed = 6
    const sprintMultiplier = 1.5
    const jumpForce = 8

    // Input state
    const inputState = {
      moveForward: false,
      moveBackward: false,
      moveLeft: false,
      moveRight: false,
      jump: false,
      sprint: false,
      attack: false,
      defend: false,
      dimensionShift: false
    }

    // Movement function - called from game loop
    const handleInput = (delta: number) => {
      if (!this.player || this.gamePaused) return

      // Get forward and right vectors from camera
      const forward = new THREE.Vector3()
      const right = new THREE.Vector3()
      
      this.camera.getWorldDirection(forward)
      forward.y = 0
      forward.normalize()
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0))
      right.normalize()

      let velocity = new THREE.Vector3(0, 0, 0)

      if (inputState.moveForward) velocity.add(forward)
      if (inputState.moveBackward) velocity.sub(forward)
      if (inputState.moveLeft) velocity.sub(right)
      if (inputState.moveRight) velocity.add(right)

      if (velocity.length() > 0) {
        const moveSpeed = inputState.sprint && this.player.getDimension() === 'material' 
          ? moveSpeed * sprintMultiplier 
          : moveSpeed
        velocity.normalize().multiplyScalar(moveSpeed * delta)
        this.player.mesh.position.add(velocity)
      }

      // Ground check and jumping
      if (inputState.jump && this.player.getPosition().y <= 2.1) {
        this.player.mesh.position.y += jumpForce
      }

      // Sprint cooldown logic
      if (inputState.sprint) {
        // In a full game, would check cooldown state from server
      }

      // Clamp position
      this.clampPlayerPosition()
    }

    // Attack function
    const handleAttack = () => {
      if (this.player) {
        this.player.attack()
        // Send to server
        // client.send({ type: 'attack' })
      }
    }

    // Dimension shift
    const handleDimensionShift = () => {
      const now = performance.now()
      if (now - this.lastDimensionShift > 2000 && this.player.getEnergy() >= 20) {
        this.player.setDimension(this.player.getDimension() === 'material' ? 'rift' : 'material')
        this.lastDimensionShift = now
        // Send to server
        // client.send({ type: 'dimensionShift' })
      }
    }

    // Subscribe to keyboard events
    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW': inputState.moveForward = true; break
        case 'KeyS': inputState.moveBackward = true; break
        case 'KeyA': inputState.moveLeft = true; break
        case 'KeyD': inputState.moveRight = true; break
        case 'ShiftLeft': inputState.sprint = true; break
        case 'Space': inputState.jump = true; break
        case 'Mouse0': inputState.attack = true; handleAttack(); break
        case 'Mouse1': inputState.defend = true; break
        case 'KeyF': inputState.dimensionShift = true; handleDimensionShift(); break
      }
    })

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': inputState.moveForward = false; break
        case 'KeyS': inputState.moveBackward = false; break
        case 'KeyA': inputState.moveLeft = false; break
        case 'KeyD': inputState.moveRight = false; break
        case 'ShiftLeft': inputState.sprint = false; break
        case 'Space': inputState.jump = false; break
        case 'Mouse0': inputState.attack = false; break
        case 'Mouse1': inputState.defend = false; break
        case 'KeyF': inputState.dimensionShift = false; break
      }
    })
  }

  private clampPlayerPosition(): void {
    if (!this.player) return
    const pos = this.player.mesh.position
    const maxDist = 25
    const dist = Math.sqrt(pos.x * pos.x + pos.z * pos.z)
    if (dist > maxDist) {
      const angle = Math.atan2(pos.x, pos.z)
      pos.x = Math.cos(angle) * maxDist
      pos.z = Math.sin(angle) * maxDist
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    // Handle key down for multiplayer input
    // This is supplementary to the setupPlayerControls above
  }

  private onKeyUp(e: KeyboardEvent): void {
    // Handle key up
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.mouse.locked || this.gamePaused) return

    // Camera rotation
    this.mouse.x += e.movementX * 0.002
    this.mouse.y -= e.movementY * 0.002

    // Limit vertical rotation
    this.mouse.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.mouse.y))

    // Apply camera rotation
    this.camera.rotation.y = this.mouse.x
    this.camera.rotation.x = this.mouse.y

    // Also update player mesh rotation
    if (this.player) {
      this.player.mesh.rotation.y = this.mouse.x
    }
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button === 0) {
      // Attack on mouse down
      if (this.player) {
        this.player.attack()
      }
    }
    if (e.button === 1) {
      // Defend on right click
      if (this.player) {
        this.player.isDefending = true
      }
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button === 1) {
      if (this.player) {
        this.player.isDefending = false
      }
    }
  }

  private requestMouseLock(): void {
    // Try to lock mouse for FPS-style controls
    const element = document.body
    if (element.requestPointerLock) {
      element.requestPointerLock()
    } else if (element.msRequestPointerLock) {
      element.msRequestPointerLock()
    } else if (element.webkitRequestPointerLock) {
      element.webkitRequestPointerLock()
    }

    // Handle lock change
    const pointerLockChange = () => {
      if (document.pointerLockElement === element || 
          document.mozPointerLockElement === element ||
          document.webkitPointerLockElement === element) {
        this.mouse.locked = true
      } else {
        this.mouse.locked = false
      }
    }

    const pointerLockError = (error: any) => {
      console.error('Pointer lock error:', error)
    }

    document.addEventListener('pointerlockchange', pointerLockChange)
    document.addEventListener('mousemove', pointerLockError)

    setTimeout(() => {
      // If lock fails, continue with keyboard-only controls
      if (!this.mouse.locked) {
        console.warn('Mouse lock failed, using keyboard controls only')
      }
    }, 100)
  }

  private onResize(): void {
    this.arena.resize()
    if (this.camera) {
      this.camera.aspect = window.innerWidth / window.innerHeight
      this.camera.updateProjectionMatrix()
    }
  }

  private animate(): void {
    requestAnimationFrame((timestamp) => this.animate(timestamp))

    const delta = timestamp ? (timestamp - (this.lastTimestamp || timestamp)) / 1000 : 0
    this.lastTimestamp = timestamp || performance.now()

    // Update hit feedback flash
    if (this.hitFeedback > 0) {
      this.hitFeedback -= delta
      if (this.hitFeedback <= 0) {
        // Hide damage flash
        this.hitFeedback = 0
      }
    }

    // Update all players
    this.players.forEach(player => {
      player.animationLoop(delta)
    })

    // Update controlled player if we have one
    if (this.player) {
      this.player.animationLoop(delta)
    }

    // Update arena
    this.arena.animate()

    // Render
    this.renderer.render(this.arena.getScene(), this.camera)
  }

  private updateMatchUI(): void {
    // Update the match timer UI
    const minutes = Math.floor(this.matchTime / 60)
    const seconds = this.matchTime % 60
    // In a full game, would update DOM element
    // document.getElementById('matchTimer')?.textContent = 
    //   `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  private showFallbackUI(message: string): void {
    // Show UI indicating multiplayer is unavailable
    console.log(message)
    this.showUI = true
    // Would display a modal or overlay
  }

  private showMatchResult(message: any): void {
    // Display match results
    const winner = message.winnerId 
      ? `Player ${message.winnerId.slice(0, 8)} wins!`
      : 'Draw!'
    console.log(winner, ' - Reason:', message.reason)
    this.showUI = true
    // Would display results screen
  }

  private resetMatch(): void {
    // Reset match state for new round
    this.matchTime = 180
    this.showUI = false
    // Reset player positions, health, etc.
    this.players.forEach(player => {
      player.respawn()
      player.health = player.maxHealth
      player.energy = player.maxEnergy
    })
  }
}