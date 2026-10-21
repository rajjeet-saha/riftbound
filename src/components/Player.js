import * as THREE from 'three'

const PALETTE = {
  material: {
    body: 0x14c8e0,
    core: 0x8ef7ff,
    emissive: 0x0b5c6b,
    ring: 0x5eead4,
    blade: 0xffe066,
    glow: 0x22d3ee
  },
  rift: {
    body: 0xd946ef,
    core: 0xffa8f5,
    emissive: 0x6b0d63,
    ring: 0xf472b6,
    blade: 0xff59d0,
    glow: 0xe879f9
  }
}

const ARENA_LIMIT = 22
const GROUND_Y = 1.5
const GRAVITY = 26
const JUMP_SPEED = 11
const BASE_SPEED = 9
const ATTACK_DURATION = 0.45
const ATTACK_COOLDOWN = 0.8
const ATTACK_RANGE = 4.2

export class Player {
  constructor (id, position, dimension = 'material') {
    this.id = id
    this.dimension = dimension === 'rift' ? 'rift' : 'material'

    this.maxHealth = 100
    this.health = 100
    this.maxEnergy = 100
    this.energy = 100
    this.score = 0

    this.isAlive = true
    this.isDefending = false
    this.grounded = true
    this.yVelocity = 0

    this.attackCooldown = 0
    this.attackTimer = 0
    this.dimensionCooldown = 0
    this.sprintCooldown = 0
    this.defensiveCooldown = 0
    this.invincibleTimer = 0

    this.respawnTime = 2.5
    this.respawnTimer = 0
    this.spawnPoint = (position || new THREE.Vector3(0, GROUND_Y, 0)).clone()

    this.time = Math.random() * 10
    this.hitFlash = null
    this.moveDir = new THREE.Vector3(0, 0, 1)

    this.createMesh(position || new THREE.Vector3(0, GROUND_Y, 0))
    this.applyDimensionVisuals()
  }

