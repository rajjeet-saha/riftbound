import * as THREE from 'three'

export interface PlayerData {
  id: string
  name: string
  health: number
  maxHealth: number
  energy: number
  maxEnergy: number
  score: number
  position: THREE.Vector3
  rotation: THREE.Euler
  dimension: 'material' | 'rift'
  alive: boolean
}

export class Player {
  public mesh: THREE.Group
  public hitbox: THREE.CapsuleGeometry
  public material: THREE.MeshStandardMaterial
  public riftMaterial: THREE.MeshStandardMaterial
  private speed = 6
  private sprintMultiplier = 1.5
  private canSprint = true
  private sprintCooldown = 0
  private jumpForce = 8
  private canJump = true
  private lastGroundedCheck = 0
  private groundCheckRadius = 1.5
  private dimension: 'material' | 'rift' = 'material'
  private attackCooldown = 0
  private defensiveCooldown = 0
  private isAttacking = false
  private isDefending = false
  private hitFlash: THREE.Mesh | null = null
  private lastHitTime = 0
  private respawnTime = 3
  private respawnTimer = 0
  private alive = true

  constructor(
    id: string,
    position: THREE.Vector3,
    dimension: 'material' | 'rift' = 'material'
  ) {
    this.dimension = dimension
    this.createMesh(position)
    this.updateMaterials()
  }

