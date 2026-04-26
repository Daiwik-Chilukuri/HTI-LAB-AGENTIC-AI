"use client";

import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from "react";
import { move, rotate, snapTo45, flipPoints, type Shape } from "@/lib/tangram-shape-utils";
import { insidePoly, calcPenetration } from "@/lib/tangram-vector-utils";

interface TangramGameHandle {
  getCurrentShapes: () => Shape[];
  isSolved: () => boolean;
  getOverlapScore: () => number;
  flipParallelogram: () => void;
}

interface TangramGameProps {
  problemData: number[][];
  problemIndex: number;
  width?: number;
  height?: number;
  onTileInteraction?: (type: "drag" | "rotate" | "flip", pieceIndex: number) => void;
  onSolve?: () => void;
}

// Fixed 900×900 solve canvas — same on every canvas size
// Pieces + silhouette both drawn in 900×900 space so they align pixel-perfect
const SOLVE_W = 900;
const SOLVE_H = 900;
const SOLVE_CENTER = 450;

const CRITERIA = 6000; // sum of red channel of remaining cyan pixels (< 6000 = solved)
const PIECE_COLORS = [
  "#8B6914", // Large Triangle A — warm golden brown
  "#6B4F12", // Large Triangle B — darker brown
  "#9B7A1A", // Parallelogram — medium gold
  "#7A5C14", // Square — muted brown
  "#5C4510", // Medium Triangle — deep brown
  "#A88B3A", // Small Triangle A — light gold
  "#C4A055", // Small Triangle B — pale gold
];

function buildShapeGeoms(tL: number): Shape[] {
  const raw = [
    { type: 1, centroid: [-2/3*tL,-2/3*tL] as [number,number], orientation: 180, vertices: [[0,0],[-1.96*tL,0],[-1.97*tL,-0.03*tL],[-0.03*tL,-1.97*tL],[0,-1.96*tL]] as [number,number][], area: (2*tL)**2/2 },
    { type: 1, centroid: [2/3*tL,-2/3*tL] as [number,number], orientation: -90, vertices: [[0,0],[0,-1.96*tL],[0.03*tL,-1.97*tL],[1.97*tL,-0.03*tL],[1.96*tL,0]] as [number,number][], area: (2*tL)**2/2 },
    { type: 2, centroid: [-1*tL,0.5*tL] as [number,number], orientation: 0, flipped: false, vertices: [[-1*tL,0],[-0.03*tL,0.97*tL],[-0.04*tL,1*tL],[-1*tL,1*tL],[-1.97*tL,0.03*tL],[-1.96*tL,0]] as [number,number][], area: tL**2 },
    { type: 3, centroid: [0.5*tL,0.5*tL] as [number,number], orientation: 0, vertices: [[0,0],[1*tL,0],[1*tL,1*tL],[0,1*tL]] as [number,number][], area: tL**2 },
    { type: 4, centroid: [0,4/3*tL] as [number,number], orientation: -135, vertices: [[0.96*tL,1*tL],[0.97*tL,1.03*tL],[0,2*tL],[-0.97*tL,1.03*tL],[-0.96*tL,1*tL]] as [number,number][], area: tL**2 },
    { type: 5, centroid: [-1/3*tL,1/3*tL] as [number,number], orientation: 90, vertices: [[0,0],[0,0.96*tL],[-0.03*tL,0.97*tL],[-0.97*tL,0.03*tL],[-0.96*tL,0]] as [number,number][], area: tL**2/2 },
    { type: 5, centroid: [4/3*tL,1/3*tL] as [number,number], orientation: 0, vertices: [[1*tL,0],[1.96*tL,0],[1.97*tL,0.03*tL],[1.03*tL,0.97*tL],[1*tL,0.96*tL]] as [number,number][], area: tL**2/2 },
  ];
  const offset: [number,number] = [2*tL, 2*tL];
  const f = 0.04;
  const moveArr: [number,number][] = [
    [-f*tL,-f*tL],[f*tL,-f*tL],[-3*f*tL,f*tL],[f*tL,f*tL],[0,3*f*tL],[-f*tL,f*tL],[3*f*tL,f*tL],
  ];

  return raw.map((obj, idx) => {
    const shape: Shape = {
      type: obj.type,
      centroid: [...obj.centroid],
      orientation: obj.orientation,
      orientationOrig: obj.orientation,
      centroidOrig: [...obj.centroid],
      vertices: obj.vertices.map(v => [...v]),
      area: obj.area,
      flipped: obj.flipped,
    };
    move(shape, offset);
    move(shape, moveArr[idx]);
    return shape;
  });
}

