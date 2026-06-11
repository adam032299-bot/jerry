import { MazeConfig } from '../types';

export function generateMaze(width: number, height: number): MazeConfig {
  const grid: number[][] = Array(height).fill(null).map(() => Array(width).fill(1));

  const startRoomSize = 3;
  const startX = Math.floor(startRoomSize / 2) + 1;
  const startY = Math.floor(startRoomSize / 2) + 1;

  // 1. CLEAR grid first for starting room
  for (let y = 1; y <= startRoomSize; y++) {
    for (let x = 1; x <= startRoomSize; x++) {
      if (y < height - 1 && x < width - 1) {
        grid[y][x] = 0;
      }
    }
  }

  // 2. Define the SINGLE exit corridor
  const exitX = startRoomSize + 1;
  const exitY = startRoomSize; // At the bottom of the right wall
  if (exitX < width - 1) {
    grid[exitY][exitX] = 0;
  }

  // 3. Place Rooms as Path Segments in the REST of the maze
  const rooms: {x: number, y: number, w: number, h: number}[] = [];
  const roomCount = Math.floor((width * height) / 100); 

  for (let i = 0; i < roomCount; i++) {
    const rw = Math.floor(Math.random() * 2) + 2; 
    const rh = Math.floor(Math.random() * 2) + 2;
    const rx = Math.floor(Math.random() * (width - rw - 1)) + 1;
    const ry = Math.floor(Math.random() * (height - rh - 1)) + 1;

    // Buffer: room must be away from the starting room's protective walls
    if (rx < startRoomSize + 3 && ry < startRoomSize + 3) continue;

    // Carve room
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
          grid[y][x] = 0;
        }
      }
    }
    rooms.push({x: rx, y: ry, w: rw, h: rh});
  }

  // 4. Recursive Backtracker starting FROM the exit point
  const stack: [number, number][] = [];
  if (exitX + 1 < width - 1) {
    grid[exitY][exitX + 1] = 0;
    stack.push([exitX + 1, exitY]);
  } else {
    stack.push([startX, startY]);
  }

  const directions = [
    [0, 2], [0, -2], [2, 0], [-2, 0]
  ];

  while (stack.length > 0) {
    const [cx, cy] = stack[stack.length - 1];
    const neighbors: {pos: [number, number, number, number], dir: [number, number]}[] = [];

    for (const [dx, dy] of directions) {
      const nx = cx + dx;
      const ny = cy + dy;

      if (nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1) {
        // PROTECT starting room boundaries (x: 1..6, y: 1..6)
        if (nx <= startRoomSize + 1 && ny <= startRoomSize + 1) continue;
        
        if (grid[ny][nx] === 1) {
          neighbors.push({ pos: [nx, ny, cx + dx / 2, cy + dy / 2], dir: [dx, dy] });
        }
      }
    }

    if (neighbors.length > 0) {
      // FORCED BRANCHING: Sometimes visit multiple neighbors from the same branch
      const branchChance = Math.random();
      const numToVisit = branchChance > 0.6 ? Math.min(neighbors.length, 2) : 1; 
      
      // Shuffle neighbors
      for (let i = neighbors.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [neighbors[i], neighbors[j]] = [neighbors[j], neighbors[i]];
      }

      for (let i = 0; i < numToVisit; i++) {
        const { pos: [nx, ny, wx, wy] } = neighbors[i];
        if (grid[ny][nx] === 1) {
          grid[wy][wx] = 0;
          grid[ny][nx] = 0;
          stack.push([nx, ny]);
        }
      }
    } else {
      stack.pop();
    }
  }

  // 3. Forced Corridors Turns (Clean up long straights)
  // Our generator above uses 2step jumps. Now we add intentional corners if a corridor is straight
  // Actually the loop logic below will break straights too.

  // 4. Heavy Loop Integration (Increased for many paths)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      // Avoid breaking starting room walls
      if (x <= startRoomSize + 1 && y <= startRoomSize + 1) continue;

      if (grid[y][x] === 1) {
        // Horizontally separating paths?
        const hPaths = grid[y][x-1] === 0 && grid[y][x+1] === 0;
        // Vertically separating paths?
        const vPaths = grid[y-1][x] === 0 && grid[y+1][x] === 0;
        
        if ((hPaths || vPaths) && Math.random() < 0.55) { // Higher chance for more openings
          grid[y][x] = 0;
        }
      }
    }
  }

  // Guarantee explicit left/right branch splits or bypass forks in standard mazes
  for (let y = 3; y < height - 3; y += 4) {
    for (let x = 3; x < width - 3; x += 4) {
      if (grid[y][x] === 0) {
        if (grid[y-1][x] === 0 || grid[y+1][x] === 0) {
          if (x > 1 && x < width - 2) {
            grid[y][x-1] = 0;
            grid[y][x+1] = 0;
          }
        }
      }
    }
  }

  // 5. Connect Rooms to Network (2-4 exits per room)
  rooms.forEach(room => {
    let exits = 0;
    while (exits < 0) {
      const side = Math.floor(Math.random() * 4);
      let ex = 0, ey = 0;
      if (side === 0) { // Top
        ex = room.x + Math.floor(Math.random() * room.w);
        ey = room.y - 1;
      } else if (side === 1) { // Bottom
        ex = room.x + Math.floor(Math.random() * room.w);
        ey = room.y + room.h;
      } else if (side === 2) { // Left
        ex = room.x - 1;
        ey = room.y + Math.floor(Math.random() * room.h);
      } else { // Right
        ex = room.x + room.w;
        ey = room.y + Math.floor(Math.random() * room.h);
      }

      if (ex >= 1 && ex < width - 1 && ey >= 1 && ey < height - 1) {
        grid[ey][ex] = 0;
        exits++;
      }
    }
  });

  return {
    grid,
    width,
    height,
    items: [],
    startX,
    startZ: startY,
    ghostStartX: width - 2,
    ghostStartZ: height - 2,
  };
}

