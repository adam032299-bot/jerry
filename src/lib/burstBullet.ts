import * as THREE from 'three';
import { BarragePattern } from '../types';

// This is not yet used in the game loop.
// Logic for Burst Bullet:
// 1. 母彈 (Parent): Large, glowing red sphere (2.5x size). Moves at 15 units/sec.
// 2. 觸發條件: 2 seconds or reach center.
// 3. 分裂 (Burst): Immediate destruction of parent, generation of 8-12 small red bullets.
// 4. 散發 (Scatter): 360 degrees, 40 units/sec speed.
// 5. 碰撞: 玩家Hitbox接觸即判定受到傷害。

export interface BurstBulletParent {
  mesh: THREE.Mesh;
  startTime: number;
}

export interface BurstBulletChild {
  mesh: THREE.Mesh;
  vx: number;
  vz: number;
}

export function createBurstBulletParent(startPos: THREE.Vector3): BurstBulletParent {
  const geom = new THREE.SphereGeometry(0.25 * 2.5, 12, 12);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Glowing red sphere
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.copy(startPos);
  
  return {
    mesh,
    startTime: Date.now()
  };
}

export function createBurstBulletChildren(origin: THREE.Vector3): BurstBulletChild[] {
  const children: BurstBulletChild[] = [];
  const numBullets = 16; // 8 to 12
  const speed = 25;
  
  for (let i = 0; i < numBullets; i++) {
    const angle = (i / numBullets) * Math.PI * 2;
    const vx = Math.cos(angle) * speed;
    const vz = Math.sin(angle) * speed;
    
    const geom = new THREE.SphereGeometry(0.25, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(origin);
    
    children.push({ mesh, vx, vz });
  }
  
  return children;
}
