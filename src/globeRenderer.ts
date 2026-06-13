import { THREE, d3, OrbitControls } from './deps.js';
import { PlanetMap } from './planetMap.js';

export class GlobeRenderer {
  private readonly planetMap: PlanetMap;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: any;
  private texture!: THREE.CanvasTexture;
  private sphere!: THREE.Mesh;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private coordsElement!: HTMLElement;

  constructor(planetMap: PlanetMap) {
    this.planetMap = planetMap;
    this.coordsElement = document.getElementById('coords')!;
    this.initCanvas();
    this.initThree();
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

      // Define base HSL values per cell type (inspired from Civilization)
      let baseH = 80;  // Plains (golden-green)
      let baseS = 50;
      let baseL = 56;

      if (cell.biome === 'Snow') {
        baseH = 210;
        baseS = 5;
        baseL = 95; // Crisp polar white
      } else if (cell.biome === 'Tundra') {
        baseH = 160;
        baseS = 10;
        baseL = 82; // Snow-patched subpolar grey-green
      } else if (cell.biome === 'Mountain') {
        baseH = 240;
        baseS = 4;
        baseL = 60; // Slate gray mountain peaks
      } else if (cell.biome === 'Hills') {
        baseH = 110;
        baseS = 40;
        baseL = 55; // Earthy rolling hills sage-green
      } else if (cell.biome === 'Desert') {
        baseH = 42;
        baseS = 65;
        baseL = 74; // Warm arid sand-yellow
      } else if (cell.biome === 'Grassland') {
        baseH = 135;
        baseS = 65;
        baseL = 48; // Rich, lush, temperate grass-green
      } else if (cell.biome === 'Marsh') {
        baseH = 100;
        baseS = 25;
        baseL = 32; // Swampy bog moss-green!
      } else if (cell.isCoast) {
        baseH = 210;
        baseS = 85;
        baseL = 40; // Vibrant shallow coastal water
      }

      // Map difficulty (1 / area) continuously to a [0, 1] factor using log-scale.
      // Typical difficulty ranges from 40 (large plain) to 1000 (small peak).
      const logMin = Math.log(40);
      const logMax = Math.log(1000);
      const logVal = Math.log(Math.max(cell.difficulty, 40));
      const factor = Math.min(Math.max((logVal - logMin) / (logMax - logMin), 0), 1);

      // Lightness decreases continuously with difficulty (making hard areas darker)
      const l = Math.round(baseL * (1.0 - factor * 0.45));
      const hslColor = `hsl(${baseH}, ${baseS}%, ${l}%)`;

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
            const isShared = ringB.some(pt2 => Math.hypot(pt1[0] - pt2[0], pt1[1] - pt2[1]) < 0.001);
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
                const dist = Math.hypot(sharedPts[a][0] - sharedPts[b][0], sharedPts[a][1] - sharedPts[b][1]);
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
      0.1,
      1000,
    );
    this.camera.position.z = 2.8;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

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

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  public startAnimation(): void {
    const animate = () => {
      requestAnimationFrame(animate);
      this.controls.update();
      this.updateViewportDisplay();
      this.renderer.render(this.scene, this.camera);
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

    this.coordsElement.innerText = `Lat: ${lat.toFixed(2)} | Lng: ${lon.toFixed(2)} | Zoom: ${zoom.toFixed(2)}x`;
  }
}
