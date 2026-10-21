import { GameRoom, GameRoomOptions } from 'colyseus'
import { Player } from '../components/Player'
import * as THREE from 'three'

export interface RoomState {
  roomId: string
  dimension: 'material' | 'rift'
  players: Map<string, PlayerData>
  scores: Map<string, number>
  matchTime: number
  startTime: number
  readyPlayers: Set<string>
}

export class RiftBoundRoom extends GameRoom {
  private players: Map<string, Player> = new Map()
  private playerData: Map<string, PlayerData> = new Map()
  private scores: Map<string, number> = new Map()
  private matchTimer: number = 3 * 60 // 3 minutes in seconds
  private startTime: number = 0
  private dimension: 'material' | 'rift' = 'material'
  private readyPlayers: Set<string> = new Set()
  private gameLoopId: number | null = null

  onAuth(client: any, options: any, request: any): boolean {
    // Simple auth - accept all connections for now
    // In production, validate session/token here
    return true
  }

  onJoin(client: any, options: any): Promise<any> {
    const playerId = client.sessionId
    
    // Initialize player state
    const player = new Player(playerId, new THREE.Vector3(0, 2, 0), this.dimension)
    this.players.set(playerId, player)
    
    // Initialize data
    const playerData: PlayerData = {
      id: playerId,
      name: `Player ${playerId.slice(0, 8)}`,
      health: 100,
      maxHealth: 100,
      energy: 100,
      maxEnergy: 100,
      score: 0,
      position: player.getPosition(),
      rotation: player.getRotation(),
      dimension: this.dimension,
      alive: true
    }
    this.playerData.set(playerId, playerData)
    this.scores.set(playerId, 0)
    
    // Set up player userData for server reference
    client.playerId = playerId
    client.riftBoundPlayer = player
    
    // Add to session
    this.setState({ ...this.state, players: new Map(this.playerData) })
    
    // Notify client of joining
    client.joinRoom(playerId)
    
    // Broadcast new player to all existing clients
    this.broadcast('playerJoined', {
      playerId,
      position: player.getPosition(),
      dimension: this.dimension
    })
    
    // If this is the second player, start the match
    if (this.numPlayers >= 2 && !this.startTime) {
      this.startMatch()
    }
    
    return null
  }

  onMessage(client: any, message: any): void {
    const playerId = client.playerId
    const player = this.players.get(playerId)
    
    if (!player) return
    
    switch (message.type) {
      case 'move':
        this.handleMove(player, message.data)
        break
      case 'jump':
        this.handleJump(player)
        break
      case 'attack':
        this.handleAttack(player)
        break
      case 'defend':
        this.handleDefend(player)
        break
      case 'dimensionShift':
        this.handleDimensionShift(player)
        break
      case 'ready':
        this.handleReady(client, playerId)
        break
    }
  }

  private handleMove(player: Player, data: { x: number; z: number }): void {
    // Validate movement - prevent cheating
    const now = performance.now() / 1000
    // Simple validation: limit movement speed and direction changes
    player.update(delta / 1000, {
      moveForward: data.forward,
      moveBackward: data.backward,
      moveLeft: data.left,
      moveRight: data.right,
      jump: false,
      sprint: false,
      attack: false,
      defend: false,
      dimensionShift: false
    })
    
    // Update player data position
    const pos = player.getPosition()
    this.playerData.get(playerId)!.position = pos
    
    // Broadcast position to other clients
    this.broadcast('playerMoved', {
      playerId,
      position: pos.toArray()
    }, client)
  }

  private handleJump(player: Player): void {
    // Server-side validation - only allow jump if on ground
    // In a full game, would raycast to check ground contact
    if (player.getPosition().y <= 2.1) { // On ground
      // Apply jump impulse conceptually
      player.takeDamage(0) // Just for side effect of updating state
    }
  }

  private handleAttack(player: Player): void {
    // Server-authoritative attack
    // In a full game, would raycast and damage other players
    player.attack()
    
    // Broadcast attack event
    this.broadcast('playerAttacked', {
      playerId: player.id,
      position: player.getPosition()
    })
    
    // Reset cooldown on server
    const playerState = this.playerData.get(player.id)
    if (playerState) {
      playerState.attackCooldown = 1.5
    }
  }

