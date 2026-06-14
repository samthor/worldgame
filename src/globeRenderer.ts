import { THREE, d3, OrbitControls, EffectComposer, RenderPass, ShaderPass, OutputPass } from './deps.js';
import { PlanetMap } from './planetMap.js';
import { GlobeGeometryRenderer } from './globeGeometryRenderer.js';
import { PLANET_VERTEX_SHADER, PLANET_FRAGMENT_SHADER } from './planetShaders.js';
import { TownRenderer } from './cellRenderer.js';
import { TILT_CONFIG, ROTATION_CONFIG, TERRAIN_CONFIG } from './constants.js';
import { getBiomeHSL } from './biomes.js';
import { EDGE_SHADER } from './edgeShader.js';

export class GlobeRenderer {
  private readonly planetMap: PlanetMap;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private edgePass!: ShaderPass;
  private controls!: any;
  private texture!: THREE.CanvasTexture;
  private sphere!: THREE.Mesh;
  private landMesh?: THREE.Mesh;
  private townMesh?: THREE.Mesh;
  private oceanSphere?: THREE.Mesh;
  private sunMesh!: THREE.Mesh;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private coordsElement!: HTMLElement;
  private isGeometryMode = true;
  private isTiltMode = false;
  
  // Selection State
  private mousePos = new THREE.Vector2(-1, -1);
  private hoveredCellId: number | null = null;
  
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
      // Record mouse position for GPU picking
      this.mousePos.x = e.clientX;
      this.mousePos.y = e.clientY;

