#!/usr/bin/env node
/**
 * Lossless web-mesh conversion of BodyParts3D OBJ layers to self-contained GLB 2.0.
 * Usage: node --expose-gc convert-bodyparts3d.mjs --source <OBJ-directory>
 *   --output <GLB-directory> [--loader <path-to-vendor/OBJLoader.js>]
 *
 * Uses the application's existing OBJLoader, preserves its FLOAT32 positions,
 * normals, triangle order and winding bit for bit, and welds only EXACT matches
 * of all six position/normal component bits. No tolerance, simplification,
 * normal recomputation, coordinate conversion, quantization or compression.
 * UVs are intentionally omitted: the application's layer materials are untextured.
 * Requires Node.js 22+ and the existing Three.js OBJLoader (no npm dependencies).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { endianness } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  assert(['--source', '--output', '--loader'].includes(key), `Unknown argument: ${key}`);
  assert(process.argv[i + 1] && !process.argv[i + 1].startsWith('--'), `Missing value for ${key}`);
  options[key.slice(2)] = path.resolve(process.argv[i + 1]);
}
assert(options.source && options.output, 'Required: --source <OBJ-directory> --output <GLB-directory>');
assert.equal(endianness(), 'LE', 'This binary writer requires a little-endian Node.js host.');
const loaderPath = options.loader ?? path.resolve(options.source, '../../vendor/examples/jsm/loaders/OBJLoader.js');
const { OBJLoader } = await import(pathToFileURL(loaderPath).href);
const files = (await readdir(options.source)).filter((file) => /^bp3d-.*\.obj$/i.test(file)).sort();
assert(files.length > 0, `No bp3d-*.obj files found in ${options.source}`);
await mkdir(options.output, { recursive: true });

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const bits = (array) => new Uint32Array(array.buffer, array.byteOffset, array.length);
const align4 = (size) => (size + 3) & ~3;
const seconds = (milliseconds) => Number((milliseconds / 1000).toFixed(3));

function inspectOBJ(text) {
  const result = { vertices: 0, normals: 0, faces: 0, triangles: 0, cornersWithoutNormal: 0 };
  for (const match of text.matchAll(/^(v|vn|f)[ \t]+([^\r\n]*)/gm)) {
    if (match[1] === 'v') result.vertices += 1;
    else if (match[1] === 'vn') result.normals += 1;
    else {
      const corners = match[2].trim().split(/\s+/);
      assert(corners.length >= 3, 'Invalid OBJ face');
      result.faces += 1;
      result.triangles += corners.length - 2;
      result.cornersWithoutNormal += corners.filter((corner) => !corner.split('/')[2]).length;
    }
  }
  return result;
}

function weldExactly(meshes) {
  const cornerCount = meshes.reduce((sum, mesh) => sum + mesh.geometry.attributes.position.count, 0);
  assert(cornerCount > 0 && cornerCount % 3 === 0, 'Input is not a nonempty triangle mesh');
  let tableSize = 1;
  while (tableSize < cornerCount / 0.7) tableSize *= 2;
  const table = new Int32Array(tableSize); // Zero means empty; stored index is +1.
  const mask = tableSize - 1;
  const positions = new Float32Array(cornerCount * 3);
  const normals = new Float32Array(cornerCount * 3);
  const positionBits = bits(positions);
  const normalBits = bits(normals);
  const indices = new Uint32Array(cornerCount);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let uniqueCount = 0;
  let corner = 0;
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    assert.equal(geometry.index, null, 'OBJLoader unexpectedly returned indexed geometry');
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    assert(normal && normal.itemSize === 3 && position.itemSize === 3, 'Position or normal attribute missing');
    assert.equal(position.count, normal.count, 'Position/normal count mismatch');
    assert(position.array instanceof Float32Array && normal.array instanceof Float32Array, 'Expected FLOAT32 source attributes');
    assert(!geometry.attributes.color, 'Vertex colors are outside this position/normal conversion contract');
    assert(mesh.position.lengthSq() === 0 && mesh.scale.x === 1 && mesh.scale.y === 1 && mesh.scale.z === 1 && mesh.quaternion.w === 1, 'Input mesh has a transform');
    const sourcePositionBits = bits(position.array);
    const sourceNormalBits = bits(normal.array);
    for (let offset = 0; offset < position.array.length; offset += 3) {
      let hash = 2166136261;
      for (let axis = 0; axis < 3; axis++) hash = Math.imul(hash ^ sourcePositionBits[offset + axis], 16777619);
      for (let axis = 0; axis < 3; axis++) hash = Math.imul(hash ^ sourceNormalBits[offset + axis], 16777619);
      hash ^= hash >>> 16;
      let slot = hash & mask;
      let index;
      for (;;) {
        if (table[slot] === 0) {
          index = uniqueCount++;
          table[slot] = index + 1;
          for (let axis = 0; axis < 3; axis++) {
            const value = position.array[offset + axis];
            assert(Number.isFinite(value) && Number.isFinite(normal.array[offset + axis]), 'Non-finite position or normal');
            positionBits[index * 3 + axis] = sourcePositionBits[offset + axis];
            normalBits[index * 3 + axis] = sourceNormalBits[offset + axis];
            min[axis] = Math.min(min[axis], value);
            max[axis] = Math.max(max[axis], value);
          }
          break;
        }
        index = table[slot] - 1;
        const target = index * 3;
        if (positionBits[target] === sourcePositionBits[offset]
          && positionBits[target + 1] === sourcePositionBits[offset + 1]
          && positionBits[target + 2] === sourcePositionBits[offset + 2]
          && normalBits[target] === sourceNormalBits[offset]
          && normalBits[target + 1] === sourceNormalBits[offset + 1]
          && normalBits[target + 2] === sourceNormalBits[offset + 2]) break;
        slot = (slot + 1) & mask;
      }
      indices[corner++] = index;
    }
  }
  return {
    positions: positions.subarray(0, uniqueCount * 3),
    normals: normals.subarray(0, uniqueCount * 3),
    // glTF disallows the maximum representable index (primitive restart value).
    indices: uniqueCount <= 65535 ? Uint16Array.from(indices) : indices,
    uniqueCount, cornerCount, min, max,
  };
}

function encodeGLB(name, mesh) {
  const arrays = [mesh.positions, mesh.normals, mesh.indices];
  let byteLength = 0;
  const bufferViews = arrays.map((array, index) => {
    const view = { buffer: 0, byteOffset: byteLength, byteLength: array.byteLength, target: index === 2 ? 34963 : 34962 };
    byteLength += align4(array.byteLength);
    return view;
  });
  const binary = Buffer.alloc(byteLength);
  arrays.forEach((array, index) => Buffer.from(array.buffer, array.byteOffset, array.byteLength).copy(binary, bufferViews[index].byteOffset));
  const document = {
    asset: { version: '2.0', generator: 'BodyParts3D exact FLOAT32 indexed layer converter', copyright: 'BodyParts3D, The Database Center for Life Science, CC BY 4.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [{ name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, mode: 4 }] }],
    buffers: [{ byteLength }],
    bufferViews,
    accessors: [
      { bufferView: 0, componentType: 5126, count: mesh.uniqueCount, type: 'VEC3', min: mesh.min, max: mesh.max },
      { bufferView: 1, componentType: 5126, count: mesh.uniqueCount, type: 'VEC3' },
      { bufferView: 2, componentType: mesh.indices instanceof Uint16Array ? 5123 : 5125, count: mesh.cornerCount, type: 'SCALAR', min: [0], max: [mesh.uniqueCount - 1] },
    ],
  };
  const json = Buffer.from(JSON.stringify(document));
  const jsonPadded = Buffer.alloc(align4(json.length), 0x20);
  json.copy(jsonPadded);
  const glb = Buffer.alloc(12 + 8 + jsonPadded.length + 8 + binary.length);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(jsonPadded.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  jsonPadded.copy(glb, 20);
  const binaryHeader = 20 + jsonPadded.length;
  glb.writeUInt32LE(binary.length, binaryHeader);
  glb.writeUInt32LE(0x004e4942, binaryHeader + 4);
  binary.copy(glb, binaryHeader + 8);
  return glb;
}

function verifyGLB(glb, sourceMeshes, expected) {
  assert.equal(glb.readUInt32LE(0), 0x46546c67, 'Bad GLB magic');
  assert.equal(glb.readUInt32LE(4), 2, 'Bad GLB version');
  assert.equal(glb.readUInt32LE(8), glb.length, 'Bad GLB length');
  const jsonLength = glb.readUInt32LE(12);
  assert.equal(jsonLength % 4, 0);
  assert.equal(glb.readUInt32LE(16), 0x4e4f534a);
  const document = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
  const binaryHeader = 20 + jsonLength;
  const binaryLength = glb.readUInt32LE(binaryHeader);
  assert.equal(glb.readUInt32LE(binaryHeader + 4), 0x004e4942);
  assert.equal(binaryLength % 4, 0);
  assert.equal(binaryHeader + 8 + binaryLength, glb.length);
  assert.equal(document.buffers.length, 1);
  assert.equal(document.buffers[0].uri, undefined, 'External buffer found');
  assert.equal(document.buffers[0].byteLength, binaryLength);
  assert.equal(document.meshes.length, 1);
  assert.equal(document.meshes[0].primitives.length, 1);
  assert.equal(document.meshes[0].primitives[0].mode, 4);
  const binary = glb.subarray(binaryHeader + 8);
  const getArray = (accessorIndex, ArrayType, components) => {
    const accessor = document.accessors[accessorIndex];
    const view = document.bufferViews[accessor.bufferView];
    const length = accessor.count * components;
    const offset = view.byteOffset + (accessor.byteOffset || 0);
    assert.equal(offset % 4, 0);
    assert.equal(view.byteLength, length * ArrayType.BYTES_PER_ELEMENT);
    assert(offset + view.byteLength <= binary.length);
    return new ArrayType(binary.buffer, binary.byteOffset + offset, length);
  };
  assert.equal(document.accessors[0].componentType, 5126);
  assert.equal(document.accessors[1].componentType, 5126);
  const positions = getArray(0, Float32Array, 3);
  const normalBits = bits(getArray(1, Float32Array, 3));
  const positionBits = bits(positions);
  const indices = getArray(2, document.accessors[2].componentType === 5123 ? Uint16Array : Uint32Array, 1);
  assert.equal(indices.length, expected.cornerCount);
  assert.equal(indices.length / 3, expected.triangles);
  assert.deepEqual(document.accessors[0].min, expected.min);
  assert.deepEqual(document.accessors[0].max, expected.max);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let corner = 0;
  for (const mesh of sourceMeshes) {
    const sourcePositionBits = bits(mesh.geometry.attributes.position.array);
    const sourceNormalBits = bits(mesh.geometry.attributes.normal.array);
    for (let offset = 0; offset < sourcePositionBits.length; offset += 3) {
      const index = indices[corner++];
      assert(index < positions.length / 3, 'Out-of-range GLB index');
      for (let axis = 0; axis < 3; axis++) {
        const target = index * 3 + axis;
        assert.equal(positionBits[target], sourcePositionBits[offset + axis], `Position changed at corner ${corner}, axis ${axis}`);
        assert.equal(normalBits[target], sourceNormalBits[offset + axis], `Normal changed at corner ${corner}, axis ${axis}`);
        min[axis] = Math.min(min[axis], positions[target]);
        max[axis] = Math.max(max[axis], positions[target]);
      }
    }
  }
  assert.deepEqual(min, expected.min);
  assert.deepEqual(max, expected.max);
  return { headerAndChunks: true, embeddedBufferOnly: true, triangleCount: true, triangleOrderAndWinding: true, positionsBitExact: true, normalsBitExact: true, boundsExact: true };
}

async function convert(file) {
  const start = performance.now();
  const sourcePath = path.join(options.source, file);
  const outputPath = path.join(options.output, file.replace(/\.obj$/i, '.glb'));
  const sourceBuffer = await readFile(sourcePath);
  const sourceSHA256 = sha256(sourceBuffer);
  let text = sourceBuffer.toString('utf8');
  const raw = inspectOBJ(text);
  const parseStart = performance.now();
  const object = new OBJLoader().parse(text);
  text = null;
  const parseEnd = performance.now();
  const meshes = [];
  object.traverse((child) => {
    if (child.isMesh) meshes.push(child);
    else assert(!child.geometry, 'Non-mesh geometry found in OBJ');
  });
  const optimized = weldExactly(meshes);
  assert.equal(optimized.cornerCount / 3, raw.triangles, 'OBJ source and parsed triangle counts differ');
  const optimizeEnd = performance.now();
  const glb = encodeGLB(path.basename(file, '.obj'), optimized);
  await writeFile(outputPath, glb);
  const encodeEnd = performance.now();
  // Read the actual saved artifact, then compare every expanded corner to OBJLoader.
  const saved = await readFile(outputPath);
  const checks = verifyGLB(saved, meshes, { ...optimized, triangles: raw.triangles });
  assert.equal(sha256(await readFile(sourcePath)), sourceSHA256, 'Source OBJ changed during conversion');
  checks.sourceUnchanged = true;
  const finish = performance.now();
  const result = {
    source: file, output: path.basename(outputPath), sourceBytes: (await stat(sourcePath)).size,
    outputBytes: saved.length, reductionPercent: Number(((1 - saved.length / sourceBuffer.length) * 100).toFixed(2)),
    sourceSHA256, outputSHA256: sha256(saved), sourceOBJ: raw,
    inputMeshes: meshes.length, outputMeshes: 1, primitives: 1,
    trianglesBefore: raw.triangles, trianglesAfter: optimized.cornerCount / 3,
    expandedVerticesBefore: optimized.cornerCount, indexedVerticesAfter: optimized.uniqueCount,
    indexType: optimized.indices instanceof Uint16Array ? 'UINT16' : 'UINT32',
    boundsBefore: { min: optimized.min, max: optimized.max },
    boundsAfter: { min: [...optimized.min], max: [...optimized.max] },
    timingsSeconds: { parse: seconds(parseEnd - parseStart), exactDeduplication: seconds(optimizeEnd - parseEnd), encodeAndWrite: seconds(encodeEnd - optimizeEnd), verification: seconds(finish - encodeEnd), total: seconds(finish - start) },
    verification: checks,
  };
  meshes.forEach((mesh) => mesh.geometry.dispose());
  return result;
}

const overallStart = performance.now();
const results = [];
for (const file of files) {
  const result = await convert(file);
  results.push(result);
  console.log(`${file}: ${result.trianglesAfter.toLocaleString('en-US')} triangles; ${result.sourceBytes} -> ${result.outputBytes} bytes (-${result.reductionPercent}%); ${result.timingsSeconds.total}s; all checks PASS`);
  global.gc?.();
}
const report = {
  generatedAt: new Date().toISOString(), sourceDirectory: options.source, outputDirectory: options.output,
  loaderPath, nodeVersion: process.version,
  method: 'OBJLoader FLOAT32 output; exact position+normal bitwise deduplication; one indexed primitive per layer; UV omitted; no decimation or transforms',
  totals: {
    files: results.length,
    sourceBytes: results.reduce((sum, item) => sum + item.sourceBytes, 0),
    outputBytes: results.reduce((sum, item) => sum + item.outputBytes, 0),
    trianglesBefore: results.reduce((sum, item) => sum + item.trianglesBefore, 0),
    trianglesAfter: results.reduce((sum, item) => sum + item.trianglesAfter, 0),
    seconds: seconds(performance.now() - overallStart),
  },
  layers: results,
};
report.totals.reductionPercent = Number(((1 - report.totals.outputBytes / report.totals.sourceBytes) * 100).toFixed(2));
await writeFile(path.join(options.output, 'CONVERSION-REPORT.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.totals));