  private handleDefend(player: Player): void {
    player.isDefending = true
    player.defensiveCooldown = 3
    
    this.broadcast('playerDefended', {
      playerId: player.id
    })
  }

  private handleDimensionShift(player: Player): void {
    // Server validates energy
    const playerState = this.playerData.get(player.id)
    if (playerState && playerState.energy >= 20) {
      player.dimensionShift()
      playerState.energy -= 20
      
      // Broadcast dimension change
      this.broadcast('dimensionChanged', {
        playerId: player.id,
        dimension: player.getDimension()
      })
    }
  }

  private handleReady(client: any, playerId: string): void {
    if (message.type === 'ready') {
      this.readyPlayers.add(playerId)
      
      // Check if all players are ready
      if (this.readyPlayers.size >= this.numPlayers && this.startTime === 0) {
        this.startMatch()
      }
      
      this.broadcast('playerReady', {
        playerId,
        ready: true
      })
    }
  }

  private startMatch(): void {
    this.startTime = performance.now()
    this.matchTimer = 3 * 60 // 3 minutes
    
    // Reset all player states
    this.players.forEach((player, playerId) => {
      const playerState = this.playerData.get(playerId)
      if (playerState) {
        playerState.health = playerState.maxHealth
        playerState.energy = playerState.maxEnergy
        playerState.score = 0
        playerState.alive = true
        player.respawn()
      }
    })
    
    this.readyPlayers.clear()
    
    // Start the match timer
    this.gameLoopId = setInterval(() => {
      this.matchTimer--
      
      // Update timer for all clients
      this.broadcast('matchTimeUpdate', {
        timeLeft: Math.max(0, this.matchTimer),
        phase: this.matchTimer > 120 ? 'early' : this.matchTimer > 60 ? 'mid' : 'final'
      })
      
      // Check for time-based win conditions
      if (this.matchTimer <= 0) {
        this.endMatch('time')
      }
    }, 1000)
    
    // Notify all clients
    this.broadcast('matchStarted', {
      matchId: this.roomId,
      dimension: this.dimension
    })
  }

  private endMatch(reason: 'time' | 'elimination' | 'draw'): void {
    clearInterval(this.gameLoopId!)
    
    // Determine winner
    let winnerId: string | null = null
    let loserId: string | null = null
    
    // Simple scoring: highest score wins
    let maxScore = -1
    this.playerData.forEach((data, id) => {
      if (data.score > maxScore) {
        maxScore = data.score
        winnerId = id
      }
    })
    
    // If tied or no kills, check scores
    if (!winnerId || this.playerData.get(winnerId)?.score === this.playerData.get(loserId)?.score) {
      // Draw based on time survived or other criteria
      this.broadcast('matchResult', {
        type: 'draw',
        reason,
        scores: Object.fromEntries(this.playerData)
      })
    } else {
      this.broadcast('matchResult', {
        type: 'win',
        winnerId,
        reason,
        scores: Object.fromEntries(this.playerData)
      })
    }
    
    // Reset for potential rematch
    setTimeout(() => {
      this.resetMatch()
    }, 5000)
  }

  private resetMatch(): void {
    // Reset timer and state for new match
    this.matchTimer = 3 * 60
    this.startTime = 0
    this.readyPlayers.clear()
    this.playerData.forEach((data, id) => {
      data.health = data.maxHealth
      data.energy = data.maxEnergy
      data.score = 0
      data.alive = true
    })
    this.broadcast('matchReset')
  }

  onLeave(client: any, consented: boolean): void {
    const playerId = client.playerId
    
    // Remove player
    this.players.delete(playerId)
    this.playerData.delete(playerId)
    this.scores.delete(playerId)
    
    // Broadcast player left
    this.broadcast('playerLeft', { playerId })
    
    // If only one player left, end match
    if (this.numPlayers < 2) {
      clearInterval(this.gameLoopId!)
      this.broadcast('matchEnded', {
        reason: 'disconnect',
        winner: null
      })
    }
  }

  onDispose(): void {
    // Clean up
    if (this.gameLoopId) {
      clearInterval(this.gameLoopId)
    }
    this.players.forEach(player => player.dispose())
  }
}