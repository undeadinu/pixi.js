import * as core from '../core';
import Texture from '../core/textures/Texture';
import getNormals from 'polyline-normals';
const tempPoint = new core.Point();
const tempPolygon = new core.Polygon();

/**
 * Base mesh class
 * @class
 * @extends PIXI.Container
 * @memberof PIXI.mesh
 */

function clamp(min, max)
{
    return Math.min(Math.max(this, min), max);
}

function duplicate(nestedArray, mirror)
{
    const out = [];

    nestedArray.forEach((x) =>
{
        const x1 = mirror ? -x : x;

        out.push(x1, x);
    });

    return out;
}
function relative(offset)
{
    return (point, index, list) =>
{
        index = clamp(index + offset, 0, list.length - 1);

        return list[index];
    };
}

function createIndex(path)
{
    const out = [];
    let count = 0;

    path.forEach((p, i) =>
    {
        out.push(count++, count++);
    });

    return out;
}
function flatten(arr)
{
    return arr.reduce(function (flat, toFlatten)
    {
        return flat.concat(Array.isArray(toFlatten) ? flatten(toFlatten) : toFlatten);
    }, []);
}

function createIndices(length)
{
    const indices = new Uint16Array(length * 6);
    let c = 0,
        index = 0;

    for (let j = 0; j < length; j++)
{
        const i = index;

        indices[c++] = i + 0;
        indices[c++] = i + 1;
        indices[c++] = i + 2;
        indices[c++] = i + 2;
        indices[c++] = i + 1;
        indices[c++] = i + 3;
        index += 2;
    }

    return indices;
}

function createUvs(length)
{
    const uvs = [];

    for (let i = 0; i < length; i++)
{
        uvs.push([i / (length - 1), 1]);
    }

    return duplicate(uvs);
}

function distance(array, ia, ib)
{
    // ia *= 2;
    // ib *= 2;
    const dx = array[ia][0] - array[ib][0];
    const dy = array[ia][1] - array[ib][1];

    return Math.sqrt(dx * dx + dy * dy);
}

function find_angle(a, b, c)
{
    const ab = Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2));
    const bc = Math.sqrt(Math.pow(b[0] - c[0], 2) + Math.pow(b[1] - c[1], 2));
    const ac = Math.sqrt(Math.pow(c[0] - a[0], 2) + Math.pow(c[1] - a[1], 2));

    return Math.acos((bc * bc + ab * ab - ac * ac) / (2 * bc * ab));
}

function cornerPoint(a, b)
{
    const midx = a[0] + (b[0] - a[0]) * 0.95;
    const midy = a[1] + (b[1] - a[1]) * 0.95;

    return [midx, midy];
}

export default class Line extends core.Container
{
    /**
     * @param {Float32Array} [path] - if you want to specify the uvs
     */
    constructor(path, opts = {})
    {
        super();

        this.path = path ? path : [];
        this.dashSize = opts.dashSize || 1;
        this.gapSize = this.dashSize / 2 + opts.gapSize || 1;
        this.closed = opts.closed || false;
        this.thickness = opts.thickness || 1;
        this.color = opts.color || 0xfffff;
        this.offset = opts.offset || 0;

        if (this.path.length > 1)
        {
            this.buildGeometry(path);
        }

        this.dirty = 0;

        this.indexDirty = 0;
        this.shouldRefresh = false;

        this.blendMode = core.BLEND_MODES.NORMAL;

        this.canvasPadding = core.settings.MESH_CANVAS_PADDING;

        this.drawMode = PIXI.DRAW_MODES.TRIANGLES;

        this.shader = null;

        this._glDatas = {};

        this.uploadUvTransform = false;

        this.pluginName = 'line';
    }
    advance(point)
    {
        this.advancing = true;
        this.path.splice(-1, 1);
        this.path.unshift(point);
        this.shouldRefresh = true;
    }
    moveTo(pt)
    {
        this.path.push(pt);
        this.shouldRefresh = true;
    }
    lineTo(pt)
    {
        this.path.push(pt);
        this.shouldRefresh = true;
    }

    buildGeometry(path)
    {
        let len = this.closed ? path.length - 1 : path.length - 2;

        if (!this.advancing)
        {
            if (path.length >= 3)
            {
                for (let i = 0; i < len; i += 3)
                {
                    const current = path[i];
                    const mid = path[i + 1];
                    let next = path[i + 2];

                    if (this.closed && !next)
                    {
                        next = path[2];
                    }

                    const angle = find_angle(current, mid, next) * 180 / Math.PI;

                    if (angle >= 30)
                    {
                        const cornerPt1 = cornerPoint(current, mid);
                        const cornerPt2 = cornerPoint(next, mid);

                        path.splice(i + 1, 0, cornerPt1);
                        path.splice(i + 3, 0, cornerPt2);
                    }
                    len = this.closed ? path.length - 1 : path.length - 2;
                }
            }
        }
        const count = (path.length - 1) * 6;

        this.count = count;

        const tags = getNormals(path, false);

        let normals = tags.map((x) => x[0]);
        let miters = tags.map((x) => x[1]);

        normals = duplicate(normals);
        miters = duplicate(miters, true);
        const positions = duplicate(path);
        const indexUint16 = createIndices(path.length);
        const uvs = createUvs(path.length);
        const lengthSoFar = [0];

        let max = -1;

        for (let ii = 1; ii < path.length; ++ii)
        {
            const len = lengthSoFar[ii - 1] + distance(path, ii - 1, ii);

            max = Math.max(max, len);
            lengthSoFar.push(len);
        }

        this.max = max;

        this.vertices = new Float32Array(path.length * 2 * 2);
        this.uvs = new Float32Array(path.length * 2 * 2);
        this.normals = new Float32Array(path.length * 2 * 2);
        this.miters = new Float32Array(path.length * 2);
        this.lengthSoFar = new Float32Array(path.length * 2);

        this.vertices.set(flatten(positions));

        this.uvs.set(flatten(uvs));
        this.normals.set(flatten(normals));
        this.lengthSoFar.set(flatten(duplicate(lengthSoFar)));

        this.miters.set(flatten(miters));
        this.indices = new Uint16Array(indexUint16);
        this.indexDirty ++;
        this.dirty++;

        this.path = path;
    }

