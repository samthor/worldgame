export const PLANET_VERTEX_SHADER = `
  precision highp float;

  in vec3 vCellColor;
  in float vCellId;

  out vec3 vColor;
  out vec3 vViewPosition;
  out vec3 vWorldPosition;
  flat out float fCellId;

  uniform float elevationScale;
  uniform bool isLine;

  void main() {
    vColor = vCellColor;
    fCellId = vCellId;

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

  in vec3 vColor;
  in vec3 vViewPosition;
  in vec3 vWorldPosition;
  flat in float fCellId;

  out vec4 pc_fragColor;

  uniform vec3 sunDirection; 
  uniform bool isLine;
  uniform float hoveredCellId;
  uniform float neighbors[12];

  vec3 saturation(vec3 rgb, float adjustment) {
    const vec3 W = vec3(0.2125, 0.7154, 0.0721);
    vec3 intensity = vec3(dot(rgb, W));
    return mix(intensity, rgb, adjustment);
  }

  void main() {
    vec3 fdx = dFdx(vViewPosition);
    vec3 fdy = dFdy(vViewPosition);
    vec3 normal = normalize(cross(fdx, fdy));

    vec3 viewSunDir = normalize((viewMatrix * vec4(sunDirection, 0.0)).xyz);
    float diff = max(dot(normal, viewSunDir), 0.0);
    float sunIntensity = pow(diff, 1.2);

    vec3 saturatedColor = saturation(vColor, 1.45);

    float ambient = 0.32; 
    float diffuse = sunIntensity * 0.85; 

    vec3 finalColor = saturatedColor * (ambient + diffuse);
    finalColor += saturatedColor * pow(diff, 12.0) * 0.25;

    // ID ENCODING FOR GPU PICKING:
    // We encode the unique Cell ID into the Alpha channel of the render target.
    // 0.0 = Empty space / Background
    // 1.0 = Standard opaque objects (e.g. the Sun sphere, Ocean sphere)
    // >= 1000.0 = Tactical Cells (Cell ID)
    // Starting IDs at 1000 avoids collision with standard Three.js materials.
    float idAlpha = fCellId;

    if (isLine) {
      pc_fragColor = vec4(saturatedColor * 0.2, idAlpha);
    } else {
      // 1. Primary Highlight
      if (abs(fCellId - hoveredCellId) < 0.1) {
        finalColor = mix(finalColor, vec3(1.0), 0.15); 
      } else {
        // 2. Neighbor Highlight (Subtle)
        for (int i = 0; i < 12; i++) {
          if (abs(fCellId - neighbors[i]) < 0.1) {
            finalColor = mix(finalColor, vec3(1.0), 0.05);
            break;
          }
        }
      }
      pc_fragColor = vec4(finalColor, idAlpha);
    }
  }
`;