  createMesh (position) {
    const colors = PALETTE[this.dimension]

    this.mesh = new THREE.Group()
    this.mesh.position.copy(position)
    this.mesh.position.y = GROUND_Y

    // --- Body (exosuit torso) ---
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.85, 1.1, 6, 18),
      new THREE.MeshStandardMaterial({
        color: colors.body,
        emissive: colors.emissive,
        emissiveIntensity: 0.55,
        metalness: 0.75,
        roughness: 0.28
      })
    )
    torso.position.y = 1.15
    torso.castShadow = true
    torso.receiveShadow = true
    this.bodyMesh = torso
    this.mesh.add(torso)

    // --- Head / visor ---
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 18, 14),
      new THREE.MeshStandardMaterial({
        color: 0x10121f,
        metalness: 0.9,
        roughness: 0.2
      })
    )
    head.position.y = 2.25
    head.castShadow = true
    this.mesh.add(head)

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.18, 0.1),
      new THREE.MeshStandardMaterial({
        color: colors.core,
        emissive: colors.core,
        emissiveIntensity: 1.6
      })
    )
    visor.position.set(0, 2.28, 0.45)
    this.mesh.add(visor)
    this.visorMesh = visor

    // --- Chest core (pulses) ---
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 16, 14),
      new THREE.MeshStandardMaterial({
        color: colors.core,
        emissive: colors.core,
        emissiveIntensity: 2.1,
        metalness: 0.3,
        roughness: 0.1
      })
    )
    core.position.set(0, 1.35, 0.72)
    this.coreMesh = core
    this.mesh.add(core)

    // --- Shoulder pads ---
    const padMat = new THREE.MeshStandardMaterial({
      color: colors.ring,
      metalness: 0.85,
      roughness: 0.3,
      emissive: colors.emissive,
      emissiveIntensity: 0.35
    })
    for (const side of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), padMat)
      pad.position.set(side * 0.85, 1.75, 0)
      pad.scale.set(1, 0.7, 1)
      pad.castShadow = true
      this.mesh.add(pad)
    }

    // --- Legs ---
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.22, 0.8, 4, 10),
        new THREE.MeshStandardMaterial({
          color: colors.body,
          metalness: 0.7,
          roughness: 0.35,
          emissive: colors.emissive,
          emissiveIntensity: 0.25
        })
      )
      leg.position.set(side * 0.34, 0.45, 0)
      leg.castShadow = true
      this.mesh.add(leg)
    }

    // --- Dimension halo ring (always spinning) ---
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(1.25, 0.07, 8, 40),
      new THREE.MeshStandardMaterial({
        color: colors.ring,
        emissive: colors.ring,
        emissiveIntensity: 1.4,
        transparent: true,
        opacity: 0.85
      })
    )
    halo.rotation.x = Math.PI / 2
    halo.position.y = 0.12
    this.haloMesh = halo
    this.mesh.add(halo)

    // --- Energy blade (appears only while attacking) ---
    this.bladeGroup = new THREE.Group()
    this.bladeGroup.position.set(0, 1.35, 0.5)
    const blade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.22, 2.6, 12),
      new THREE.MeshStandardMaterial({
        color: colors.blade,
        emissive: colors.blade,
        emissiveIntensity: 2.4,
        transparent: true,
        opacity: 0.95
      })
    )
    blade.rotation.x = Math.PI / 2
    blade.position.z = 1.4
    this.bladeMesh = blade
    this.bladeGroup.add(blade)
    this.bladeGroup.visible = false
    this.mesh.add(this.bladeGroup)

    // --- Defensive shield dome ---
    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(1.9, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0ea5e9,
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    )
    shield.position.y = 0.5
    this.shieldMesh = shield
    this.shieldMesh.visible = false
    this.mesh.add(shield)

    return this.mesh
  }

  applyDimensionVisuals () {
    const colors = PALETTE[this.dimension]
    if (this.bodyMesh) this.bodyMesh.material.color.set(colors.body)
    if (this.bodyMesh) this.bodyMesh.material.emissive.set(colors.emissive)
    if (this.coreMesh) {
      this.coreMesh.material.color.set(colors.core)
      this.coreMesh.material.emissive.set(colors.core)
    }
    if (this.visorMesh) {
      this.visorMesh.material.color.set(colors.core)
      this.visorMesh.material.emissive.set(colors.core)
    }
    if (this.haloMesh) {
      this.haloMesh.material.color.set(colors.ring)
      this.haloMesh.material.emissive.set(colors.ring)
    }
    if (this.bladeMesh) {
      this.bladeMesh.material.color.set(colors.blade)
      this.bladeMesh.material.emissive.set(colors.blade)
    }
  }

  getPosition () {
    return this.mesh.position.clone()
  }

  getDimension () {
    return this.dimension
  }

  setDimension (dimension) {
    this.dimension = dimension === 'rift' ? 'rift' : 'material'
    this.applyDimensionVisuals()
  }

  /* ---------- combat ---------- */

  attack () {
    if (!this.isAlive || this.attackCooldown > 0) return false
    this.attackTimer = ATTACK_DURATION
    this.attackCooldown = ATTACK_COOLDOWN
    this.bladeGroup.visible = true
    return true
  }

  /** Returns true while the swing is in its damage window. */
  isAttackActive () {
    return this.attackTimer > ATTACK_DURATION * 0.35 && this.attackTimer > 0
  }

  canReach (other) {
    if (!other || !other.isAlive) return false
    return this.getPosition().distanceTo(other.getPosition()) <= ATTACK_RANGE
  }

  takeDamage (amount, fromId = null) {
    if (!this.isAlive || this.invincibleTimer > 0) return 0

    const finalDamage = this.isDefending ? amount * 0.25 : amount
    this.health = Math.max(0, this.health - finalDamage)
    this.invincibleTimer = 0.45
    this.showDamageFeedback()

    if (this.health <= 0) {
      this.die(fromId)
      return -1
    }
    return finalDamage
  }

  showDamageFeedback () {
    if (!this.hitFlash) {
      this.hitFlash = new THREE.Mesh(
        new THREE.SphereGeometry(1.35, 16, 12),
        new THREE.MeshBasicMaterial({
          color: 0xff3b58,
          transparent: true,
          opacity: 0.45,
          depthWrite: false
        })
      )
      this.hitFlash.position.y = 1.35
      this.mesh.add(this.hitFlash)
    }
    this.hitFlash.material.opacity = 0.45
  }

  die (killerId = null) {
    this.isAlive = false
    this.isDefending = false
    this.attackTimer = 0
    this.bladeGroup.visible = false
    this.shieldMesh.visible = false
    this.health = 0
    this.respawnTimer = this.respawnTime
    this.mesh.visible = false
    this.spawnDeathBurst()
    this.lastKiller = killerId
  }

  spawnDeathBurst () {
    const scene = this.mesh.parent
    if (!scene) return

    const colors = PALETTE[this.dimension]
    const group = new THREE.Group()
    group.position.copy(this.mesh.position)
    group.position.y += 1.2

    const geo = new THREE.SphereGeometry(0.13, 6, 5)
    for (let i = 0; i < 60; i++) {
      const particle = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xffffff : colors.glow })
      )
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 14,
        Math.random() * 10 + 2,
        (Math.random() - 0.5) * 14
      )
      particle.userData.velocity = velocity
      particle.userData.life = 0.7 + Math.random() * 0.7
      group.add(particle)
    }

    scene.add(group)

    const started = performance.now()
    const step = () => {
      const dt = Math.min(0.05, (performance.now() - started) / 1000)
      let alive = false
      for (const particle of group.children) {
        particle.userData.life -= 0.016
        if (particle.userData.life <= 0) continue
        alive = true
        particle.userData.velocity.y -= 18 * 0.016
        particle.position.addScaledVector(particle.userData.velocity, 0.016)
        particle.material.opacity = Math.max(0, particle.userData.life)
        particle.material.transparent = true
      }
      if (alive) {
        requestAnimationFrame(step)
      } else {
        scene.remove(group)
        group.children.forEach(p => p.material.dispose())
        geo.dispose()
      }
    }
    requestAnimationFrame(step)
  }

  respawn () {
    this.isAlive = true
    this.health = this.maxHealth
    this.energy = this.maxEnergy
    this.isDefending = false
    this.attackCooldown = 0
    this.attackTimer = 0
    this.dimensionCooldown = 0
    this.sprintCooldown = 0
    this.defensiveCooldown = 0
    this.invincibleTimer = 1.2
    this.respawnTimer = 0
    this.grounded = true
    this.yVelocity = 0
    this.mesh.visible = true
    this.mesh.position.copy(this.spawnPoint)
    this.mesh.position.y = GROUND_Y
  }

  /* ---------- per-frame ---------- */

  update (delta, inputs = {}) {
    this.time += delta

    if (!this.isAlive) {
      this.respawnTimer -= delta
      if (this.respawnTimer <= 0) this.respawn()
      return
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - delta)
    this.dimensionCooldown = Math.max(0, this.dimensionCooldown - delta)
    this.sprintCooldown = Math.max(0, this.sprintCooldown - delta)
    this.invincibleTimer = Math.max(0, this.invincibleTimer - delta)

    // ---- movement (world axes keep controls intuitive with the arena camera) ----
    const dir = new THREE.Vector3()
    if (inputs.moveForward) dir.z -= 1
    if (inputs.moveBackward) dir.z += 1
    if (inputs.moveLeft) dir.x -= 1
    if (inputs.moveRight) dir.x += 1

    const wantsSprint = !!inputs.sprint && dir.lengthSq() > 0 && this.energy > 2 && this.sprintCooldown <= 0
    if (wantsSprint) {
      this.energy = Math.max(0, this.energy - 22 * delta)
      this.sprintCooldown = 0.25
    }

    if (dir.lengthSq() > 0) {
      dir.normalize()
      const speed = BASE_SPEED * (wantsSprint ? 1.75 : 1) * (this.isDefending ? 0.4 : 1)
      this.mesh.position.x += dir.x * speed * delta
      this.mesh.position.z += dir.z * speed * delta
      this.moveDir.copy(dir)

      // face travel direction, smoothly
      const targetAngle = Math.atan2(dir.x, dir.z)
      let diff = targetAngle - this.mesh.rotation.y
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      this.mesh.rotation.y += diff * Math.min(1, 14 * delta)
    }

    // ---- jump / gravity ----
    if (inputs.jump && this.grounded) {
      this.yVelocity = JUMP_SPEED
      this.grounded = false
    }
    this.yVelocity -= GRAVITY * delta
    this.mesh.position.y += this.yVelocity * delta
    if (this.mesh.position.y <= GROUND_Y) {
      this.mesh.position.y = GROUND_Y
      this.yVelocity = 0
      this.grounded = true
    }

    // ---- attack ----
    if (inputs.attack) this.attack()
    if (this.attackTimer > 0) {
      this.attackTimer = Math.max(0, this.attackTimer - delta)
      const progress = 1 - this.attackTimer / ATTACK_DURATION
      const arc = Math.sin(progress * Math.PI)
      this.bladeGroup.visible = true
      this.bladeGroup.scale.set(0.4 + arc * 0.6, 0.4 + arc * 0.6, 0.6 + arc * 1.6)
      this.bladeGroup.rotation.y = -1.1 + arc * 2.2
      if (this.attackTimer === 0) this.bladeGroup.visible = false
    }

    // ---- defense ----
    this.isDefending = !!inputs.defend
    this.shieldMesh.visible = this.isDefending
    if (this.isDefending) {
      const pulse = 1 + Math.sin(this.time * 7) * 0.05
      this.shieldMesh.scale.setScalar(pulse)
      this.shieldMesh.material.opacity = 0.16 + Math.sin(this.time * 5) * 0.06
      this.energy = Math.max(0, this.energy - 6 * delta)
    }

    // ---- dimension shift ----
    if (inputs.dimensionShift && this.dimensionCooldown <= 0 && this.energy >= 40) {
      this.dimensionShift()
      this.energy -= 40
      this.dimensionCooldown = 2.5
    }

    // ---- energy regen ----
    if (!this.isDefending) {
      this.energy = Math.min(this.maxEnergy, this.energy + 11 * delta)
    }

    this.clampPosition()
    this.animateVisuals(delta)
  }

  dimensionShift () {
    this.dimension = this.dimension === 'material' ? 'rift' : 'material'
    this.applyDimensionVisuals()

    const burst = new THREE.Group()
    burst.position.copy(this.mesh.position)
    burst.position.y = 1.2
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.09, 8, 32),
      new THREE.MeshBasicMaterial({
        color: this.dimension === 'rift' ? 0xf0abfc : 0x67e8f9,
        transparent: true,
        opacity: 0.9
      })
    )
    ring.rotation.x = Math.PI / 2
    burst.add(ring)
    const scene = this.mesh.parent
    if (scene) {
      scene.add(burst)
      const start = performance.now()
      const grow = () => {
        const t = (performance.now() - start) / 500
        if (t >= 1) {
          scene.remove(burst)
          ring.geometry.dispose()
          ring.material.dispose()
          return
        }
        ring.scale.setScalar(1 + t * 5)
        ring.material.opacity = 0.9 * (1 - t)
        requestAnimationFrame(grow)
      }
      requestAnimationFrame(grow)
    }
  }

  animateVisuals (delta) {
    // halo spin
    if (this.haloMesh) {
      this.haloMesh.rotation.z += delta * 1.8
      this.haloMesh.position.y = 0.12 + Math.sin(this.time * 2.4) * 0.12
    }
    // core pulse
    if (this.coreMesh) {
      const pulse = 0.9 + Math.sin(this.time * 4) * 0.12
      this.coreMesh.scale.setScalar(pulse)
      this.coreMesh.material.emissiveIntensity = 1.8 + Math.sin(this.time * 4) * 0.7
    }
    // body idle bob
    if (this.bodyMesh) {
      this.bodyMesh.position.y = 1.15 + Math.sin(this.time * 2.2) * 0.05
    }
    // hit flash fade
    if (this.hitFlash) {
      this.hitFlash.material.opacity = Math.max(0, this.hitFlash.material.opacity - delta * 1.6)
      if (this.hitFlash.material.opacity <= 0.01) {
        this.mesh.remove(this.hitFlash)
        this.hitFlash.geometry.dispose()
        this.hitFlash.material.dispose()
        this.hitFlash = null
      }
    }
  }

  clampPosition () {
    this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -ARENA_LIMIT, ARENA_LIMIT)
    this.mesh.position.z = THREE.MathUtils.clamp(this.mesh.position.z, -ARENA_LIMIT, ARENA_LIMIT)
  }

  dispose () {
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh)
    this.mesh.traverse(child => {
      if (child.isMesh) {
        child.geometry?.dispose()
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose())
        else child.material?.dispose()
      }
    })
  }
}
