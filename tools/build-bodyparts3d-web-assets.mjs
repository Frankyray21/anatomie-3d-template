import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const root = process.cwd();
const workDir = path.join(root, "work", "bodyparts3d");
const outputDir = path.join(root, "outputs", "anatomie-3d-template", "assets", "bodyparts3d");

const tables = {
  partof: path.join(workDir, "partof_element_parts.txt"),
  isa: path.join(workDir, "isa_element_parts.txt")
};

const extracted = {
  partof: path.join(workDir, "extracted", "partof"),
  isa: path.join(workDir, "extracted", "isa")
};

const layerDefinitions = [
  {
    key: "skin",
    source: "partof",
    concepts: ["FMA7163"],
    out: "bp3d-skin.obj",
    label: "Skin, FMA7163"
  },
  {
    key: "skeleton",
    source: "partof",
    concepts: ["FMA23876"],
    out: "bp3d-skeleton.obj",
    label: "Skeleton in vivo, FMA23876"
  },
  {
    key: "muscles",
    source: "isa",
    concepts: [
      "FMA34676",
      "FMA34686",
      "FMA37684",
      "FMA37685",
      "FMA37686",
      "FMA37687",
      "FMA37692",
      "FMA37693",
      "FMA37694",
      "FMA22430",
      "FMA22542",
      "FMA45888",
      "FMA45889",
      "FMA45891",
      "FMA45892",
      "FMA45950"
    ],
    out: "bp3d-major-muscles.obj",
    label: "Major visible muscles from BodyParts3D IS-A concepts"
  },
  {
    key: "tendons",
    source: "isa",
    concepts: ["FMA9721"],
    out: "bp3d-tendons.obj",
    label: "Tendon, FMA9721"
  },
  {
    key: "nerves",
    source: "partof",
    concepts: ["FMA7157"],
    out: "bp3d-nervous-system.obj",
    label: "Nervous system, FMA7157"
  },
  {
    key: "vessels",
    source: "partof",
    concepts: ["FMA49894", "FMA45626", "FMA45842", "FMA45847"],
    out: "bp3d-major-vessels.obj",
    label: "Systemic arterial tree, systemic venous system, pulmonary arterial tree, portal venous tree"
  }
];

function readConceptFiles(tablePath) {
  const map = new Map();
  const rows = fs.readFileSync(tablePath, "utf8").split(/\r?\n/);
  for (const row of rows.slice(1)) {
    if (!row.trim()) continue;
    const [conceptId, name, fileId] = row.split("\t");
    if (!conceptId || !fileId) continue;
    if (!map.has(conceptId)) map.set(conceptId, { name, files: new Set() });
    map.get(conceptId).files.add(fileId.trim());
  }
  return map;
}

function buildSelection() {
  const conceptMaps = {
    partof: readConceptFiles(tables.partof),
    isa: readConceptFiles(tables.isa)
  };

  const selection = {};
  for (const def of layerDefinitions) {
    const files = new Set();
    for (const concept of def.concepts) {
      const entry = conceptMaps[def.source].get(concept);
      if (!entry) {
        throw new Error(`Concept not found in ${def.source}: ${concept}`);
      }
      for (const file of entry.files) files.add(file);
    }
    selection[def.key] = {
      source: def.source,
      label: def.label,
      out: def.out,
      files: [...files].sort()
    };
  }

  fs.writeFileSync(path.join(workDir, "selection.json"), `${JSON.stringify(selection, null, 2)}\n`);
  return selection;
}

function rewriteFaceToken(token, offsets) {
  const parts = token.split("/");
  const vertex = Number(parts[0]);
  if (Number.isFinite(vertex) && vertex > 0) parts[0] = String(vertex + offsets.v);
  if (parts.length > 1 && parts[1] !== "") {
    const uv = Number(parts[1]);
    if (Number.isFinite(uv) && uv > 0) parts[1] = String(uv + offsets.vt);
  }
  if (parts.length > 2 && parts[2] !== "") {
    const normal = Number(parts[2]);
    if (Number.isFinite(normal) && normal > 0) parts[2] = String(normal + offsets.vn);
  }
  return parts.join("/");
}

async function mergeLayer(definition) {
  const outPath = path.join(outputDir, definition.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const out = fs.createWriteStream(outPath, "utf8");
  let vertexOffset = 0;
  let uvOffset = 0;
  let normalOffset = 0;
  let mergedVertices = 0;
  let mergedFaces = 0;

  out.write(`# BodyParts3D web layer: ${definition.label}\n`);
  out.write("# Source: BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution 4.0 International\n");
  out.write("# Generated from official BodyParts3D OBJ files reduced at 99%.\n\n");

  for (const fileId of definition.files) {
    const inputPath = path.join(extracted[definition.source], `${fileId}.obj`);
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Missing extracted OBJ: ${inputPath}`);
    }

    const offsets = { v: vertexOffset, vt: uvOffset, vn: normalOffset };
    let localVertices = 0;
    let localUvs = 0;
    let localNormals = 0;
    let localFaces = 0;

    out.write(`\no ${fileId}\n`);

    const rl = readline.createInterface({
      input: fs.createReadStream(inputPath, "utf8"),
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (!line || line.startsWith("#") || line.startsWith("mtllib") || line.startsWith("usemtl")) continue;
      if (line.startsWith("v ")) {
        localVertices += 1;
        out.write(`${line}\n`);
      } else if (line.startsWith("vt ")) {
        localUvs += 1;
        out.write(`${line}\n`);
      } else if (line.startsWith("vn ")) {
        localNormals += 1;
        out.write(`${line}\n`);
      } else if (line.startsWith("f ")) {
        localFaces += 1;
        const face = line
          .trim()
          .split(/\s+/)
          .slice(1)
          .map((token) => rewriteFaceToken(token, offsets))
          .join(" ");
        out.write(`f ${face}\n`);
      } else if (line.startsWith("g ")) {
        out.write(`${line}\n`);
      }
    }

    vertexOffset += localVertices;
    uvOffset += localUvs;
    normalOffset += localNormals;
    mergedVertices += localVertices;
    mergedFaces += localFaces;
  }

  await new Promise((resolve) => out.end(resolve));
  return {
    file: outPath,
    files: definition.files.length,
    vertices: mergedVertices,
    faces: mergedFaces,
    bytes: fs.statSync(outPath).size
  };
}

async function main() {
  const selection = buildSelection();
  if (process.argv.includes("--selection-only")) {
    console.log(JSON.stringify(selection, null, 2));
    return;
  }

  const summaries = [];
  for (const def of layerDefinitions) {
    summaries.push(await mergeLayer(selection[def.key]));
  }
  fs.writeFileSync(path.join(outputDir, "BUILD-SUMMARY.json"), `${JSON.stringify(summaries, null, 2)}\n`);
  console.table(
    summaries.map((item) => ({
      file: path.basename(item.file),
      sourceFiles: item.files,
      vertices: item.vertices,
      faces: item.faces,
      mb: (item.bytes / 1024 / 1024).toFixed(1)
    }))
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
