import { THREE, d3, OrbitControls } from './deps.js';
import { PlanetMap } from './planetMap.js';
import { GlobeGeometryRenderer } from './globeGeometryRenderer.js';
import { PLANET_VERTEX_SHADER, PLANET_FRAGMENT_SHADER } from './planetShaders.js';
import { TownRenderer } from './cellRenderer.js';
import { TILT_CONFIG, ROTATION_CONFIG } from './constants.js';
import { getBiomeHSL } from './biomes.js';

export class GlobeRenderer {
  private readonly planetMap: PlanetMap;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: any;
  private texture!: THREE.CanvasTexture;
  private sphere!: THREE.Mesh;
  private landMesh?: THREE.Mesh;
  private edgeMesh?: THREE.Mesh; // Changed from LineSegments to Mesh
  private townMesh?: THREE.Mesh;
  private oceanSphere?: THREE.Mesh;
  private sunMesh!: THREE.Mesh;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private coordsElement!: HTMLElement;
  private isGeometryMode = true;
  private isTiltMode = false;
  
  // World-Space Sun position (Equatorial Plane, 1 AU in Earth-Radius units)
  private sunPosition = new THREE.Vector3(23481, 0, 0);
  
  // Tilt State
  private tiltAngle = TILT_CONFIG.DEFAULT_ANGLE;
  private tiltVelocity = 0;
  private isDraggingTilt = false;
  private renderCamera!: THREE.PerspectiveCamera;

  constructor(planetMap: PlanetMap) {
    this.planetMap = planetMap;
    this.coordsElement = document.getElementById('coords')!;
    this.initCanvas();
    this.initThree();
    this.setupModeToggle();
    this.setupKeyListeners();

    // Initial state set based on default
    this.updateModeVisibility();
  }

