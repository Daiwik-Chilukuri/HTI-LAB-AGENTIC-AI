// Tangram piece definitions for AI context
// Each piece has a type ID (1-5), name, and area multiplier relative to tL²
// tL = half of the minimum canvas dimension / 4 (in the original game)

export const TANGRAM_PIECES = [
  {
    type: 1,
    name: "Large Triangle A",
    areaMultiplier: 2, // (2*tL)²/2 / tL² = 2
    defaultOrientation: 180,
    description: "Large right isosceles triangle, fills half a square"
  },
  {
    type: 2,
    name: "Parallelogram",
    areaMultiplier: 1, // tL² / tL² = 1
    defaultOrientation: 0,
    description: "Parallelogram that can be flipped"
  },
  {
    type: 1,
    name: "Large Triangle B",
    areaMultiplier: 2,
    defaultOrientation: -90,
    description: "Large right isosceles triangle, fills half a square"
  },
  {
    type: 3,
    name: "Square",
    areaMultiplier: 1, // tL² / tL² = 1
    defaultOrientation: 0,
    description: "Medium square"
  },
  {
    type: 4,
    name: "Medium Triangle",
    areaMultiplier: 1, // tL² / tL² = 1
    defaultOrientation: -135,
    description: "Right isosceles triangle, medium size"
  },
  {
    type: 5,
    name: "Small Triangle A",
    areaMultiplier: 0.5, // (tL²/2) / tL² = 0.5
    defaultOrientation: 90,
    description: "Small right isosceles triangle"
  },
  {
    type: 5,
    name: "Small Triangle B",
    areaMultiplier: 0.5,
    defaultOrientation: 0,
    description: "Small right isosceles triangle"
  },
] as const;

export type TangramPiece = (typeof TANGRAM_PIECES)[number];

// Build a human-readable description of the target silhouette for AI context
export function buildSilhouetteContext(
  silhouetteVertices: number[][],
  problemIndex: number,
  difficulty: string
): string {
  const vertexList = silhouetteVertices
    .map((v, i) => `  Vertex ${i + 1}: [${v[0].toFixed(2)}, ${v[1].toFixed(2)}]`)
    .join("\n");

  return `TANGRAM PUZZLE #${problemIndex + 1} (${difficulty})
Target silhouette (${silhouetteVertices.length} vertices):
${vertexList}

IMPORTANT: The target above shows the OUTLINE/shape you need to form with the 7 pieces.
You are helping a user solve this tangram puzzle. You can see where each piece currently is.
Guide the user spatially — tell them which piece goes where, describe rotations, and give placement hints.
DO NOT solve it for them — guide them step by step.`;
}

// Build a context string describing current piece positions (for Send State)
export function buildCurrentStateContext(
  shapes: Array<{
    type: number;
    centroid: number[];
    orientation: number;
    vertices: number[][];
  }>,
  problemIndex: number
): string {
  const pieceList = shapes
    .map((s, i) => {
      const pieceInfo = TANGRAM_PIECES.find((p) => p.type === s.type) ?? TANGRAM_PIECES[0];
      return `  Piece ${i + 1} (${pieceInfo.name}): centroid=[${s.centroid[0].toFixed(1)}, ${s.centroid[1].toFixed(1)}], orientation=${s.orientation}°, vertices=${s.vertices.map((v) => `[${v[0].toFixed(1)},${v[1].toFixed(1)}]`).join(",")}`;
    })
    .join("\n");

  return `CURRENT PIECE POSITIONS — Puzzle #${problemIndex + 1}:
${pieceList}

Use the above to understand where each piece is currently placed.`;
}
