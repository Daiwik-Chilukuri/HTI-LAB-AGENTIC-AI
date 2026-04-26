// Vector math utilities ported from external/tangram/vectorUtils.js

export const toVec = (a: number[], b: number[]): number[] => [b[0] - a[0], b[1] - a[1]];
export const cross = (v: number[], w: number[]): number => v[0] * w[1] - v[1] * w[0];

export function insidePoly(vertices: number[][], p: number[]): boolean {
  // Important!! this assumes vertices are arranged in counter clockwise direction
  let left = vertices[vertices.length - 1];
  for (let i = 0; i < vertices.length; i++) {
    const center = vertices[i];
    if (cross(toVec(center, left), toVec(center, p)) > 0) {
      return false;
    }
    left = center;
  }
  return true;
}

export function findIntersection(p: number[], r: number[], q: number[], s: number[]): number | null {
  const q_minus_p = toVec(p, q);
  const r_cross_s = cross(r, s);
  if (r_cross_s === 0) return null;
  return cross(q_minus_p, r) / r_cross_s;
}

export const dot = (v: number[], w: number[]): number => v[0] * w[0] + v[1] * w[1];

export function calcPenetration(sVertices: number[][], p: number[], lastMouseMove: number[]): number[] | null {
  let prev = sVertices[sVertices.length - 1];
  lastMouseMove = lastMouseMove.map((ele) => ele * 1.2);

  for (let k = 0; k < sVertices.length; k++) {
    const currVertex = sVertices[k];
    const edgeVec = toVec(currVertex, prev);
    const res = findIntersection(currVertex, edgeVec, p, lastMouseMove);
    if (res && res > 0 && res < 1) {
      const p_currVertex_vec = toVec(p, currVertex);
      const precalc = dot(p_currVertex_vec, edgeVec) / (edgeVec[0] ** 2 + edgeVec[1] ** 2);
      return p_currVertex_vec.map((ele, idx) => ele - precalc * edgeVec[idx]);
    }
    prev = currVertex;
  }
  return null;
}

export function multMatrixVector(matrix: number[], vector: number[]): number[] {
  const nr = matrix.length / vector.length;
  let res: number[] = [];
  for (let i = 0; i < nr; i++) {
    res[i] = vector.reduce(
      (acc, ele, idx) => acc + ele * matrix[i * vector.length + idx],
      0
    );
  }
  return res;
}

export const vecAdd = (a: number[], b: number[]): number[] => [a[0] + b[0], a[1] + b[1]];

export function rotatePoints(deg: number, vertices: number[][], rotationPt: number[]): number[][] {
  const radians = deg * Math.PI / 180;
  const rotMat = [
    Math.cos(radians), -Math.sin(radians),
    Math.sin(radians), Math.cos(radians),
  ];
  return vertices.map((vec) =>
    vecAdd(rotationPt, multMatrixVector(rotMat, toVec(rotationPt, vec)))
  );
}