  private setupKeyListeners(): void {
    let lastY = 0;

    const handleKeys = (e: KeyboardEvent) => {
      const isPressed = e.metaKey || e.ctrlKey;
      if (isPressed !== this.isTiltMode) {
        this.isTiltMode = isPressed;
        if (!this.isTiltMode) this.isDraggingTilt = false;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (this.isTiltMode && e.buttons === 1) {
        this.isDraggingTilt = true;
        const dy = e.clientY - lastY;
        // Inverted: dragging DOWN (+dy) now tilts camera UP (-tiltAngle)
        // Wait, user said "direction is wrong way around - just invert the delta change".
        // Currently: +dy (dragging down) results in +tiltAngle (camera leans forward).
        // If that was wrong, then dragging DOWN should result in -tiltAngle.
        this.tiltVelocity -= dy * TILT_CONFIG.SENSITIVITY; 
      }
      lastY = e.clientY;
    };

    const handleMouseDown = (e: MouseEvent) => {
      lastY = e.clientY;
      if (this.isTiltMode) {
        this.tiltVelocity = 0; // Stop any existing fling
      }
    };

    const handleMouseUp = () => {
      this.isDraggingTilt = false;
    };

    window.addEventListener('keydown', handleKeys);
    window.addEventListener('keyup', handleKeys);
    window.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('mousedown', handleMouseDown, true);
    window.addEventListener('mouseup', handleMouseUp, true);
    
    window.addEventListener('blur', () => {
      this.isTiltMode = false;
      this.isDraggingTilt = false;
    });
  }
  private initCanvas(): void {
    const canvasWidth = 4096; // 4K resolution width
    const canvasHeight = 2048; // 4K resolution height
    this.canvas = document.createElement('canvas');
    this.canvas.width = canvasWidth;
    this.canvas.height = canvasHeight;
    this.ctx = this.canvas.getContext('2d')!;

    this.drawMap();
  }

  private drawMap(): void {
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    const projection = d3
      .geoEquirectangular()
      .translate([canvasWidth / 2, canvasHeight / 2])
      .scale(canvasWidth / (2 * Math.PI));
    const path = d3.geoPath(projection, this.ctx);

    // Paint background deep ocean blue (Gridless void)
    this.ctx.fillStyle = '#0a1a2f';
    this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw the cells
    this.planetMap.cells.forEach((cell) => {
      // Reconstruct GeoJSON feature for d3.geoPath
      const feature = {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: cell.coordinates,
        },
      };

      // Map difficulty (1 / area) continuously to a [0, 1] factor using log-scale.
      const logMin = Math.log(40);
      const logMax = Math.log(1000);
      const logVal = Math.log(Math.max(cell.difficulty, 40));
      const factor = Math.min(Math.max((logVal - logMin) / (logMax - logMin), 0), 1);

      // Lightness decreases continuously with difficulty (making hard areas darker)
      const lightnessMod = 1.0 - factor * 0.45;
      const hslColor = getBiomeHSL(cell.biome, cell.isCoast, lightnessMod);

      this.ctx.beginPath();
      path(feature);

      if (cell.isLand) {
        this.ctx.fillStyle = hslColor;
        this.ctx.fill();

        // Draw land borders
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        this.ctx.lineWidth = 1.0;
        this.ctx.stroke();

        // Render stylized mountain peak icon for ALL mountain cells
        if (cell.biome === 'Mountain') {
          const projectedCentroid = projection(cell.centroid);
          if (projectedCentroid) {
            const [cx, cy] = projectedCentroid;

            // Draw Peak 1 (Main/background peak)
            this.ctx.beginPath();
            this.ctx.moveTo(cx - 2, cy - 8);
            this.ctx.lineTo(cx - 10, cy + 8);
            this.ctx.lineTo(cx + 6, cy + 8);
            this.ctx.closePath();
            this.ctx.fillStyle = '#27272a'; // Deep charcoal gray fill
            this.ctx.fill();
            this.ctx.strokeStyle = '#f4f4f5'; // Light snow cap ridge line
            this.ctx.lineWidth = 1.0;
            this.ctx.stroke();

            // Draw Peak 2 (Foreground peak overlapping)
            this.ctx.beginPath();
            this.ctx.moveTo(cx + 4, cy - 2);
            this.ctx.lineTo(cx - 2, cy + 8);
            this.ctx.lineTo(cx + 10, cy + 8);
            this.ctx.closePath();
            this.ctx.fillStyle = '#18181b'; // Darker charcoal fill
            this.ctx.fill();
            this.ctx.strokeStyle = '#e4e4e7'; // Ridge line
            this.ctx.lineWidth = 1.0;
            this.ctx.stroke();
          }
        }

        // Render stylized hill crescent icon for ALL hill cells
        if (cell.biome === 'Hills') {
          const projectedCentroid = projection(cell.centroid);
          if (projectedCentroid) {
            const [cx, cy] = projectedCentroid;

            // Draw primary retro crescent arc
            this.ctx.beginPath();
            this.ctx.arc(cx, cy + 2, 4, Math.PI, 0, false);
            this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
            this.ctx.lineWidth = 1.2;
            this.ctx.stroke();

            // Draw secondary offset crescent arc for a lovely hand-drawn group feel
            this.ctx.beginPath();
            this.ctx.arc(cx + 4, cy + 4, 2.5, Math.PI, 0, false);
            this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            this.ctx.lineWidth = 1.0;
            this.ctx.stroke();
          }
        }
      } else if (cell.isCoast) {
        // Shallow coastal water WITH borders and continuous depth darkness
        this.ctx.fillStyle = hslColor;
        this.ctx.fill();

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.lineWidth = 0.8;
        this.ctx.stroke();
      }
    });

    // Draw implied 3D cliff shadows between steep elevation drops (high to low land)
    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.58)'; // Darker, higher contrast shadow
    this.ctx.lineWidth = 4.0; // Much thicker and more obvious cliff line
    this.ctx.lineCap = 'round';

