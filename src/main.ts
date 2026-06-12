import { generatePlanetMap } from './mapGenerator.js';
import { GlobeRenderer } from './globeRenderer.js';

function main() {
  const infoElement = document.getElementById('info');
  if (infoElement) {
    infoElement.innerHTML = `
      <strong>Generating Topological Planet...</strong><br />
      Calculating Noise, Relaxation, Adjacency, and Edge Collapsing...
    `;
  }

  // Generate the planet map
  const planetMap = generatePlanetMap();

  // Initialize the renderer
  const renderer = new GlobeRenderer(planetMap);

  // Start the render loop
  renderer.startAnimation();

  // Update UI when done
  if (infoElement) {
    infoElement.innerHTML = `
      <strong>Topological Generation Complete</strong><br>
      Notice how the grid only exists on land and immediately adjacent coastal waters. Tiny edges have been collapsed into clean vertices.<br><br>
      Drag to rotate | Scroll to zoom
    `;
  }
}

// Start the application
main();
