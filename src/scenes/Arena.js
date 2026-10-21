import * as THREE from 'three'

const PALETTE = {
  material: {
    fog: 0x0a1424,
    floor: 0x1c2c47,
    grid: 0x3d7fb0,
    accent: 0x22d3ee,
    accent2: 0x38bdf8,
    light: 0x9be7ff
  },
  rift: {
    fog: 0x1c0a28,
    floor: 0x2c1440,
    grid: 0x8b3fb0,
    accent: 0xe879f9,
    accent2: 0xf472b6,
    light: 0xffb3f7
  }
}

export class Arena {
  constructor () {
    this.dimension = 'material'
    this.time = 0

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x05070f)

    this.camera = new THREE.PerspectiveCamera(
      58,
      window.innerWidth / window.innerHeight,
      0.1,
      400
    )
    this.camera.position.set(0, 20, 26)
    this.camera.lookAt(0, 2, 0)

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05

    this.fog = new THREE.FogExp2(PALETTE.material.fog, 0.021)
    this.scene.fog = this.fog

    this.rings = []
    this.orbs = []
    this.pillarCaps = []

    this.buildFloor()
    this.buildWalls()
    this.buildPillars()
    this.buildCore()
    this.buildOrbs()
    this.buildRiftDome()
    this.buildLights()