    this.planetMap.cells.forEach((cellA) => {
      if (!cellA.isLand) return;

      cellA.neighbors.forEach((neighborId) => {
        const cellB = this.planetMap.getCell(neighborId);
        if (!cellB) return;

        // We only draw the cliff shadow if cellA is land, and is significantly HIGHER than cellB
        // AND cellB is also a land cell (restricts cliffs strictly to inland plateaus/mountains, keeping coastlines gentle!)
        // Lowered elevation threshold to 0.08 to make cliffs much more common across the globe.
        if (cellB.isLand && cellA.elevation - cellB.elevation > 0.08) {
          // Find the shared vertices directly in the merged, visible cell coordinates
          const ringA = (cellA.coordinates[0] || []).slice(0, -1);
          const ringB = (cellB.coordinates[0] || []).slice(0, -1);

          const sharedPts: [number, number][] = [];
          for (const pt1 of ringA) {
            const isShared = ringB.some(
              (pt2) => Math.hypot(pt1[0] - pt2[0], pt1[1] - pt2[1]) < 0.001,
            );
            if (isShared) {
              sharedPts.push(pt1);
            }
          }

          if (sharedPts.length >= 2) {
            // Find the two furthest apart shared merged vertices (the actual visible edge endpoints)
            let maxDist = -1;
            let p1_merged = sharedPts[0];
            let p2_merged = sharedPts[1];

            for (let a = 0; a < sharedPts.length; a++) {
              for (let b = a + 1; b < sharedPts.length; b++) {
                const dist = Math.hypot(
                  sharedPts[a][0] - sharedPts[b][0],
                  sharedPts[a][1] - sharedPts[b][1],
                );
                if (dist > maxDist) {
                  maxDist = dist;
                  p1_merged = sharedPts[a];
                  p2_merged = sharedPts[b];
                }
              }
            }

            const p1 = projection(p1_merged);
            const p2 = projection(p2_merged);

            if (p1 && p2) {
              const centroidB = projection(cellB.centroid);
              if (centroidB) {
                const mx = (p1[0] + p2[0]) / 2;
                const my = (p1[1] + p2[1]) / 2;

                let cx = centroidB[0];
                let cy = centroidB[1];

                // Correct wrap-around of lower cell centroid for accurate offset direction
                let dx = cx - mx;
                let dy = cy - my;
                if (dx > canvasWidth / 2) {
                  cx -= canvasWidth;
                  dx = cx - mx;
                } else if (dx < -canvasWidth / 2) {
                  cx += canvasWidth;
                  dx = cx - mx;
                }

                // Calculate normalized vector pointing from edge center towards lower cell centroid
                const len = Math.hypot(dx, dy);
                if (len > 0) {
                  const ux = dx / len;
                  const uy = dy / len;

                  // Offset by 3.5 pixels strictly into the lower cell (cellB)
                  const offset = 3.5;
                  const sx1 = p1[0] + ux * offset;
                  const sy1 = p1[1] + uy * offset;
                  const sx2 = p2[0] + ux * offset;
                  const sy2 = p2[1] + uy * offset;

                  this.drawSeamSafeLine(sx1, sy1, sx2, sy2, canvasWidth);
                } else {
                  this.drawSeamSafeLine(p1[0], p1[1], p2[0], p2[1], canvasWidth);
                }
              } else {
                this.drawSeamSafeLine(p1[0], p1[1], p2[0], p2[1], canvasWidth);
              }
            }
          }
        }
      });
    });

