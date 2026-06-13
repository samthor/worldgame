# Project Instructions: Evolving Civilization Grand Strategy

## Design Philosophy

### Scale and Evolution
The game shifts from early-game micro-management (tactical unit movement) to late-game macro-management (player-defined administrative regions, automated frontlines, logistical supply routes).

### The Map is the Mechanic
The world is a 3D sphere tiled with a procedural Spherical Voronoi diagram. Tile geometry dictates gameplay:
- **Mountains/Jungles:** Tightly clustered, jagged cells (high movement cost, low unit cap).
- **Plains:** Massive sweeping cells (fast movement, massive army capacity).

### Topological Exceptions
- **Deep Ocean & Outer Space:** Gridless freeform transit zones focused on power projection, blockades, and supply lines.
- **Coastal/Orbital Layers:** Grid exists only on landmasses and immediately adjacent layers.

### Resource Eras
Cutting-edge resources require physical supply routes. Once technology advances, older resources become ubiquitous and are mathematically abstracted.

---

## Technical Implementation

### Current State
The project is currently a **3D World Generator and Visualizer**. It generates a planetary map with topological cells, biomes, and rivers, and renders it using Three.js.

### Libraries
- **Three.js:** 3D scene, camera, orbital controls, sphere geometry.
- **D3.js + d3-geo-voronoi:** Spherical math, projections, Voronoi dual calculations.
- **simplex-noise.js:** 3D noise generation.

### Generation Pipeline (`src/mapGenerator.ts`)
1.  **3D Simplex Noise:** Evaluates $(x, y, z)$ coordinates on the sphere's surface for elevation (continents, mountains).
2.  **Rejection Sampling (Density Control):** Distributes seed points heavily on land and sparsely in the ocean.
3.  **Lloyd's Relaxation:** Multiple passes snapping points to centroids to create a consistent, playable grid (mostly hexagons/pentagons).
4.  **Topological Coastline Pass:** Uses Delaunay/Voronoi adjacency to define coastlines. Water cells sharing a vertex with land are marked as "Coast"; all other water cells are culled (leaving the deep ocean gridless).
5.  **Vertex Merging (Edge Collapse):** Snaps microscopic, fractional edges to a single midpoint for clean tile intersections.
6.  **River Generation:** Topological rivers flow uphill from coasts, branching organically between cell centroids.
7.  **Equirectangular Projection:** Maps 3D polygons onto a flat 2:1 canvas, paints biomes, and wraps it around the Three.js sphere.

---

## Conventions & Style

- **Language:** TypeScript.
- **Module System:** ESM (`import`, NEVER `require`).
- **Package Manager:** `pnpm`.
- **Formatting:** Prettier (configured in `.prettierrc.json`).
- **Comments:**
    - Multi-line (function/method): Full sentences with punctuation, no wrapping, <100 chars.
    - Inline (technical context): Concise, lower-case, no punctuation, short notes.
- **Go Naming (if applicable):** Always name return types (e.g., `func() (namedInt int)`).
- **TypeScript Runtime:** Use Node's built-in mode with flags (e.g., `--experimental-transform-types`). Avoid `tsx`.

---

## Workflows

### Setup
```bash
pnpm install
```

### Development
```bash
pnpm exec vite
```

### Testing
```bash
pnpm test
```
*Note: Tests use Node's built-in test runner with `--experimental-transform-types`.*

---

## Architecture

- `src/main.ts`: Application entry point, orchestrates generation and rendering.
- `src/mapGenerator.ts`: Core procedural generation logic (Noise, Voronoi, Relaxation, Topology).
- `src/globeRenderer.ts`: Three.js rendering pipeline, canvas texture management.
- `src/planetMap.ts`: Domain model for the generated planet grid.
- `src/types.ts`: Shared TypeScript interfaces (Cell, Biome, etc.).
- `src/deps.ts`: Centralized dependency exports (d3, SimplexNoise).