    /**
     * Renders the object using the WebGL renderer
     *
     * @private
     * @param {PIXI.WebGLRenderer} renderer - a reference to the WebGL renderer
     */
    _renderWebGL(renderer)
    {
        this.refresh();
        renderer.setObjectRenderer(renderer.plugins[this.pluginName]);
        renderer.plugins[this.pluginName].render(this);
    }

    /**
     * Renders the object using the Canvas renderer
     *
     * @private
     * @param {PIXI.CanvasRenderer} renderer - The canvas renderer.
     */
    _renderCanvas(renderer)
    {
        this.refresh();
        renderer.plugins[this.pluginName].render(this);
    }

    /**
     * multiplies uvs only if uploadUvTransform is false
     * call it after you change uvs manually
     * make sure that texture is valid
     */
    multiplyUvs()
    {
        if (!this.uploadUvTransform)
        {
            // this._uvTransform.multiplyUvs(this.uvs);
        }
    }

    /**
     * Refreshes uvs for generated meshes (rope, plane)
     * sometimes refreshes vertices too
     *
     * @param {boolean} [forceUpdate=false] if true, matrices will be updated any case
     */
    refresh(forceUpdate)
    {
        // if (this._uvTransform.update(forceUpdate))
        // {
        //     this._refresh();
        // }
        if (this.path.length > 0 && this.shouldRefresh)
        {
            this.shouldRefresh = false;
            this.buildGeometry(this.path);
        }
    }

    /**
     * re-calculates mesh coords
     * @protected
     */
    _refresh()
    {

        /* empty */
    }

    /**
     * Returns the bounds of the mesh as a rectangle. The bounds calculation takes the worldTransform into account.
     *
     */
    _calculateBounds()
    {
        // TODO - we can cache local bounds and use them if they are dirty (like graphics)
        this._bounds.addVertices(this.transform, this.vertices, 0, this.vertices.length);
    }

    /**
     * Tests if a point is inside this mesh. Works only for TRIANGLE_MESH
     *
     * @param {PIXI.Point} point - the point to test
     * @return {boolean} the result of the test
     */
    containsPoint(point)
    {
        if (!this.getBounds().contains(point.x, point.y))
        {
            return false;
        }

        this.worldTransform.applyInverse(point, tempPoint);

        const vertices = this.vertices;
        const points = tempPolygon.points;
        const indices = this.indices;
        const len = this.indices.length;
        const step = this.drawMode === Line.DRAW_MODES.TRIANGLES ? 3 : 1;

        for (let i = 0; i + 2 < len; i += step)
        {
            const ind0 = indices[i] * 2;
            const ind1 = indices[i + 1] * 2;
            const ind2 = indices[i + 2] * 2;

            points[0] = vertices[ind0];
            points[1] = vertices[ind0 + 1];
            points[2] = vertices[ind1];
            points[3] = vertices[ind1 + 1];
            points[4] = vertices[ind2];
            points[5] = vertices[ind2 + 1];

            if (tempPolygon.contains(tempPoint.x, tempPoint.y))
            {
                return true;
            }
        }

        return false;
    }

    /**
     * The tint applied to the mesh. This is a hex value. A value of 0xFFFFFF will remove any tint effect.
     *
     * @member {number}
     * @default 0xFFFFFF
     */
    get color()
    {
        return core.utils.rgb2hex(this.colorRgb);
    }

    set color(value) // eslint-disable-line require-jsdoc
    {
        this.colorRgb = core.utils.hex2rgb(value, this.colorRgb);
    }
    get texture()
    {
        return this._texture;
    }

    set texture(value) // eslint-disable-line require-jsdoc
    {
        if (this._texture === value)
        {
            return;
        }

        this._texture = value;

        if (value)
        {
            // wait for the texture to load
            if (value.baseTexture.hasLoaded)
            {
                this._onTextureUpdate();
            }
            else
            {
                value.once('update', this._onTextureUpdate, this);
            }
        }
    }

}

/**
 * Different drawing buffer modes supported
 *
 * @static
 * @constant
 * @type {object}
 * @property {number} TRIANGLE_MESH
 * @property {number} TRIANGLES
 */
Line.DRAW_MODES = {
    TRIANGLE_MESH: 0,
    TRIANGLES: 1,
};
