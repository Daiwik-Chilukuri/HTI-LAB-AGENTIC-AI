// Shape manipulation utilities ported from external/tangram/shape.js
import { rotatePoints, multMatrixVector, toVec, vecAdd } from './tangram-vector-utils';

export interface Shape {
  type: number;
  centroid: number[];
  orientation: number;
  orientationOrig: number;
  centroidOrig: number[];
  vertices: number[][];
  area: number;
  flipped?: boolean;
}

export function move(shape: Shape, translate: number[] = [0, 0]): void {
  shape.centroid = shape.centroid.map((coord, idx) => coord + translate[idx]);
  shape.vertices = shape.vertices.map((vtx) =>
    vtx.map((coord, idx) => coord + translate[idx])
  );
}

export function rotate(shape: Shape, angle: number = 0, rotationPt?: number[]): void {
  if (rotationPt) {
    shape.vertices = rotatePoints(angle, shape.vertices, rotationPt);
    shape.centroid = rotatePoints(angle, [shape.centroid], rotationPt)[0];
  } else {
    shape.vertices = rotatePoints(angle, shape.vertices, shape.centroid);
  }
  shape.orientation += angle;
}

export function snapTo45(shape: Shape): void {
  const deg = Math.round(shape.orientation / 45) * 45 - shape.orientation;
  shape.vertices = rotatePoints(deg, shape.vertices, shape.centroid);
  shape.orientation += deg;
}

export function flipPoints(shape: Shape): void {
  const rotMat = [-1, 0, 0, 1];
  shape.vertices = shape.vertices
    .map((vec) =>
      vecAdd(shape.centroid, multMatrixVector(rotMat, toVec(shape.centroid, vec)))
    )
    .reverse();
  shape.orientation = 180 - shape.orientation;
}
