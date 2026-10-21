import * as THREE from 'three'

export class Arena {
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private arenaMesh: THREE.Mesh
  private riftIndicator: THREE.Mesh
  private dimension: 'material' | 'rift' = 'material'
  private fog: THREE.Fog

  constructor() {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x0a0a1a)

    // Setup camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
    this.camera.position.set(0, 8, 12)

    // Setup renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    // Fog for atmosphere
    this.fog = new THREE.Fog(0x0a0a1a, 15, 40)
    this.scene.fog = this.fog

    // Create arena floor
    const floorGeometry = new THREE.PlaneGeometry(50, 50, 50, 50)
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.8,
      metalness: 0.2
    })
    this.arenaMesh = new THREE.Mesh(floorGeometry, floorMaterial)
    this.arenaMesh.rotation.x = -Math.PI / 2
    this.arenaMesh.receiveShadow = true
    this.scene.add(this.arenaMesh)

    // Create arena border
    const borderGeometry = new THREE.BoxGeometry(52, 2, 52)
    const borderMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a3a5e,
      roughness: 0.5
    })
    const border = new THREE.Mesh(borderGeometry, borderMaterial)
    border.position.y = 1
    border.receiveShadow = true
    this.scene.add(border)

    // Create pillars around the arena
    this.createPillars()

    // Create central structure
    this.createCentralStructure()

    // Rift indicator (visual cue for dimension state)
    const riftGeometry = new THREE.SphereGeometry(8, 32, 32, 16, 16, Math.PI / 2, Math.PI)
    const riftMaterial = new THREE.MeshStandardMaterial({
      color: 0xff00ff,
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide
    })
    this.riftIndicator = new THREE.Mesh(riftGeometry, riftMaterial)
    this.riftIndicator.position.y = 8
    this.scene.add(this.riftIndicator)

    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x4a4a6a, 0.6)
    this.scene.add(ambientLight)

    // Directional light
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight.position.set(10, 15, 10)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.width = 2048
    dirLight.shadow.mapSize.height = 2048
    dirLight.shadow.bias = -0.0001
    dirLight.shadow.radius = 4
    this.scene.add(dirLight)

    // Hemisphere light
    const hemiLight = new THREE.HemisphereLight(0x88c0d0, 0x1a1a3e, 0.5)
    this.scene.add(hemiLight)

    // Energy spheres floating in the arena
    this.energySpheres: THREE.Mesh[] = []
    for (let i = 0; i < 6; i++) {
      const sphereGeo = new THREE.SphereGeometry(1, 16, 16)
      const sphereMat = new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? 0x00ff80 : 0xff00ff,
        emissive: i % 2 === 0 ? 0x004422 : 04400ff,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.7
      })
      const sphere = new THREE.Mesh(sphereGeo, sphereMat)
      sphere.position.set(
        (Math.random() - 0.5) * 30,
        3 + Math.random() * 5,
        (Math.random() - 0.5) * 30
      )
      sphere.castShadow = true
      this.scene.add(sphere)
      this.energySpheres.push(sphere)
    }
  }

  private createPillars(): void {
    const pillarPositions = [
      { x: -15, z: -15 },
      { x: 15, z: -15 },
      { x: -15, z: 15 },
      { x: 15, z: 15 },
      { x: -8, z: 0 },
      { x: 8, z: 0 },
      { x: 0, z: -8 },
      { x: 0, z: 8 }
    ]

    for (const pos of pillarPositions) {
      const pillarGeo = new THREE.CylinderGeometry(1, 1.5, 8, 16)
      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0x2d2d4a,
        roughness: 0.6,
        metalness: 0.4
      })
      const pillar = new THREE.Mesh(pillarGeo, pillarMat)
      pillar.position.set(pos.x, 4, pos.z)
      pillar.castShadow = true
      pillar.receiveShadow = true
      this.scene.add(pillar)
    }
  }

  private createCentralStructure(): void {
    // Core geometry
    const coreGeo = new THREE.BoxGeometry(6, 12, 6)
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a3e,
      roughness: 0.5,
      metalness: 0.8
    })
    const core = new THREE.Mesh(coreGeo, coreMat)
    core.position.y = 6
    core.castShadow = true
    core.receiveShadow = true
    this.scene.add(core)

    // Core rings
    for (let i = 0; i < 3; i++) {
      const ringGeo = new THREE.TorusGeometry(5 - i * 1.5, 0.8, 8, 32, Math.PI / 2)
      const ringMat = new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? 0x00ffff : 0xff00ff,
        emissive: i % 2 === 0 ? 0x004466 : 0x440066,
        emissiveIntensity: 0.3 + i * 0.1,
        transparent: i > 0 ? true : false,
        opacity: i > 0 ? 0.5 : 1
      })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.position.y = 6 + i * 4
      ring.rotation.x = Math.PI / 2
      ring.castShadow = true
      this.scene.add(ring)
    }
  }

  public getScene(): THREE.Scene {
    return this.scene
  }

  public getCamera(): THREE.PerspectiveCamera {
    return this.camera
  }

  public getRenderer(): THREE.WebGLRenderer {
    return this.renderer
  }

  public getDimension(): 'material' | 'rift' {
    return this.dimension
  }

  public setDimension(dimension: 'material' | 'rift'): void {
    this.dimension = dimension
    this.updateDimensionVisuals()
  }

  public toggleDimension(): void {
    this.dimension = this.dimension === 'material' ? 'rift' : 'material'
    this.updateDimensionVisuals()
  }

  private updateDimensionVisuals(): void {
    const isRift = this.dimension === 'rift'

    // Update arena materials
    this.arenaMesh.material.color.set(isRift ? 0x1a0a2e : 0x1a1a2e)
    this.riftIndicator.material.opacity = isRift ? 0.6 : 0.3

    // Update energy sphere colors
    this.energySpheres.forEach((sphere, i) => {
      const newColor = isRift
        ? (i % 2 === 0 ? 0xff00ff : 0x00ffff)
        : (i % 2 === 0 ? 0x00ff80 : 0xff00ff)
      sphere.material.color.set(newColor)
    })

    // Update fog density for dimension feel
    this.fog.density = isRift ? 0.08 : 0.05
  }

  public resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  public animate(): void {
    // Rotate central structure
    const elapsed = performance.now() / 1000

    // Find the central mesh and rotate it
    const children = this.scene.children
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      if (child.isMesh && child.userData?.isCore) {
        child.rotation.y += 0.2 * elapsed
      }
    }

    // Animate energy spheres
    this.energySpheres.forEach((sphere, i) => {
      sphere.rotation.y += 0.1 * elapsed
      sphere.rotation.x += 0.08 * elapsed
    })

    this.renderer.render(this.scene, this.camera)
  }
}