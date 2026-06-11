export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  JUMPSCARE = 'JUMPSCARE',
  GAMEOVER_WIN = 'GAMEOVER_WIN',
  GAMEOVER_LOSE = 'GAMEOVER_LOSE',
}

export enum MonsterAIState {
  IDLE = 'IDLE',               // Hidden, waiting to spawn
  STALKING = 'STALKING',       // Stage 2: Presence (no chase, just staring/flashing)
  APPROACH_VANISH = 'APPROACH_VANISH', // Stage 3: Approaches then vanishes
  PERSISTENT_CHASE = 'PERSISTENT_CHASE', // Stage 4: Persistent Chase
  ULTIMATE_CHASE = 'ULTIMATE_CHASE',     // Stage 5: Fast chase + gaze stop
}

export enum HorrorProgression {
  STAGE_1 = 1,   // Safe exploration
  STAGE_2 = 2,   // Flashing anomaly
  STAGE_3 = 3,   // Approaching presence
  STAGE_4 = 4,   // Persistent chase
  STAGE_5 = 5,   // Hard-stop high-speed pursuit
  STAGE_6 = 6,   // Multi-stage Boss Fight
  STAGE_7 = 7,   // Final Room
  STAGE_8 = 8,   // True Final Room
}

export enum BossStageStatus {
  P1_NORMAL = 'P1_NORMAL',
  P2_EYEBALLS = 'P2_EYEBALLS',
  P2_BOSS_FIGHT = 'P2_BOSS_FIGHT',
  SUPPRESSED = 'SUPPRESSED',
}

export enum BarragePattern {
  RED_BULLETS = 'RED_BULLETS',       // 彈幕一：猩紅彈雨
  SPINNING_CROSS = 'SPINNING_CROSS', // 彈幕二：旋轉十字雷射
  CEILING_STRIKE = 'CEILING_STRIKE', // 彈幕三：天基定時雷射
  IRREGULAR_GRID = 'IRREGULAR_GRID', // 彈幕四：不規則井字雷射
  BURST_BULLET = 'BURST_BULLET',      // 彈幕五：分裂彈
  PRISM_SNIPING = 'PRISM_SNIPING', // 第六種彈幕：幾何稜鏡重砲狙擊
  TRIPLE_LANE_BLAST = 'TRIPLE_LANE_BLAST', // 第七種彈幕：自適應三軌雷射轟炸
  GIANT_SWEEP_LASER = 'GIANT_SWEEP_LASER' // 第八種彈幕：極地軌道橫掃死光
}

export interface Vector2D {
  x: number;
  y: number;
}

export interface GameItem {
  id: string;
  name: string;
  gridX: number;
  gridZ: number;
  collected: boolean;
  // World space positions
  worldX: number;
  worldZ: number;
  isFake?: boolean;
}

export interface MazeConfig {
  grid: number[][]; // 1 = wall, 0 = path
  width: number;
  height: number;
  startX: number;
  startZ: number;
  items: GameItem[];
  ghostStartX: number;
  ghostStartZ: number;
}

export interface PlayerControls {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump?: boolean;
}