  private createMesh(position: THREE.Vector3): void {
    this.mesh = new THREE.Group()
    this.mesh.position.copy(position)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true

    // Player body (exosuit)
    const bodyGeo = new THREE.CapsuleGeometry(1, 2, 4, 16)
    this.material = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      metalness: 0.7,
      roughness: 0.4
    })
    const body = new THREE.Mesh(bodyGeo, this.material)
    body.position.y = 1
    body.castShadow = true
    body.receiveShadow = true
    this.mesh.add(body)

    // Pilot seat/center
    const seatGeo = new THREE.SphereGeometry(0.5, 16, 16)
    const seatMat = new THREE.MeshStandardMaterial({
      color: 0x202040,
      metalness: 0.5,
      roughness: 0.8
    })
    const seat = new THREE.Mesh(seatGeo, seatMat)
    seat.position.y = 1.5
    seat.castShadow = true
    this.mesh.add(seat)

    // Hitbox for collision detection
    this.hitbox = new THREE.CapsuleGeometry(1, 2, 4, 16)

    // Dimension indicator ring around the player
    const ringGeo = new THREE.TorusGeometry(1.2, 0.15, 8, 32, Math.PI)
    const ringMatDim = new THREE.MeshStandardMaterial({
      color: this.dimension === 'rift' ? 0xff00ff : 0x00ffff,
      emissive: this.dimension === 'rift' ? 0x440066 : 0x004488,
      emissiveIntensity: 0.5,
      side: THREE.DoubleSide
    })
    const ring = new THREE.Mesh(ringGeo, ringMatDim)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 2.2
    this.mesh.add(ring)

    // Dimension glow effect
    const glowGeo = new THREE.SphereGeometry(1.8, 16, 16, 8, 8, Math.PI / 2, Math.PI)
    const glowMat = new THREE.MeshStandardMaterial({
      color: this.dimension === 'rift' ? 0xff00ff : 0x00ffff,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide
    })
    const glow = new THREE.Mesh(glowGeo, glowMat)
    glow.position.y = 2.5
    this.mesh.add(glow)

    // Attacks indicators (swords/energy blades)
    this.createAttackIndicators()

    // Position based on dimension
    this.updateForDimension()
  }

  private createAttackIndicators(): void {
    // Primary attack sword
    const swordGeo = new THREE.CylinderGeometry(0.1, 0.5, 3, 16).rotateX(-Math.PI / 2)
    const swordMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.8,
      roughness: 0.3,
      visible: false
    })
    this.mesh.add(new THREE.Mesh(swordGeo, swordMat))

    // Defensive shield
    const shieldGeo = new THREE.HemiSphereGeometry(1.5, 16)
    const shieldMat = new THREE.MeshStandardMaterial({
      color: 0000ff,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide
    })
    const shield = new THREE.Mesh(shieldGeo, shieldMat)
    shield.rotation.x = Math.PI / 2
    shield.position.y = 2.5
    this.mesh.add(shield)
  }

  private updateMaterials(): void {
    // Update body material based on dimension
    if (this.material) {
      this.material.color.set(this.dimension === 'rift' ? 0xff00ff : 0x00ffff)
    }
  }

  private updateForDimension(): void {
    // Adjust player height/position for dimension
    this.mesh.position.y = this.dimension === 'rift' ? 8 : 2
  }

  public getPosition(): THREE.Vector3 {
    return this.mesh.position.clone()
  }

  public getRotation(): THREE.Euler {
    return this.mesh.rotation.clone()
  }

  public getDimension(): 'material' | 'rift' {
    return this.dimension
  }

  public setDimension(dimension: 'material' | 'rift'): void {
    this.dimension = dimension
    this.updateForDimension()
    this.updateMaterials()
    if (this.hitFlash) {
      this.hitFlash.material.opacity = this.dimension === 'rift' ? 0.3 : 0.1
    }
  }

  public takeDamage(amount: number): void {
    if (!this.alive) return
    if (this.isDefending) {
      // Reduced damage while defending
      this.health = Math.max(0, this.health - amount * 0.5)
      this.showDamageFeedback(0.3)
      return
    }
    this.health = Math.max(0, this.health - amount)
    this.showDamageFeedback(1)
    
    if (this.health <= 0) {
      this.die()
    }
  }

  private showDamageFeedback(intensity: number): void {
    // Flash the player red on damage
    if (!this.hitFlash) {
      const flashGeo = new THREE.SphereGeometry(1.2, 16, 16)
      const flashMat = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.4
      })
      this.hitFlash = new THREE.Mesh(flashGeo, flashMat)
      this.hitFlash.position.y = 2
      this.mesh.add(this.hitFlash)
    }
    this.hitFlash.material.opacity = intensity
    
    this.lastHitTime = performance.now()
    
    // Remove flash after short time
    setTimeout(() => {
      if (this.hitFlash && this.mesh.contains(this.hitFlash)) {
        this.mesh.remove(this.hitFlash)
      }
      this.hitFlash = null
    }, 100)
  }

  private die(): void {
    this.alive = false
    this.isAttacking = false
    this.isDefending = false
    
    // Create death effect
    const deathParticles = new THREE.Group()
    for (let i = 0; i < 50; i++) {
      const particleGeo = new THREE.SphereGeometry(0.2, 4, 4)
      const particleMat = new THREE.MeshStandardMaterial({
        color: this.dimension === 'rift' ? 0xff00ff : 0x00ffff,
        emissive: this.dimension === 'rift' ? 0x440066 : 0x004488
      })
      const particle = new THREE.Mesh(particleGeo, particleMat)
      particle.position.copy(this.mesh.position)
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        Math.random() * 5 + 2,
        (Math.random() - 0.5) * 10
      )
      particle.userData.velocity = velocity
      particle.userData.life = 1 + Math.random() * 0.5
      deathParticles.add(particle)
    }
    deathParticles.position.copy(this.mesh.position)
    this.mesh.scene?.add(deathParticles)
    
    // Remove after animation
    setTimeout(() => {
      deathParticles.visible = false
    }, 2000)
    
    // Switch to spectator mode or respawn
    this.respawnTimer = this.respawnTime
    this.mesh.visible = false
  }

  public respawn(): void {
    this.alive = true
    this.health = this.maxHealth
    this.energy = this.maxEnergy
    this.mesh.visible = true
    this.mesh.position.set(0, 2, 0) // Will be set by game
    this.mesh.rotation.set(0, 0, 0)
    this.respawnTimer = 0
  }

  public update(delta: number, inputs: {
    moveForward: boolean,
    moveBackward: boolean,
    moveLeft: boolean,
    moveRight: boolean,
    jump: boolean,
    sprint: boolean,
    attack: boolean,
    defend: boolean,
    dimensionShift: boolean
  }): void {
    if (!this.alive) {
      this.respawnTimer -= delta
      if (this.respawnTimer <= 0) {
        this.respawn()
      }
      return
    }

    const moveSpeed = inputs.sprint && this.canSprint ? this.speed * this.sprintMultiplier : this.speed
    const forward = new THREE.Vector3()
    const right = new THREE.Vector3()
    
    this.mesh.getWorldDirection(forward)
    forward.y = 0
      forward.normalize()
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0))
      right.normalize()

    // Movement
    let velocity = new THREE.Vector3(0, 0, 0)
    
    if (inputs.moveForward) velocity.add(forward)
    if (inputs.moveBackward) velocity.sub(forward)
    if (inputs.moveLeft) velocity.sub(right)
    if (inputs.moveRight) velocity.add(right)

    if (velocity.length() > 0) {
      velocity.normalize().multiplyScalar(moveSpeed)
      // Apply friction/damping
      velocity.z *= 0.9
      velocity.x *= 0.9
      this.mesh.position.add(velocity)
    }

    // Ground check and jumping
    const now = performance.now()
    const onGround = this.checkGround()
    
    if (inputs.jump && onGround && this.canJump) {
      this.mesh.position.y += this.jumpForce
      this.canJump = false
    }

    // Sprint cooldown
    if (inputs.sprint && this.canSprint) {
      this.canSprint = false
      this.sprintCooldown = 3 // 3 seconds
    }
    
    if (!this.canSprint && this.sprintCooldown > 0) {
      this.sprintCooldown -= delta
      if (this.sprintCooldown <= 0) {
        this.canSprint = true
      }
    }

    // Clamp position within arena
    this.clampPosition()

    // Attack
    if (inputs.attack && this.attackCooldown <= 0 && !this.isDefending) {
      this.attack()
      this.attackCooldown = 1.5 // 1.5s cooldown
    }
    if (this.attackCooldown > 0) {
      this.attackCooldown -= delta
    }

    // Defend
    if (inputs.defend && this.defensiveCooldown <= 0) {
      this.isDefending = true
      this.defensiveCooldown = 3 // 3s duration
    }
    if (this.defensiveCooldown > 0) {
      this.defensiveCooldown -= delta
      if (this.defensiveCooldown <= 0) {
        this.isDefending = false
      }
    }

    // Dimension shift
    if (inputs.dimensionShift && this.energy >= 20) {
      this.dimensionShift()
      this.energy = Math.max(0, this.energy - 20)
    }

    // Update dimension indicator
    this.mesh.userData.dimension = this.dimension
  }

  private checkGround(): boolean {
    // Simple ground check - in a full game would use raycasting
    const now = performance.now()
    // For prototype: assume grounded if y position is at or near expected
    return this.mesh.position.y <= 3 && this.canJump
  }

  private clampPosition(): void {
    const pos = this.mesh.position
    // Keep player within roughly 20 units of center
    const maxDist = 25
    const dist = Math.sqrt(pos.x * pos.x + pos.z * pos.z)
    if (dist > maxDist) {
      const angle = Math.atan2(pos.x, pos.z)
      pos.x = Math.cos(angle) * maxDist
      pos.z = Math.sin(angle) * maxDist
    }
  }

  public attack(): void {
    // Create attack hitbox
    const attackDuration = 0.3 // seconds
    const startTime = performance.now()
    
    // Mark this player as attacking with a hitbox
    this.isAttacking = true
    
    // In a full game, would raycast or create a trigger volume
    // For now, mark attack state
    setTimeout(() => {
      this.isAttacking = false
    }, attackDuration * 1000)
  }

  public dimensionShift(): void {
    this.dimension = this.dimension === 'material' ? 'rift' : 'material'
    
    // Visual transition
    this.updateForDimension()
    this.updateMaterials()
    
    // Energy drain continues over time
    // Dimension provides different abilities/tactics
    // Reduced gravity in rift dimension
    this.mesh.userData.dimension = this.dimension
  }

  public heal(amount: number): void {
    this.health = Math.min(this.maxHealth, this.health + amount)
  }

  public gainEnergy(amount: number): void {
    this.energy = Math.min(this.maxEnergy, this.energy + amount)
  }

  public animationLoop(delta: number): void {
    // Continuous rotation of equipment/accessories
    this.mesh.rotation.y += 0.01 * delta
    
    // Cooldown decreasing animation feedback
    if (this.hitFlash && performance.now() - this.lastHitTime < 100) {
      // Already handled in takeDamage
    }
    
    // Dimension glow pulse
    if (this.mesh.children.length > 0) {
      const glow = this.mesh.children.find(c => c.isMesh && c.material?.transparent)
      if (glow) {
        glow.scale.set(
          1 + Math.sin(performance.now() / 200) * 0.1,
          1 + Math.cos(performance.now() / 200) * 0.1,
          1 + Math.sin(performance.now() / 250) * 0.1
        )
      }
    }
  }

  public dispose(): void {
    // Clean up Three.js resources
    this.mesh.removeFromParent()
    if (this.hitFlash) {
      this.hitFlash.removeFromParent()
    }
  }
}