// Build a wood-grain CSS pattern on an offscreen canvas
function buildWoodPattern(ctx: CanvasRenderingContext2D, size = 128): CanvasPattern | null {
  const oc = document.createElement("canvas");
  oc.width = size;
  oc.height = size;
  const c = oc.getContext("2d")!;

  // Base warm brown
  c.fillStyle = "#A0712C";
  c.fillRect(0, 0, size, size);

  // Grain lines
  for (let i = 0; i < size; i += 4) {
    const alpha = 0.04 + Math.random() * 0.08;
    const lightness = Math.floor(Math.random() * 30);
    c.fillStyle = `rgba(${120 + lightness}, ${80 + lightness}, ${30 + lightness}, ${alpha})`;
    c.fillRect(0, i, size, 2);
  }
  // Dark grain accents
  for (let i = 0; i < size; i += 18) {
    const alpha = 0.06 + Math.random() * 0.06;
    c.fillStyle = `rgba(60, 35, 10, ${alpha})`;
    c.fillRect(0, i, size, 1);
  }

  return ctx.createPattern(oc, "repeat");
}

const TangramGame = forwardRef<TangramGameHandle, TangramGameProps>(
  ({ problemData, problemIndex, width = 560, height = 560, onTileInteraction, onSolve }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // Offscreen canvas: holds the cyan target silhouette on black (900x900)
    const offscreenRef = useRef<HTMLCanvasElement | null>(null);
    // Thumb canvas: shows the gray target silhouette (140x140)
    const thumbCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const shapesRef = useRef<Shape[]>([]);
    const tLRef = useRef<number>(75);
    const animatingRef = useRef(false);
    const animFrameRef = useRef<number>(0);
    const solvedRef = useRef(false);
    const sumRef = useRef<number>(0);
    const centroidTotRef = useRef<[number,number]>([0, 0]);
    const liftedPieceRef = useRef(false);
    const movingShapeIdxRef = useRef<number>(-1);
    const prevTouchRef = useRef<[number,number]>([0,0]);
    const prevTouchRotRef = useRef<[number,number][]>([[0,0],[0,0]]);
    const longpressIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const doubleTabIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const woodPatternRef = useRef<CanvasPattern | null>(null);
    const thumbOffsetRef = useRef<[number,number]>([16, 16]);

    const [solved, setSolved] = useState(false);
    // Force re-render when pieces change
    const [, forceUpdate] = useState(0);
    const triggerUpdate = useCallback(() => forceUpdate(n => n + 1), []);

    useImperativeHandle(ref, () => ({
      getCurrentShapes: () => shapesRef.current.map(s => ({ ...s })),
      isSolved: () => solvedRef.current,
      getOverlapScore: () => sumRef.current,
      flipParallelogram: () => {
        const idx = shapesRef.current.findIndex(s => s.type === 2);
        if (idx !== -1) {
          flipPoints(shapesRef.current[idx]);
          if (onTileInteraction) onTileInteraction("flip", idx);
          triggerUpdate();
          animatingRef.current = true;
          animFrameRef.current = requestAnimationFrame(renderScene);
        }
      },
    }));

    // ── Compute centroid of all shapes ────────────────────────────────
    // Returns [[cx, cy]] in the same format as original tL.centroidTot
    const getCentroidTot = useCallback((): [[number,number]] => {
      const totArea = shapesRef.current.reduce((acc, s) => acc + s.area, 0);
      const ct = shapesRef.current.reduce(
        (acc, s) => [acc[0] + s.centroid[0]*s.area, acc[1] + s.centroid[1]*s.area] as [number,number],
        [0, 0] as [number,number]
      );
      return [[ct[0]/totArea, ct[1]/totArea]];
    }, []);

    // ── Clamp a shape's vertices to canvas bounds ───────────────────
    const clampToCanvas = useCallback((shape: Shape) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const v of shape.vertices) {
        if (v[0] < minX) minX = v[0];
        if (v[1] < minY) minY = v[1];
        if (v[0] > maxX) maxX = v[0];
        if (v[1] > maxY) maxY = v[1];
      }
      let dx = 0, dy = 0;
      if (maxX > width) dx = width - maxX;
      if (maxY > height) dy = height - maxY;
      if (minX + dx < 0) dx = -minX;
      if (minY + dy < 0) dy = -minY;
      if (dx !== 0 || dy !== 0) {
        move(shape, [dx, dy]);
      }
    }, [width, height]);

    // ── Collision detection ──────────────────────────────────────────
    const checkCollisions = useCallback((movingShapeIdx: number, delta: [number,number]): [number,number] => {
      const moveBack: [number,number] = [0, 0];
      const movingShapePts = shapesRef.current[movingShapeIdx].vertices;

      for (let i = 0; i < shapesRef.current.length; i++) {
        if (i === movingShapeIdx) continue;
        const shapePts = shapesRef.current[i].vertices;

        for (let j = 0; j < shapePts.length; j++) {
          if (insidePoly(movingShapePts, shapePts[j])) {
            const u = calcPenetration(movingShapePts, shapePts[j], delta);
            if (!u) continue;
            u.forEach((ele, idx) => {
              if (Math.abs(moveBack[idx]) < Math.abs(ele))
                moveBack[idx] = (ele < 0 ? -1 : 1) * Math.max(Math.abs(moveBack[idx]), Math.abs(ele));
            });
          }
        }
        for (let j = 0; j < movingShapePts.length; j++) {
          if (insidePoly(shapePts, movingShapePts[j])) {
            const u = calcPenetration(shapePts, movingShapePts[j], [delta[0]*-1, delta[1]*-1]);
            if (!u) continue;
            u.forEach((ele, idx) => {
              if (Math.abs(moveBack[idx]) < Math.abs(ele))
                moveBack[idx] = (ele < 0 ? -1 : 1) * Math.max(Math.abs(moveBack[idx]), Math.abs(ele));
            });
          }
        }
      }
      return moveBack;
    }, []);

    // ── Reposition shapes to fit canvas ───────────────────────────
    const rePositionShapes = useCallback(() => {
      // tL is derived from canvas width so pieces are a consistent
      // screen-size regardless of how the canvas itself is sized.
      // clusterW ≈ 6.93 * tL → pieces fill ~70% of canvas width (fits comfortably).
      tLRef.current = width / 10;
      shapesRef.current = buildShapeGeoms(tLRef.current);

      // Centre the piece cluster in the canvas
      const newMinX = Math.min(...shapesRef.current.flatMap(s => s.vertices.map(v => v[0])));
      const newMinY = Math.min(...shapesRef.current.flatMap(s => s.vertices.map(v => v[1])));
      const newMaxX = Math.max(...shapesRef.current.flatMap(s => s.vertices.map(v => v[0])));
      const newMaxY = Math.max(...shapesRef.current.flatMap(s => s.vertices.map(v => v[1])));
      const cW = newMaxX - newMinX;
      const cH = newMaxY - newMinY;
      const delta: [number,number] = [(width - cW) / 2 - newMinX, (height - cH) / 2 - newMinY];
      for (const shape of shapesRef.current) move(shape, delta);
    }, [width, height]);

    // ── Draw the target silhouette to offscreen & thumb canvases ───
    const drawSilhouette = useCallback(() => {
      const offscreen = offscreenRef.current;
      const thumbCanvas = thumbCanvasRef.current;
      if (!offscreen || !thumbCanvas) return;

      const octx = offscreen.getContext("2d")!;
      const thumbCtx = thumbCanvas.getContext("2d")!;

      // Fixed 900×900 solve canvas — always the same size
      offscreen.width = SOLVE_W;
      offscreen.height = SOLVE_H;

      // Thumb: fixed 140×140
      thumbCanvas.width = 140;
      thumbCanvas.height = 140;
      const THUMB_SIZE = 140;

      const area = Number(problemData[problemData.length - 2]);
      const bounds = problemData[problemData.length - 1] as unknown as [number,number,number,number];
      const maxBound = Math.max(Math.abs(bounds[0]), Math.abs(bounds[1]), Math.abs(bounds[2]), Math.abs(bounds[3]));

      // Same factor formula as original tangram: sqrt(80000/area)
      const factor = Math.sqrt(80000 / area);
      const thumbFactor = 0.95 * (THUMB_SIZE / 2) / maxBound;

      // Black on solve canvas
      octx.fillStyle = "black";
      octx.fillRect(0, 0, SOLVE_W, SOLVE_H);

      // White on thumb
      thumbCtx.fillStyle = "#f0ede8";
      thumbCtx.fillRect(0, 0, THUMB_SIZE, THUMB_SIZE);
      octx.beginPath();
      thumbCtx.beginPath();

      const n = problemData.length - 2;
      for (let i = 0; i < n; i++) {
        const vx = problemData[i][0];
        const vy = problemData[i][1];
        if (isNaN(vx)) continue;
        // Original formula: ele/2 + prob[i][idx] * factor
        const ox = SOLVE_W / 2 + vx * factor;
        const oy = SOLVE_H / 2 + vy * factor;
        const tx = THUMB_SIZE / 2 + vx * thumbFactor;
        const ty = THUMB_SIZE / 2 + vy * thumbFactor;
        if (i === 0 || isNaN(problemData[i - 1][0])) {
          octx.moveTo(ox, oy);
          thumbCtx.moveTo(tx, ty);
        } else {
          octx.lineTo(ox, oy);
          thumbCtx.lineTo(tx, ty);
        }
      }
      octx.fillStyle = "#01FFFF";
      octx.fill();
      thumbCtx.fillStyle = "#555";
      thumbCtx.fill();

      thumbOffsetRef.current = [10, 18];
    }, [problemData]);

    // ── Main render loop ───────────────────────────────────────────
    const renderScene = useCallback(() => {
      const canvas = canvasRef.current;
      const offscreen = offscreenRef.current;
      const thumbCanvas = thumbCanvasRef.current;
      if (!canvas || !offscreen) return;
      const ctx = canvas.getContext("2d")!;
      const tL = tLRef.current;
      const centroidTot = centroidTotRef.current;

      // 1. Clear main canvas
      ctx.fillStyle = "#d8d0c4";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 2. Build wood pattern if not yet built
      if (!woodPatternRef.current) {
        woodPatternRef.current = buildWoodPattern(ctx);
      }

      // 3. Create 900×900 pixel-counting canvas: copy silhouette + draw pieces in 900×900 space
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = SOLVE_W;
      tempCanvas.height = SOLVE_H;
      const tempCtx = tempCanvas.getContext("2d")!;
      tempCtx.drawImage(offscreen, 0, 0);

      // 4. Draw each piece on tempCtx as BLACK — transform to 900×900 solve space
      // Formula: (ele - centroidTot[idx]) * 100 / tL + SOLVE_CENTER
      // This matches the original tangram's silCtx coordinate transform exactly
      tempCtx.fillStyle = "black";
      for (let i = 0; i < shapesRef.current.length; i++) {
        const shape = shapesRef.current[i];
        tempCtx.beginPath();
        tempCtx.moveTo(
          ...shape.vertices[0].map((ele, idx) =>
            (ele - centroidTot[0][idx]) * 100 / tL + SOLVE_CENTER
          )
        );
        for (let j = 1; j < shape.vertices.length; j++) {
          tempCtx.lineTo(
            ...shape.vertices[j].map((ele, idx) =>
              (ele - centroidTot[0][idx]) * 100 / tL + SOLVE_CENTER
            )
          );
        }
        tempCtx.closePath();
        tempCtx.fill();
      }

      // 5. Draw thumb (140×140 target silhouette) in top-left corner
      if (thumbCanvas) {
        ctx.drawImage(thumbCanvas, thumbOffsetRef.current[0], thumbOffsetRef.current[1]);
        ctx.strokeStyle = "#aaa";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(thumbOffsetRef.current[0], thumbOffsetRef.current[1], 140, 140);
        // Label BELOW the thumb
        ctx.fillStyle = "#888";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("target", thumbOffsetRef.current[0] + 70, thumbOffsetRef.current[1] + 140 + 14);
      }

      // 6. Draw each piece on main canvas with wood pattern + edge highlight
      const pieceColors = PIECE_COLORS;
      for (let i = 0; i < shapesRef.current.length; i++) {
        const shape = shapesRef.current[i];
        const pieceColor = pieceColors[i % pieceColors.length];

        ctx.beginPath();
        ctx.moveTo(shape.vertices[0][0], shape.vertices[0][1]);
        for (let j = 1; j < shape.vertices.length; j++) {
          ctx.lineTo(shape.vertices[j][0], shape.vertices[j][1]);
        }
        ctx.closePath();

        ctx.save();
        if (liftedPieceRef.current && i === shapesRef.current.length - 1) {
          ctx.globalAlpha = 0.45;
        }
        const dx = shape.centroid[0] - shape.centroidOrig[0];
        const dy = shape.centroid[1] - shape.centroidOrig[1];
        ctx.translate(dx, dy);
        ctx.translate(shape.centroidOrig[0], shape.centroidOrig[1]);
        ctx.rotate((shape.orientation - shape.orientationOrig) * Math.PI / 180);
        ctx.translate(-shape.centroidOrig[0], -shape.centroidOrig[1]);

        // Fill with warm wood color
        ctx.fillStyle = pieceColor;
        ctx.fill();

        // Wood grain overlay (stripes)
        if (woodPatternRef.current) {
          ctx.fillStyle = woodPatternRef.current;
          ctx.fill();
        }

        // Subtle inner gradient for depth
        const grad = ctx.createLinearGradient(0, 0, ctx.canvas.width, ctx.canvas.height);
        grad.addColorStop(0, "rgba(255,220,150,0.15)");
        grad.addColorStop(1, "rgba(0,0,0,0.1)");
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.restore();

        // Piece outline
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Label: piece number (1-7) drawn directly on the piece in canvas coordinates
        const label = String(i + 1);
        const fontSize = Math.max(12, tL * 0.28);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "black";
        ctx.fillText(label, shape.centroid[0], shape.centroid[1]);
      }

      // 7. Count cyan pixels (sum < CRITERIA → solved)
      const imgData = tempCtx.getImageData(0, 0, SOLVE_W, SOLVE_H).data;
      let sum = 0;
      for (let i = 0; i < imgData.length; i += 4) {
        sum += imgData[i]; // red channel of #01FFFF = 1
      }
      if (sum < CRITERIA) console.log("[solve] sum=", sum, "SOLVED ✓");
      sumRef.current = sum;

      const isSolvedNow = sum < CRITERIA;
      if (isSolvedNow && !solvedRef.current) {
        solvedRef.current = true;
        setSolved(true);
        if (onSolve) onSolve();
      } else if (!isSolvedNow && solvedRef.current) {
        solvedRef.current = false;
        setSolved(false);
      }

      if (animatingRef.current) {
        animFrameRef.current = requestAnimationFrame(renderScene);
      }
    }, [onSolve]);

    // ── Canvas coordinate helper ───────────────────────────────────
    const getCanvasCoord = useCallback((clientX: number, clientY: number): [number,number] => {
      const canvas = canvasRef.current;
      if (!canvas) return [0, 0];
      const rect = canvas.getBoundingClientRect();
      return [clientX - rect.left, clientY - rect.top];
    }, []);

    // ── Pointer down (mouse) ───────────────────────────────────────
    const handlePointerDown = useCallback((clientX: number, clientY: number, button: number, detail: number) => {
      const coord = getCanvasCoord(clientX, clientY);
      for (let i = shapesRef.current.length - 1; i >= 0; i--) {
        const shape = shapesRef.current[i];
        if (!insidePoly(shape.vertices, coord)) continue;
        movingShapeIdxRef.current = i;

        if (button !== 2) {
          // Left/middle: drag
          if (detail >= 2) {
            // Double-click: lift piece to top
            shapesRef.current.push(...shapesRef.current.splice(i, 1));
            liftedPieceRef.current = true;
            movingShapeIdxRef.current = shapesRef.current.length - 1;
          }
          const onMove = (e: MouseEvent) => {
            if (e.buttons !== 1) return;
            const delta: [number,number] = [e.movementX, e.movementY];
            const shape = shapesRef.current[movingShapeIdxRef.current];
            move(shape, delta);
            if (!liftedPieceRef.current) {
              const back = checkCollisions(movingShapeIdxRef.current, delta);
              move(shape, back as [number,number]);
            }
            clampToCanvas(shape);
            centroidTotRef.current = getCentroidTot();
            if (onTileInteraction) onTileInteraction("drag", movingShapeIdxRef.current);
          };
          const onUp = () => {
            liftedPieceRef.current = false;
            centroidTotRef.current = getCentroidTot();
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            animatingRef.current = false;
          };
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        } else {
          // Right-click: rotate
          // Double right-click (detail === 2) on parallelogram (type 2) flips it
          if (detail === 2 && shape.type === 2) {
            flipPoints(shape);
            if (onTileInteraction) onTileInteraction("flip", i);
          }
          const onRotateMove = (e: MouseEvent) => {
            if (e.buttons !== 2) return;
            const prevCoord: [number,number] = [coord[0] - e.movementX, coord[1] - e.movementY];
            const start: [number,number] = [prevCoord[0] - shape.centroid[0], prevCoord[1] - shape.centroid[1]];
            const end: [number,number] = [coord[0] - shape.centroid[0], coord[1] - shape.centroid[1]];
            const cross = start[0]*end[1] - start[1]*end[0];
            const mag = Math.sqrt(start[0]**2+start[1]**2) * Math.sqrt(end[0]**2+end[1]**2);
            if (mag === 0) return;
            const angle = Math.asin(cross/mag) * 180 / Math.PI;
            rotate(shape, angle);
            clampToCanvas(shape);
            if (onTileInteraction) onTileInteraction("rotate", i);
          };
          const onRotateUp = () => {
            snapTo45(shape);
            clampToCanvas(shape);
            document.removeEventListener("mousemove", onRotateMove);
            document.removeEventListener("mouseup", onRotateUp);
            animatingRef.current = false;
          };
          document.addEventListener("mousemove", onRotateMove);
          document.addEventListener("mouseup", onRotateUp);
        }

        animatingRef.current = true;
        animFrameRef.current = requestAnimationFrame(renderScene);
        break;
      }
    }, [getCanvasCoord, checkCollisions, clampToCanvas, renderScene, getCentroidTot, onTileInteraction]);

    // ── Touch start ────────────────────────────────────────────────
    const handleTouchStart = useCallback((e: TouchEvent) => {
      if (e.touches.length > 1) {
        // Two-finger rotate
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const touches: [number,number][] = [
          [e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top],
          [e.touches[1].clientX - rect.left, e.touches[1].clientY - rect.top],
        ];
        prevTouchRotRef.current = touches;

        const onRotate = (ev: TouchEvent) => {
          if (ev.touches.length < 2) return;
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const curr: [number,number][] = [
            [ev.touches[0].clientX - rect.left, ev.touches[0].clientY - rect.top],
            [ev.touches[1].clientX - rect.left, ev.touches[1].clientY - rect.top],
          ];
          const start = prevTouchRotRef.current[1].map((v,i) => v - prevTouchRotRef.current[0][i]) as [number,number];
          const end = curr[1].map((v,i) => v - curr[0][i]) as [number,number];
          prevTouchRotRef.current = curr;
          const cross = start[0]*end[1] - start[1]*end[0];
          const mag = Math.sqrt(start[0]**2+start[1]**2) * Math.sqrt(end[0]**2+end[1]**2);
          if (mag === 0) return;
          const angle = Math.asin(cross/mag) * 180 / Math.PI;
          const shape = shapesRef.current[movingShapeIdxRef.current];
          if (shape) {
            rotate(shape, angle);
            clampToCanvas(shape);
          }
          if (onTileInteraction) onTileInteraction("rotate", movingShapeIdxRef.current);
        };
        const onRotateEnd = () => {
          const shape = shapesRef.current[movingShapeIdxRef.current];
          if (shape) { snapTo45(shape); clampToCanvas(shape); }
          document.removeEventListener("touchmove", onRotate);
          document.removeEventListener("touchend", onRotateEnd);
          animatingRef.current = false;
        };
        document.addEventListener("touchmove", onRotate, { passive: false });
        document.addEventListener("touchend", onRotateEnd);
        return;
      }

      // Single touch: pick up piece
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const coord: [number,number] = [e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top];
      prevTouchRef.current = [e.touches[0].clientX, e.touches[0].clientY];

      for (let i = shapesRef.current.length - 1; i >= 0; i--) {
        const shape = shapesRef.current[i];
        if (!insidePoly(shape.vertices, coord)) continue;
        movingShapeIdxRef.current = i;

        longpressIdRef.current = setTimeout(() => {
          shapesRef.current.push(...shapesRef.current.splice(i, 1));
          liftedPieceRef.current = true;
          movingShapeIdxRef.current = shapesRef.current.length - 1;
        }, 400);

        doubleTabIdRef.current = setTimeout(() => { doubleTabIdRef.current = null; }, 400);

        const onTouchMove = (ev: TouchEvent) => {
          if (ev.touches.length < 1) return;
          ev.preventDefault();
          const dx = ev.touches[0].clientX - prevTouchRef.current[0];
          const dy = ev.touches[0].clientY - prevTouchRef.current[1];
          prevTouchRef.current = [ev.touches[0].clientX, ev.touches[0].clientY];
          const shape = shapesRef.current[movingShapeIdxRef.current];
          move(shape, [dx, dy]);
          if (!liftedPieceRef.current) {
            const back = checkCollisions(movingShapeIdxRef.current, [dx, dy]);
            move(shape, back as [number,number]);
          }
          clampToCanvas(shape);
          centroidTotRef.current = getCentroidTot();
          if (onTileInteraction) onTileInteraction("drag", movingShapeIdxRef.current);
        };
        const onTouchEnd = () => {
          clearTimeout(longpressIdRef.current!);
          clearTimeout(doubleTabIdRef.current!);
          liftedPieceRef.current = false;
          centroidTotRef.current = getCentroidTot();
          document.removeEventListener("touchmove", onTouchMove);
          document.removeEventListener("touchend", onTouchEnd);
          animatingRef.current = false;
        };
        document.addEventListener("touchmove", onTouchMove, { passive: false });
        document.addEventListener("touchend", onTouchEnd);

        animatingRef.current = true;
        animFrameRef.current = requestAnimationFrame(renderScene);
        break;
      }
    }, [checkCollisions, clampToCanvas, renderScene, getCentroidTot, onTileInteraction]);

    // ── Initialize ─────────────────────────────────────────────────
    useEffect(() => {
      // Fixed 900×900 solve canvas — always the same size regardless of display canvas
      offscreenRef.current = document.createElement("canvas");
      offscreenRef.current.width = SOLVE_W;
      offscreenRef.current.height = SOLVE_H;

      // Fixed 140×140 thumb canvas
      thumbCanvasRef.current = document.createElement("canvas");
      thumbCanvasRef.current.width = 140;
      thumbCanvasRef.current.height = 140;

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = width;
        canvas.height = height;
      }

      rePositionShapes();
      centroidTotRef.current = getCentroidTot();
      drawSilhouette();

      animatingRef.current = true;
      animFrameRef.current = requestAnimationFrame(renderScene);

      return () => {
        cancelAnimationFrame(animFrameRef.current);
        animatingRef.current = false;
      };
    }, [width, height, rePositionShapes, getCentroidTot, drawSilhouette, renderScene]);

    return (
      <div style={{ position: "relative", width, height }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={{ position: "absolute", top: 0, left: 0, touchAction: "none", cursor: "default" }}
          onMouseDown={(e) => { handlePointerDown(e.clientX, e.clientY, e.button, e.detail); }}
          onContextMenu={(e) => e.preventDefault()}
          onTouchStart={(e) => { e.preventDefault(); handleTouchStart(e as unknown as TouchEvent); }}
        />
        {solved && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.5)", borderRadius: 8, pointerEvents: "none",
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", color: "#86efac", marginBottom: 8 }}>✓</div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: "1.1rem" }}>Puzzle Solved!</div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

TangramGame.displayName = "TangramGame";

export default TangramGame;
export type { TangramGameHandle, TangramGameProps, Shape };
