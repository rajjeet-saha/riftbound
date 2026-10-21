import * as THREE from 'three'
import { Arena } from './Arena'
import { Player } from '../components/Player'

const MATCH_DURATION = 180
const GROUND_Y = 1.5
const ATTACK_DAMAGE = 8
const KILL_SCORE = 1
const HIT_RANGE = 4.2

const freshInputs = () => ({
  moveForward: false,
  moveBackward: false,
  moveLeft: false,
  moveRight: false,
  jump: false,
  sprint: false,
  attack: false,
  defend: false,
  dimensionShift: false
})

export class GameScene {
  constructor () {
    this.arena = new Arena()
    this.scene = this.arena.getScene()
    this.camera = this.arena.getCamera()
    this.renderer = this.arena.getRenderer()

    // Attach the WebGL canvas to the page (it is created detached otherwise).
    const host = document.getElementById('canvas-container')
    if (host && this.renderer.domElement.parentElement !== host) {
      host.appendChild(this.renderer.domElement)
    }

    this.players = new Map()
    this.localPlayer = null
    this.opponent = null
    this.mode = 'ai'

    this.player1Inputs = freshInputs()
    this.player2Inputs = freshInputs()

    this.matchPhase = 'menu' // menu | match | results
    this.matchTime = MATCH_DURATION
    this.matchStartStamp = 0
    this.winner = null
    this.gamePaused = false

    this.graphicsQuality = 'balanced'
    this.qualityPresets = {
      performance: { pixelRatio: 0.75, shadows: false, fog: 0.03, label: 'Performance' },
      balanced: { pixelRatio: 1, shadows: true, fog: 0.021, label: 'Balanced' },
      maximum: { pixelRatio: Math.min(window.devicePixelRatio || 1, 2), shadows: true, fog: 0.016, label: 'Maximum' }
    }

    this.cameraPos = new THREE.Vector3(0, 22, 28)
    this.cameraLook = new THREE.Vector3(0, 2, 0)

    this.lastTimestamp = performance.now()
    this.time = 0
    this.aiThinkTimer = 0
    this.aiIntent = freshInputs()

    this.setupInput()
    this.applyQuality(this.graphicsQuality)

    window.addEventListener('resize', () => this.onResize())

    // Expose a handle for debugging / e2e checks.
    window.__riftbound = this

    this.animate()
  }

  /* ------------------------------------------------------------------ input */

