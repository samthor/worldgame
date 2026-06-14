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

  // Helper to boost saturation
  vec3 saturation(vec3 rgb, float adjustment) {
    const vec3 W = vec3(0.2125, 0.7154, 0.0721);
    vec3 intensity = vec3(dot(rgb, W));
    return mix(intensity, rgb, adjustment);
  }

  void main() {
    // 1. Faceted Normals
    vec3 fdx = dFdx(vViewPosition);
    vec3 fdy = dFdy(vViewPosition);
    vec3 normal = normalize(cross(fdx, fdy));

    // 2. Cinematic Sun Lighting
    // Fixed Sun Direction in View Space
    vec3 lightDir = normalize(vec3(0.5, 0.8, 1.0));
    float diff = max(dot(normal, lightDir), 0.0);

    // Apply a power curve for more dramatic 'Sun' falloff
    float sunIntensity = pow(diff, 1.2);

    // 3. Color & Saturation
    // Boost base saturation to match 2D mode vibrancy
    vec3 saturatedColor = saturation(vColor, 1.45);

    // 4. Lighting Composition
    // Low ambient for deep shadows, but with colorful bounce
    float ambient = 0.32; // Slightly higher ambient for better fill
    float diffuse = sunIntensity * 0.85; // Reduced from 1.05

    vec3 finalColor = saturatedColor * (ambient + diffuse);

    // Specular-like 'Sun Kick' on direct surfaces - Tone this down
    finalColor += saturatedColor * pow(diff, 12.0) * 0.25; // Sharper falloff and lower intensity

    gl_FragColor = vec4(finalColor, 1.0);

  }
`;
