import { PlanetMap } from './planetMap.js';

export class GlobeRenderer {
  private readonly planetMap: PlanetMap;

  private scene!: any; // THREE.Scene
  private camera!: any; // THREE.PerspectiveCamera
  private renderer!: any; // THREE.WebGLRenderer
  private controls!: any; // THREE.OrbitControls
  private texture!: any; // THREE.CanvasTexture
  private sphere!: any; // THREE.Mesh
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;

  constructor(planetMap: PlanetMap) {
    this.planetMap = planetMap;
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

      // Define base HSL values per cell type
      let baseH = 140; // Plains Green
      let baseS = 70;
      let baseL = 58;

      if (cell.biome === 'Tundra') {
        baseH = 210;
        baseS = 15;
        baseL = 90;
      } else if (cell.biome === 'Mountain') {
        baseH = 240;
        baseS = 5;
        baseL = 60;
      } else if (cell.biome === 'Desert') {
        baseH = 45;
        baseS = 40;
        baseL = 75;
      } else if (cell.isCoast) {
        baseH = 215;
        baseS = 85;
        baseL = 40;
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

        // Render stylized mountain peak icon for mountains with high difficulty (small area)
        if (cell.biome === 'Mountain' && cell.difficulty > 260) {
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
      } else if (cell.isCoast) {
        // Shallow coastal water WITH borders and continuous depth darkness
        this.ctx.fillStyle = hslColor;
        this.ctx.fill();

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.lineWidth = 0.8;
        this.ctx.stroke();
      }
    });

    // Draw rivers pass (after all cell fills to prevent overlapping cut-offs)
    this.ctx.strokeStyle = '#00a8ff99'; // Beautiful bright river blue
    this.ctx.lineWidth = 6.5; // Thicker to make rivers highly visible on a 4K canvas
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.planetMap.cells.forEach((cell) => {
      if (cell.riverConnections?.length) {
        const fromPt = projection(cell.centroid);
        if (!fromPt) return;

        cell.riverConnections.forEach((neighborId) => {
          const neighbor = this.planetMap.getCell(neighborId);
          if (!neighbor) return;

          // Only draw river segment on land cells to keep them out of oceans/coasts
          if (!neighbor.isLand) return;

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

    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
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
      // this.sphere.rotation.y += 0.0005;
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }
}