  setupInput () {
    const p1Keys = {
      KeyW: 'moveForward',
      KeyS: 'moveBackward',
      KeyA: 'moveLeft',
      KeyD: 'moveRight',
      Space: 'jump',
      ShiftLeft: 'sprint',
      ShiftRight: 'sprint',
      KeyF: 'dimensionShift'
    }
    const p2Keys = {
      ArrowUp: 'moveForward',
      ArrowDown: 'moveBackward',
      ArrowLeft: 'moveLeft',
      ArrowRight: 'moveRight',
      Enter: 'jump',
      KeyR: 'sprint',
      KeyG: 'dimensionShift',
      Numpad0: 'attack',
      Numpad1: 'defend',
      NumpadDecimal: 'attack'
    }

    const blocked = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'])

    window.addEventListener('keydown', (event) => {
      if (blocked.has(event.code) && this.matchPhase === 'match') event.preventDefault()

      if (event.code === 'Escape') {
        this.togglePause()
        return
      }

      if (this.matchPhase !== 'match' || this.gamePaused) return

      if (p1Keys[event.code]) this.player1Inputs[p1Keys[event.code]] = true
      if (p2Keys[event.code] && this.mode === 'local') this.player2Inputs[p2Keys[event.code]] = true
    })

    window.addEventListener('keyup', (event) => {
      if (p1Keys[event.code]) this.player1Inputs[p1Keys[event.code]] = false
      if (p2Keys[event.code] && this.mode === 'local') this.player2Inputs[p2Keys[event.code]] = false
    })

    // Mouse: left = attack, right = defend (player 1)
    const canvas = this.renderer.domElement
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    canvas.addEventListener('mousedown', (event) => {
      if (this.matchPhase !== 'match' || this.gamePaused) return
      if (event.button === 0) this.player1Inputs.attack = true
      if (event.button === 2) this.player1Inputs.defend = true
    })
    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.player1Inputs.attack = false
      if (event.button === 2) this.player1Inputs.defend = false
    })
    // Leaving the window should not leave keys stuck on.
    window.addEventListener('blur', () => {
      this.player1Inputs = freshInputs()
      this.player2Inputs = freshInputs()
    })
  }

  /* -------------------------------------------------------------- match flow */

  startMatch (mode = 'ai') {
    this.mode = mode === 'local' ? 'local' : 'ai'
    this.clearPlayers()

    const p1 = new Player('p1', new THREE.Vector3(-6, GROUND_Y, 0), 'material')
    p1.spawnPoint.set(-6, GROUND_Y, 0)
    this.addPlayer(p1, true)

    const p2 = new Player(this.mode === 'local' ? 'p2' : 'ai', new THREE.Vector3(6, GROUND_Y, 0), 'material')
    p2.spawnPoint.set(6, GROUND_Y, 0)
    if (this.mode === 'local') {
      this.addPlayer(p2, false)
    } else {
      this.opponent = p2
      this.addPlayer(p2, false)
    }

    this.player1Inputs = freshInputs()
    this.player2Inputs = freshInputs()
    this.aiIntent = freshInputs()

    this.matchPhase = 'match'
    this.matchTime = MATCH_DURATION
    this.matchStartStamp = performance.now()
    this.gamePaused = false
    this.winner = null
    this.arena.setDimension('material')

    this.showScreen('hud')
    this.updateHUD()
  }

  addPlayer (player, isLocal) {
    this.scene.add(player.mesh)
    this.players.set(player.id, player)
    if (isLocal) this.localPlayer = player
    return player
  }

  clearPlayers () {
    this.players.forEach((player) => player.dispose())
    this.players.clear()
    this.localPlayer = null
    this.opponent = null
  }

  rematch () {
    this.startMatch(this.mode)
  }

  returnToMenu () {
    this.matchPhase = 'menu'
    this.clearPlayers()
    this.player1Inputs = freshInputs()
    this.player2Inputs = freshInputs()
    this.showScreen('menu')
  }

  togglePause () {
    if (this.matchPhase !== 'match') return
    this.gamePaused = !this.gamePaused
    const pause = document.getElementById('pause-menu')
    if (pause) pause.classList.toggle('open', this.gamePaused)
  }

  endMatch () {
    if (this.matchPhase === 'results') return
    this.matchPhase = 'results'
    this.gamePaused = false

    const list = [...this.players.values()]
    let winner = list[0]
    for (const player of list) {
      if (!winner || player.score > winner.score || (player.score === winner.score && player.health > winner.health)) {
        winner = player
      }
    }
    this.winner = winner ? winner.id : null

    const isAi = this.mode === 'ai'
    const title = document.getElementById('results-title')
    const message = document.getElementById('results-message')
    const scoreP1 = document.getElementById('score-p1')
    const scoreP2 = document.getElementById('score-p2')

    if (title) {
      if (!winner) {
        title.textContent = 'DRAW'
      } else if (winner.id === 'p1') {
        title.textContent = isAi ? 'VICTORY' : 'PLAYER 1 WINS'
      } else {
        title.textContent = isAi ? 'DEFEATED' : 'PLAYER 2 WINS'
      }
    }
    if (message) {
      message.textContent = winner
        ? `${winner.health.toFixed(0)} HP left · ${winner.score} takedown${winner.score === 1 ? '' : 's'}`
        : 'Both fighters fell at the same moment.'
    }
    if (scoreP1) scoreP1.textContent = this.players.get('p1')?.score ?? 0
    if (scoreP2) {
      const other = this.players.get('p2') || this.players.get('ai')
      scoreP2.textContent = other?.score ?? 0
    }

    this.showScreen('results')
  }

  showScreen (which) {
    const menu = document.getElementById('main-menu')
    const hud = document.getElementById('hud')
    const results = document.getElementById('results-screen')
    const pause = document.getElementById('pause-menu')

    if (menu) menu.classList.toggle('hidden', which !== 'menu')
    if (hud) hud.classList.toggle('hidden', which !== 'hud')
    if (results) results.classList.toggle('open', which === 'results')
    if (pause) pause.classList.remove('open')
  }

  /* --------------------------------------------------------------- graphics */

  applyQuality (name) {
    const preset = this.qualityPresets[name] || this.qualityPresets.balanced
    this.graphicsQuality = this.qualityPresets[name] ? name : 'balanced'

    this.renderer.setPixelRatio(preset.pixelRatio)
    this.renderer.shadowMap.enabled = preset.shadows
    this.scene.traverse((object) => {
      if (object.isMesh && object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => { material.needsUpdate = true })
      }
    })
    this.arena.fog.density = preset.fog
    this.onResize()

    document.querySelectorAll('[data-quality]').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.quality === this.graphicsQuality)
    })
    const label = document.getElementById('quality-current')
    if (label) label.textContent = preset.label
  }

  onResize () {
    this.arena.resize()
  }

  /* ------------------------------------------------------------------- loop */

  animate () {
    const now = performance.now()
    let delta = (now - this.lastTimestamp) / 1000
    this.lastTimestamp = now
    // Guard against huge jumps after tab switches / breakpoints.
    if (!Number.isFinite(delta) || delta > 0.1) delta = 0.016
    this.time += delta

    this.update(delta)
    this.renderer.render(this.scene, this.camera)

    requestAnimationFrame(() => this.animate())
  }

  update (delta) {
    this.arena.animate(delta)

    const playing = this.matchPhase === 'match' && !this.gamePaused

    if (playing) {
      const elapsed = (performance.now() - this.matchStartStamp) / 1000
      this.matchTime = Math.max(0, MATCH_DURATION - elapsed)

      if (this.matchTime <= 0) this.endMatch()

      // Player 1 is always human controlled.
      if (this.localPlayer) {
        this.localPlayer.update(delta, this.player1Inputs)
      }

      // Second fighter.
      const other = this.players.get('p2') || this.players.get('ai')
      if (other) {
        if (this.mode === 'local') {
          other.update(delta, this.player2Inputs)
        } else {
          this.updateAI(other, delta)
        }
      }

      this.resolveHits()
      this.syncArenaDimension()
      this.updateHUD()
    }

    this.updateCamera(delta)
  }

  updateCamera (delta) {
    const list = [...this.players.values()]
    const alive = list.filter((player) => player.isAlive)
    const framing = alive.length > 0 ? alive : list

    const focus = new THREE.Vector3(0, 2, 0)
    if (framing.length > 0) {
      const mid = framing.reduce((acc, player) => acc.add(player.mesh.position), new THREE.Vector3())
      mid.multiplyScalar(1 / framing.length)
      focus.set(mid.x, 2, mid.z)
    }

    // Keep the fighters framed no matter how far they drift apart.
    const spread = framing.length > 1
      ? framing[0].mesh.position.distanceTo(framing[1].mesh.position)
      : 8

    const view = THREE.MathUtils.clamp(15 + spread * 0.75, 17, 40)
    const target = new THREE.Vector3(focus.x, view * 0.66, focus.z + view * 0.8)

    const smoothing = 1 - Math.pow(0.002, delta)
    this.cameraPos.lerp(target, smoothing)
    this.cameraLook.lerp(focus, smoothing)

    this.camera.position.copy(this.cameraPos)
    this.camera.lookAt(this.cameraLook)
  }

  /* --------------------------------------------------------------------- AI */

  updateAI (ai, delta) {
    const target = this.localPlayer
    if (!target) return

    this.aiThinkTimer -= delta
    if (this.aiThinkTimer <= 0) {
      this.aiThinkTimer = 0.12 + Math.random() * 0.1
      this.aiIntent = this.decideAI(ai, target)
    }

    ai.update(delta, this.aiIntent)
  }

  decideAI (ai, target) {
    const intent = freshInputs()
    if (!ai.isAlive || !target.isAlive) return intent

    const toTarget = target.mesh.position.clone().sub(ai.mesh.position)
    const distance = toTarget.length()
    const direction = toTarget.clone().normalize()

    if (distance > 3.4) {
      if (direction.x > 0.15) intent.moveRight = true
      if (direction.x < -0.15) intent.moveLeft = true
      if (direction.z > 0.15) intent.moveBackward = true
      if (direction.z < -0.15) intent.moveForward = true
    } else {
      // Circle strafe so the AI is not a sitting duck.
      if (Math.random() > 0.5) intent.moveLeft = direction.z > 0
      else intent.moveRight = direction.z <= 0
      if (Math.random() > 0.75) {
        intent.moveForward = direction.z < 0
        intent.moveBackward = direction.z > 0
      }
    }

    // Only commit to a swing part of the time so the AI feels beatable.
    if (distance <= HIT_RANGE * 0.85 && Math.random() < 0.4) {
      intent.attack = true
    }
    if (ai.health < 45 && Math.random() < 0.35) {
      intent.defend = true
    }
    // Back off briefly after landing a hit to give the player room to breathe.
    if (ai.lastHitAt && this.time - ai.lastHitAt < 0.9) {
      intent.attack = false
      intent.moveLeft = Math.random() > 0.5
      intent.moveRight = !intent.moveLeft
    }
    if (ai.energy > 70 && Math.random() < 0.02) {
      intent.dimensionShift = true
    }
    if (distance > 6 && Math.random() < 0.25) {
      intent.sprint = true
    }
    if (Math.random() < 0.03) {
      intent.jump = true
    }

    return intent
  }

  /* ----------------------------------------------------------------- combat */

  resolveHits () {
    const list = [...this.players.values()]

    for (const attacker of list) {
      if (attacker.attackTimer <= 0 && attacker.hitLanded) {
        attacker.hitLanded = false
      }
      if (!attacker.isAlive || !attacker.isAttackActive() || attacker.hitLanded) continue

      for (const defender of list) {
        if (defender === attacker || !defender.isAlive) continue
        if (!attacker.canReach(defender)) continue

        attacker.hitLanded = true
        attacker.lastHitAt = this.time
        const result = defender.takeDamage(ATTACK_DAMAGE, attacker.id)

        if (result === -1) {
          attacker.score += KILL_SCORE
        } else if (result > 0) {
          this.arena.coreLight.intensity = 60
        }

        // knockback
        const push = defender.mesh.position.clone().sub(attacker.mesh.position)
        push.y = 0
        if (push.lengthSq() > 0.0001) {
          push.normalize().multiplyScalar(0.9)
          defender.mesh.position.add(push)
          defender.clampPosition()
        }
        break
      }
    }

    // decay core light flash
    if (this.arena.coreLight.intensity > 40) {
      this.arena.coreLight.intensity = Math.max(40, this.arena.coreLight.intensity - 90 * 0.016)
    }
  }

  syncArenaDimension () {
    const player = this.localPlayer
    if (!player) return
    if (this.arena.getDimension() !== player.dimension) {
      this.arena.setDimension(player.dimension)
    }
  }

  /* -------------------------------------------------------------------- HUD */

  updateHUD () {
    const minutes = Math.floor(this.matchTime / 60)
    const seconds = Math.floor(this.matchTime % 60)
    const timer = document.getElementById('match-timer')
    if (timer) {
      timer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`
      timer.classList.toggle('urgent', this.matchTime <= 15)
    }

    const paint = (player, suffix) => {
      if (!player) return
      const healthPct = Math.max(0, (player.health / player.maxHealth) * 100)
      const energyPct = Math.max(0, (player.energy / player.maxEnergy) * 100)

      const healthFill = document.getElementById(`p${suffix}-health-fill`)
      const healthText = document.getElementById(`p${suffix}-health`)
      const energyFill = document.getElementById(`p${suffix}-energy-fill`)
      const energyText = document.getElementById(`p${suffix}-energy`)
      const scoreText = document.getElementById(`p${suffix}-score`)

      if (healthFill) healthFill.style.width = `${healthPct}%`
      if (healthText) healthText.textContent = Math.ceil(player.health)
      if (energyFill) energyFill.style.width = `${energyPct}%`
      if (energyText) energyText.textContent = Math.ceil(player.energy)
      if (scoreText) scoreText.textContent = player.score
    }

    paint(this.players.get('p1'), '1')
    paint(this.players.get('p2') || this.players.get('ai'), '2')

    const dimensionLabel = document.getElementById('dimension-value')
    if (dimensionLabel && this.localPlayer) {
      const rift = this.localPlayer.dimension === 'rift'
      dimensionLabel.textContent = rift ? 'RIFT' : 'MATERIAL'
      dimensionLabel.classList.toggle('rift', rift)
    }

    const p2Title = document.getElementById('p2-name')
    if (p2Title) p2Title.textContent = this.mode === 'ai' ? 'AI' : 'P2'
  }
}
