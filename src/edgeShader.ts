/**
 * Edge Detection Shader
 * Performs Sobel-like edge detection on color and potentially depth.
 */
export const EDGE_SHADER = {
  uniforms: {
    'tDiffuse': { value: null },
    'resolution': { value: null },
    'thickness': { value: 1.0 },
    'hoveredCellId': { value: -1.0 },
    'neighbors': { value: new Float32Array(12).fill(-1.0) }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float thickness;
    uniform float hoveredCellId;
    uniform float neighbors[12];
    varying vec2 vUv;

    void main() {
      vec2 texel = vec2(1.0 / resolution.x, 1.0 / resolution.y) * thickness;

      // Sample 3x3 grid around current UV
      // Channel .a is normalized Cell ID (+1.0)
      
      vec4 s00 = texture2D(tDiffuse, vUv + texel * vec2(-1, -1));
      vec4 s10 = texture2D(tDiffuse, vUv + texel * vec2( 0, -1));
      vec4 s20 = texture2D(tDiffuse, vUv + texel * vec2( 1, -1));
      vec4 s01 = texture2D(tDiffuse, vUv + texel * vec2(-1,  0));
      vec4 s11 = texture2D(tDiffuse, vUv + texel * vec2( 0,  0));
      vec4 s21 = texture2D(tDiffuse, vUv + texel * vec2( 1,  0));
      vec4 s02 = texture2D(tDiffuse, vUv + texel * vec2(-1,  1));
      vec4 s12 = texture2D(tDiffuse, vUv + texel * vec2( 0,  1));
      vec4 s22 = texture2D(tDiffuse, vUv + texel * vec2( 1,  1));

      float a00 = s00.a; float a10 = s10.a; float a20 = s20.a;
      float a01 = s01.a; float a11 = s11.a; float a21 = s21.a;
      float a02 = s02.a; float a12 = s12.a; float a22 = s22.a;

      // SOBEL ON CELL ID (Alpha)
      float hId = a00 + 2.0 * a01 + a02 - a20 - 2.0 * a21 - a22;
      float vId = a00 + 2.0 * a10 + a20 - a02 - 2.0 * a12 - a22;
      float magId = sqrt(hId * hId + vId * vId);

      bool isHoveredEdge = false;
      bool isNeighborEdge = false;

      // Map the hovered hoveredCellId to its encoded Alpha value
      // This matches the encoding used in the Planet Fragment Shader.
      float target = hoveredCellId;
      
      if (hoveredCellId >= 1000.0) {
        // 1. Check for primary hovered edge
        // If current pixel OR any neighbor pixel belongs to the hovered cell ID...
        if (abs(a11 - target) < 0.1 || abs(a10 - target) < 0.1 || abs(a12 - target) < 0.1 || 
            abs(a01 - target) < 0.1 || abs(a21 - target) < 0.1) {
          // ...and there is an ID jump (magId > 0.1), then we are on the border of the hovered cell.
          isHoveredEdge = (magId > 0.1);
        }

        // 2. Check for neighbor edges
        if (!isHoveredEdge) {
          for (int i = 0; i < 12; i++) {
            float nId = neighbors[i];
            if (neighbors[i] < 1000.0) continue;
            
            if (abs(a11 - nId) < 0.1 || abs(a10 - nId) < 0.1 || abs(a12 - nId) < 0.1 || 
                abs(a01 - nId) < 0.1 || abs(a21 - nId) < 0.1) {
              if (magId > 0.1) {
                isNeighborEdge = true;
                break;
              }
            }
          }
        }
      }

      // Final mix
      vec3 edgeColor = vec3(0.0, 0.0, 0.0);
      float edgeAlpha = 0.8;

      if (isHoveredEdge) {
        edgeColor = vec3(1.0, 1.0, 1.0);
        edgeAlpha = 0.95;
      } else if (isNeighborEdge) {
        edgeColor = vec3(0.5, 0.5, 0.5); // Subtle grey for neighbors
        edgeAlpha = 0.85;
      }
      
      float idEdge = smoothstep(0.1, 0.2, magId); 
      float edgeStrength = idEdge;

      // Output original color mixed with dark (or glowing white) edges
      vec3 originalColor = s11.rgb;
      gl_FragColor = vec4(mix(originalColor, edgeColor, edgeStrength * edgeAlpha), 1.0);
    }
  `
};
