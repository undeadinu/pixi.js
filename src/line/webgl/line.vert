
attribute vec2 aVertexPosition;
attribute vec2 aNext;
attribute float lengthSoFar;
attribute vec2 aNormal;
attribute float aMiter;
attribute vec2 aUv;


uniform mat3 translationMatrix;
uniform mat3 projectionMatrix;

uniform float thickness;

varying vec2 vUv;
varying float lineLength;


void main()
{


  vUv = vec2(aUv.x,(aMiter/2.0) + 0.5);
  vec2 pointPos = aVertexPosition.xy + vec2(aNormal * thickness/2.0 * aMiter);
  lineLength = lengthSoFar;
  gl_Position = vec4((projectionMatrix * translationMatrix * vec3(pointPos, 1.0)).xy, 0.0, 1.0);
}
