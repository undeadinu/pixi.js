import * as core from '../../core';
import glCore from 'pixi-gl-core';
import { readFileSync } from 'fs';
import { join } from 'path';

const matrixIdentity = core.Matrix.IDENTITY;

/**
 * WebGL renderer plugin for tiling sprites
 *
 * @class
 * @memberof PIXI
 * @extends PIXI.ObjectRenderer
 */
export default class LineRenderer extends core.ObjectRenderer
{

    /**
     * constructor for renderer
     *
     * @param {WebGLRenderer} renderer The renderer this tiling awesomeness works for.
     */
    constructor(renderer)
    {
        super(renderer);

        this.shader = null;
    }

    /**
     * Sets up the renderer context and necessary buffers.
     *
     * @private
     */
    onContextChange()
    {
        const gl = this.renderer.gl;

        this.shader = new core.Shader(gl,
            readFileSync(join(__dirname, './line.vert'), 'utf8'),
            readFileSync(join(__dirname, './line.frag'), 'utf8'));
    }

    /**
     * renders mesh
     *
     * @param {PIXI.mesh.Mesh} mesh mesh instance
     */
    render(mesh)
    {
        const renderer = this.renderer;
        const gl = renderer.gl;

        let glData = mesh._glDatas[renderer.CONTEXT_UID];

        if (!glData)
        {
            renderer.bindVao(null);

            glData = {
                shader: this.shader,
                vertexBuffer: glCore.GLBuffer.createVertexBuffer(gl, mesh.vertices, gl.STREAM_DRAW),
                lenBuffer: glCore.GLBuffer.createVertexBuffer(gl, mesh.lengthSoFar, gl.STREAM_DRAW),
                normalBuffer: glCore.GLBuffer.createVertexBuffer(gl, mesh.normals, gl.STREAM_DRAW),
                miterBuffer: glCore.GLBuffer.createVertexBuffer(gl, mesh.miters, gl.STREAM_DRAW),
                uvsBuffer: glCore.GLBuffer.createVertexBuffer(gl, mesh.uvs, gl.STREAM_DRAW),
                indexBuffer: glCore.GLBuffer.createIndexBuffer(gl, mesh.indices, gl.STREAM_DRAW),
                vao: null,
                dirty: mesh.dirty,
                indexDirty: mesh.indexDirty,
            };

            glData.vao = new glCore.VertexArrayObject(gl)
                .addIndex(glData.indexBuffer)
                .addAttribute(glData.vertexBuffer, glData.shader.attributes.aVertexPosition, gl.FLOAT, true, 0, 0)
                .addAttribute(glData.lenBuffer, glData.shader.attributes.lengthSoFar, gl.FLOAT, true, 0, 0)
                .addAttribute(glData.uvsBuffer, glData.shader.attributes.aUv, gl.FLOAT, true, 0, 0)
                .addAttribute(glData.normalBuffer, glData.shader.attributes.aNormal, gl.FLOAT, true, 0, 0)
                .addAttribute(glData.miterBuffer, glData.shader.attributes.aMiter, gl.FLOAT, true, 0, 0);
            mesh._glDatas[renderer.CONTEXT_UID] = glData;
        }

        renderer.bindVao(glData.vao);

        if (mesh.dirty !== glData.dirty)
        {
            glData.dirty = mesh.dirty;
            glData.vertexBuffer.upload(mesh.vertices);
            glData.lenBuffer.upload(mesh.lengthSoFar);

            glData.normalBuffer.upload(mesh.normals);
            glData.miterBuffer.upload(mesh.miters);
            glData.uvsBuffer.upload(mesh.uvs);
        }

        if (mesh.indexDirty !== glData.indexDirty)
        {
            glData.indexDirty = mesh.indexDirty;
            glData.indexBuffer.upload(mesh.indices);
        }


        renderer.bindShader(glData.shader);

        // renderer.state.setBlendMode(core.utils.correctBlendMode(mesh.blendMode, texture.baseTexture.premultipliedAlpha));

        if (glData.shader.uniforms.uTransform)
        {
            if (mesh.uploadUvTransform)
            {
                glData.shader.uniforms.uTransform = mesh._uvTransform.mapCoord.toArray(true);
            }
            else
            {
                glData.shader.uniforms.uTransform = matrixIdentity.toArray(true);
            }
        }

        glData.shader.uniforms.translationMatrix = mesh.worldTransform.toArray(true);
        glData.shader.uniforms.thickness = mesh.thickness;
        glData.shader.uniforms.uOffset = mesh.offset;
        glData.shader.uniforms.uDashSize = mesh.dashSize;
        glData.shader.uniforms.uGapSize = mesh.gapSize;

        glData.shader.uniforms.uColor = core.utils.premultiplyRgba(mesh.colorRgb,
            mesh.worldAlpha, glData.shader.uniforms.uColor, 1);

        const drawMode = gl.TRIANGLES;

        glData.vao.draw(gl.TRIANGLES, mesh.count, 0);
    }
}

core.WebGLRenderer.registerPlugin('line', LineRenderer);