      if (this.isTiltMode && e.buttons === 1) {
        this.isDraggingTilt = true;
        const dy = e.clientY - lastY;
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

        if (cellB.isLand && cellA.elevation - cellB.elevation > 0.08) {
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

                let dx = cx - mx;
                let dy = cy - my;
                if (dx > canvasWidth / 2) {
                  cx -= canvasWidth;
                  dx = cx - mx;
                } else if (dx < -canvasWidth / 2) {
                  cx += canvasWidth;
                  dx = cx - mx;
                }

                const len = Math.hypot(dx, dy);
                if (len > 0) {
                  const ux = dx / len;
                  const uy = dy / len;

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

    // Draw rivers pass
    this.ctx.strokeStyle = '#00a8ff'; 
    this.ctx.lineWidth = 6.5; 
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.planetMap.cells.forEach((cell) => {
      if (!cell.isLand && !cell.isCoast) return;

      if (cell.riverConnections?.length) {
        const fromPt = projection(cell.centroid);
        if (!fromPt) return;

        cell.riverConnections.forEach((neighborId) => {
          const neighbor = this.planetMap.getCell(neighborId);
          if (!neighbor) return;
          if (!neighbor.isLand && !neighbor.isCoast) return;
          const toPt = projection(neighbor.centroid);
          if (!toPt) return;
          this.drawSeamSafeLine(fromPt[0], fromPt[1], toPt[0], toPt[1], canvasWidth);
        });
      }
    });
  }

  private drawSeamSafeLine(
    fx: number,
    fy: number,
    tx: number,
    ty: number,
    canvasWidth: number,
  ): void {
    const dx = tx - fx;
    if (Math.abs(dx) > canvasWidth / 2) {
      const midY = (fy + ty) / 2;
      if (dx > 0) {
        this.ctx.beginPath();
        this.ctx.moveTo(fx, fy);
        this.ctx.lineTo(0, midY);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(canvasWidth, midY);
        this.ctx.lineTo(tx, ty);
        this.ctx.stroke();
      } else {
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
      50000, 
    );
    this.camera.position.set(0, 0, 2.8);
    
    this.renderCamera = this.camera.clone();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    
    document.body.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enablePan = false; 
    
    this.controls.minDistance = 1.25;
    this.controls.maxDistance = 6.0;

    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN, 
    };

    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.texture.anisotropy = Math.min(maxAnisotropy, 8);

    const geometry = new THREE.SphereGeometry(1, 64, 64);
    const material = new THREE.MeshBasicMaterial({ map: this.texture });
    this.sphere = new THREE.Mesh(geometry, material);
    this.scene.add(this.sphere);

    const oceanGeometry = new THREE.SphereGeometry(0.998, 64, 64);
    const oceanMaterial = new THREE.MeshPhongMaterial({
      color: 0x0a1a2f,
      transparent: false,
      shininess: 30,
    });
    this.oceanSphere = new THREE.Mesh(oceanGeometry, oceanMaterial);
    this.oceanSphere.visible = false;
    this.scene.add(this.oceanSphere);

    const sunGeometry = new THREE.SphereGeometry(109.0, 32, 32);
    const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    this.sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    this.sunMesh.position.copy(this.sunPosition);
    this.scene.add(this.sunMesh);

    const ambientLight = new THREE.AmbientLight(0xffffff, 2.5);
    this.scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 3.0);
    mainLight.position.copy(this.sunPosition); 
    this.scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
    fillLight.position.set(-5, 2, -5);
    this.scene.add(fillLight);

    // Setup Post-Processing with High-Precision Render Target
    // FloatType (32-bit) provides absolute precision for 5000+ unique cell IDs
    const renderTarget = new THREE.WebGLRenderTarget(
      window.innerWidth * window.devicePixelRatio,
      window.innerHeight * window.devicePixelRatio,
      {
        type: THREE.FloatType,
        format: THREE.RGBAFormat,
        colorSpace: THREE.SRGBColorSpace,
      }
    );
    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.edgePass = new ShaderPass(EDGE_SHADER);
    this.edgePass.uniforms.hoveredCellId.value = -1.0;
    this.edgePass.uniforms.resolution.value = new THREE.Vector2(
      window.innerWidth * window.devicePixelRatio,
      window.innerHeight * window.devicePixelRatio
    );
    this.composer.addPass(this.edgePass);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
      this.edgePass.uniforms.resolution.value.set(
        window.innerWidth * window.devicePixelRatio,
        window.innerHeight * window.devicePixelRatio
      );
    });
  }

  private setupModeToggle(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'g') {
        this.toggleMode();
      }
    });

    const info = document.getElementById('info');
    if (info) {
      info.innerHTML += '<br><br><span style="color: #4ade80">Press [G] to toggle 3D Geometry Mode</span>';
    }
  }

  private toggleMode(): void {
    this.isGeometryMode = !this.isGeometryMode;
    this.updateModeVisibility();
  }

  private updateModeVisibility(): void {
    if (this.isGeometryMode) {
      this.sphere.visible = false;
      if (!this.landMesh) this.createLandMesh();
      if (!this.townMesh) this.createTownMesh();
      if (this.landMesh) this.landMesh.visible = true;
      if (this.townMesh) this.townMesh.visible = true;
      if (this.oceanSphere) this.oceanSphere.visible = true;
      if (this.sunMesh) this.sunMesh.visible = true;
      this.edgePass.enabled = true;
    } else {
      this.sphere.visible = true;
      if (this.landMesh) this.landMesh.visible = false;
      if (this.townMesh) this.townMesh.visible = false;
      if (this.oceanSphere) this.oceanSphere.visible = false;
      if (this.sunMesh) this.sunMesh.visible = false;
      this.edgePass.enabled = false;
    }
  }

  private createLandMesh(): void {
    const geoRenderer = new GlobeGeometryRenderer(this.planetMap);
    const geometry = geoRenderer.createLandGeometry();
    const material = new THREE.ShaderMaterial({
      vertexShader: PLANET_VERTEX_SHADER,
      fragmentShader: PLANET_FRAGMENT_SHADER,
      uniforms: {
        elevationScale: { value: TERRAIN_CONFIG.ELEVATION_SCALE },
        sunDirection: { value: this.sunPosition.clone().normalize() },
        hoveredCellId: { value: -1.0 },
        isLine: { value: false },
      },
      vertexColors: true,
      side: THREE.FrontSide,
      extensions: { derivatives: true },
      glslVersion: THREE.GLSL3,
    });
    this.landMesh = new THREE.Mesh(geometry, material);
    this.landMesh.frustumCulled = false;
    this.scene.add(this.landMesh);
  }

  private createTownMesh(): void {
    const townRenderer = new TownRenderer();
    const geometry = townRenderer.render(this.planetMap.cells);
    const material = new THREE.ShaderMaterial({
      vertexShader: PLANET_VERTEX_SHADER,
      fragmentShader: PLANET_FRAGMENT_SHADER,
      uniforms: {
        elevationScale: { value: TERRAIN_CONFIG.ELEVATION_SCALE },
        sunDirection: { value: this.sunPosition.clone().normalize() },
        hoveredCellId: { value: -1.0 },
        isLine: { value: false },
      },
      vertexColors: true,
      extensions: { derivatives: true },
      glslVersion: THREE.GLSL3,
    });
    this.townMesh = new THREE.Mesh(geometry, material);
    this.townMesh.frustumCulled = false;
    this.scene.add(this.townMesh);
  }

  public startAnimation(): void {
    const animate = () => {
      requestAnimationFrame(animate);

      // Perform GPU picking to find hovered cell
      this.updateHoveredCell();

      if (this.isTiltMode) {
        this.controls.minPolarAngle = this.controls.getPolarAngle();
        this.controls.maxPolarAngle = this.controls.getPolarAngle();
      } else {
        this.controls.minPolarAngle = 0;
        this.controls.maxPolarAngle = Math.PI;
      }
      
      this.controls.update();

      const dist = this.camera.position.length();
      const t = Math.max(0, Math.min(1, (dist - ROTATION_CONFIG.MIN_DISTANCE) / (ROTATION_CONFIG.MAX_DISTANCE - ROTATION_CONFIG.MIN_DISTANCE)));
      this.controls.rotateSpeed = ROTATION_CONFIG.MIN_SPEED + t * (ROTATION_CONFIG.MAX_SPEED - ROTATION_CONFIG.MIN_SPEED);

      this.tiltAngle += this.tiltVelocity;
      if (!this.isDraggingTilt) {
        this.tiltVelocity *= TILT_CONFIG.FRICTION;
        if (this.tiltAngle < TILT_CONFIG.MIN_ANGLE) {
          this.tiltVelocity += (TILT_CONFIG.MIN_ANGLE - this.tiltAngle) * TILT_CONFIG.SPRING_K;
        } else if (this.tiltAngle > TILT_CONFIG.MAX_ANGLE) {
          this.tiltVelocity += (TILT_CONFIG.MAX_ANGLE - this.tiltAngle) * TILT_CONFIG.SPRING_K;
        }
      } else {
        this.tiltVelocity *= 0.8;
      }

      this.tiltAngle = Math.max(TILT_CONFIG.MIN_ANGLE - TILT_CONFIG.OVERSHOOT_MAX, Math.min(TILT_CONFIG.MAX_ANGLE + TILT_CONFIG.OVERSHOOT_MAX, this.tiltAngle));

      this.renderCamera.copy(this.camera);
      this.renderCamera.aspect = this.camera.aspect;
      this.renderCamera.updateProjectionMatrix();

      if (this.tiltAngle !== 0) {
        const surfacePoint = this.camera.position.clone().normalize();
        const cameraDir = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDir);
        const right = new THREE.Vector3().crossVectors(this.camera.up, cameraDir).normalize();
        this.renderCamera.position.sub(surfacePoint);
        const rotation = new THREE.Matrix4().makeRotationAxis(right, -this.tiltAngle);
        this.renderCamera.position.applyMatrix4(rotation);
        this.renderCamera.quaternion.multiplyQuaternions(new THREE.Quaternion().setFromAxisAngle(right, -this.tiltAngle), this.renderCamera.quaternion);
        this.renderCamera.position.add(surfacePoint);
      }

      this.updateViewportDisplay();

      // Ensure RenderPass uses the correctly transformed camera
      const renderPass = this.composer.passes[0] as RenderPass;
      if (renderPass) renderPass.camera = this.renderCamera;

      this.composer.render();
    };
    animate();
  }

  /**
   * Performs GPU-based picking to identify the cell under the mouse.
   * Reads the raw float ID from the Alpha channel of the render target.
   */
  private updateHoveredCell(): void {
    if (!this.composer || !this.isGeometryMode) return;

    // 1. Get pixel coordinates (flipping Y for WebGL)
    const x = this.mousePos.x * window.devicePixelRatio;
    const y = (window.innerHeight - this.mousePos.y) * window.devicePixelRatio;

    // 2. Read the pixel from the composer's write buffer (the one containing the raw pass)
    // We read a 1x1 area
    const pixel = new Float32Array(4);
    this.renderer.readRenderTargetPixels(
      this.composer.readBuffer,
      x, y, 1, 1,
      pixel
    );

    // 3. Extract and decode ID
    // Our encoding: idAlpha = fCellId + 1.0;
    const rawId = pixel[3]; 
    const cellId = Math.round(rawId - 1.0);

    // 4. Update state and uniforms
    if (cellId >= 0 && cellId < this.planetMap.cells.length) {
      this.hoveredCellId = cellId;
    } else {
      this.hoveredCellId = null;
    }

    const idVal = this.hoveredCellId ?? -1.0;
    
    // Update all materials with the hovered ID
    if (this.landMesh) {
      (this.landMesh.material as THREE.ShaderMaterial).uniforms.hoveredCellId.value = idVal;
    }
    if (this.townMesh) {
      (this.townMesh.material as THREE.ShaderMaterial).uniforms.hoveredCellId.value = idVal;
    }
    if (this.edgePass) {
      this.edgePass.uniforms.hoveredCellId.value = idVal;
    }
  }

  private updateViewportDisplay(): void {
    if (!this.coordsElement) return;
    const pos = this.camera.position.clone().normalize();
    const lat = 90 - (Math.acos(pos.y) * 180) / Math.PI;
    let lon = (Math.atan2(pos.z, pos.x) * 180) / Math.PI - 180;
    if (lon < -180) lon += 360;
    if (lon > 180) lon -= 360;
    const distance = this.camera.position.length();
    const zoom = 2.8 / distance;
    const tiltIndicator = this.isTiltMode ? ' <span style="color: #fbbf24">[TILT MODE]</span>' : '';
    const tiltDeg = (this.tiltAngle * 180 / Math.PI).toFixed(1);

    let hoveredInfo = '';
    if (this.hoveredCellId !== null) {
      const cell = this.planetMap.getCell(this.hoveredCellId);
      if (cell) {
        hoveredInfo = ` | <span style="color: #4ade80">Cell: ${cell.id} (${cell.biome}, El: ${cell.elevation.toFixed(3)})</span>`;
      }
    }

    this.coordsElement.innerHTML = `Lat: ${lat.toFixed(2)} | Lng: ${lon.toFixed(2)} | Zoom: ${zoom.toFixed(2)}x | Tilt: ${tiltDeg}°${tiltIndicator}${hoveredInfo}`;
    }
    }