export interface BranchInfo {
  x: number;
  z: number;
  correctDir: 'left' | 'right';
  facingWallX: number;
  facingWallZ: number;
}

export interface BranchSelectionMazeConfig {
  grid: number[][];
  branches: BranchInfo[];
  pathPoints: { x: number; z: number }[];
  obstacles: { x: number; z: number }[];
  startX: number;
  startZ: number;
  finalExitX: number;
  finalExitZ: number;
}

export function generateBranchSelectionMaze(gridW: number, gridH: number): BranchSelectionMazeConfig {
  const grid: number[][] = Array(gridH).fill(null).map(() => Array(gridW).fill(1));
  
  // PRESERVE STARTING ROOM (World X: 1..3, Z: 1..3)
  for (let rz = 1; rz <= 3; rz++) {
    for (let rx = 1; rx <= 3; rx++) {
      grid[rz][rx] = 0;
    }
  }
  // Hollow out an extra space behind (left side of starting room) for the monster to spawn further back
  grid[1][0] = 0;
  grid[2][0] = 0;
  grid[3][0] = 0;
  grid[3][4] = 0; // Exit Door passage at grid level

  // Path starts FROM the door area
  let cx = 5;
  let cz = 3;
  
  const branches: BranchInfo[] = [];
  const pathPoints: {x: number, z: number}[] = [];
  const obstacles: {x: number, z: number}[] = [];
  
  // Start path points at the deep carved alcove (behind starting room) for spawning
  pathPoints.push({ x: 0 * 2 + 1, z: 2 * 2 + 1 });
  pathPoints.push({ x: 1 * 2 + 1, z: 2 * 2 + 1 });
  pathPoints.push({ x: 2 * 2 + 1, z: 2 * 2 + 1 });
  pathPoints.push({ x: 3 * 2 + 1, z: 3 * 2 + 1 });
  pathPoints.push({ x: 4 * 2 + 1, z: 3 * 2 + 1 }); // Doorway

  // Initial path segment out of the door
  grid[cz][cx] = 0; 
  pathPoints.push({x: cx * 2 + 1, z: cz * 2 + 1});

  // Corridor generation going "out" (increasing Z)
  for (let i = 0; i < 5; i++) {
    const segLen = 12; // 12 cells per straight corridor segment
    for (let j = 0; j < segLen; j++) {
      if (cx >= 0 && cx < gridW && cz + 1 < gridH) {
        cz++;
        grid[cz][cx] = 0;
        const obsX = cx * 2 + 1;
        const obsZ = cz * 2 + 1;
        pathPoints.push({x: obsX, z: obsZ});

        if (j === 4 || j === 8) {
          obstacles.push({ x: obsX, z: obsZ });
        }
      }
    }
    
    if (cz + 4 >= gridH) break;

    // 1. UNIQUE CORE VARIABLE
    const isLeftCorrect = Math.random() < 0.5;
    const correctDir: 'left' | 'right' = isLeftCorrect ? 'left' : 'right';

    // Branch checkpoint position
    branches.push({ 
      x: cx * 2 + 1, 
      z: cz * 2 + 1, 
      correctDir,
      facingWallX: cx * 2 + 1,
      facingWallZ: (cz + 2) * 2 + 1
    });
    
    cz++;
    if (cz < gridH) {
      grid[cz][cx] = 0; // Junction step
      pathPoints.push({x: cx * 2 + 1, z: cz * 2 + 1});
      
      // Side paths for forks (initially hollowed out)
      if (cx - 1 >= 0) grid[cz][cx-1] = 0; 
      if (cx - 2 >= 0) grid[cz][cx-2] = 0;
      if (cx + 1 < gridW) grid[cz][cx+1] = 0; 
      if (cx + 2 < gridW) grid[cz][cx+2] = 0;
      
      // 2. FORCED CAUSAL BINDING
      if (isLeftCorrect) {
         if (cz + 1 < gridH && cx - 2 >= 0) grid[cz+1][cx-2] = 0; 
         if (cz + 2 < gridH && cx - 2 >= 0) grid[cz+2][cx-2] = 0;
         
         if (cx - 1 >= 0) pathPoints.push({ x: (cx - 1) * 2 + 1, z: cz * 2 + 1 });
         if (cx - 2 >= 0) pathPoints.push({ x: (cx - 2) * 2 + 1, z: cz * 2 + 1 });
         if (cz + 1 < gridH && cx - 2 >= 0) pathPoints.push({ x: (cx - 2) * 2 + 1, z: (cz + 1) * 2 + 1 });
         if (cz + 2 < gridH && cx - 2 >= 0) pathPoints.push({ x: (cx - 2) * 2 + 1, z: (cz + 2) * 2 + 1 });
         
         cx = Math.max(0, cx - 2); 
         cz = cz + 2;
      } else {
         if (cz + 1 < gridH && cx + 2 < gridW) grid[cz+1][cx+2] = 0; 
         if (cz + 2 < gridH && cx + 2 < gridW) grid[cz+2][cx+2] = 0;
         
         if (cx + 1 < gridW) pathPoints.push({ x: (cx + 1) * 2 + 1, z: cz * 2 + 1 });
         if (cx + 2 < gridW) pathPoints.push({ x: (cx + 2) * 2 + 1, z: cz * 2 + 1 });
         if (cz + 1 < gridH && cx + 2 < gridW) pathPoints.push({ x: (cx + 2) * 2 + 1, z: (cz + 1) * 2 + 1 });
         if (cz + 2 < gridH && cx + 2 < gridW) pathPoints.push({ x: (cx + 2) * 2 + 1, z: (cz + 2) * 2 + 1 });
         
         cx = Math.min(gridW - 1, cx + 2); 
         cz = cz + 2;
      }
    }
  }
  
  const remainingRow = gridH - cz - 1;
  for (let j = 0; j < remainingRow; j++) {
    if (cz + 1 < gridH) {
      cz++;
      grid[cz][cx] = 0;
      pathPoints.push({x: cx * 2 + 1, z: cz * 2 + 1});
    }
  }

  return {
    grid,
    branches,
    pathPoints,
    obstacles,
    startX: 2,
    startZ: 2,
    finalExitX: cx * 2 + 1,
    finalExitZ: cz * 2 + 1
  };
}
