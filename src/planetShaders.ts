export const PLANET_VERTEX_SHADER = `
  precision highp float;

  attribute vec3 vCellColor;
  
  varying vec3 vColor;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  uniform float elevationScale;

  void main() {
    vColor = vCellColor;

    float lon = position.x;
    float lat = position.y;
    float el = position.z;

    float phi = (90.0 - lat) * (3.14159265359 / 180.0);
    float theta = (lon + 180.0) * (3.14159265359 / 180.0);
    float r = 1.0 + el * elevationScale;

    vec3 sphericalPos;
    sphericalPos.x = -r * sin(phi) * cos(theta);
    sphericalPos.y = r * cos(phi);
    sphericalPos.z = r * sin(phi) * sin(theta);

    vec4 worldPosition = modelMatrix * vec4(sphericalPos, 1.0);
    vWorldPosition = worldPosition.xyz;

    vec4 mvPosition = modelViewMatrix * vec4(sphericalPos, 1.0);
    vViewPosition = mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const PLANET_FRAGMENT_SHADER = `
  precision highp float;

  varying vec3 vColor;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  void main() {
    // Calculate face normal using screen-space derivatives in view space
    // dFdx/dFdy are built-in in WebGL 2 (ESSL 3)
    vec3 fdx = dFdx(vViewPosition);
    vec3 fdy = dFdy(vViewPosition);
    vec3 normal = normalize(cross(fdx, fdy));
// Simple Lambertian lighting (in view space)
// Light is roughly overhead and slightly behind the camera
vec3 lightDir = normalize(vec3(0.3, 0.6, 1.0));
float diff = max(dot(normal, lightDir), 0.0);

// Increased ambient and diffuse contribution
vec3 ambient = vColor * 0.55;
vec3 diffuse = vColor * diff * 0.85;

gl_FragColor = vec4(ambient + diffuse, 1.0);

  }
`;