    this.setDimension('material')
  }

  /* ---------------- construction ---------------- */

  buildFloor () {
    const floorMat = new THREE.MeshStandardMaterial({
      color: PALETTE.material.floor,
      roughness: 0.7,
      metalness: 0.35,
      emissive: 0x08131f,
      emissiveIntensity: 0.55
    })
    this.floorMat = floorMat

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(52, 52), floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    this.scene.add(floor)
    this.floor = floor

    this.grid = new THREE.GridHelper(52, 26, PALETTE.material.grid, PALETTE.material.grid)
    this.grid.position.y = 0.02
    this.grid.material.transparent = true
    this.grid.material.opacity = 0.55
    this.scene.add(this.grid)

    // Glowing centre disc
    const disc = new THREE.Mesh(
      new THREE.RingGeometry(6.5, 7.2, 64),
      new THREE.MeshBasicMaterial({
        color: PALETTE.material.accent,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide
      })
    )
    disc.rotation.x = -Math.PI / 2
    disc.position.y = 0.04
    this.scene.add(disc)
    this.centreDisc = disc
  }

  buildWalls () {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x24395c,
      roughness: 0.5,
      metalness: 0.65,
      emissive: 0x0a2a3d,
      emissiveIntensity: 0.6
    })
    this.wallMat = mat

    const size = 52
    const height = 2.4
    for (const [x, z, rotY] of [
      [0, -size / 2, 0],
      [0, size / 2, 0],
      [-size / 2, 0, Math.PI / 2],
      [size / 2, 0, Math.PI / 2]
    ]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(size, height, 1.2), mat)
      wall.position.set(x, height / 2, z)
      wall.rotation.y = rotY
      wall.castShadow = true
      wall.receiveShadow = true
      this.scene.add(wall)
    }

    // Neon trim strips
    this.trimMat = new THREE.MeshBasicMaterial({
      color: PALETTE.material.accent,
      transparent: true,
      opacity: 0.5
    })
    for (const [x, z, w, d] of [
      [0, -size / 2 + 0.7, size, 0.12],
      [0, size / 2 - 0.7, size, 0.12],
      [-size / 2 + 0.7, 0, 0.12, size],
      [size / 2 - 0.7, 0, 0.12, size]
    ]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), this.trimMat)
      strip.position.set(x, 2.42, z)
      this.scene.add(strip)
    }
  }

  buildPillars () {
    const positions = [
      [-16, -16], [16, -16], [-16, 16], [16, 16],
      [-9, 0], [9, 0], [0, -9], [0, 9]
    ]
    const shaftMat = new THREE.MeshStandardMaterial({
      color: 0x2b3f61,
      roughness: 0.45,
      metalness: 0.7,
      emissive: 0x0d2233,
      emissiveIntensity: 0.5
    })
    this.pillarMat = shaftMat

    for (const [x, z] of positions) {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 7, 12), shaftMat)
      shaft.position.set(x, 3.5, z)
      shaft.castShadow = true
      shaft.receiveShadow = true
      this.scene.add(shaft)

      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(1.15, 1.15, 0.3, 12),
        new THREE.MeshBasicMaterial({ color: PALETTE.material.accent })
      )
      cap.position.set(x, 7.1, z)
      this.scene.add(cap)
      this.pillarCaps.push(cap)
    }
  }

  buildCore () {
    this.coreGroup = new THREE.Group()
    this.coreGroup.position.y = 6
    this.scene.add(this.coreGroup)

    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x101a30,
      roughness: 0.35,
      metalness: 0.95
    })
    const core = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.6, 8, 6), coreMat)
    core.castShadow = true
    core.receiveShadow = true
    this.coreGroup.add(core)

    const crystalMat = new THREE.MeshStandardMaterial({
      color: PALETTE.material.accent,
      emissive: PALETTE.material.accent,
      emissiveIntensity: 1.7,
      metalness: 0.4,
      roughness: 0.15,
      transparent: true,
      opacity: 0.85
    })
    this.crystalMat = crystalMat

    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), crystalMat)
    crystal.position.y = 0.4
    this.coreGroup.add(crystal)
    this.crystal = crystal

    for (let i = 0; i < 3; i++) {
      const ringMat = new THREE.MeshStandardMaterial({
        color: PALETTE.material.accent2,
        emissive: PALETTE.material.accent2,
        emissiveIntensity: 1.1,
        transparent: true,
        opacity: 0.75 - i * 0.15
      })
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.1 + i * 1.15, 0.09, 8, 64),
        ringMat
      )
      ring.rotation.x = Math.PI / 2
      ring.rotation.z = i * 0.7
      this.coreGroup.add(ring)
      this.rings.push(ring)
    }
  }

  buildOrbs () {
    const orbMat = new THREE.MeshStandardMaterial({
      color: PALETTE.material.accent,
      emissive: PALETTE.material.accent,
      emissiveIntensity: 1.4,
      transparent: true,
      opacity: 0.8,
      roughness: 0.2,
      metalness: 0.3
    })
    this.orbMat = orbMat

    const count = 8
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const radius = 11 + (i % 3) * 3.5
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), orbMat)
      orb.position.set(
        Math.cos(angle) * radius,
        3 + (i % 4) * 1.6,
        Math.sin(angle) * radius
      )
      orb.userData.baseY = orb.position.y
      orb.userData.phase = Math.random() * Math.PI * 2
      orb.userData.spin = 0.4 + Math.random() * 0.9
      this.scene.add(orb)
      this.orbs.push(orb)

      // Point light on a couple of orbs for atmosphere
      if (i % 3 === 0) {
        const light = new THREE.PointLight(PALETTE.material.accent, 12, 22, 2)
        light.position.copy(orb.position)
        orb.userData.light = light
        this.scene.add(light)
      }
    }
  }

  buildRiftDome () {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(24, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xe879f9,
        transparent: true,
        opacity: 0,
        side: THREE.BackSide,
        depthWrite: false
      })
    )
    this.scene.add(dome)
    this.riftDome = dome
  }

  buildLights () {
    this.scene.add(new THREE.AmbientLight(0x93a8d4, 1.9))

    const hemi = new THREE.HemisphereLight(0xa9c8ff, 0x18243a, 1.4)
    this.scene.add(hemi)

    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(14, 24, 12)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.near = 1
    key.shadow.camera.far = 90
    key.shadow.camera.left = -34
    key.shadow.camera.right = 34
    key.shadow.camera.top = 34
    key.shadow.camera.bottom = -34
    key.shadow.bias = -0.0005
    this.scene.add(key)

    this.keyLight = key

    const rim = new THREE.DirectionalLight(0x38bdf8, 1.1)
    rim.position.set(-16, 14, -14)
    this.scene.add(rim)
    this.rimLight = rim

    const coreLight = new THREE.PointLight(PALETTE.material.accent, 40, 34, 2)
    coreLight.position.set(0, 7, 0)
    this.scene.add(coreLight)
    this.coreLight = coreLight
  }

  /* ---------------- dimension ---------------- */

  setDimension (dimension) {
    this.dimension = dimension === 'rift' ? 'rift' : 'material'
    const p = PALETTE[this.dimension]

    this.scene.background.set(p.fog)
    this.fog.color.set(p.fog)
    this.fog.density = this.dimension === 'rift' ? 0.032 : 0.021

    this.floorMat.color.set(p.floor)
    this.grid.material.color.set(p.grid)
    this.trimMat.color.set(p.accent)
    this.centreDisc.material.color.set(p.accent)

    this.crystalMat.color.set(p.accent)
    this.crystalMat.emissive.set(p.accent)
    this.orbMat.color.set(p.accent)
    this.orbMat.emissive.set(p.accent)

    this.rings.forEach(r => {
      r.material.color.set(p.accent2)
      r.material.emissive.set(p.accent2)
    })

    this.pillarCaps.forEach(c => c.material.color.set(p.accent))
    this.coreLight.color.set(p.light)
    this.keyLight.color.set(this.dimension === 'rift' ? 0xffd1f7 : 0xffffff)
    this.riftDome.material.color.set(p.accent)
    this.riftDome.material.opacity = this.dimension === 'rift' ? 0.09 : 0
  }

  getDimension () {
    return this.dimension
  }

  toggleDimension () {
    this.setDimension(this.dimension === 'material' ? 'rift' : 'material')
    return this.dimension
  }

  /* ---------------- loop ---------------- */

  animate (delta = 0.016) {
    this.time += delta

    // rings orbit at different speeds
    this.rings.forEach((ring, i) => {
      ring.rotation.z += delta * (0.5 + i * 0.28)
      ring.rotation.x = Math.PI / 2 + Math.sin(this.time * 0.4 + i) * 0.18
    })

    // core crystal spin + bob
    if (this.crystal) {
      this.crystal.rotation.y += delta * 0.9
      this.crystal.rotation.x += delta * 0.35
      const pulse = 1 + Math.sin(this.time * 2.2) * 0.07
      this.crystal.scale.setScalar(pulse)
      this.crystalMat.emissiveIntensity = 1.4 + Math.sin(this.time * 3.1) * 0.5
    }

    // floating orbs
    for (const orb of this.orbs) {
      orb.rotation.y += delta * orb.userData.spin
      orb.rotation.x += delta * orb.userData.spin * 0.6
      orb.position.y = orb.userData.baseY + Math.sin(this.time * 1.4 + orb.userData.phase) * 0.55
      if (orb.userData.light) orb.userData.light.position.y = orb.position.y
    }

    // centre disc breathes
    this.centreDisc.material.opacity = 0.4 + Math.sin(this.time * 2) * 0.18

    // rift dome swirl
    if (this.dimension === 'rift') {
      this.riftDome.rotation.y += delta * 0.15
    }
  }

  /* ---------------- accessors ---------------- */

  getScene () { return this.scene }
  getCamera () { return this.camera }
  getRenderer () { return this.renderer }

  resize () {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }
}