    // Draw rivers pass (after all cell fills to prevent overlapping cut-offs)
    this.ctx.strokeStyle = '#00a8ff'; // Beautiful bright river blue
    this.ctx.lineWidth = 6.5; // Thicker to make rivers highly visible on a 4K canvas
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.planetMap.cells.forEach((cell) => {
      // Don't draw rivers if they are in the deep ocean (allow them on land and shallow coast!)
      if (!cell.isLand && !cell.isCoast) return;

      if (cell.riverConnections?.length) {
        const fromPt = projection(cell.centroid);
        if (!fromPt) return;

        cell.riverConnections.forEach((neighborId) => {
          const neighbor = this.planetMap.getCell(neighborId);
          if (!neighbor) return;

          // Only draw river segment on land or coast cells to keep them out of deep ocean
          if (!neighbor.isLand && !neighbor.isCoast) return;

          const toPt = projection(neighbor.centroid);
          if (!toPt) return;

          // Draw a solid, seam-safe line directly from cell midpoint to neighbor midpoint
          this.drawSeamSafeLine(fromPt[0], fromPt[1], toPt[0], toPt[1], canvasWidth);
        });
      }
    });
  }

  /**
   * Safely draws a line segment on an equirectangular canvas, splitting the line
   * and wrapping it around the boundaries if it crosses the 180° longitude meridian seam.
   */
  private drawSeamSafeLine(
    fx: number,
    fy: number,
    tx: number,
    ty: number,
    canvasWidth: number,
  ): void {
    const dx = tx - fx;
    if (Math.abs(dx) > canvasWidth / 2) {
      // Meridian seam crossed! Split and draw off-canvas edges.
      const midY = (fy + ty) / 2;
      if (dx > 0) {
        // fx is near 0, tx is near canvasWidth. Split off both sides.
        this.ctx.beginPath();
        this.ctx.moveTo(fx, fy);
        this.ctx.lineTo(0, midY);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(canvasWidth, midY);
        this.ctx.lineTo(tx, ty);
        this.ctx.stroke();
      } else {
        // fx is near canvasWidth, tx is near 0. Split off both sides.
        this.ctx.beginPath();
        this.ctx.moveTo(fx, fy);
        this.ctx.lineTo(canvasWidth, midY);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(0, midY);
        this.ctx.lineTo(tx, ty);
        this.ctx.stroke();
      }
    } else {
      // Standard line (within the same hemisphere/seam)
      this.ctx.beginPath();
      this.ctx.moveTo(fx, fy);
      this.ctx.lineTo(tx, ty);
      this.ctx.stroke();
    }
  }

  private initThree(): void {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.01,
      50000, // Extended far plane for astronomical sun distance
    );
    // Initial position
    this.camera.position.set(0, 0, 2.8);
    
    this.renderCamera = this.camera.clone();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    // Disable tone mapping to get raw, punchy colors like older Three.js versions
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    
    document.body.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enablePan = false; // Completely disable panning
    
    // Zoom limits to prevent entering the planet
    this.controls.minDistance = 1.25;
    this.controls.maxDistance = 6.0;

    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN, // This is still mapped but enablePan=false will block it
    };

    // Limits for better 3D navigation
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI; // Allow full access to South Pole

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    // Check maximum anisotropy of WebGL capabilities and apply 8x anisotropic filtering
    // to keep the texture razor-sharp at extreme angles near the sphere horizon.
    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.texture.anisotropy = Math.min(maxAnisotropy, 8);

    const geometry = new THREE.SphereGeometry(1, 64, 64);
    const material = new THREE.MeshBasicMaterial({ map: this.texture });
    this.sphere = new THREE.Mesh(geometry, material);
    this.scene.add(this.sphere);

    // Create Ocean Sphere (slightly smaller to avoid Z-fighting with land geometry)
    const oceanGeometry = new THREE.SphereGeometry(0.998, 64, 64);
    const oceanMaterial = new THREE.MeshPhongMaterial({
      color: 0x0a1a2f,
      transparent: false,
      shininess: 30,
    });
    this.oceanSphere = new THREE.Mesh(oceanGeometry, oceanMaterial);
    this.oceanSphere.visible = false;
    this.scene.add(this.oceanSphere);

    // Create Sun Mesh (visual indicator)
    // Scale: 109x Earth Radius
    const sunGeometry = new THREE.SphereGeometry(109.0, 32, 32);
    const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    this.sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    this.sunMesh.position.copy(this.sunPosition);
    this.scene.add(this.sunMesh);

    // Setup Lighting for Geometry Mode (High Brightness Levels)
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.5);
    this.scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 3.0);
    mainLight.position.copy(this.sunPosition); // Point from sun towards (0,0,0)
    this.scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
    fillLight.position.set(-5, 2, -5);
    this.scene.add(fillLight);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  private setupModeToggle(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'g') {
        this.toggleMode();
      }
    });

    // Also add to UI info
    const info = document.getElementById('info');
    if (info) {
      info.innerHTML +=
        '<br><br><span style="color: #4ade80">Press [G] to toggle 3D Geometry Mode</span>';
    }
  }

  private toggleMode(): void {
    this.isGeometryMode = !this.isGeometryMode;
    this.updateModeVisibility();
  }

  private updateModeVisibility(): void {
    if (this.isGeometryMode) {
      // Switch to Geometry Mode
      this.sphere.visible = false;
      if (!this.landMesh) {
        this.createLandMesh();
      }
      if (!this.townMesh) {
        this.createTownMesh();
      }
      if (!this.edgeMesh) {
        this.createEdgeMesh();
      }
      if (this.landMesh) this.landMesh.visible = true;
      if (this.townMesh) this.townMesh.visible = true;
      if (this.edgeMesh) this.edgeMesh.visible = true;
      if (this.oceanSphere) this.oceanSphere.visible = true;
      if (this.sunMesh) this.sunMesh.visible = true;
    } else {
      // Switch to Texture Mode
      this.sphere.visible = true;
      if (this.landMesh) this.landMesh.visible = false;
      if (this.townMesh) this.townMesh.visible = false;
      if (this.edgeMesh) this.edgeMesh.visible = false;
      if (this.oceanSphere) this.oceanSphere.visible = false;
      if (this.sunMesh) this.sunMesh.visible = false;
    }
  }

  private createLandMesh(): void {
    const geoRenderer = new GlobeGeometryRenderer(this.planetMap);
    const geometry = geoRenderer.createLandGeometry();

    const material = new THREE.ShaderMaterial({
      vertexShader: PLANET_VERTEX_SHADER,
      fragmentShader: PLANET_FRAGMENT_SHADER,
      uniforms: {
        elevationScale: { value: 0.15 },
        sunDirection: { value: this.sunPosition.clone().normalize() },
        isLine: { value: false },
      },
      vertexColors: true,
      side: THREE.FrontSide,
      extensions: { derivatives: true }, // Required for dFdx/dFdy in fragment shader
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    this.landMesh = new THREE.Mesh(geometry, material);
    this.landMesh.frustumCulled = false; // Important because "flat" positions aren't the real spherical ones
    this.scene.add(this.landMesh);
  }

  private createEdgeMesh(): void {
    const geoRenderer = new GlobeGeometryRenderer(this.planetMap);
    const geometry = geoRenderer.createEdgeGeometry();

    const material = new THREE.ShaderMaterial({
      vertexShader: PLANET_VERTEX_SHADER,
      fragmentShader: PLANET_FRAGMENT_SHADER,
      uniforms: {
        elevationScale: { value: 0.15 },
        sunDirection: { value: this.sunPosition.clone().normalize() },
        isLine: { value: true },
      },
      vertexColors: true,
      side: THREE.DoubleSide,
    });

    this.edgeMesh = new THREE.Mesh(geometry, material);
    this.edgeMesh.frustumCulled = false;
    this.scene.add(this.edgeMesh);
  }

  private createTownMesh(): void {
    const townRenderer = new TownRenderer();
    const geometry = townRenderer.render(this.planetMap.cells);

    const material = new THREE.ShaderMaterial({
      vertexShader: PLANET_VERTEX_SHADER,
      fragmentShader: PLANET_FRAGMENT_SHADER,
      uniforms: {
        elevationScale: { value: 0.15 },
        sunDirection: { value: this.sunPosition.clone().normalize() },
        isLine: { value: false },
      },
      vertexColors: true,
      extensions: { derivatives: true },
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    this.townMesh = new THREE.Mesh(geometry, material);
    this.townMesh.frustumCulled = false;
    this.scene.add(this.townMesh);
  }

  public startAnimation(): void {
    const animate = () => {
      requestAnimationFrame(animate);

      // Disable vertical tilt in OrbitControls when in TILT mode to avoid conflicts
      if (this.isTiltMode) {
        this.controls.minPolarAngle = this.controls.getPolarAngle();
        this.controls.maxPolarAngle = this.controls.getPolarAngle();
      } else {
        this.controls.minPolarAngle = 0;
        this.controls.maxPolarAngle = Math.PI;
      }
      
      this.controls.update();

      // Dynamic Rotation Speed based on distance (Zoom-Sensitive)
      const dist = this.camera.position.length();
      const t = Math.max(0, Math.min(1, (dist - ROTATION_CONFIG.MIN_DISTANCE) / (ROTATION_CONFIG.MAX_DISTANCE - ROTATION_CONFIG.MIN_DISTANCE)));
      this.controls.rotateSpeed = ROTATION_CONFIG.MIN_SPEED + t * (ROTATION_CONFIG.MAX_SPEED - ROTATION_CONFIG.MIN_SPEED);

      // TILT PHYSICS LOOP
      // 1. Apply Velocity
      this.tiltAngle += this.tiltVelocity;
      
      // 2. Apply Friction
      if (!this.isDraggingTilt) {
        this.tiltVelocity *= TILT_CONFIG.FRICTION;
      } else {
        // While dragging, we damp velocity slightly to keep it manageable
        this.tiltVelocity *= 0.8;
      }

      // 3. Spring-back from overshoots (Elastic boundaries)
      // Only rollback after the user has stopped actively dragging
      if (!this.isDraggingTilt) {
        if (this.tiltAngle < TILT_CONFIG.MIN_ANGLE) {
          const diff = TILT_CONFIG.MIN_ANGLE - this.tiltAngle;
          this.tiltVelocity += diff * TILT_CONFIG.SPRING_K;
        } else if (this.tiltAngle > TILT_CONFIG.MAX_ANGLE) {
          const diff = TILT_CONFIG.MAX_ANGLE - this.tiltAngle;
          this.tiltVelocity += diff * TILT_CONFIG.SPRING_K;
        }
      }

      // 4. Hard Clamps (Safety limits)
      this.tiltAngle = Math.max(
        TILT_CONFIG.MIN_ANGLE - TILT_CONFIG.OVERSHOOT_MAX,
        Math.min(TILT_CONFIG.MAX_ANGLE + TILT_CONFIG.OVERSHOOT_MAX, this.tiltAngle)
      );

      // Update render camera based on controls camera
      this.renderCamera.copy(this.camera);
      this.renderCamera.aspect = this.camera.aspect;
      this.renderCamera.updateProjectionMatrix();

      if (this.tiltAngle !== 0) {
        // TILT LOGIC: Rotate around the point on the surface (r=1.0) directly under the camera
        const surfacePoint = this.camera.position.clone().normalize();
        
        const cameraDir = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDir);
        const right = new THREE.Vector3().crossVectors(this.camera.up, cameraDir).normalize();

        this.renderCamera.position.sub(surfacePoint);
        
        const rotation = new THREE.Matrix4().makeRotationAxis(right, -this.tiltAngle);
        this.renderCamera.position.applyMatrix4(rotation);
        this.renderCamera.quaternion.multiplyQuaternions(
          new THREE.Quaternion().setFromAxisAngle(right, -this.tiltAngle),
          this.renderCamera.quaternion
        );
        
        this.renderCamera.position.add(surfacePoint);
      }

      this.updateViewportDisplay();
      this.renderer.render(this.scene, this.renderCamera);
    };
    animate();
  }
  /**
   * Updates the HTML label with current camera-centered lat/lng and zoom level.
   */
  private updateViewportDisplay(): void {
    if (!this.coordsElement) return;

    const pos = this.camera.position.clone().normalize();

    // Convert Cartesian direction to Spherical coordinates
    const lat = 90 - (Math.acos(pos.y) * 180) / Math.PI;
    let lon = (Math.atan2(pos.z, pos.x) * 180) / Math.PI - 180;

    // Wrap longitude to [-180, 180]
    if (lon < -180) lon += 360;
    if (lon > 180) lon -= 360;

    // Zoom calculation: distance of 2.8 is ~1.0x zoom
    const distance = this.camera.position.length();
    const zoom = 2.8 / distance;

    const tiltIndicator = this.isTiltMode ? ' <span style="color: #fbbf24">[TILT MODE]</span>' : '';
    const tiltDeg = (this.tiltAngle * 180 / Math.PI).toFixed(1);
    
    this.coordsElement.innerHTML = `Lat: ${lat.toFixed(2)} | Lng: ${lon.toFixed(2)} | Zoom: ${zoom.toFixed(2)}x | Tilt: ${tiltDeg}°${tiltIndicator}`;
  }
}
