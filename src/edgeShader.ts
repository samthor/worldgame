/**
 * Edge Detection Shader
 * Performs Sobel-like edge detection on color and potentially depth.
 */
export const EDGE_SHADER = {
  uniforms: {
    'tDiffuse': { value: null },
    'resolution': { value: null },
    'thickness': { value: 1.0 }
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
    varying vec2 vUv;

    void main() {
      vec2 texel = vec2(1.0 / resolution.x, 1.0 / resolution.y) * thickness;

      // Sample 3x3 grid around current UV
      // Channel .a is normalized Cell ID (Perfectly solid per cell due to 'flat' varyings)
      
      float a00 = texture2D(tDiffuse, vUv + texel * vec2(-1, -1)).a;
      float a10 = texture2D(tDiffuse, vUv + texel * vec2( 0, -1)).a;
      float a20 = texture2D(tDiffuse, vUv + texel * vec2( 1, -1)).a;
      float a01 = texture2D(tDiffuse, vUv + texel * vec2(-1,  0)).a;
      float a11 = texture2D(tDiffuse, vUv + texel * vec2( 0,  0)).a;
      float a21 = texture2D(tDiffuse, vUv + texel * vec2( 1,  0)).a;
      float a02 = texture2D(tDiffuse, vUv + texel * vec2(-1,  1)).a;
      float a12 = texture2D(tDiffuse, vUv + texel * vec2( 0,  1)).a;
      float a22 = texture2D(tDiffuse, vUv + texel * vec2( 1,  1)).a;

      // SOBEL ON CELL ID (Alpha)
      float hId = a00 + 2.0 * a01 + a02 - a20 - 2.0 * a21 - a22;
      float vId = a00 + 2.0 * a10 + a20 - a02 - 2.0 * a12 - a22;
      float magId = sqrt(hId * hId + vId * vId);

      // Final mix
      vec3 edgeColor = vec3(0.0, 0.0, 0.0);
      
      // Threshold: Since we use 32-bit floats and raw IDs, 
      // any magId > 0.1 is a definitive boundary.
      float idEdge = smoothstep(0.1, 0.2, magId); 
      
      float edgeStrength = idEdge;

      // Output original color mixed with dark edges
      vec3 originalColor = texture2D(tDiffuse, vUv).rgb;
      gl_FragColor = vec4(mix(originalColor, edgeColor, edgeStrength * 0.8), 1.0);
    }
  `
};
