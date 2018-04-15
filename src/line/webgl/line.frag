precision highp float;

uniform float uGapSize;
uniform float uDashSize;
uniform vec4 uColor;
uniform float thickness;
uniform float uOffset;
uniform float umax;

varying vec2 vUv;
varying float lineLength;


void main(void)
{

    float d = mod(lineLength * 1.0/uDashSize + uOffset,  uGapSize/uDashSize);

    if(d>0.5) {
      discard;
    }

    gl_FragColor = vec4(vec3(1.), 1.0) * uColor;
}
