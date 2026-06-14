export const PLANET_VERTEX_SHADER = `
  precision highp float;

  attribute vec3 vCellColor;
  
  varying vec3 vColor;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  uniform float elevationScale;
  uniform bool isLine;

  void main() {
    vColor = vCellColor;

    float lon = position.x;
    float lat = position.y;
    float el = position.z;

    float phi = (90.0 - lat) * (3.14159265359 / 180.0);
    float theta = (lon + 180.0) * (3.14159265359 / 180.0);
    
    // Physical radius
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

  uniform vec3 sunDirection; // World-space direction to the sun
  uniform bool isLine;

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
    // Transform world-space sun direction to view-space
    vec3 viewSunDir = normalize((viewMatrix * vec4(sunDirection, 0.0)).xyz);
    float diff = max(dot(normal, viewSunDir), 0.0);

    // Apply a power curve for more dramatic 'Sun' falloff
    float sunIntensity = pow(diff, 1.2);
    // 3. Color & Saturation
    // Boost base saturation to match 2D mode vibrancy
    vec3 saturatedColor = saturation(vColor, 1.45);

    // 4. Lighting Composition
    // Low ambient for deep shadows, but with colorful bounce
    float ambient = 0.32; // Slightly higher ambient for better fill
    float diffuse = sunIntensity * 0.85; 
    
    vec3 finalColor = saturatedColor * (ambient + diffuse);
    
    // Specular-like 'Sun Kick' on direct surfaces
    finalColor += saturatedColor * pow(diff, 12.0) * 0.25;

    if (isLine) {
      // Return a very dark version for outlines
      gl_FragColor = vec4(saturatedColor * 0.2, 1.0);
    } else {
      gl_FragColor = vec4(finalColor, 1.0);
    }

  }
`;
