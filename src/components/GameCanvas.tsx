import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowUp } from 'lucide-react';
import { GameItem, MazeConfig, PlayerControls, MonsterAIState, HorrorProgression, BossStageStatus, BarragePattern } from '../types';
import { spookyAudio } from './AudioEngine';
import { playMenuClickSound, playNpcSaySound, playItemGetSound } from '../lib/uiSounds';
import { generateMaze, generateBranchSelectionMaze } from '../utils/mazeGenerator';

const grass3Url = '/src/grass3.png';
const wall3Url = '/src/wall3.png';

interface TypewriterTransitionProps {
  onComplete: () => void;
}

const TypewriterTransition: React.FC<TypewriterTransitionProps> = ({ onComplete }) => {
  const [segmentIdx, setSegmentIdx] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [charIdx, setCharIdx] = useState(0);
  const [showRedFlood, setShowRedFlood] = useState(false);

  const segments = [
    { text: "你來到這裡第幾天了？", pause: 1500, delay: 300 },
    { text: "要逃了嗎？", pause: 1500, delay: 300 },
    { text: "醒來", pause: 1500, delay: 300 },
    { text: "醒來", pause: 1500, delay: 300 },
    { text: "醒來", pause: 1500, delay: 1000 }
  ];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        onComplete();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onComplete]);

  useEffect(() => {
    if (segmentIdx >= segments.length) {
      setShowRedFlood(true);
      spookyAudio.playRedFloodSound();
      const timer = setTimeout(() => {
        onComplete();
      }, 2500); // Shakes violently for 2.5 seconds
      return () => clearTimeout(timer);
    }

    const current = segments[segmentIdx];
    let typeTimer: NodeJS.Timeout | null = null;
    let pauseTimer: NodeJS.Timeout | null = null;

    if (charIdx < current.text.length) {
      typeTimer = setInterval(() => {
        setCharIdx(prev => {
          const nextIdx = prev + 1;
          setDisplayText(current.text.slice(0, nextIdx));
          spookyAudio.playTypewriterStrike();
          return nextIdx;
        });
      }, current.delay);
    } else {
      pauseTimer = setTimeout(() => {
        setDisplayText("");
        setCharIdx(0);
        setSegmentIdx(prev => prev + 1);
      }, current.pause);
    }

    return () => {
      if (typeTimer) clearInterval(typeTimer);
      if (pauseTimer) clearTimeout(pauseTimer);
    };
  }, [segmentIdx, charIdx]);

  return (
    <div 
      style={{ background: "#000000", zIndex: 999997 }}
      className={`fixed inset-0 flex items-center justify-center select-none pointer-events-auto cursor-none ${showRedFlood ? 'shake-violent' : 'animate-fade-in duration-1000'}`}
    >
      <style>{`
        @keyframes screen-shake {
          0% { transform: translate(2px, 2px) rotate(0deg); }
          10% { transform: translate(-2px, -3px) rotate(-1.5deg); }
          20% { transform: translate(-4px, 0px) rotate(1.5deg); }
          30% { transform: translate(0px, 3px) rotate(0deg); }
          40% { transform: translate(2px, -2px) rotate(1.5deg); }
          50% { transform: translate(-2px, 3px) rotate(-1.5deg); }
          60% { transform: translate(-4px, 2px) rotate(0deg); }
          70% { transform: translate(3px, 2px) rotate(-1.5deg); }
          80% { transform: translate(-2px, -2px) rotate(1.5deg); }
          90% { transform: translate(3px, 3px) rotate(0deg); }
          100% { transform: translate(2px, -3px) rotate(-1.5deg); }
        }
        .shake-violent {
          animation: screen-shake 0.08s infinite;
        }
      `}</style>

      {showRedFlood ? (
        <div className="absolute inset-0 flex flex-wrap justify-center items-center content-center overflow-hidden p-6 gap-2 bg-black select-none pointer-events-none">
          {Array.from({ length: 160 }).map((_, idx) => (
            <span 
              key={idx} 
              className="text-red-600 font-extrabold text-3xl md:text-6xl font-sans tracking-wide uppercase select-none transform transition-transform animate-pulse"
              style={{
                opacity: Math.random() * 0.5 + 0.5,
                textShadow: "0 0 15px rgba(220, 38, 38, 0.9)",
                transform: `rotate(${Math.random() * 32 - 16}deg) scale(${0.8 + Math.random() * 0.6})`,
                animationDelay: `${Math.random() * 0.5}s`
              }}
            >
              醒來
            </span>
          ))}
        </div>
      ) : (
        <p 
          className="text-white text-3xl md:text-5xl font-extralight tracking-[0.25em] text-center font-sans animate-pulse"
          style={{ textShadow: "0 0 15px rgba(255,255,255,0.4)" }}
        >
          {displayText}
        </p>
      )}
      <div className="absolute bottom-10 left-0 right-0 text-center">
        <p className="text-white/30 text-sm font-light tracking-widest animate-pulse uppercase">
          [ Space to Skip ]
        </p>
      </div>
    </div>
  );
};

interface GameCanvasProps {
  config: MazeConfig;
  onItemCollected: (count: number) => void;
  onTriggerJumpScare: () => void;
  onGameOverLose: () => void;
  onGameOverWin: () => void;
  isPaused: boolean;
  gameActive: boolean;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  config,
  onItemCollected,
  onTriggerJumpScare,
  onGameOverLose,
  onGameOverWin,
  isPaused,
  gameActive,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const triggerRef = useRef<((s: number) => void) | null>(null);
  const typewriterOnCompleteRef = useRef<(() => void) | null>(null);
  const syncPatternsRef = useRef<((pats: BarragePattern[]) => void) | null>(null);
  const fallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Reaction states for React overlay
  const [currentStageUI, setCurrentStageUI] = useState<number>(HorrorProgression.STAGE_1);
  const [isTypewriterActive, setIsTypewriterActive] = useState<boolean>(false);
  const [sanity, setSanity] = useState<number>(100);
  const [collectedCount, setCollectedCount] = useState<number>(0);
  const [isTrackerVisible, setIsTrackerVisible] = useState<boolean>(true);
  const [branchesCleared, setBranchesCleared] = useState<number>(0);
  const [subliminalText, setSubliminalText] = useState<string | null>(null);
  const [distortion, setDistortion] = useState<number>(0);
  const [texturesLoaded, setTexturesLoaded] = useState<number>(0); 
  const [isGlitching, setIsGlitching] = useState<boolean>(false);
  const [isVictoryFading, setIsVictoryFading] = useState<boolean>(false);
  const [distToMonster, setDistToMonster] = useState<number>(100);
  const [npcDialogue, setNpcDialogue] = useState<{ text: string; color: string } | null>(null);
  const [isDialogueShaking, setIsDialogueShaking] = useState<boolean>(false);
  const [npcInteractionCount, setNpcInteractionCount] = useState<number>(0);
  const [isBlinking, setIsBlinking] = useState<boolean>(false);
  const [showInteractHint, setShowInteractHint] = useState<boolean>(false);
  const [interactHintText, setInteractHintText] = useState<string>("按下 [F] 對話");
  const [showRunIndicator, setShowRunIndicator] = useState<boolean>(false);
  const [showStage4EnterPrompt, setShowStage4EnterPrompt] = useState<boolean>(false);
  const [showMenu, setShowMenu] = useState<boolean>(true);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showPauseSettings, setShowPauseSettings] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(80);
  const volumeRef = useRef<number>(80);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);



  const [isNearNPC, setIsNearNPC] = useState<boolean>(false);
  const [canInteract, setCanInteract] = useState<boolean>(false);
  const [isTalking, setIsTalking] = useState<boolean>(false);
  const [isJumpscareActive, setIsJumpscareActive] = useState<boolean>(false);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [isChasing, setIsChasing] = useState<boolean>(false);
  const [isPlayingVideo, setIsPlayingVideo] = useState<boolean>(false);
  const [bossPhase, setBossPhase] = useState<string>('NONE');
  const [bossTimeLeft, setBossTimeLeft] = useState<number>(40);
  const [countdownTime, setCountdownTime] = useState<number>(3.0);
  const [bossPlayerHp, setBossPlayerHp] = useState<number>(40);
  const [showStage6DeadScreen, setShowStage6DeadScreen] = useState<boolean>(false);
  const [hasCollectedCoreUI, setHasCollectedCoreUI] = useState<boolean>(false);
  useEffect(() => {
    spookyAudio.preloadParry();
    const images = ['/lbone.png', '/rbone.png', '/parrysword.png'];
    images.forEach(src => {
        new Image().src = src;
    });
  }, []);

  const [bossNpcDialogue, setBossNpcDialogue] = useState<string | null>(null);
  const [subtitle, setSubtitle] = useState("");
  const [subtitleVisible, setSubtitleVisible] = useState(false);
  const [parryStatus, setParryStatus] = useState<'READY' | 'ACTIVE' | 'COOLDOWN'>('READY');
  const [parryCdMs, setParryCdMs] = useState<number>(0);

  useEffect(() => {
    let timer: any;
    if (parryStatus === 'ACTIVE') {
      setParryCdMs(0);
      fallbackTimeoutRef.current = setTimeout(() => {
        setParryStatus('COOLDOWN');
      }, 250);
    } else if (parryStatus === 'COOLDOWN') {
      const startTime = performance.now();
      const duration = 750; // remaining time after active phase ends (1000ms - 250ms)
      const updateCd = () => {
        const elapsed = performance.now() - startTime;
        const remaining = Math.max(0, Math.round(duration - elapsed));
        setParryCdMs(remaining);
        if (remaining > 0) {
          timer = requestAnimationFrame(updateCd);
        } else {
          setParryStatus('READY');
        }
      };
      timer = requestAnimationFrame(updateCd);
    } else {
      setParryCdMs(0);
    }
    return () => {
      if (timer) cancelAnimationFrame(timer);
      if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
    };
  }, [parryStatus]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const stage6RestartRef = useRef<(() => void) | null>(null);
  const runMusic = useRef<HTMLAudioElement | null>(null);
  const bossMusic = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    runMusic.current = new Audio('/run.mp3');
    runMusic.current.loop = true;

    bossMusic.current = new Audio('/boss.mp3');
    bossMusic.current.loop = true;

    return () => {
      if (runMusic.current) {
        runMusic.current.pause();
        runMusic.current.currentTime = 0;
      }
      if (bossMusic.current) {
        bossMusic.current.pause();
        bossMusic.current.currentTime = 0;
      }
    };
  }, []);

  // Sync run music volume and handle pause/resume
  useEffect(() => {
    if (runMusic.current) {
      runMusic.current.volume = (volume / 100) * 0.5;
      if (isChasing && !isPaused && gameActive) {
        runMusic.current.play().catch(e => console.log("音樂播放被瀏覽器阻擋", e));
      } else {
        runMusic.current.pause();
      }
    }
  }, [volume, isChasing, isPaused, gameActive]);

  const [isFlashing, setIsFlashing] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [isEndingWhiteScreen, setIsEndingWhiteScreen] = useState(false);
  const [endingText, setEndingText] = useState('');

  const triggerScreenFlash = (duration: number) => {
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), duration * 100);
  };

  const triggerCameraShake = (intensity: number, duration: number) => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), duration);
  };

  const spawnGlowSlash = (
    scene: THREE.Scene, 
    basePos: THREE.Vector3, 
    offsetX: number, 
    offsetZ: number, 
    rotationZ: number, 
    sizeX: number, 
    sizeY: number, 
    texture: THREE.Texture,
    duration: number = 320,
    hasExtraLines: boolean = false
  ) => {
    const group = new THREE.Group();
    // Position group slightly above the ground plane to prevent clipping
    group.position.set(basePos.x + offsetX, 0.09, basePos.z + offsetZ);
    scene.add(group);

    // 1. Core sword slash geometry
    const mainGeom = new THREE.PlaneGeometry(1, 1);

    // Main texture mesh (additive and clean)
    const mainMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      opacity: 1.0
    });
    const mainMesh = new THREE.Mesh(mainGeom, mainMat);
    mainMesh.rotation.x = -Math.PI / 2;
    mainMesh.rotation.z = rotationZ;
    mainMesh.scale.set(sizeX * 0.4, sizeY * 1.3, 1);
    group.add(mainMesh);

    // 2. Extra hot inner glow mesh (slightly offset or different rotation) to give it volumetric punch!
    const glowMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      opacity: 0.7,
      color: 0xffddaa // golden aura overlay
    });
    const glowMesh = new THREE.Mesh(mainGeom, glowMat);
    glowMesh.rotation.x = -Math.PI / 2;
    glowMesh.rotation.z = rotationZ + 0.05; // slight cinematic offset
    glowMesh.scale.set(sizeX * 0.45, sizeY * 1.35, 1);
    group.add(glowMesh);

    // 2b. Add highly visual, sharp energy slicing speed-lines (旁邊的線條特效) for first phase
    const streaks: { mesh: THREE.Mesh; scaleX: number; len: number; speed: number; angle: number; currentDist: number; maxDist: number }[] = [];
    const lineGeom = new THREE.PlaneGeometry(1, 1);

    if (hasExtraLines) {
      const streakCount = 18;
      for (let i = 0; i < streakCount; i++) {
        const isGold = i % 2 === 0;
        const lineMat = new THREE.MeshBasicMaterial({
          color: isGold ? 0xffea88 : 0xffffff, // high electricity gold/white lines
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          opacity: 1.0
        });
        const lineMesh = new THREE.Mesh(lineGeom, lineMat);
        lineMesh.rotation.x = -Math.PI / 2;

        // Spread angles around the cutting line to look like a chaotic burst of energy blades
        const spreadOffset = (Math.random() - 0.5) * 0.65;
        const finalAngle = rotationZ + spreadOffset;
        lineMesh.rotation.z = finalAngle;

        // Super long and thin sword cuts/streaks
        const streakLen = 1.6 + Math.random() * 2.8;
        const streakWidth = 0.015 + Math.random() * 0.035;
        
        // Start thin and short, will scale up in animation
        lineMesh.scale.set(streakWidth, 0.05, 1);

        // Position distributed along the arc
        const slideOffset = (Math.random() - 0.5) * sizeY * 0.9;
        const startX = Math.sin(rotationZ) * slideOffset;
        const startZ = -Math.cos(rotationZ) * slideOffset;
        lineMesh.position.set(startX, 0.015 + Math.random() * 0.06, startZ);

        group.add(lineMesh);

        streaks.push({
          mesh: lineMesh,
          scaleX: streakWidth,
          len: streakLen,
          speed: 4.5 + Math.random() * 9.5,
          angle: finalAngle,
          currentDist: 0,
          maxDist: 1.0 + Math.random() * 3.5
        });
      }
    }

    // 3. Dynamic Particle Burst Effect! Creates a procedural canvas-based glow texture
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 32;
    pCanvas.height = 32;
    const pCtx = pCanvas.getContext('2d')!;
    const grad = pCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.2, 'rgba(255, 200, 50, 0.9)');
    grad.addColorStop(0.5, 'rgba(255, 60, 10, 0.5)');
    grad.addColorStop(1, 'rgba(255, 0, 0, 0)');
    pCtx.fillStyle = grad;
    pCtx.fillRect(0, 0, 32, 32);
    
    const pTex = new THREE.CanvasTexture(pCanvas);
    const pGeom = new THREE.PlaneGeometry(0.5, 0.5);
    const particlesCount = 18;
    const particles: { mesh: THREE.Mesh; vx: number; vz: number; vy: number; rotSpd: number }[] = [];

    for (let i = 0; i < particlesCount; i++) {
      const pMat = new THREE.MeshBasicMaterial({
        map: pTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const pMesh = new THREE.Mesh(pGeom, pMat);
      
      // Scatter particles along the slash line path
      const offsetDist = (Math.random() - 0.5) * sizeY * 0.8;
      const slashLineX = Math.sin(rotationZ) * offsetDist;
      const slashLineZ = -Math.cos(rotationZ) * offsetDist;
      
      pMesh.position.set(
        slashLineX + (Math.random() - 0.5) * 0.4, 
        0.01 + Math.random() * 0.05, 
        slashLineZ + (Math.random() - 0.5) * 0.4
      );
      
      // Random sizes for depth and variety
      const scaleVal = 0.25 + Math.random() * 0.45;
      pMesh.scale.set(scaleVal, scaleVal, 1);
      pMesh.rotation.x = -Math.PI / 2;
      pMesh.rotation.z = Math.random() * Math.PI * 2;
      group.add(pMesh);

      // Energy bursts perpendicular to the cut direction for an explosive look
      const perpAngle = rotationZ + (Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2) + (Math.random() - 0.5) * 0.7;
      const speed = 2.5 + Math.random() * 3.5;
      
      particles.push({
        mesh: pMesh,
        vx: Math.sin(perpAngle) * speed,
        vz: -Math.cos(perpAngle) * speed,
        vy: 0.1 + Math.random() * 1.2,
        rotSpd: (Math.random() - 0.5) * 8
      });
    }

    // 4. Update and animate
    const startTime = performance.now();
    let animFrameId: number;

    const animateGlowSlash = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1.0);

      // Elastic slash animation script: snaps in, then widens out
      const sizeMultX = THREE.MathUtils.lerp(0.4, 1.15, Math.min(progress * 2.5, 1.0));
      const sizeMultY = THREE.MathUtils.lerp(1.3, 0.95, progress);

      mainMesh.scale.set(sizeX * sizeMultX, sizeY * sizeMultY, 1);
      glowMesh.scale.set(sizeX * (sizeMultX + 0.15), sizeY * (sizeMultY + 0.1), 1);

      // Rotate slightly over life to give a sense of physical momentum
      mainMesh.rotation.z = rotationZ + (progress * 0.04);
      glowMesh.rotation.z = rotationZ + 0.05 - (progress * 0.03);

      // Dynamic opacity fade
      let currentOpacity = 1.0;
      if (progress < 0.15) {
        currentOpacity = progress / 0.15;
      } else if (progress > 0.5) {
        currentOpacity = 1.0 - (progress - 0.5) / 0.5;
      }

      mainMat.opacity = currentOpacity;
      glowMat.opacity = currentOpacity * 0.65;

      // Move and fade particles
      const dt = 0.016;
      particles.forEach(part => {
        part.mesh.position.x += part.vx * dt;
        part.mesh.position.z += part.vz * dt;
        part.mesh.position.y += part.vy * dt;
        part.mesh.rotation.z += part.rotSpd * dt;

        const pMat = part.mesh.material as THREE.MeshBasicMaterial;
        // Fade out slightly after the half point
        pMat.opacity = Math.max(0, 1.0 - progress);
        part.mesh.scale.multiplyScalar(0.95); // shrink
      });

      // Animate custom sword energy streaks (旁邊的線條特效)
      if (hasExtraLines) {
        streaks.forEach(s => {
          // Slide forward along its trajectory
          s.mesh.position.x += Math.sin(s.angle) * s.speed * dt;
          s.mesh.position.z -= Math.cos(s.angle) * s.speed * dt;
          s.currentDist += s.speed * dt;

          // Expand length quickly, then fade/shrink size
          let scaleYVal = s.len;
          if (progress < 0.25) {
            scaleYVal = s.len * (progress / 0.25);
          } else {
            scaleYVal = s.len * Math.max(0, 1.0 - (progress - 0.25) / 0.75);
          }
          s.mesh.scale.set(s.scaleX, scaleYVal, 1.0);

          const sMat = s.mesh.material as THREE.MeshBasicMaterial;
          sMat.opacity = Math.max(0, 1.0 - progress);
        });
      }

      if (progress < 1.0) {
        animFrameId = requestAnimationFrame(animateGlowSlash);
      } else {
        cancelAnimationFrame(animFrameId);
        mainGeom.dispose();
        mainMat.dispose();
        glowMat.dispose();
        pGeom.dispose();
        pTex.dispose();
        particles.forEach(part => {
          (part.mesh.material as THREE.MeshBasicMaterial).dispose();
        });
        
        // Clean up speed-line materials/geometries to avoid memory leaks
        lineGeom.dispose();
        if (hasExtraLines) {
          streaks.forEach(s => {
            (s.mesh.material as THREE.MeshBasicMaterial).dispose();
          });
        }
        scene.remove(group);
      }
    };

    animateGlowSlash();
  };

  const handleDialogComplete = () => {
    setSubtitleVisible(false);
    triggerScreenFlash(5);
    triggerCameraShake(1.5, 1000);
    
    // Explicitly transition to Phase 2
    const bossPhase = 'P2_SURVIVAL';
    (stateRef.current as any).boss.bossPhase = bossPhase;
    setBossPhase(bossPhase);
    (stateRef.current as any).boss.p1TotalTime = 0;
    setBossTimeLeft(50);
    (stateRef.current as any).boss.patternDuration = 0;
    (stateRef.current as any).boss.sequenceIndex = 0;
    
    // Re-sync patterns for Phase 2
    if (syncPatternsRef.current) syncPatternsRef.current([]);
    
    setNpcDialogue({
      text: "💥 瘋狂與憤怒...【第二階段】：絶望開始！",
      color: "text-red-500 font-extrabold text-sm tracking-wide animate-pulse"
    });
  };

  const runAttackDialogue = async () => {
    if (subtitleVisible) return;
    setSubtitleVisible(true);
    
    const text1 = "你在幹嘛?";
    setSubtitle("");
    for (const char of text1) {
        setSubtitle((prev) => prev + char);
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const text2 = "不要拿走";
    setSubtitle("");
    for (const char of text2) {
        setSubtitle((prev) => prev + char);
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    handleDialogComplete();
  };

  const runPhase3Dialogue = async () => {
    if (subtitleVisible) return;
    setSubtitleVisible(true);
    
    // First part: 陳家睿不是你能碰的
    const text1 = "陳家睿不是你能碰的";
    setSubtitle("");
    for (const char of text1) {
        setSubtitle((prev) => prev + char);
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setSubtitleVisible(false);
    
    // Trigger Phase 3 transition
    triggerP3Transition();
  };

  const runPhase4Dialogue = async () => {
    const boss = stateRef.current.boss;
    boss.p4Stage = 'SPEAKING';
    boss.p4TotalTime = 0;

    if (subtitleVisible) return;
    setSubtitleVisible(true);
    
    // Display "艾德加" char by char
    const text = "艾德加";
    setSubtitle("");
    for (const char of text) {
        setSubtitle((prev) => prev + char);
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
    setSubtitleVisible(false);

    // Dialogue finishes! Now transition to SWEEP_LASER
    boss.p4Stage = 'SWEEP_LASER';
    boss.p4LaserTime = 0;
    boss.p4LaserCharged = false;
    boss.p4LaserBellTriggered = false;
    boss.p4LaserSweepIndex = 0;
  };

  const triggerP3Transition = () => {
    // C. 狀態推進 (Enter Phase 3)
    stateRef.current.boss.bossPhase = 'PHASE_3';
    setBossPhase('PHASE_3');
    
    stateRef.current.boss.phaseIndex = 3;
    stateRef.current.boss.p1TotalTime = 0;
    (stateRef.current as any).boss.p3TotalTime = 0;
    setBossTimeLeft(65.0);
    stateRef.current.boss.patternDuration = 0;
    stateRef.current.boss.sequenceIndex = 0;
    if (syncPatternsRef.current) syncPatternsRef.current([BarragePattern.RED_BULLETS, BarragePattern.BURST_BULLET]);

    setNpcDialogue({
      text: "⚡💀 邪能再次崩裂！陳家睿神情痛苦，進入【第三階段】：幾何稜鏡重砲 & 自適應三軌雷射網！",
      color: "text-red-500 font-black text-sm tracking-widest animate-pulse"
    });
  };

  const ITEM_NAMES: Record<number, string> = {
    [HorrorProgression.STAGE_1]: "陳家睿軀幹",
    [HorrorProgression.STAGE_2]: "陳家睿左腳",
    [HorrorProgression.STAGE_3]: "陳家睿右腳",
    [HorrorProgression.STAGE_4]: "陳家睿右手",
    [HorrorProgression.STAGE_5]: "陳家睿左手",
    [HorrorProgression.STAGE_6]: "完全體陳家睿",
  };

  // Guidance System States
  const arrowRef = useRef<HTMLDivElement>(null);
  const [bossMashProgress, setBossMashProgress] = useState(0);
  const [mashCount, setMashCount] = useState(0);
  const [devMode, setDevMode] = useState<boolean>(false); 
  const [isPausedInternal, setIsPausedInternal] = useState<boolean>(false);

  // Sync boss music volume and handle play/pause on stage 6 boss fight states
  // Heartbeat loop for stages 1, 2, 3
  useEffect(() => {
    stateRef.current.isGameOver = isGameOver;
  }, [isGameOver]);

  useEffect(() => {
    stateRef.current.stage = currentStageUI;
  }, [currentStageUI]);

  useEffect(() => {
    if (currentStageUI >= HorrorProgression.STAGE_1 && currentStageUI <= HorrorProgression.STAGE_4) {
      // Logic moved to updateGhostAI
    } else {
      spookyAudio.stopHeartbeat();
    }
  }, [currentStageUI]);

  useEffect(() => {
    if (bossMusic.current) {
      bossMusic.current.volume = (volume / 100) * 0.30;
      const shouldPlay = (currentStageUI === HorrorProgression.STAGE_6) && 
                         (bossPhase !== 'NONE' && bossPhase !== 'DEFEATED') && 
                         (!isPaused) && 
                         (!isPausedInternal) && 
                         (!showMenu) && 
                         (!showStage6DeadScreen) &&
                         gameActive;
      if (shouldPlay) {
        bossMusic.current.play().catch(e => console.log("Boss music blocked by browser", e));
      } else {
        bossMusic.current.pause();
      }
    }
  }, [volume, currentStageUI, bossPhase, isPaused, isPausedInternal, showMenu, showStage6DeadScreen, gameActive]);
  const cloudImgRef = useRef<HTMLImageElement | null>(null);
  const eyesImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    let loadedCount = 0;
    const totalToLoad = 2;

    const checkAllLoaded = () => {
      loadedCount++;
      if (loadedCount === totalToLoad) {
        setTexturesLoaded(prev => prev + 1); // Trigger re-render/effect
      }
    };

    const cloudImg = new Image();
    cloudImg.src = '/cloud.png';
    cloudImg.onload = () => {
      cloudImgRef.current = cloudImg;
      checkAllLoaded();
    };

    const eyeImg = new Image();
    eyeImg.src = '/eyes.png';
    eyeImg.onload = () => {
      eyesImgRef.current = eyeImg;
      checkAllLoaded();
    };
  }, []);

  // Core references
  const stateRef = useRef({
    player: {
      x: config.startX * 2 + 1, // World coordinates (Grid cell is 2x2, player centered in starts)
      z: config.startZ * 2 + 1,
      angle: 0, // Facing direction (yaw, radians)
      pitch: 0, // Vertical direction (pitch, radians)
      radius: 0.35,
      y: 0.8,
      vy: 0,
      isJumping: false,
    },
    isInvincible: false,
    isBlinking: false,
    isLevel4: false,
    stageStartTime: 0,
    isMonsterActive: false,
    level4: {
      branches: [] as { x: number; z: number; correctDir: 'left' | 'right'; facingWallX: number; facingWallZ: number }[],
      currentBranch: 0,
      obstacles: [] as { x: number; z: number; mesh: THREE.Group }[],
      monsterLastPos: { x: 0, z: 0 },
      isDeadEnd: false,
      deadEndStartTime: 0,
      isSceneLoaded: false,
      pathPoints: [] as { x: number; z: number }[],
      itemSpawned: false,
      finalExitX: 0,
      finalExitZ: 0,
      slowdownTimer: 0,
    },
    ghost: {
      x: config.ghostStartX * 2 + 1,
      z: config.ghostStartZ * 2 + 1,
      angle: 0,
      active: true,
      lastGridX: config.ghostStartX,
      lastGridZ: config.ghostStartZ,
      targetGridX: config.ghostStartX,
      targetGridZ: config.ghostStartZ,
      lerpProgress: 0,
      speed: 0, // dynamic
      state: MonsterAIState.IDLE,
      visibilityTimer: 0,
      isSeen: false,
      hasScared: false,
      lastSeenTime: 0,
      noiseLevel: 0,
      chaseTimer: 0,
      stalkPosition: { x: 0, z: 0 },
      isFake: false,
      jumpscarePhase: 0, // 0: none, 1: behind footsteps, 2: turn back monster
      duration: 0,
      spawnTime: 0,
      isPaused: false,
      pauseStartTime: 0,
      pathIdx: 0,
    },
    isChasing: false,
    items: JSON.parse(JSON.stringify(config.items)) as GameItem[], // deep clone
    controls: {
      forward: false,
      backward: false,
      left: false,
      right: false,
      turnLeft: false,
      turnRight: false,
      run: false,
      interact: false,
      jump: false,
    } as PlayerControls & { turnLeft: boolean; turnRight: boolean; run: boolean; interact: boolean; jump: boolean },
    sanity: 100,
    isScreamerTriggered: false,
    isGameOver: false,
    collectedCount: 0,
    stage: HorrorProgression.STAGE_1,
    spawnDevItem: null as (() => void) | null,
    mazeGrid: JSON.parse(JSON.stringify(config.grid)) as number[][],
    wallBoxes: [] as { minX: number; maxX: number; minZ: number; maxZ: number }[],
    wallMeshesMap: new Map<string, THREE.Mesh>(),
    devStageOverride: -1, 
    tension: 0,
    noise: 0,
    lastMoveTime: 0,
    isGlitching: false,
    lastPointerLockExitTime: 0,
    gameStartTime: performance.now(),
    hasSpawnedFirstItems: false,
    // Pressure Triggers
    continuousMoveTime: 0,
    stayTime: 0,
    cornersPassed: 0,
    lastGridPosition: { x: -1, z: -1 },
    lastMoveDir: { x: 0, z: 0 },
    pressureRhythm: 10000, // Starting quiet time in ms
    isGhostTriggered: false, 
    lastCameraY: 0,
    hintUpdateTimer: 0,
    stage4TriggerTimer: 0,
    npc: {
      interactionCount: 0,
      isGlitched: false,
      lastInteractionTime: 0,
      isOpen: false,
      isQuestComplete: false,
    },
    canInteract: false,
    isTalking: false,
    npcToggleTriggered: false,
    showMenu: true,
    isPausedInternal: false,
    isPlayingVideo: false,
    isTypewriterActive: false,
    stamina: 100,
    isRecovering: false,
    lastRunTime: 0,
    boss: {
      showStage6DeadScreen: false,
      burstBullets: [] as { mesh: THREE.Mesh, startTime: number }[],
      hasBeenAttacked: false,
      status: BossStageStatus.P1_NORMAL,
      health: 1000,
      maxHealth: 1000,
      isInvulnerable: false,
      eyeballs: [] as { height: number, angle: number, health: number, mesh: THREE.Group, id: number }[],
      adds: [] as { mesh: THREE.Mesh, speed: number }[],
      hazards: [] as { mesh: THREE.Mesh, speed: number }[],
      lastSummonTime: 0,
      groundHazardMaterial: null as THREE.ShaderMaterial | null,
      bulletMode: 'SPIRAL' as 'SPIRAL' | 'LASER' | 'NONE',
      spiralAngle: 0,
      normalBullets: [] as { mesh: THREE.Mesh, vx: number, vz: number }[],
      lastSpiralShootTime: 0,
      bossPhase: 'NONE' as any,
      p1TotalTime: 0,
      patternDuration: 0,
      currentPattern: BarragePattern.RED_BULLETS as BarragePattern,
      stunCore: null as THREE.Mesh | null,
      laserGroup: null as THREE.Group | null,
      laserLines: [] as number[],
      laserAngle: 0,
      orbitalStrikes: [] as any[],
      lastOrbitalStrikeSpawnTime: 0,
      matrixStrikes: [] as any[],
      lastMatrixStrikeSpawnTime: 0,
      phaseIndex: 1,
      sequenceIndex: 0,
      activePatterns: [] as BarragePattern[],
      hasCollectedCore: false,
      slashMeshes: [] as any[],
      shakeTimer: 0,
      knockbackTargetTime: 0,
      knockbackDir: null as { x: number, z: number } | null,
      lastLaserSoundTime: 0,
      lastBulletShootTime: 0,
      swipeState: null as any | null,
      p4TotalTime: 0,
    },
    parryActiveUntil: 0,
    parryCooldownUntil: 0,
    parrySuccessfulInThisWindow: false,
    prevParryStatus: 'READY' as 'READY' | 'ACTIVE' | 'COOLDOWN',
    prevParryCooldownLeft: 0,
    parryFreezeTimeLeft: 0,
  });

  // Onscreen control toggles (for testing or touch screens)
  const isTouchDeviceRef = useRef<boolean>(false);
  const [showTouchControls, setShowTouchControls] = useState<boolean>(false);

  // Offscreen Procedural Textures
  const createWallTexture = (stage: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    if (stage === HorrorProgression.STAGE_1) {
      // Stage 1: Safe Illusion - Blue Sky and Clouds
      ctx.fillStyle = '#87CEEB';
      ctx.fillRect(0, 0, 512, 512);

      ctx.fillStyle = '#FFFFFF';
      for (let i = 0; i < 8; i++) {
        const cx = Math.random() * 512;
        const cy = Math.random() * 200 + 50;
        const size = Math.random() * 40 + 30;
        ctx.beginPath();
        ctx.arc(cx, cy, size, 0, Math.PI * 2);
        ctx.arc(cx + size * 0.7, cy - size * 0.4, size * 0.9, 0, Math.PI * 2);
        ctx.arc(cx + size * 1.3, cy, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Add simple Rainbow arcs
      ctx.strokeStyle = 'rgba(255, 182, 193, 0.4)';
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.arc(256, 512, 400, Math.PI, 2 * Math.PI);
      ctx.stroke();
    } else if (stage === HorrorProgression.STAGE_2) {
      // Stage 2: Anomaly Start - Gloomy sky but colorful walls remnant
      ctx.fillStyle = '#D1D1D1';
      ctx.fillRect(0, 0, 512, 512);
      
      // Rain streaks
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 100; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 5, y + 20);
        ctx.stroke();
      }
    } else if (stage === HorrorProgression.STAGE_3) {
      // Stage 3: Bricks / Concrete
      ctx.fillStyle = '#a0a0a0';
      ctx.fillRect(0, 0, 512, 512);
      
      // Brick pattern
      ctx.strokeStyle = '#808080';
      ctx.lineWidth = 2;
      for(let y=0; y<512; y+=32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y);
        ctx.stroke();
        for(let x=(y%64===0?0:32); x<512; x+=64) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y+32);
          ctx.stroke();
        }
      }
    } else if (stage === HorrorProgression.STAGE_4) {
      // Stage 4: Collapsing - Dirty Peeling Walls
      ctx.fillStyle = '#666666';
      ctx.fillRect(0, 0, 512, 512);
      
      // Dirty spots
      for (let i = 0; i < 30; i++) {
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.random() * 0.2 + 0.1})`;
        ctx.beginPath();
        ctx.arc(Math.random()*512, Math.random()*512, Math.random()*60, 0, Math.PI*2);
        ctx.fill();
      }
    } else {
      // Stage 5: FLESH - Dark pulsating red living maze
      ctx.fillStyle = '#1a0505';
      ctx.fillRect(0, 0, 512, 512);
      
      // Vein network
      ctx.strokeStyle = '#450a0a';
      ctx.lineWidth = 4;
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        let x = Math.random() * 512;
        let y = Math.random() * 512;
        ctx.moveTo(x, y);
        for (let j = 0; j < 5; j++) {
          x += (Math.random() - 0.5) * 80;
          y += (Math.random() - 0.5) * 80;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Wet highlights
      for (let i = 0; i < 50; i++) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.beginPath();
        ctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    return texture;
  };

  const createCloudTexture = (stage: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    
    if (stage === HorrorProgression.STAGE_1) {
      // Sky gradient
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0, '#87ceeb');
      grad.addColorStop(1, '#bae6fd');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      for (let i = 0; i < 15; i++) {
         const x = Math.random() * 512;
         const y = Math.random() * 512;
         const rad = 30 + Math.random() * 40;
         ctx.beginPath();
         ctx.arc(x, y, rad, 0, Math.PI * 2);
         ctx.arc(x + rad * 0.5, y - rad * 0.2, rad * 0.7, 0, Math.PI * 2);
         ctx.arc(x - rad * 0.5, y - rad * 0.2, rad * 0.7, 0, Math.PI * 2);
         ctx.fill();
      }
    } else if (stage === HorrorProgression.STAGE_2) {
      // Darkening sky + Clouds
      ctx.fillStyle = '#4b5563';
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = 'rgba(200, 200, 200, 0.3)';
       for (let i = 0; i < 10; i++) {
         ctx.beginPath();
         ctx.arc(Math.random()*512, Math.random()*512, 60, 0, Math.PI*2);
         ctx.fill();
       }
    } else if (stage === HorrorProgression.STAGE_3) {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, 512, 512);
    } else {
      // Stage 5: Dark pulsating red sky
      ctx.fillStyle = '#050000';
      ctx.fillRect(0, 0, 512, 512);
      const grad = ctx.createRadialGradient(256, 256, 10, 256, 256, 400);
      grad.addColorStop(0, '#2a0000');
      grad.addColorStop(1, '#050000');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    return texture;
  };

  const createFloorTexture = (stage: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    if (stage === HorrorProgression.STAGE_1) {
      // Stage 1: Safe Illusion - Lush Bright Green Grass
      ctx.fillStyle = '#4ADE80';
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 3000; i++) {
        ctx.fillStyle = `rgba(34, 197, 94, ${Math.random() * 0.5})`;
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 6);
      }
      ctx.fillStyle = '#FEF08A'; // Little flowers
      for(let i=0; i<50; i++) {
        ctx.beginPath();
        ctx.arc(Math.random()*512, Math.random()*512, 2, 0, Math.PI*2);
        ctx.fill();
      }
    } else if (stage === HorrorProgression.STAGE_2) {
      // Stage 2: Rain hitting green grass (slightly darker)
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(0, 0, 512, 512);
      // Puddles
      for(let i=0; i<5; i++) {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.ellipse(Math.random()*512, Math.random()*512, 40, 20, Math.random()*Math.PI, 0, Math.PI*2);
        ctx.fill();
      }
    } else if (stage === HorrorProgression.STAGE_3) {
      // Stage 3: Withered Greyish Grass
      ctx.fillStyle = '#4d4d33';
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 2000; i++) {
        ctx.fillStyle = `rgba(30, 30, 20, ${Math.random() * 0.4})`;
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 4);
      }
    } else if (stage === HorrorProgression.STAGE_4) {
      // Stage 4: Cracked Grey Stone
      ctx.fillStyle = '#262626';
      ctx.fillRect(0, 0, 512, 512);
      
      ctx.strokeStyle = '#404040';
      ctx.lineWidth = 2;
      for (let i = 0; i < 15; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random()*512, Math.random()*512);
        ctx.lineTo(Math.random()*512, Math.random()*512);
        ctx.stroke();
      }
    } else {
      // Stage 5: Wet fleshy floor
      ctx.fillStyle = '#2a0505';
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 20; i++) {
        ctx.fillStyle = 'rgba(69, 10, 10, 0.4)';
        ctx.beginPath();
        ctx.ellipse(Math.random() * 512, Math.random() * 512, 40, 20, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      for(let i=0; i<512; i+=64) {
        ctx.beginPath();
        ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    return texture;
  };

  const createItemTexture = (itemName: string, stage: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    if (stage === HorrorProgression.STAGE_1) {
      // Stage 1: Joyful Golden Theme
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(0, 0, 128, 256);
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, 118, 246);
      ctx.fillStyle = '#1e293b';
    } else {
      // Stage 2-5: Spooky Crimson Parchment
      ctx.fillStyle = '#1a0505';
      ctx.fillRect(0, 0, 128, 256);
      ctx.strokeStyle = '#e11d48';
      ctx.lineWidth = 6;
      ctx.strokeRect(4, 4, 120, 248);
      ctx.fillStyle = '#f87171';
      ctx.shadowColor = '#dc2626';
      ctx.shadowBlur = 8;
    }

    // Draw item text vertically in bold Chinese font
    const isStage1 = stage === HorrorProgression.STAGE_1;
    ctx.font = isStage1 ? 'bold 20px "Noto Sans TC", sans-serif' : 'bold 24px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Print text characters vertically
    const chars = itemName.split('');
    const spacing = isStage1 ? (chars.length > 3 ? 40 : 70) : 70;
    const startY = isStage1 ? (chars.length > 3 ? 30 : 55) : 55;
    
    chars.forEach((char, idx) => {
      ctx.fillText(char, 64, startY + idx * spacing);
    });

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  };

  const createRainbowTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const centerX = 256;
    const centerY = 256;
    const colors = ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#9400d3'];
    
    ctx.lineWidth = 15;
    colors.forEach((color, i) => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 200 - i * 15, Math.PI, 0);
      ctx.stroke();
    });
    
    return new THREE.CanvasTexture(canvas);
  };

  const createGhostFaceTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(0, 0, 0, 0)'; // Transparent background
    ctx.clearRect(0, 0, 256, 256);

    // Spooky spectral skull silhouette
    ctx.fillStyle = 'rgba(15, 15, 17, 0.82)'; // Hollow body
    ctx.beginPath();
    ctx.arc(128, 100, 70, 0, Math.PI * 2);
    ctx.fill();

    // Draw screaming raw open mouth with blood outlines
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(128, 140, 30, 45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Terrifying hollow eye sockets with small glowing red eyes
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(95, 90, 16, 0, Math.PI * 2);
    ctx.arc(161, 90, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ef4444'; // Glowing pinpoint iris
    ctx.beginPath();
    ctx.arc(95, 90, 4, 0, Math.PI * 2);
    ctx.arc(161, 90, 4, 0, Math.PI * 2);
    ctx.fill();

    // Ghost body trailing fog overlay
    const gradient = ctx.createLinearGradient(128, 140, 128, 256);
    gradient.addColorStop(0, 'rgba(15, 15, 17, 0.82)');
    gradient.addColorStop(1, 'rgba(15, 15, 17, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(80, 140, 96, 116);

    // Add crack lines and hollow decay
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(95, 50);
    ctx.lineTo(85, 80);
    ctx.moveTo(161, 50);
    ctx.lineTo(171, 80);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  };

  // Keyboard Event Hooks
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      // If Stage 6 Dead Screen is active, only respond to Enter to restart
      if (stateRef.current.boss.showStage6DeadScreen) {
        if (key === 'enter') {
          if (stage6RestartRef.current) {
            stage6RestartRef.current();
          }
        }
        return;
      }

      if (key === 'tab') {
        e.preventDefault();
        
        // Ignore Tab key if we are on the main start welcome menu and haven't played yet
        if (!(stateRef.current as any).hasPlayed) return;
        
        setShowMenu(prev => {
          const nextShow = !prev;
          (stateRef.current as any).showMenu = nextShow;
          
          setIsPausedInternal(nextShow);
          (stateRef.current as any).isPausedInternal = nextShow;
          
          setShowPauseSettings(false); // Reset settings panel to false when toggled
          // If opening the menu, release the mouse cursor
          if (nextShow && document.pointerLockElement) {
            document.exitPointerLock();
          }
          return nextShow;
        });
        
        spookyAudio.resume();
        spookyAudio.playClick();
        return;
      }
      if (e.shiftKey && e.altKey && key === 'd') {
        setDevMode(prev => !prev);
        spookyAudio.playClick();
        return;
      }

      if (!gameActive || isPaused || stateRef.current.isScreamerTriggered || (stateRef.current as any).isPausedInternal || (stateRef.current as any).showMenu || stateRef.current.isTypewriterActive) return;
      
      const controls = stateRef.current.controls;

      if (key === 'w') controls.forward = true;
      if (key === 's') controls.backward = true;
      if (key === 'a') controls.left = true;
      if (key === 'd') controls.right = true;
      if (key === 'f' || key === 'e') {
        controls.interact = true;
      }
      if (key === 'f') {
        const isStage6 = stateRef.current.stage === HorrorProgression.STAGE_6;
        const boss = stateRef.current.boss;
        if (isStage6 && ((boss.bossPhase === 'PHASE_4' && boss.p4Stage === 'SWEEP_LASER') || boss.bossPhase === 'PHASE_5')) {
          const nowTime = performance.now();
          const parryCooldownUntil = (stateRef.current as any).parryCooldownUntil || 0;
          
          if (nowTime < parryCooldownUntil) {
            console.log("Parry on cooldown loop!");
            return; // ignore F input on CD
          }
          
          // Start the 250ms golden parry window
          (stateRef.current as any).parryActiveUntil = nowTime + 250;
          
          // Set standard 0.5-second failure penalty cooldown
          (stateRef.current as any).parryCooldownUntil = nowTime + 500;
          
          // Trigger React states for golden player and HUD info
          setParryStatus('ACTIVE');

          // Audio feedback
          try {
            spookyAudio.playWeapon();
          } catch (e) {}
          return;
        }

        const scene = (stateRef.current as any).scene as THREE.Scene;
        const mainBoss = scene.getObjectByName("mainBoss") as THREE.Mesh;

        // --- NEW VULNERABLE_P5 SPECIAL SLASH CHECK ---
        if (mainBoss && stateRef.current.boss.bossPhase === 'VULNERABLE_P5') {
          const nowTime = performance.now();
          const p5Last = stateRef.current.boss.p5LastAttackTime || 0;
          if (nowTime - p5Last < 100) return; // Cooldown 0.1s

          stateRef.current.boss.p5LastAttackTime = nowTime;
          let progress = (stateRef.current.boss.p5MashProgress || 0) + 1;
          stateRef.current.boss.p5MashProgress = progress;
          
          setBossMashProgress(progress);
          setMashCount(prev => prev + 1);

          const camera = (stateRef.current as any).camera as THREE.PerspectiveCamera;
          if (!camera) return;
          const fovRad = (camera.fov * Math.PI) / 180;
          const vHeight = 2 * 38 * Math.tan(fovRad / 2);
          const vWidth = vHeight * camera.aspect;
          const largeBossHeight = vWidth * 0.5;

          // Random angle for slash effect, keeping center
          const randomAngle = Math.random() * Math.PI * 2;
          spawnGlowSlash(
            scene,
            mainBoss.position,
            0,
            0,
            randomAngle,
            vWidth * 1.0,
            largeBossHeight * 1.0,
            (stateRef.current as any).fswordTex || (stateRef.current as any).swordTex
          );

          try { spookyAudio.playWeapon(); } catch(e) {}
          
          triggerCameraShake(2.0, 100);

          // reduce opacity and optional shake
          const bossMat = Array.isArray(mainBoss.material) ? mainBoss.material[0] : mainBoss.material;
          if (bossMat instanceof THREE.MeshStandardMaterial) {
            bossMat.transparent = true;
            bossMat.opacity = Math.max(0.1, 1.0 - (progress / 20));
          }

          // Shattering visual effect!
          spawnShatterPieces(
            mainBoss.position,
            vWidth * 1.0, 
            largeBossHeight * 1.0, 
            5, // Spawn 5 shatter particle meshes per click
            bossMat instanceof THREE.MeshStandardMaterial ? bossMat.map as THREE.Texture : undefined
          );

          if (progress >= 20) {
            // DEFEATED: Massive screen shake, Boss Shatters, Flashes
            triggerCameraShake(20.0, 3000);
            
            // Shatter completely!
            mainBoss.visible = false;
            let bossMatTex = undefined;
            const bMat = Array.isArray(mainBoss.material) ? mainBoss.material[0] : mainBoss.material;
            if (bMat instanceof THREE.MeshStandardMaterial) bossMatTex = bMat.map as THREE.Texture;
            
            spawnShatterPieces(
              mainBoss.position,
              vWidth * 2.0, 
              largeBossHeight * 2.0, 
              150, // 150 shatter pieces
              bossMatTex
            );

            stateRef.current.boss.bossPhase = 'DEFEATED';
            setBossPhase('DEFEATED');
            
            // Continuous flash and squelches
            let flashes = 0;
            const flashInt = setInterval(() => {
              triggerScreenFlash(2);
              if (Math.random() > 0.5) {
                 try { spookyAudio.playSquelch(); } catch(e) {}
              }
              flashes++;
              if (flashes > 20) clearInterval(flashInt);
            }, 100);

            // Wait 3 seconds for the explosion effect before white screen
            setTimeout(() => {
              setIsEndingWhiteScreen(true);
              setEndingText('');
              
              try {
                const audioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
                if (audioCtx) {
                  if (!(window as any).__customAudioCtx) {
                    (window as any).__customAudioCtx = new audioCtx();
                  }
                  const ctx: AudioContext = (window as any).__customAudioCtx;
                  if (ctx.state === 'suspended') ctx.resume();
                  const nowSec = ctx.currentTime;
                  const osc = ctx.createOscillator();
                  const gain = ctx.createGain();
                  osc.type = 'sawtooth';
                  osc.frequency.setValueAtTime(200, nowSec);
                  osc.frequency.exponentialRampToValueAtTime(280, nowSec + 0.15);
                  gain.gain.setValueAtTime(0.03, nowSec);
                  gain.gain.exponentialRampToValueAtTime(0.001, nowSec + 0.15);
                  osc.connect(gain);
                  gain.connect(ctx.destination);
                  osc.start(nowSec);
                  osc.stop(nowSec + 0.15);
                }
              } catch(e) {}
              
              // Typewriter effect sequence
              const endingString = '陳家睿';
              let currentStr = '';
              // wait 2 seconds after white screen appears, then type text
              setTimeout(() => {
                for (let i = 0; i < endingString.length; i++) {
                  setTimeout(() => {
                    currentStr += endingString[i];
                    setEndingText(currentStr);
                    spookyAudio.playSparkleHint(); // Small click sound for each letter
                  }, i * 600); // 0.6s per character
                }
              }, 2000);

              // Wait until typing finishes (2000 + 3*600 = 3800), pause a bit, then switch stage
              setTimeout(() => {
                triggerRef.current?.(HorrorProgression.STAGE_7);
                setTimeout(() => {
                  setIsEndingWhiteScreen(false);
                }, 850);
              }, 5500);
            }, 3000);
            
            try { spookyAudio.playSparkleHint(); } catch(e) {}
            setNpcDialogue({ 
              text: "🎉 直搗邪靈本體，全面淨化！陳家睿的身影漸漸化成光點消散，深淵徹底破碎，你成功通關！", 
              color: "text-emerald-400 font-extrabold text-sm tracking-wide bg-black/50 p-2 rounded" 
            });
            setBossMashProgress(0);
          }
          return;
        }

        // --- NEW VULNERABLE_P4 SPECIAL SLASH CHECK ---
        if (mainBoss && stateRef.current.boss.bossPhase === 'VULNERABLE_P4') {
          // Final Purifying Slash Feedback with shake but no flash!
          triggerCameraShake(4.0, 700);
          
          spawnGlowSlash(
            scene,
            mainBoss.position,
            0,
            0, // Centered on boss body per user request
            Math.PI / 4,
            mainBoss.scale.x * 0.9,
            mainBoss.scale.y * 0.9,
            (stateRef.current as any).swordTex
          );

          spookyAudio.playWeapon();

          // CHANGE TEXTURE TO boss5.png per user request!
          const dynamicLoader = new THREE.TextureLoader();
          dynamicLoader.load('/src/boss5.png', (loadedTex) => {
            const bossMat = mainBoss.material as THREE.MeshStandardMaterial;
            if (bossMat) {
              bossMat.map = loadedTex;
              bossMat.needsUpdate = true;
            }
          });

          // Transition to speaking "Jerry" typewriter style before Phase 5
          stateRef.current.boss.bossPhase = 'SPEAKING_JERRY';
          setBossPhase('SPEAKING_JERRY');
          stateRef.current.boss.speakingJerryTime = 0;
          setBossNpcDialogue("");

          return;
        }

        // --- NEW VULNERABLE_P3 SPECIAL SLASH CHECK ---
        if (mainBoss && stateRef.current.boss.bossPhase === 'VULNERABLE_P3') {
          // Final Purifying Slash Feedback with shake but no flash!
          triggerCameraShake(3.5, 600);
          
          // Show sword.png slash effect with cool glowing particles and scaling animation per user request
          spawnGlowSlash(
            scene,
            mainBoss.position,
            0,
            0,
            0, // vertical cut (0 degrees rotation) per user request
            mainBoss.scale.x * 0.85,
            mainBoss.scale.y * 0.85,
            (stateRef.current as any).swordTex
          );

          spookyAudio.playWeapon();

          // TRANSITION TO PHASE 4
          stateRef.current.boss.bossPhase = 'PHASE_4';
          stateRef.current.boss.phaseIndex = 4;
          setBossPhase('PHASE_4');
          
          // CHANGE TEXTURE TO boss4.png
          const dynamicLoader = new THREE.TextureLoader();
          dynamicLoader.load('/src/boss4.png', (loadedTex) => {
            const bossMat = mainBoss.material as THREE.MeshStandardMaterial;
            if (bossMat) {
              bossMat.map = loadedTex;
              bossMat.needsUpdate = true;
            }
          });

          // DISPLAY DIALOGUE "艾德加"
          runPhase4Dialogue();
          
          return;
        }

        // --- NEW VULNERABLE_P2 SLASH CHECK ---
        if (mainBoss && stateRef.current.boss.bossPhase === 'VULNERABLE_P2' && !stateRef.current.boss.isAttacking) {
          stateRef.current.boss.isAttacking = true;
          // A. 斬擊視覺回饋 (Slash Visual Feedback) with screen shake, NO flash
          triggerCameraShake(2.5, 450);
          
          // Show sword.png slash effect with cool glowing particles and scaling animation per user request
          spawnGlowSlash(
            scene,
            mainBoss.position,
            0,
            0,
            -25 * Math.PI / 180, // tilted left by -25 degrees per user request
            mainBoss.scale.x * 0.85,
            mainBoss.scale.y * 0.85,
            (stateRef.current as any).swordTex
          );

          spookyAudio.playWeapon();

          // B. Boss 材質替換 (Texture Swap) with TextureLoader
          const dynamicLoader = new THREE.TextureLoader();
          dynamicLoader.load('/src/boss3.png', (loadedTex) => {
            const bossMat = mainBoss.material as THREE.MeshStandardMaterial;
            if (bossMat) {
              bossMat.map = loadedTex;
              bossMat.needsUpdate = true;
            }
          });

        // C. 狀態推進 (Enter Phase 3)
           runPhase3Dialogue();
           return;
         }

        if (mainBoss && !stateRef.current.boss.hasBeenAttacked && (stateRef.current.boss.bossPhase === 'READY_TO_ATTACK' || stateRef.current.stage !== HorrorProgression.STAGE_6)) {
            stateRef.current.boss.hasBeenAttacked = true;
            spookyAudio.playWeapon();
            // Satisfying camera shake on attack
            triggerCameraShake(2.5, 450);
            // Boss texture swap
            const bossMat = mainBoss.material as THREE.MeshStandardMaterial;
            bossMat.map = (stateRef.current as any).boss2Tex;
            bossMat.needsUpdate = true;
            
            // Flicker effect
            let fCounter = 0;
            const fInterval = setInterval(() => {
                mainBoss.visible = !mainBoss.visible;
                fCounter++;
                if (fCounter > 6) {
                    clearInterval(fInterval);
                    mainBoss.visible = true;
                }
            }, 50);

            // If in stage 6, we trigger the win condition
            if (stateRef.current.stage === HorrorProgression.STAGE_6) {
                // Play final defeat sound/logic here
                stateRef.current.boss.bossPhase = 'DEFEATED';
                setBossPhase('DEFEATED');
                setNpcDialogue({ 
                    text: "🎉 直搗邪靈本體，全面淨化！陳家睿的身影漸漸化成光點消散，深淵徹底破碎，你成功通關！", 
                    color: "text-emerald-400 font-extrabold text-sm tracking-wide" 
                });
            }
            
            // Show sword.png slash effect with cool glowing particles and scaling animation per user request
            spawnGlowSlash(
              scene,
              mainBoss.position,
              0,
              0,
              25 * Math.PI / 180, // tilted right by 25 degrees per user request
              mainBoss.scale.x * 0.65,
              mainBoss.scale.y * 0.65,
              (stateRef.current as any).swordTex,
              320,
              true // hasExtraLines enabled for the first stage to spawn beautiful glowing speed-lines!
            );

            // Start dialogue
            runAttackDialogue();
        }

        if (!isStage6) {
          if (canInteract) {
            setIsTalking(prev => {
              const next = !prev;
              stateRef.current.isTalking = next;
              stateRef.current.npcToggleTriggered = true;
              return next;
            });
          }
        }
      }
      if (key === ' ') controls.jump = true;
      if (key === 'shift' || e.key === 'Shift') controls.run = true;
      if (e.key === 'ArrowLeft') controls.turnLeft = true;
      if (e.key === 'ArrowRight') controls.turnRight = true;

      // Safe initialization of Audio on first User Action gesture
      spookyAudio.resume();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const controls = stateRef.current.controls;

      if (key === 'w') controls.forward = false;
      if (key === 's') controls.backward = false;
      if (key === 'a') controls.left = false;
      if (key === 'd') controls.right = false;
      if (key === 'f' || key === 'e') controls.interact = false;
      if (key === ' ') controls.jump = false;
      if (key === 'shift' || e.key === 'Shift') controls.run = false;
      if (e.key === 'ArrowLeft') controls.turnLeft = false;
      if (e.key === 'ArrowRight') controls.turnRight = false;
    };

    const handleBlur = () => {
      const controls = stateRef.current.controls;
      controls.forward = false;
      controls.backward = false;
      controls.left = false;
      controls.right = false;
      controls.jump = false;
      controls.run = false;
      controls.turnLeft = false;
      controls.turnRight = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    
    // Check if touch device
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      isTouchDeviceRef.current = true;
      setShowTouchControls(true);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [gameActive, isPaused, showMenu, canInteract]);


    // --- Helper Functions in Component Scope ---
    const spawnParrySparks = (x: number, z: number) => {
      const scene = (stateRef.current as any).scene;
      if (!scene) return;
      const sparkCount = 40;
      const sparksList = (stateRef.current as any).parrySparks || [];
      
      const geom = new THREE.SphereGeometry(0.12, 8, 8);
      
      for (let i = 0; i < sparkCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const speed = 4.0 + Math.random() * 8.0;
        const vx = Math.cos(theta) * Math.sin(phi) * speed;
        const vy = (0.2 + Math.random() * 1.5) * speed;
        const vz = Math.sin(theta) * Math.sin(phi) * speed;
        
        const colorVal = Math.random() < 0.3 ? 0xffffff : (Math.random() < 0.5 ? 0xffeb3b : 0xff9800);
        const mat = new THREE.MeshBasicMaterial({
          color: colorVal,
          transparent: true,
          opacity: 1.0,
          depthWrite: false
        });
        
        const sparkMesh = new THREE.Mesh(geom, mat);
        sparkMesh.position.set(x + (Math.random() - 0.5) * 0.3, 0.1, z + (Math.random() - 0.5) * 0.3);
        scene.add(sparkMesh);
        
        sparksList.push({
          mesh: sparkMesh,
          vx,
          vy,
          vz,
          life: 0,
          maxLife: 0.4 + Math.random() * 0.5
        });
      }
      (stateRef.current as any).parrySparks = sparksList;
    };

    const spawnShatterPieces = (centerPos: THREE.Vector3, vWidth: number, vHeight: number, count: number, tex?: THREE.Texture) => {
      const scene = (stateRef.current as any).scene;
      if (!scene) return;
      const sparksList = (stateRef.current as any).parrySparks || [];
      
      for (let i = 0; i < count; i++) {
        const pSize = 1.0 + Math.random() * 2.0; 
        const geom = new THREE.PlaneGeometry(pSize, pSize);
        
        if (tex) {
          const u = Math.random() * 0.8;
          const v = Math.random() * 0.8;
          const uvAttr = geom.attributes.uv;
          uvAttr.setXY(0, u, v + 0.2); 
          uvAttr.setXY(1, u + 0.2, v + 0.2); 
          uvAttr.setXY(2, u, v); 
          uvAttr.setXY(3, u + 0.2, v); 
          uvAttr.needsUpdate = true;
        }

        const mat = new THREE.MeshBasicMaterial({
          color: tex ? 0xffffff : 0xff0000,
          map: tex || null,
          transparent: true,
          opacity: 1.0,
          side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geom, mat);
        
        mesh.position.copy(centerPos);
        mesh.position.x += (Math.random() - 0.5) * vWidth;
        mesh.position.z += (Math.random() - 0.5) * vHeight;
        mesh.position.y += Math.random() * 2.0;

        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = Math.random() * Math.PI * 2;
        
        scene.add(mesh);
        
        const speed = 10.0 + Math.random() * 15.0;
        const angle = Math.random() * Math.PI * 2;
        const vx = Math.cos(angle) * speed;
        const vy = (0.5 + Math.random() * 1.5) * speed; 
        const vz = Math.sin(angle) * speed;
        
        sparksList.push({
          mesh,
          vx,
          vy,
          vz,
          life: 0,
          maxLife: 1.0 + Math.random() * 1.0
        });
      }
      (stateRef.current as any).parrySparks = sparksList;
    };

    const spawnParrySwordEffect = (x: number, z: number) => {
      const scene = (stateRef.current as any).scene;
      if (!scene) return;
      const effectList = (stateRef.current as any).parrySwordEffects || [];
      
      const geom = new THREE.PlaneGeometry(1.0, 1.0);
      const tex = (stateRef.current as any).parrySwordTex || (stateRef.current as any).swordTex;
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(x, 0.08, z);
      mesh.rotation.x = -Math.PI / 2;
      scene.add(mesh);
      
      effectList.push({
        mesh,
        life: 0,
        maxLife: 0.8,
        startScale: 3.5,
        endScale: 12.0
      });
      (stateRef.current as any).parrySwordEffects = effectList;
    };

    const clearLasers = () => {
      const scene = (stateRef.current as any).scene;
      const boss = stateRef.current.boss;
      if (boss.laserGroup) {
        scene.remove(boss.laserGroup);
        boss.laserGroup.traverse((child: any) => {
          if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((m: any) => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
        boss.laserGroup = null;
      }
      boss.laserLines = [];

      const sweepingGroup = scene?.getObjectByName("bossSweepingLaserGroup");
      if (sweepingGroup) {
        scene.remove(sweepingGroup);
        sweepingGroup.traverse((child: any) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
            else child.material.dispose();
          }
        });
        boss.sweepingLaserGroup = null;
        boss.p4LaserCharged = false;
        boss.p4LaserBellTriggered = false;
      }

      // Cleanup parry sparks and rings here
      const parrySparks = (stateRef.current as any).parrySparks || [];
      parrySparks.forEach((s: any) => {
        scene?.remove(s.mesh);
        if (s.mesh.geometry) s.mesh.geometry.dispose();
        if (s.mesh.material) {
          if (Array.isArray(s.mesh.material)) s.mesh.material.forEach((m: any) => m.dispose());
          else s.mesh.material.dispose();
        }
      });
      (stateRef.current as any).parrySparks = [];

      const parrySwordEffects = (stateRef.current as any).parrySwordEffects || [];
      parrySwordEffects.forEach((e: any) => {
        scene?.remove(e.mesh);
        if (e.mesh.geometry) e.mesh.geometry.dispose();
        if (e.mesh.material) {
          if (Array.isArray(e.mesh.material)) e.mesh.material.forEach((m: any) => m.dispose());
          else e.mesh.material.dispose();
        }
      });
      (stateRef.current as any).parrySwordEffects = [];

      const parryRing = scene?.getObjectByName("playerParryRing");
      if (parryRing) {
        scene.remove(parryRing);
        if (parryRing.geometry) parryRing.geometry.dispose();
        if (parryRing.material) (parryRing.material as THREE.Material).dispose();
      }
    };

    const clearOrbitalStrikes = () => {
      const scene = (stateRef.current as any).scene;
      const boss = stateRef.current.boss;
      const strikes = boss.orbitalStrikes || [];
      strikes.forEach((strike: any) => {
        if (strike.ringMesh) {
          scene.remove(strike.ringMesh);
          strike.ringMesh.geometry.dispose();
          if (Array.isArray(strike.ringMesh.material)) {
            strike.ringMesh.material.forEach((m: any) => m.dispose());
          } else if (strike.ringMesh.material) {
            strike.ringMesh.material.dispose();
          }
        }
      });
      boss.orbitalStrikes = [];
    };

    const clearMatrixStrikes = () => {
      const scene = (stateRef.current as any).scene;
      const boss = stateRef.current.boss;
      const strikes = boss.matrixStrikes || [];
      strikes.forEach((strike: any) => {
        if (strike.mesh) {
          scene.remove(strike.mesh);
          strike.mesh.geometry.dispose();
          if (Array.isArray(strike.mesh.material)) {
            strike.mesh.material.forEach((m: any) => m.dispose());
          } else if (strike.mesh.material) {
            strike.mesh.material.dispose();
          }
        }
      });
      boss.matrixStrikes = [];
    };

    const clearPrismSniping = () => {
      const scene = (stateRef.current as any).scene;
      const boss = stateRef.current.boss;
      if (boss.prismSnipingState) {
        const state = boss.prismSnipingState;
        if (state.prismMesh) scene.remove(state.prismMesh);
        if (state.laserMesh) scene.remove(state.laserMesh);
        boss.prismSnipingState = null;
      }
    };

    const clearTripleLaneBlast = () => {
      const scene = (stateRef.current as any).scene;
      const boss = stateRef.current.boss;
      if (boss.tripleLaneBlastState) {
        const state = boss.tripleLaneBlastState;
        if (state.laneMeshes) {
          state.laneMeshes.forEach((mesh: any) => scene.remove(mesh));
        }
        boss.tripleLaneBlastState = null;
      }
    };

  // Main 3D Initialization and Game Loop
  useEffect(() => {
    if (!gameActive || !containerRef.current || !canvasRef.current) return;

    let width = containerRef.current.clientWidth;
    let height = containerRef.current.clientHeight;

    // 1. Scene, Camera, WebGL Renderer setup
    const scene = new THREE.Scene();
    (stateRef.current as any).scene = scene;

    // Dark foggy atmosphere
    scene.background = new THREE.Color(0xffffff); 
    scene.fog = new THREE.FogExp2(0xffffff, 0.01); // Bright start fog

    const camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 1000);
    (stateRef.current as any).camera = camera;

    // Initial player layout height position offset is 0.8m
    const playerState = stateRef.current.player;
    camera.position.set(playerState.x, 0.8, playerState.z);

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;

    const raycaster = new THREE.Raycaster();
    const handleShoot = (e: MouseEvent) => {
      if (stateRef.current.stage !== HorrorProgression.STAGE_6) return;
      if (e.button !== 0) return; // Left click only
      
      const boss = stateRef.current.boss;
      if (boss.status === BossStageStatus.SUPPRESSED) return;

      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      
      const targets: THREE.Object3D[] = [];
      const mainBoss = scene.getObjectByName("mainBoss");
      if (mainBoss && !boss.isInvulnerable) targets.push(mainBoss);
      
      boss.eyeballs.forEach(eye => {
        if (eye.mesh.visible) targets.push(eye.mesh);
      });
      
      const intersects = raycaster.intersectObjects(targets, true);
      if (intersects.length > 0) {
        const hit = intersects[0].object;
        // Search up hierarchy for named parts
        let target = hit;
        while (target && !target.name.startsWith("bossEye_") && target.name !== "mainBoss" && target.parent) {
            target = target.parent as THREE.Mesh;
        }

        if (target && target.name === "mainBoss") {
          boss.health -= 10;
          spookyAudio.playClick();
        } else if (target && target.name.startsWith("bossEye_")) {
          const eyeIdx = parseInt(target.name.split("_")[1]);
          const eye = boss.eyeballs.find(e => e.id === eyeIdx);
          if (eye) {
            eye.health -= 25;
            spookyAudio.playClick();
          }
        }
      }
    };
    renderer.domElement.addEventListener('mousedown', handleShoot);

    // 2. Light Setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // Adjusted for brighter textures
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.8);
    sunLight.position.set(5, 20, 5);
    scene.add(sunLight);

    scene.add(camera);

    const flashlight = new THREE.SpotLight(0xffffff, 0); // Intensity 0 by default
    flashlight.position.set(0, -0.2, 0); // Slightly below camera eye level
    flashlight.angle = Math.PI / 4; // 45 degrees
    flashlight.penumbra = 0.3; // Soft edges
    flashlight.distance = 100;
    flashlight.decay = 2;
    camera.add(flashlight);
    camera.add(flashlight.target);
    flashlight.target.position.set(0, -0.2, -1);
    (stateRef.current as any).flashlight = flashlight;

    // 3. Environment Textures
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('/src/boss2.png', (tex) => { (stateRef.current as any).boss2Tex = tex; });
    textureLoader.load('/src/boss3.png', (tex) => { (stateRef.current as any).boss3Tex = tex; });
    textureLoader.load('/src/boss4.png', (tex) => { (stateRef.current as any).boss4Tex = tex; });
    textureLoader.load('/src/boss5.png', (tex) => { (stateRef.current as any).boss5Tex = tex; });
    textureLoader.load('/lbone.png', (tex) => { (stateRef.current as any).lboneTex = tex; }, undefined, (err) => console.warn("Failed loading /lbone.png", err));
    textureLoader.load('/rbone.png', (tex) => { (stateRef.current as any).rboneTex = tex; }, undefined, (err) => console.warn("Failed loading /rbone.png", err));
    
    // Fallback procedural high-fidelity sword slash generator
    const createProceduralSwordSlashTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 512, 512);
        // Golden/Amber glowing crescent slash shape
        ctx.shadowColor = 'rgba(245, 158, 11, 0.9)'; // Amber glow
        ctx.shadowBlur = 40;
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.98)'; // Pure white hot core
        ctx.lineWidth = 26;
        ctx.lineCap = 'round';
        ctx.beginPath();
        // Dynamic curved swing arc
        ctx.moveTo(80, 130);
        ctx.bezierCurveTo(190, 410, 320, 420, 430, 130);
        ctx.stroke();
        
        // Inner amber secondary slash layer for depth
        ctx.shadowBlur = 15;
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(110, 160);
        ctx.bezierCurveTo(200, 370, 310, 380, 400, 160);
        ctx.stroke();
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      return texture;
    };

    // Fallback procedural high-fidelity parry sword generator
    const createProceduralParrySwordTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 512, 512);
        
        ctx.shadowColor = 'rgba(251, 191, 36, 0.95)'; // Golden Amber glow
        ctx.shadowBlur = 35;
        
        // Blade 1
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = 14;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(100, 100);
        ctx.lineTo(412, 412);
        ctx.stroke();
        
        // Blade 2
        ctx.beginPath();
        ctx.moveTo(412, 100);
        ctx.lineTo(100, 412);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(180, 220);
        ctx.lineTo(220, 180);
        ctx.moveTo(292, 180);
        ctx.lineTo(332, 220);
        ctx.stroke();
        
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(256, 256, 120, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(256, 256, 120, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(251, 191, 36, 0.9)';
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
          const cos = Math.cos(a);
          const sin = Math.sin(a);
          ctx.beginPath();
          ctx.moveTo(256 + cos * 125, 256 + sin * 125);
          ctx.lineTo(256 + cos * 155, 256 + sin * 155);
          ctx.lineTo(256 + Math.cos(a + 0.1) * 128, 256 + Math.sin(a + 0.1) * 128);
          ctx.closePath();
          ctx.fill();
        }
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      return texture;
    };

    const loadParrySwordTexture = () => {
      textureLoader.load(
        '/src/parrysword.png',
        (tex) => {
          if (tex.image && (tex.image.width === 0 || tex.image.height === 0)) {
            // Try loading from /parrysword.png next
            loadBackupParrySwordTexture();
          } else {
            (stateRef.current as any).parrySwordTex = tex;
          }
        },
        undefined,
        () => {
          loadBackupParrySwordTexture();
        }
      );
    };

    const loadBackupParrySwordTexture = () => {
      textureLoader.load(
        '/parrysword.png',
        (tex) => {
          if (tex.image && (tex.image.width === 0 || tex.image.height === 0)) {
            (stateRef.current as any).parrySwordTex = createProceduralParrySwordTexture();
          } else {
            (stateRef.current as any).parrySwordTex = tex;
          }
        },
        undefined,
        () => {
          (stateRef.current as any).parrySwordTex = createProceduralParrySwordTexture();
        }
      );
    };

    loadParrySwordTexture();

    const loadSwordTexture = () => {
      textureLoader.load(
        '/src/sword.png', 
        (tex) => { 
          if (tex.image && (tex.image.width === 0 || tex.image.height === 0)) {
            loadBackupSwordTexture();
          } else {
            (stateRef.current as any).swordTex = tex; 
          }
        },
        undefined,
        () => {
          loadBackupSwordTexture();
        }
      );
    };

    const loadBackupSwordTexture = () => {
      textureLoader.load(
        '/sword.png', 
        (tex) => { 
          if (tex.image && (tex.image.width === 0 || tex.image.height === 0)) {
            (stateRef.current as any).swordTex = createProceduralSwordSlashTexture();
          } else {
            (stateRef.current as any).swordTex = tex; 
          }
        },
        undefined,
        () => {
          (stateRef.current as any).swordTex = createProceduralSwordSlashTexture();
        }
      );
    };

    const loadFswordTexture = () => {
      textureLoader.load(
        '/fsword.png', 
        (tex) => { 
          if (tex.image && (tex.image.width === 0 || tex.image.height === 0)) {
            (stateRef.current as any).fswordTex = createProceduralSwordSlashTexture();
          } else {
            (stateRef.current as any).fswordTex = tex; 
          }
        },
        undefined,
        () => {
          (stateRef.current as any).fswordTex = createProceduralSwordSlashTexture();
        }
      );
    };

    loadSwordTexture();
    loadFswordTexture();
    textureLoader.crossOrigin = 'anonymous';
    const gridH = config.height;
    const gridW = config.width;
    
    // Create materials with white base color
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0.1,
    });
    (stateRef.current as any).wallMat = wallMat;
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.15,
    });
    const ceilMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.15,
    });

    const createProceduralGrass3 = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d')!;
      
      ctx.fillStyle = '#100505';
      ctx.fillRect(0, 0, 256, 256);
      
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(${30 + Math.random() * 20}, ${5 + Math.random() * 10}, ${5 + Math.random() * 5}, 0.6)`;
        ctx.beginPath();
        ctx.arc(Math.random() * 256, Math.random() * 256, 20 + Math.random() * 30, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.strokeStyle = '#5a1111';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 200; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const h = 10 + Math.random() * 20;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x - 5, y - h/2, x + 5, y - h/2, x + (Math.random()*10 - 5), y - h);
        ctx.stroke();
      }
      
      ctx.fillStyle = '#8b0000';
      for (let i = 0; i < 15; i++) {
        ctx.beginPath();
        const bx = Math.random() * 256;
        const by = Math.random() * 256;
        ctx.arc(bx, by, 3 + Math.random() * 6, 0, Math.PI * 2);
        ctx.fill();
        for (let j = 0; j < 3; j++) {
          ctx.beginPath();
          ctx.arc(bx + (Math.random() * 16 - 8), by + (Math.random() * 16 - 8), 1 + Math.random() * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(10, 10);
      tex.needsUpdate = true;
      return tex;
    };

    const createProceduralWall3 = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d')!;
      
      ctx.fillStyle = '#1a0505';
      ctx.fillRect(0, 0, 256, 256);
      
      ctx.strokeStyle = '#0a0202';
      ctx.lineWidth = 3;
      const rows = 8;
      const cols = 4;
      const rh = 256 / rows;
      const rw = 256 / cols;
      
      for (let r = 0; r <= rows; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * rh);
        ctx.lineTo(256, r * rh);
        ctx.stroke();
      }
      for (let r = 0; r < rows; r++) {
        const offset = (r % 2) * (rw / 2);
        for (let c = 0; c <= cols + 1; c++) {
          ctx.beginPath();
          ctx.moveTo(c * rw - offset, r * rh);
          ctx.lineTo(c * rw - offset, (r + 1) * rh);
          ctx.stroke();
        }
      }
      
      ctx.strokeStyle = '#c91a1a';
      ctx.lineWidth = 1;
      for (let i = 0; i < 25; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * 256, Math.random() * 256);
        ctx.lineTo(Math.random() * 256, Math.random() * 256);
        ctx.stroke();
      }
      
      ctx.fillStyle = 'rgba(139, 0, 0, 0.85)';
      for (let i = 0; i < 8; i++) {
        const dx = Math.random() * 256;
        const dy = Math.random() * 100;
        const dw = 3 + Math.random() * 5;
        const dl = 30 + Math.random() * 60;
        ctx.fillRect(dx, dy, dw, dl);
        ctx.beginPath();
        ctx.arc(dx + dw/2, dy + dl, dw/2 + 2, 0, Math.PI * 2);
        ctx.fill();
      }
      
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(6, 4);
      tex.needsUpdate = true;
      return tex;
    };

    // Texture storage for level transitions
    let wall1Tex: THREE.Texture | null = null;
    let ceil1Tex: THREE.Texture | null = null;
    let wall2Tex: THREE.Texture | null = null;
    let ceil2Tex: THREE.Texture | null = null;
    let grass1Tex: THREE.Texture | null = null;
    let grass2Tex: THREE.Texture | null = null;
    let grass3Tex: THREE.Texture = createProceduralGrass3();
    let wall3Tex: THREE.Texture = createProceduralWall3();

    const processWall = (tex: THREE.Texture) => {
      const wallCanvas = document.createElement('canvas');
      wallCanvas.width = 512;
      wallCanvas.height = 512;
      const wCtx = wallCanvas.getContext('2d')!;
      wCtx.drawImage(tex.image as any, 0, 0, 512, 512);
      wCtx.fillStyle = 'rgba(135, 206, 235, 0.4)';
      wCtx.strokeStyle = '#f0f9ff';
      wCtx.lineWidth = 6;
      wCtx.fillRect(186, 120, 140, 180);
      wCtx.strokeRect(186, 120, 140, 180);
      wCtx.beginPath();
      wCtx.moveTo(256, 120); wCtx.lineTo(256, 300);
      wCtx.moveTo(186, 210); wCtx.lineTo(326, 210);
      wCtx.stroke();
      const res = new THREE.CanvasTexture(wallCanvas);
      res.wrapS = res.wrapT = THREE.RepeatWrapping;
      res.needsUpdate = true;
      return res;
    };

    const processCeil = (tex: THREE.Texture) => {
      const ceilCanvas = document.createElement('canvas');
      ceilCanvas.width = 512;
      ceilCanvas.height = 512;
      const cCtx = ceilCanvas.getContext('2d')!;
      cCtx.drawImage(tex.image as any, 0, 0, 512, 512);
      cCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      const lightSize = 60;
      for (let y = 100; y < 512; y += 256) {
        for (let x = 100; x < 512; x += 256) {
          cCtx.fillRect(x, y, lightSize, lightSize);
          cCtx.shadowBlur = 15; cCtx.shadowColor = 'white';
          cCtx.strokeRect(x, y, lightSize, lightSize);
          cCtx.shadowBlur = 0;
        }
      }
      const res = new THREE.CanvasTexture(ceilCanvas);
      res.wrapS = res.wrapT = THREE.RepeatWrapping;
      res.needsUpdate = true;
      return res;
    };

    // Load Wall 1 (Stage 1)
    textureLoader.load('/wall.png', (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      wall1Tex = processWall(tex);
      ceil1Tex = processCeil(tex);
      if (stateRef.current.stage === HorrorProgression.STAGE_1) {
        wallMat.map = wall1Tex;
        ceilMat.map = ceil1Tex;
        wallMat.needsUpdate = true;
        ceilMat.needsUpdate = true;
      }
    }, undefined, (err) => console.error("Failed to load wall.png:", err));

    // Load Wall 2 (Stage 2)
    textureLoader.load('/wall2.png', (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      wall2Tex = processWall(tex);
      ceil2Tex = processCeil(tex);
      if (stateRef.current.stage >= HorrorProgression.STAGE_2 && stateRef.current.stage <= HorrorProgression.STAGE_4) {
        wallMat.map = wall2Tex;
        ceilMat.map = ceil2Tex;
        wallMat.needsUpdate = true;
        ceilMat.needsUpdate = true;
      }
    }, undefined, (err) => console.error("Failed to load wall2.png:", err));

    // Load Grass 1 (Stage 1)
    textureLoader.load('/grass.png', (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(gridW, gridH);
      tex.needsUpdate = true;
      grass1Tex = tex;
      if (stateRef.current.stage === HorrorProgression.STAGE_1) {
        floorMat.map = grass1Tex;
        floorMat.needsUpdate = true;
      }
    }, undefined, (err) => console.error("Failed to load grass.png:", err));

    // Load Grass 2 (Stage 2)
    textureLoader.load('/grass2.png', (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(gridW, gridH);
      tex.needsUpdate = true;
      grass2Tex = tex;
      if (stateRef.current.stage >= HorrorProgression.STAGE_2 && stateRef.current.stage <= HorrorProgression.STAGE_4) {
        floorMat.map = grass2Tex;
        floorMat.needsUpdate = true;
      }
    }, undefined, (err) => console.error("Failed to load grass2.png:", err));

    // Load Grass 3 (Stage 6)
    textureLoader.load(grass3Url, (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(10, 10);
      tex.needsUpdate = true;
      grass3Tex = tex;
    }, undefined, (err) => {
      console.warn("Using procedural fallback for grass3.png", err);
    });

    // Load Wall 3 (Stage 6)
    textureLoader.load(wall3Url, (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(6, 4);
      tex.needsUpdate = true;
      wall3Tex = tex;
    }, undefined, (err) => {
      console.warn("Using procedural fallback for wall3.png", err);
    });

    // Create box walls mesh arrays
    const gridData = stateRef.current.mazeGrid;
    const wallBoxes = stateRef.current.wallBoxes;
    const wallMeshesMap = stateRef.current.wallMeshesMap;
    const allWallMeshes: THREE.Mesh[] = [];

    // Clear previous refs if any (useful for potential hot reloads or future logic)
    wallBoxes.length = 0;
    wallMeshesMap.clear();

    // Set wall width and depth to 2.02 (up from 2) to overlap slightly and hide adjacent mesh gaps/seams completely!
    const wallGeom = new THREE.BoxGeometry(2.02, 2.2, 2.02);

    for (let z = 0; z < gridH; z++) {
      for (let x = 0; x < gridW; x++) {
        // World position represents matching grid
        const wx = x * 2 + 1;
        const wz = z * 2 + 1;
        const wallMesh = new THREE.Mesh(wallGeom, wallMat);
        wallMesh.position.set(wx, 1.1, wz);
        wallMesh.receiveShadow = true;
        wallMesh.castShadow = true;
        wallMesh.visible = gridData[z][x] === 1;
        scene.add(wallMesh);
        wallMeshesMap.set(`${x},${z}`, wallMesh);
        allWallMeshes.push(wallMesh);

        if (gridData[z][x] === 1) {
          // Bounding box for collisions (static for now, logic uses gridData)
          wallBoxes.push({
            minX: wx - 1,
            maxX: wx + 1,
            minZ: wz - 1,
            maxZ: wz + 1,
          });
        }
      }
    }

    // 4. Create Floor
    const floorGeom = new THREE.PlaneGeometry(gridW * 2, gridH * 2);
    const floorMesh = new THREE.Mesh(floorGeom, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(gridW, 0, gridH);
    floorMesh.receiveShadow = true;
    floorMesh.name = "defaultFloor";
    scene.add(floorMesh);

    // 5. Create Ceiling
    const skyTex = createCloudTexture(0);
    const ceilGeom = new THREE.PlaneGeometry(gridW * 2, gridH * 2);
    const ceilMesh = new THREE.Mesh(ceilGeom, ceilMat);
    ceilMesh.rotation.x = Math.PI / 2;
    ceilMesh.position.set(gridW, 2.2, gridH);
    ceilMesh.name = "defaultCeil";
    scene.add(ceilMesh);

    // Add Rainbow Sprite for Stage 0
    const rainbowTex = createRainbowTexture();
    const rainbowMat = new THREE.SpriteMaterial({ map: rainbowTex, transparent: true });
    const rainbowSprite = new THREE.Sprite(rainbowMat);
    rainbowSprite.name = 'rainbowSprite';
    rainbowSprite.scale.set(30, 15, 1);
    rainbowSprite.position.set(gridW, 12, gridH); // Way up high
    scene.add(rainbowSprite);

    const itemsGroup = new THREE.Group();
    scene.add(itemsGroup);

    // Setup Eye meshes for Stage 3
    const eyesGroup = new THREE.Group();
    scene.add(eyesGroup);

    const hintGroup = new THREE.Group(); 
    scene.add(hintGroup);

    const npcTex = textureLoader.load('/NPC.png');
    const npc2Tex = textureLoader.load('/NPC2.png');
    const npc3Tex = textureLoader.load('/NPC3.png');
    const npc4Tex = textureLoader.load('/NPC4.png');
    const boss2Tex = textureLoader.load('/src/boss2.png');
    const boss3Tex = textureLoader.load('/src/boss3.png');
    const boss4Tex = textureLoader.load('/src/boss4.png');
    const boss5Tex = textureLoader.load('/src/boss5.png');
    const eyeTex = textureLoader.load('/eyes.png');
    eyeTex.anisotropy = 8;

    const createGraffitiTexture = (direction: 'left' | 'right') => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 512, 512);
        ctx.strokeStyle = '#dc2626';
        ctx.fillStyle = '#dc2626';
        ctx.shadowColor = '#7f1d1d';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 45;

        if (direction === 'left') {
          ctx.moveTo(420, 256);
          ctx.lineTo(120, 256);
          ctx.lineTo(240, 140);
          ctx.moveTo(120, 256);
          ctx.lineTo(240, 372);
        } else {
          ctx.moveTo(92, 256);
          ctx.lineTo(392, 256);
          ctx.lineTo(272, 140);
          ctx.moveTo(392, 256);
          ctx.lineTo(272, 372);
        }
        ctx.stroke();

        for (let i = 0; i < 90; i++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.random() * 55;
          let rx = 256;
          let ry = 256;
          if (direction === 'left') {
            rx = Math.random() * 300 + 120 + Math.cos(angle) * dist;
          } else {
            rx = Math.random() * 300 + 92 + Math.cos(angle) * dist;
          }
          ry = 256 + Math.sin(angle) * dist;
          ctx.beginPath();
          ctx.fillStyle = `rgba(220, 38, 38, ${Math.random() * 0.7 + 0.3})`;
          ctx.arc(rx, ry, Math.random() * 3 + 1.5, 0, Math.PI * 2);
          ctx.fill();
        }

        for (let d = 0; d < 4; d++) {
          const dripX = (direction === 'left') ? (150 + d * 60) : (110 + d * 60);
          const dripLength = Math.random() * 110 + 40;
          ctx.beginPath();
          ctx.lineWidth = Math.random() * 4 + 3;
          ctx.strokeStyle = 'rgba(220, 38, 38, 0.85)';
          ctx.moveTo(dripX, 256);
          ctx.bezierCurveTo(dripX - 2, 256 + (dripLength / 2), dripX + 2, 256 + (dripLength / 2), dripX, 256 + dripLength);
          ctx.stroke();

          ctx.beginPath();
          ctx.fillStyle = 'rgba(220, 38, 38, 0.85)';
          ctx.arc(dripX, 256 + dripLength, Math.random() * 4 + 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return new THREE.CanvasTexture(canvas);
    };

    const arrowLeftTexture = createGraffitiTexture('left');
    const arrowRightTexture = createGraffitiTexture('right');

    const eyeMat = new THREE.MeshBasicMaterial({ 
      map: eyeTex,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide
    });
    const eyeGeom = new THREE.PlaneGeometry(1.2, 1.2);

    const itemGeom = new THREE.BoxGeometry(0.35, 0.7, 0.08);

    const triggerGhostSpawn = (force: boolean = false) => {
      const ghostState = stateRef.current.ghost;
      if (!ghostState.active || stateRef.current.isScreamerTriggered) return;
      if (ghostState.state !== MonsterAIState.IDLE && !force) return;

      const stage = stateRef.current.stage;
      if (stage === HorrorProgression.STAGE_1) return; // Stage 1: Purely safe

      // Logic delay for first appearance in Stage 2
      const now = performance.now();
      if (stage === HorrorProgression.STAGE_2) {
        if (!stateRef.current.stageStartTime) stateRef.current.stageStartTime = now;
        if (now - stateRef.current.stageStartTime < 5000) return;
      }

      const playerPos = camera.position;
      
      let tx = 0, tz = 0;
      let spawned = false;
      const playerDir = new THREE.Vector3();
      camera.getWorldDirection(playerDir);

      // Attempt to spawn at a valid location
      for (let attempts = 0; attempts < 15; attempts++) {
        if (stage === HorrorProgression.STAGE_2) {
          // Stage 2: Spawn in FOV but randomly (flash only)
          const dist = 8 + Math.random() * 8;
          const spread = (Math.random() - 0.5) * 1.5;
          tx = playerPos.x + (playerDir.x + spread) * dist;
          tz = playerPos.z + (playerDir.z + spread) * dist;
        } else if (stage === HorrorProgression.STAGE_3) {
          // Stage 3: Spawn at medium distance
          const angle = (Math.random() - 0.5) * 2.0; 
          const dist = 14 + Math.random() * 4;
          tx = playerPos.x + (playerDir.x + angle) * dist;
          tz = playerPos.z + (playerDir.z + angle) * dist;
        } else {
          // Stage 4 & 5: Spawn further and chase
          const angle = Math.random() * Math.PI * 2;
          const spawnDist = 18 + Math.random() * 6;
          tx = playerPos.x + Math.sin(angle) * spawnDist;
          tz = playerPos.z + Math.cos(angle) * spawnDist;
        }

        const gx = Math.floor(tx / 2);
        const gz = Math.floor(tz / 2);
        const mazeGrid = stateRef.current.mazeGrid;

        if (gx >= 0 && gx < gridW && gz >= 0 && gz < gridH && mazeGrid[gz][gx] === 0) {
          spawned = true;
          break;
        }
      }

      if (spawned) {
        ghostState.x = tx;
        ghostState.z = tz;
        ghostGroup.position.set(tx, 0, tz);
        
        if (stage === HorrorProgression.STAGE_2) {
          ghostState.state = MonsterAIState.STALKING;
          ghostState.duration = 300 + Math.random() * 500; // 0.3s to 0.8s flash
          ghostState.hasScared = false;
        } else if (stage === HorrorProgression.STAGE_3) {
          ghostState.state = MonsterAIState.PERSISTENT_CHASE;
          ghostState.speed = 3.0; 
        } else if (stage === HorrorProgression.STAGE_4) {
          ghostState.state = MonsterAIState.PERSISTENT_CHASE;
          ghostState.speed = 4.9; // 0.1 speed increase in final corridor
        } else if (stage === HorrorProgression.STAGE_5) {
          ghostState.state = MonsterAIState.ULTIMATE_CHASE;
          ghostState.speed = 7.5; // Sped up a lot! (Slightly slower than 10.0 per user request)
        }

        ghostState.spawnTime = performance.now();
        stateRef.current.continuousMoveTime = 0;
        stateRef.current.stayTime = 0;
        stateRef.current.cornersPassed = 0;
        ghostGroup.visible = true;
      }
    };

    const shiftMaze = () => {
      if (stateRef.current.stage === HorrorProgression.STAGE_1) return;
      const mazeGrid = stateRef.current.mazeGrid;
      const wallMeshesMap = stateRef.current.wallMeshesMap;
      
      for (let i = 0; i < 4; i++) {
        const rx = 1 + Math.floor(Math.random() * (gridW - 2));
        const rz = 1 + Math.floor(Math.random() * (gridH - 2));
        
        const dirs = [[1,0], [-1,0], [0,1], [0,-1]];
        for (const [dx, dz] of dirs) {
          const nx = rx + dx;
          const nz = rz + dz;
          if (mazeGrid[rz][rx] === 1 && mazeGrid[nz][nx] === 0) {
            mazeGrid[rz][rx] = 0;
            mazeGrid[nz][nx] = 1;
            
            const m1 = wallMeshesMap.get(`${rx},${rz}`);
            const m2 = wallMeshesMap.get(`${nx},${nz}`);
            if (m1) m1.visible = false;
            if (m2) m2.visible = true;
            break;
          }
        }
      }
    };

    const currentItemMeshes: THREE.Mesh[] = [];
    const currentItemLights: THREE.PointLight[] = [];

    const spawnNextItem = () => {
      // Don't spawn if game just started (short delay for initial load)
      const now = performance.now();
      if (now - stateRef.current.gameStartTime < 1000 && stateRef.current.collectedCount === 0) {
        return;
      }
      stateRef.current.hasSpawnedFirstItems = true;

      itemsGroup.clear();
      hintGroup.clear();
      currentItemLights.forEach(l => scene.remove(l));
      currentItemLights.length = 0;
      currentItemMeshes.length = 0;

      const playerPos = camera.position;
      const playerDir = new THREE.Vector3();
      camera.getWorldDirection(playerDir);

      // Rule: Spawn only 1 item per level
      const itemCount = 1;
      const realIndex = 0;
      
      // Level 2 Item Placeholder Name
      const level2_item = "肢體"; 

      for (let i = 0; i < itemCount; i++) {
        // Find a random spot that follows strict rules
        let rx = 0, rz = 0;
        let attempts = 0;
        let valid = false;

        while (attempts < 300) {
          rx = Math.floor(Math.random() * gridW);
          rz = Math.floor(Math.random() * gridH);
          attempts++;
          const mazeGrid = stateRef.current.mazeGrid;

          if (mazeGrid[rz][rx] !== 0) continue;

          const worldX = rx * 2 + 1;
          const worldZ = rz * 2 + 1;
          
          const dx = worldX - playerPos.x;
          const dz = worldZ - playerPos.z;
          const dist = Math.sqrt(dx*dx + dz*dz);

          // Looser distance for Stage 0
          const minDist = stateRef.current.stage === HorrorProgression.STAGE_1 ? 8 : 15;
          if (dist < minDist) continue;

          // 2. Visibility Check (Heuristic: Dot product + "behind wall" estimate)
          const toItem = new THREE.Vector3(dx, 0, dz).normalize();
          const dot = playerDir.dot(toItem);
          
          // Stage 0: Don't restrict visibility as strictly
          if (stateRef.current.stage !== HorrorProgression.STAGE_1) {
            if (dot > 0.3 && dist < 30) continue;
          }

          // 3. Avoid same spot as existing items
          const isTooCloseToOther = currentItemMeshes.some(m => 
            Math.abs(m.position.x - worldX) < 6 && Math.abs(m.position.z - worldZ) < 6
          );
          if (isTooCloseToOther) continue;

          // 4. "Behind Corner" Heuristic: check if straight line to player is blocked
          if (stateRef.current.stage !== HorrorProgression.STAGE_1) {
            const pgx = Math.floor(playerPos.x / 2);
            const pgz = Math.floor(playerPos.z / 2);
            const midX = Math.floor((pgx + rx) / 2);
            const midZ = Math.floor((pgz + rz) / 2);
            if (mazeGrid[midZ][midX] !== 1 && attempts < 200) {
               if (Math.random() > 0.3) continue; 
            }
          }

          valid = true;
          break;
        }

        if (!valid) continue; // Skip if we couldn't find a good spot

        const worldX = rx * 2 + 1;
        const worldZ = rz * 2 + 1;
        const isFake = i !== realIndex;

        // Use appropriate item name for stages
        const stageNum = stateRef.current.stage;
        
        // Stage 4: Only spawn real item if we've cleared at least 5 branches
        if (stageNum === HorrorProgression.STAGE_4 && stateRef.current.level4.currentBranch < 5 && !isFake) {
          // Skip spawning the real item for stage 4 until branch 5
          continue; 
        }

        let itemName = ITEM_NAMES[stageNum] || "陳家睿的軀幹";
        
        let itemTex;
        if (!isFake) {
          switch (stageNum) {
            case HorrorProgression.STAGE_1: itemTex = textureLoader.load("/jerry1.jpg"); break;
            case HorrorProgression.STAGE_2: itemTex = textureLoader.load("/jerrylf.jpg"); break;
            case HorrorProgression.STAGE_3: itemTex = textureLoader.load("/jerryrf.jpg"); break;
            case HorrorProgression.STAGE_4: itemTex = textureLoader.load("/jerryrh-1.jpg"); break;
            case HorrorProgression.STAGE_5: itemTex = textureLoader.load("/jerrylh.jpg"); break;
            default: itemTex = createItemTexture(itemName, stageNum);
          }
        } else {
          itemTex = createItemTexture(Math.random() > 0.5 ? "偽物" : itemName, stageNum);
        }

        const itemMat = new THREE.MeshStandardMaterial({
          map: itemTex,
          roughness: 0.4,
          emissive: stageNum === HorrorProgression.STAGE_1 ? (isFake ? 0x000000 : 0x111111) : (isFake ? 0x200505 : 0x500505),
        });

        const mesh = new THREE.Mesh(itemGeom, itemMat);
        mesh.position.set(worldX, 0.6, worldZ);
        mesh.userData = { isFake, gridX: rx, gridZ: rz, name: itemName };
        mesh.castShadow = true;
        itemsGroup.add(mesh);
        currentItemMeshes.push(mesh);

        const pLight = new THREE.PointLight(isFake ? 0xef4444 : 0xf43f5e, 1.2, 3);
        pLight.position.set(worldX, 0.6, worldZ);
        scene.add(pLight);
        currentItemLights.push(pLight);

        // Stage 0: Natural Hints
        if (stateRef.current.stage === HorrorProgression.STAGE_1 && !isFake) {
          // 1. Add "brighter grass" patch mesh
          const hintGrassGeom = new THREE.CircleGeometry(1.5, 16);
          const hintGrassMat = new THREE.MeshBasicMaterial({ 
            color: 0x86efac, // Slightly brighter emerald
            transparent: true,
            opacity: 0.3
          });
          const hintGrass = new THREE.Mesh(hintGrassGeom, hintGrassMat);
          hintGrass.rotation.x = -Math.PI / 2;
          hintGrass.position.set(worldX, 0.01, worldZ);
          hintGroup.add(hintGrass);

          // 2. Add some "special" yellow flowers cluster
          for(let j=0; j<8; j++) {
            const flowerGeom = new THREE.PlaneGeometry(0.15, 0.15);
            const flowerMat = new THREE.MeshBasicMaterial({ color: 0xfef08a, side: THREE.DoubleSide });
            const flower = new THREE.Mesh(flowerGeom, flowerMat);
            const angle = Math.random() * Math.PI * 2;
            const r = 0.3 + Math.random() * 0.7;
            flower.position.set(worldX + Math.cos(angle)*r, 0.02, worldZ + Math.sin(angle)*r);
            flower.rotation.x = -Math.PI / 2;
            hintGroup.add(flower);
          }
          
          // 3. Subtle ambient glow
          pLight.intensity = 4.0;
          pLight.distance = 8;
        }
      }
    };

    const spawnDevItem = () => {
      const playerPos = camera.position;
      const playerDir = new THREE.Vector3();
      camera.getWorldDirection(playerDir);
      
      const spawnX = playerPos.x + playerDir.x * 1.5;
      const spawnZ = playerPos.z + playerDir.z * 1.5;
      
      const stageNum = stateRef.current.stage;
      let itemName = ITEM_NAMES[stageNum] || "肢體";
      let itemTex;
      
      switch (stageNum) {
        case HorrorProgression.STAGE_1: itemTex = textureLoader.load("/jerry1.jpg"); break;
        case HorrorProgression.STAGE_2: itemTex = textureLoader.load("/jerrylf.jpg"); break;
        case HorrorProgression.STAGE_3: itemTex = textureLoader.load("/jerryrf.jpg"); break;
        case HorrorProgression.STAGE_4: itemTex = textureLoader.load("/jerryrh-1.jpg"); break;
        case HorrorProgression.STAGE_5: itemTex = textureLoader.load("/jerrylh.jpg"); break;
        default: itemTex = createItemTexture(itemName, stageNum);
      }
      
      const itemMat = new THREE.MeshStandardMaterial({
        map: itemTex,
        roughness: 0.4,
        emissive: 0x500505,
      });

      const mesh = new THREE.Mesh(itemGeom, itemMat);
      mesh.position.set(spawnX, 0.6, spawnZ);
      mesh.userData = { isFake: false, gridX: -1, gridZ: -1, name: itemName };
      mesh.castShadow = true;
      
      itemsGroup.add(mesh);
      currentItemMeshes.push(mesh);

      const pLight = new THREE.PointLight(0xf43f5e, 1.2, 3);
      pLight.position.set(spawnX, 0.6, spawnZ);
      scene.add(pLight);
      currentItemLights.push(pLight);
      
      spookyAudio.playClick();
    };
    stateRef.current.spawnDevItem = spawnDevItem;

    spawnNextItem();

    // 7. Spawn the Monster
    const ghostGroup = new THREE.Group();
    (stateRef.current as any).ghostGroup = ghostGroup;
    scene.add(ghostGroup);

    const monsterFaceTex = textureLoader.load('/monster.jpg');
    
    // Monster redesign: Just a billboarded sprite, no body parts
    const ghostSpriteMat = new THREE.SpriteMaterial({ 
      map: monsterFaceTex, 
      transparent: true,
      color: 0x888888,
    });
    const ghostSprite = new THREE.Sprite(ghostSpriteMat);
    ghostSprite.scale.set(1.5, 2.0, 1);
    ghostSprite.position.y = 1.0;
    ghostGroup.add(ghostSprite);

    // Stage 5: Shadow Entity (Monster redesign)
    const shadowEntity = new THREE.Group();
    shadowEntity.visible = false;
    ghostGroup.add(shadowEntity);

    // Shadow Face (Billboard Sprite)
    const shadowFaceMat = new THREE.SpriteMaterial({ 
      map: monsterFaceTex, 
      transparent: true,
      color: 0x777777, 
    });
    const shadowFace = new THREE.Sprite(shadowFaceMat);
    shadowFace.scale.set(2.2, 2.8, 1); 
    shadowFace.position.y = 1.4; 
    shadowEntity.add(shadowFace);

    // 7c. NPC Definition (Unlit and specifically positioned)
    const npcMat = new THREE.SpriteMaterial({ map: npcTex, transparent: true });
    const npcSprite = new THREE.Sprite(npcMat);
    (stateRef.current as any).npcSprite = npcSprite;
    npcSprite.scale.set(2.5, 2.5, 1); 
    
    // Move NPC to be left of the door (Door at grid x=4, y=3 -> world x=9, z=7)
    // NPC inside room at world x=7, z=5
    const pStartX = config.startX * 2 + 1;
    const pStartZ = config.startZ * 2 + 1;
    npcSprite.position.set(pStartX + 2.0, 1.25, pStartZ); 
    
    scene.add(npcSprite);

    // 7d. Removed graphical markers in favor of UI text radar
    const ghostState = stateRef.current.ghost;
    ghostGroup.position.set(ghostState.x, 0, ghostState.z);

    // 7e. Level 4 Branch Arrow indicators
    const branchArrowsGroup = new THREE.Group();
    scene.add(branchArrowsGroup);

    // 7f. Level 4 Floor Obstacles
    const obstaclesGroup = new THREE.Group();
    scene.add(obstaclesGroup);

    const createWallGraffitiArrow = (direction: 'left' | 'right') => {
      const graffitiGroup = new THREE.Group();

      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 512, 512);

        // Bold scary spray paint (Red-500/Red-600)
        ctx.strokeStyle = '#dc2626';
        ctx.fillStyle = '#dc2626';
        ctx.shadowColor = '#991b1b';
        ctx.shadowBlur = 10;

        ctx.beginPath();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 45;

        // Draw rough spray arrow
        if (direction === 'left') {
          // Shaft
          ctx.moveTo(420, 256);
          ctx.lineTo(120, 256);
          // Head
          ctx.lineTo(240, 140);
          ctx.moveTo(120, 256);
          ctx.lineTo(240, 372);
        } else {
          // Shaft
          ctx.moveTo(92, 256);
          ctx.lineTo(392, 256);
          // Head
          ctx.lineTo(272, 140);
          ctx.moveTo(392, 256);
          ctx.lineTo(272, 372);
        }
        ctx.stroke();

        // Spray particles/splatters around the arrow
        for (let i = 0; i < 90; i++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.random() * 55;
          let rx = 256;
          let ry = 256;
          
          if (direction === 'left') {
            rx = Math.random() * 300 + 120 + Math.cos(angle) * dist;
          } else {
            rx = Math.random() * 300 + 92 + Math.cos(angle) * dist;
          }
          ry = 256 + Math.sin(angle) * dist;

          ctx.beginPath();
          ctx.fillStyle = `rgba(220, 38, 38, ${Math.random() * 0.6 + 0.3})`;
          ctx.arc(rx, ry, Math.random() * 3 + 1, 0, Math.PI * 2);
          ctx.fill();
        }

        // Scary dripping effect
        const dripCount = 4;
        for (let d = 0; d < dripCount; d++) {
          const dripX = (direction === 'left') ? (160 + d * 65) : (110 + d * 65);
          const dripLength = Math.random() * 110 + 40;
          ctx.beginPath();
          ctx.lineWidth = Math.random() * 4 + 3;
          ctx.strokeStyle = 'rgba(220, 38, 38, 0.85)';
          ctx.moveTo(dripX, 256);
          ctx.bezierCurveTo(dripX - 2, 256 + dripLength / 2, dripX + 2, 256 + dripLength / 2, dripX, 256 + dripLength);
          ctx.stroke();

          // Drip landing drop/dot
          ctx.beginPath();
          ctx.fillStyle = 'rgba(220, 38, 38, 0.85)';
          ctx.arc(dripX, 256 + dripLength, Math.random() * 4 + 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const texture = new THREE.CanvasTexture(canvas);
      
      const planeGeom = new THREE.PlaneGeometry(1.6, 1.6);
      const planeMat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        polygonOffset: true,
        polygonOffsetFactor: -1.5,
        polygonOffsetUnits: -1.5,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const planeMesh = new THREE.Mesh(planeGeom, planeMat);
      planeMesh.rotation.y = Math.PI; // Face the approaching player precisely
      graffitiGroup.add(planeMesh);

      // Eerie low red glow radiating from the spray painted area
      const pLight = new THREE.PointLight(0xef4444, 0.8, 3);
      pLight.position.set(0, 0, 0.05);
      graffitiGroup.add(pLight);

      return graffitiGroup;
    };

    const spawnStage4EndItem = () => {
      itemsGroup.clear();
      currentItemMeshes.length = 0;
      currentItemLights.forEach(l => scene.remove(l));
      currentItemLights.length = 0;

      const finalX = stateRef.current.level4.finalExitX;
      // Spawn slightly in front of the exit door (along Z) so it is floating in the corridor
      const finalZ = stateRef.current.level4.finalExitZ - 3.0;

      const itemName = "陳家睿右手";
      const itemTex = textureLoader.load("/jerryrh-1.jpg");

      const handMat = new THREE.MeshStandardMaterial({
        map: itemTex,
        roughness: 0.4,
        emissive: 0x500505,
      });

      const mesh = new THREE.Mesh(itemGeom, handMat);
      mesh.position.set(finalX, 0.6, finalZ);
      mesh.userData = { isFake: false, gridX: Math.floor(finalX / 2), gridZ: Math.floor(finalZ / 2), name: itemName };
      mesh.castShadow = true;
      
      itemsGroup.add(mesh);
      currentItemMeshes.push(mesh);

      const pLight = new THREE.PointLight(0xf43f5e, 2.5, 6);
      pLight.position.set(finalX, 0.6, finalZ);
      scene.add(pLight);
      currentItemLights.push(pLight);

      // Play eerie reveal notifications
      spookyAudio.playClick();
      setNpcDialogue({ text: "一隻右手出現在了走廊盡頭……觸碰它以啟用最終章！", color: "text-red-500 font-bold font-mono tracking-wider drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]" });
      setTimeout(() => {
        setNpcDialogue(null);
      }, 5000);
    };

    // 7b. Guidance Hints Group
    const hintsGroup = new THREE.Group();
    scene.add(hintsGroup);
    
    // Stage 5: Wall Eyelids Group
    const eyelidsGroup = new THREE.Group();
    scene.add(eyelidsGroup);
    
    const eyelidTex = textureLoader.load('/eyes.png'); // We'll simulate eyelids with half-covered planes or just eyes that look at you
    const eyelidMat = new THREE.MeshBasicMaterial({ map: eyelidTex, transparent: true });
    const eyelidGeom = new THREE.PlaneGeometry(0.5, 0.5);

    const spawnEyelidsForStage5 = () => {
      eyelidsGroup.clear();
      // Wall Eye Texture (Large bloodshot eye)
      const wallEyeTex = textureLoader.load('/eyes.png');
      const wallEyeMat = new THREE.MeshBasicMaterial({ map: wallEyeTex, transparent: true });
      const wallEyeGeom = new THREE.PlaneGeometry(0.6, 0.6);

      for (let i = 0; i < 50; i++) {
        let wx, wz, fx, fz;
        let found = false;
        let attempts = 0;
        const mazeGrid = stateRef.current.mazeGrid;
        while (!found && attempts < 200) {
          attempts++;
          const rx = Math.floor(Math.random() * gridW);
          const rz = Math.floor(Math.random() * gridH);
          if (mazeGrid[rz][rx] === 1) {
             const dirs = [[1,0], [-1,0], [0,1], [0,-1]];
             const [dx, dz] = dirs[Math.floor(Math.random()*4)];
             const nx = rx + dx, nz = rz + dz;
             if (nx >=0 && nx < gridW && nz >=0 && nz < gridH && mazeGrid[nz][nx] === 0) {
               wx = rx * 2 + 1 + dx * 1.02;
               wz = rz * 2 + 1 + dz * 1.02;
               fx = dx; fz = dz;
               found = true;
              }
           }
        }
        if (found) {
          const eyelid = new THREE.Mesh(wallEyeGeom, wallEyeMat.clone());
          eyelid.position.set(wx!, 0.4 + Math.random() * 1.4, wz!);
          // Initial rotation to face the corridor
          if (fx !== 0) eyelid.rotation.y = fx! > 0 ? Math.PI/2 : -Math.PI/2;
          if (fz !== 0) eyelid.rotation.y = fz! > 0 ? 0 : Math.PI;
          eyelid.scale.set(0, 0, 0); // Initially closed/hidden
          eyelidsGroup.add(eyelid);
        }
      }
    };

    // Tracking for visual stage updates
    let lastVisualStage = -1;

    // Mouse Turning Event Listeners
    let previousMouseX = 0;
    let previousMouseY = 0;
    let firstMove = true;

    // Track pointer lock state to avoid rapid re-acquisition errors
    const onPointerLockChange = () => {
      if (document.pointerLockElement !== containerRef.current) {
        stateRef.current.lastPointerLockExitTime = performance.now();
      }
    };
    document.addEventListener('pointerlockchange', onPointerLockChange);

    // Click canvas / container to lock pointer
    const handleCanvasClick = () => {
      if ((stateRef.current as any).showMenu || stateRef.current.isTypewriterActive) return;
      spookyAudio.resume();
      
      const now = performance.now();
      const timeSinceExit = now - stateRef.current.lastPointerLockExitTime;
      
      // Browser safety: Pointer lock cannot be acquired immediately after exiting (usually ~1.2s delay required in Chrome)
      if (document.pointerLockElement !== containerRef.current && timeSinceExit > 1300) {
        try {
          const promise = containerRef.current?.requestPointerLock() as unknown as Promise<void> | undefined;
          if (promise && typeof promise.catch === 'function') {
            promise.catch(() => {
              // Silently ignore "immediately after" or other browser-blocked lock requests
            });
          }
        } catch (err) {
          // Sync error fallback
        }
      }
    };

    const handleMouseMoveByPointer = (e: MouseEvent) => {
      if (isPaused || (stateRef.current as any).showMenu || stateRef.current.isPlayingVideo || stateRef.current.isTypewriterActive) return;
      if (stateRef.current.stage === HorrorProgression.STAGE_6) return; // Locked 2.5D overhead camera view

      if (document.pointerLockElement === containerRef.current) {
        // Pointer is locked: use the incredibly smooth infinite movement delta directly
        stateRef.current.player.angle -= e.movementX * 0.0025;
        stateRef.current.player.pitch -= e.movementY * 0.0025;
      } else {
        // Pointer is not locked: rotate based on clientX/Y hover delta as fallback
        if (firstMove) {
          previousMouseX = e.clientX;
          previousMouseY = e.clientY;
          firstMove = false;
          return;
        }
        const deltaX = e.clientX - previousMouseX;
        const deltaY = e.clientY - previousMouseY;
        
        // Skip huge jumps (e.g. mouse leaving / entering window) to keep views stable
        if (Math.abs(deltaX) < 185) {
          stateRef.current.player.angle -= deltaX * 0.0035;
        }
        if (Math.abs(deltaY) < 185) {
          stateRef.current.player.pitch -= deltaY * 0.0035;
        }
        previousMouseX = e.clientX;
        previousMouseY = e.clientY;
      }

      // Clamp pitch to prevent flipping (approx -85 to 85 degrees)
      stateRef.current.player.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, stateRef.current.player.pitch));
    };

    const handleMouseEnterCanvas = (e: MouseEvent) => {
      previousMouseX = e.clientX;
      previousMouseY = e.clientY;
      firstMove = false;
    };

    // Mobile swipe rotation handling is separate and preserved!
    let isDraggingTouch = false;
    let previousTouchX = 0;
    let previousTouchY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (stateRef.current.isTypewriterActive) return;
      if (e.touches.length > 0) {
        isDraggingTouch = true;
        previousTouchX = e.touches[0].clientX;
        previousTouchY = e.touches[0].clientY;
        spookyAudio.resume();
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (stateRef.current.isTypewriterActive) return;
      if (!isDraggingTouch || isPaused || stateRef.current.isPlayingVideo) return;
      if (e.touches.length > 0) {
        const deltaX = e.touches[0].clientX - previousTouchX;
        const deltaY = e.touches[0].clientY - previousTouchY;
        stateRef.current.player.angle -= deltaX * 0.007;
        stateRef.current.player.pitch -= deltaY * 0.007;
        
        // Clamp pitch for touch too
        stateRef.current.player.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, stateRef.current.player.pitch));
        
        previousTouchX = e.touches[0].clientX;
        previousTouchY = e.touches[0].clientY;
      }
    };

    const handleTouchEnd = () => {
      isDraggingTouch = false;
    };

    containerRef.current.addEventListener('click', handleCanvasClick);
    containerRef.current.addEventListener('mouseenter', handleMouseEnterCanvas);
    window.addEventListener('mousemove', handleMouseMoveByPointer);
    containerRef.current.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);

    // 8. Dynamic Collision Check Utility (Player and walls) - Perfect Circle-vs-AABB Resolution
    const checkWallCollision = (newX: number, newZ: number): { x: number; z: number } => {
      if (stateRef.current.stage === HorrorProgression.STAGE_6) {
        const heightY = 38.0;
        const fovRad = 65 * Math.PI / 180;
        const vHeight = 2 * heightY * Math.tan(fovRad / 2);
        const zBottom = 12.5 + vHeight / 2;

        const limitX = 7.5 - playerState.radius;
        const limitZMin = (zBottom - 15.0) + playerState.radius;
        const limitZMax = zBottom - playerState.radius;
        const finalX = Math.max(-limitX, Math.min(limitX, newX));
        const finalZ = Math.max(limitZMin, Math.min(limitZMax, newZ));
        return { x: finalX, z: finalZ };
      }
      
      let finalX = newX;
      let finalZ = newZ;
      const radius = playerState.radius;

      // Wall boxes containment
      for (const box of stateRef.current.wallBoxes) {
        // Broad phase grid filter to keep frame calculations lightning fast
        if (Math.abs(box.minX - finalX) > 3 || Math.abs(box.minZ - finalZ) > 3) continue;

        // Check if player position is inside the box (penetration case)
        if (finalX >= box.minX && finalX <= box.maxX && finalZ >= box.minZ && finalZ <= box.maxZ) {
          const depthLeft = finalX - box.minX;
          const depthRight = box.maxX - finalX;
          const depthBottom = finalZ - box.minZ;
          const depthTop = box.maxZ - finalZ;

          const minDepth = Math.min(depthLeft, depthRight, depthBottom, depthTop);
          if (minDepth === depthLeft) {
            finalX = box.minX - radius;
          } else if (minDepth === depthRight) {
            finalX = box.maxX + radius;
          } else if (minDepth === depthBottom) {
            finalZ = box.minZ - radius;
          } else {
            finalZ = box.maxZ + radius;
          }
          continue;
        }

        // Standard Circle-vs-AABB collision resolution
        const closestX = Math.max(box.minX, Math.min(finalX, box.maxX));
        const closestZ = Math.max(box.minZ, Math.min(finalZ, box.maxZ));

        const dx = finalX - closestX;
        const dz = finalZ - closestZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < radius * radius && distSq > 1e-6) {
          const dist = Math.sqrt(distSq);
          const overlap = radius - dist;
          finalX += (dx / dist) * overlap;
          finalZ += (dz / dist) * overlap;
        }
      }

      // Keep inside maze bounds
      const currentGridH = stateRef.current.isLevel4 ? 120 : gridH;
      const currentGridW = stateRef.current.isLevel4 ? 40 : gridW;
      finalX = Math.max(1, Math.min(currentGridW * 2 - 1, finalX));
      finalZ = Math.max(1, Math.min(currentGridH * 2 - 1, finalZ));

      return { x: finalX, z: finalZ };
    };

    // 9. Psychological Monster AI Logic
    const updateGhostAI = (deltaTime: number, now: number) => {
      const ghostState = stateRef.current.ghost;
      
      if (stateRef.current.stage === HorrorProgression.STAGE_8) {
         ghostGroup.visible = false;
         setDistToMonster(100);
         return;
      }
      
      // MONSTER ACTIVATION CHECK
      if (!stateRef.current.isMonsterActive) {
        ghostGroup.visible = false;
        setDistToMonster(100);
        const startX = config.startX * 2 + 1;
        const startZ = config.startZ * 2 + 1;
        const distFromStart = Math.sqrt(Math.pow(camera.position.x - startX, 2) + Math.pow(camera.position.z - startZ, 2));
        
        // If player moves away from the starting room area
        if (distFromStart > 4.5) {
          stateRef.current.isMonsterActive = true;
        }
        return;
      }

      if (!ghostState.active || stateRef.current.isScreamerTriggered || stateRef.current.isGlitching) {
        if (!stateRef.current.isScreamerTriggered) {
          setDistToMonster(100);
        }
        return;
      }

      const playerPos = camera.position;
      const ghostPos = ghostGroup.position;
      const dist = ghostPos.distanceTo(playerPos);
      setDistToMonster(dist);
      const stage = stateRef.current.stage;
      spookyAudio.updateHeartbeat(dist, stateRef.current.isGameOver, !(stage >= HorrorProgression.STAGE_1 && stage <= HorrorProgression.STAGE_4));
      spookyAudio.updateComeAudio(dist, stateRef.current.isGameOver, !(stage >= HorrorProgression.STAGE_1 && stage <= HorrorProgression.STAGE_5));

      const cameraDir = new THREE.Vector3();
      camera.getWorldDirection(cameraDir);

      // --- UNIFIED VISIBILITY CHECK (Directly from User Guidance) ---
      // (1) Start from camera, (2) Target head, (3) Only filter walls
      const monsterHeadPos = ghostPos.clone().setY(ghostPos.y + 1.9); 
      const dirToHead = monsterHeadPos.clone().sub(playerPos).normalize();
      const dotToHead = cameraDir.dot(dirToHead);
      
      const inFOV = dotToHead > 0.4; // FOV check
      let isSeen = false;

      if (inFOV) {
        // Raycast from exact camera position to monster head
        const loSRay = new THREE.Raycaster(playerPos, dirToHead, 0.05, dist + 0.5);
        // Collision only with wall meshes
        const wallIntersects = loSRay.intersectObjects(allWallMeshes, false).filter(i => i.object.visible);
        
        // If no wall is blocking the head, the monster is officially "seen"
        isSeen = wallIntersects.length === 0;
      }

      ghostState.isSeen = isSeen;
      if (isSeen) ghostState.lastSeenTime = now;

      const rotY = camera.rotation.y;
      const rotDelta = Math.abs(rotY - stateRef.current.lastCameraY);
      stateRef.current.lastCameraY = rotY;

      // --- HELPER FOR COLLISION (Used by all stages) ---
      const canGhostMoveTo = (nx: number, nz: number) => {
        // Safe Zone Check
        const s = stateRef.current.stage;
        if (s <= HorrorProgression.STAGE_3 || s === HorrorProgression.STAGE_5) {
          // Starting room in Stage 1-3 and 5 is typically x < 9 and z < 9 area
          if (nx < 8.5 && nz < 8.5) return false;
        } else if (s === HorrorProgression.STAGE_4) {
          // Stage 4 starting room bounds (x: 2~8, z: 2~8)
          if (nx >= 2 && nx <= 8 && nz >= 2 && nz <= 8) return false;
        }

        const currentGrid = stateRef.current.mazeGrid;
        const gx = Math.floor((nx + 0.1) / 2);
        const gz = Math.floor((nz + 0.1) / 2);
        const gx2 = Math.floor((nx - 0.1) / 2);
        const gz2 = Math.floor((nz - 0.1) / 2);
        if (gx < 0 || gx >= gridW || gz < 0 || gz >= gridH) return false;
        if (gx2 < 0 || gx2 >= gridW || gz2 < 0 || gz2 >= gridH) return false;
        return currentGrid[gz][gx] === 0 && currentGrid[gz][gx2] === 0 && currentGrid[gz2][gx] === 0 && currentGrid[gz2][gx2] === 0;
      };

      const moveGhostWithCollision = (moveX: number, moveZ: number) => {
        const nextX = ghostPos.x + moveX;
        const nextZ = ghostPos.z + moveZ;
        if (canGhostMoveTo(nextX, nextZ)) {
          ghostPos.x = nextX;
          ghostPos.z = nextZ;
        } else {
          if (canGhostMoveTo(nextX, ghostPos.z)) ghostPos.x = nextX;
          else if (canGhostMoveTo(ghostPos.x, nextZ)) ghostPos.z = nextZ;
        }
        ghostState.x = ghostPos.x;
        ghostState.z = ghostPos.z;
      };

      // --- STAGE 5 BINARY AI OVERRIDE ---
      if (stage === HorrorProgression.STAGE_5) {
        if (ghostState.state === MonsterAIState.IDLE) {
          if (now - ghostState.lastSeenTime > 1500) triggerGhostSpawn();
          return;
        }

        ghostGroup.visible = true;

        // Frozen if seen, otherwise pursuit
        if (!isSeen) {
          const speed = 8.5; // Slightly slower than 12.0 per user request
          const dir = playerPos.clone().sub(ghostPos).normalize();
          moveGhostWithCollision(dir.x * speed * deltaTime, dir.z * speed * deltaTime);
          
          ghostGroup.lookAt(playerPos.x, ghostGroup.position.y, playerPos.z);
          const mesh = ghostGroup.children[0] as THREE.Mesh;
          if (mesh) mesh.rotation.z = Math.sin(now * 0.001) * 0.05;
        } 

        const proximity = Math.max(0, 1 - (dist / 10));
        spookyAudio.playGhostProximity(proximity);
        stateRef.current.sanity -= deltaTime * (isSeen ? 0.2 : 3.5);
        setSanity(Math.floor(stateRef.current.sanity));
        return; 
      }

      // --- LEVEL 4 PATHFOLLOWING AI ---
      if (stateRef.current.isLevel4 && stateRef.current.isChasing) {
          ghostGroup.visible = true; // Ensure ghost is visible in Stage 4 chase
          const pathPoints = stateRef.current.level4.pathPoints;
          if (!pathPoints || pathPoints.length === 0) return;

          // Fetch or initialize stateful node-index tracker
          if (ghostState.pathIdx === undefined) {
              ghostState.pathIdx = 0;
          }

          let currentGhostIdx = ghostState.pathIdx;

          // Out-of-bounds sanity check
          if (currentGhostIdx < 0) currentGhostIdx = 0;
          if (currentGhostIdx >= pathPoints.length) currentGhostIdx = pathPoints.length - 1;

          let target = pathPoints[currentGhostIdx];

          // Drive sequential forward-only waypoint tracking
          const distToWaypoint = Math.sqrt((ghostPos.x - target.x) ** 2 + (ghostPos.z - target.z) ** 2);
          if (distToWaypoint < 0.40) {
              // Waypoint reached! Safely advance forward.
              if (currentGhostIdx < pathPoints.length - 1) {
                  ghostState.pathIdx = currentGhostIdx + 1;
                  currentGhostIdx = ghostState.pathIdx;
                  target = pathPoints[currentGhostIdx];
              }
          }

          let speed = ghostState.speed * (stateRef.current.level4.isDeadEnd ? 1.0 : 1.0);
          
          let toTargetX = target.x - ghostPos.x;
          let toTargetZ = target.z - ghostPos.z;

          const toTargetLen = Math.sqrt(toTargetX * toTargetX + toTargetZ * toTargetZ);
          
          if (toTargetLen > 0.01) {
              const dirX = toTargetX / toTargetLen;
              const dirZ = toTargetZ / toTargetLen;
              // Ghost mode / No-Clip: bypass wall and roadblock collisions entirely in Level 4 so the ghost slides smoothly without getting stuck
              ghostPos.x += dirX * speed * deltaTime;
              ghostPos.z += dirZ * speed * deltaTime;
              ghostState.x = ghostPos.x;
              ghostState.z = ghostPos.z;
          }

          // Look forward along its path instead of looking at the player
          if (toTargetLen > 0.05) {
              ghostGroup.lookAt(target.x, ghostGroup.position.y, target.z);
          }
          
          const proximity = Math.max(0, 1 - (dist / 12));
          spookyAudio.playGhostProximity(proximity);
          
          return;
      }

      // --- Stay Too Long Trigger ---
      const isMoving = stateRef.current.controls.forward || stateRef.current.controls.backward || stateRef.current.controls.left || stateRef.current.controls.right;
      if (!isMoving) {
          stateRef.current.tension += deltaTime * 1.5; // Stay still = higher tension
      }

      // --- Sequenced Jumpscare Logic (Behind you) ---
      // If tension high enough, trigger the "Look behind" event
      if (stateRef.current.tension > 45 && ghostState.jumpscarePhase === 0 && ghostState.state === MonsterAIState.IDLE) {
          ghostState.jumpscarePhase = 1;
          // Spawn ghost behind player
          const backDir = cameraDir.clone().negate().setY(0).normalize();
          ghostPos.copy(playerPos).add(backDir.multiplyScalar(4)); 
          ghostState.x = ghostPos.x;
          ghostState.z = ghostPos.z;
          spookyAudio.playClick(); // Footstep sound behind
      }

      if (ghostState.jumpscarePhase === 1) {
          // If player looks at monster (it's behind them)
          if (isSeen) {
              // PHASE 1 Triggered: They turned around. 
              // Hide the ghost again so they see nothing.
              ghostGroup.visible = false;
              ghostState.jumpscarePhase = 2; // Next turn back
          }
      } else if (ghostState.jumpscarePhase === 2) {
          // If player looks away from original spot (turns back)
          if (!isSeen && dotToHead < -0.5) {
              // They turned back. Teleport monster to face them.
              const frontDir = cameraDir.clone().setY(0).normalize();
              ghostPos.copy(playerPos).add(frontDir.multiplyScalar(1.5));
              ghostGroup.visible = true;
              ghostState.jumpscarePhase = 3;
              ghostState.lastSeenTime = now; // Give a small gap
          }
      } else if (ghostState.jumpscarePhase === 3) {
          // Small pause before lunge
          if (now - ghostState.lastSeenTime > 500) {
              handlePlayerCaught();
              ghostState.jumpscarePhase = 0;
          }
      }

      // --- Fake Footsteps Stage 2+ ---
      if (stage > HorrorProgression.STAGE_2 && !ghostGroup.visible && ghostState.jumpscarePhase === 0) {
          if (Math.random() < 0.002) {
              spookyAudio.playClick();
          }
      }

      // Sanity and Effects
      stateRef.current.sanity = Math.max(0, stateRef.current.sanity);
      
      // Proximity to nearest item for psychological effects
      let minDistToItem = Infinity;
      currentItemMeshes.forEach(m => {
        const d = playerPos.distanceTo(m.position);
        if (d < minDistToItem) minDistToItem = d;
      });

      // Brain Interference logic
      if (minDistToItem < 20) {
        // Closer = more distortion and text frequency
        const intensity = Math.max(0, 1 - (minDistToItem / 20));
        setDistortion(intensity);

        // Random subliminal text triggers
        if (Math.random() < 0.008 * (1 + intensity * 6) && !subliminalText) {
          const texts = ["jerry", "Jerry", "陳家睿", "軀幹", "就在這裡", "你在找我嗎", "陳 家 睿"];
          setSubliminalText(texts[Math.floor(Math.random() * texts.length)]);
          setTimeout(() => setSubliminalText(null), 1000 + Math.random() * 1000);
        }
      } else {
        setDistortion(0);
      }

      // --- State Machine ---
      if (ghostState.jumpscarePhase > 0) return; // Sequence takes over behavior
      
      // Helper functions defined at top

      switch (ghostState.state) {
        case MonsterAIState.IDLE:
          ghostGroup.visible = false;
          ghostState.hasScared = false;
          ghostState.visibilityTimer = 0;
          ghostState.isPaused = false;

          // Trigger logic for scares
          if (stage === HorrorProgression.STAGE_2 || stage === HorrorProgression.STAGE_3) {
              const turnTrigger = rotDelta > 0.06 && Math.random() < 0.08; 
              const moveTrigger = isMoving && Math.random() < 0.0006; 

              if (turnTrigger || moveTrigger) {
                  triggerGhostSpawn();
              }
          } else if ((stage as any) === HorrorProgression.STAGE_4 || (stage as any) === HorrorProgression.STAGE_5) {
              // High pressure chase: spawn frequently if idle
              if (now - ghostState.lastSeenTime > 2000) {
                  triggerGhostSpawn();
              }
          }
          break;

        case MonsterAIState.STALKING: // Stage 2: Flash and Panic
          ghostGroup.visible = true;
          // In Stage 2, no sound when looked at as per request
          if (isSeen && !ghostState.hasScared) {
            // spookyAudio.playScreamer(); 
            ghostState.hasScared = true;
            stateRef.current.tension += 15;
          }
          // Flash duration check
          if (now - ghostState.spawnTime > ghostState.duration) {
            ghostState.state = MonsterAIState.IDLE;
            ghostState.lastSeenTime = now;
            ghostGroup.visible = false;
          }
          break;

        case MonsterAIState.APPROACH_VANISH: // Stage 3: Approach then Vanish
          ghostGroup.visible = true;
          if (!isSeen) {
            const dirApproch = playerPos.clone().sub(ghostPos).normalize();
            moveGhostWithCollision(dirApproch.x * ghostState.speed * deltaTime, dirApproch.z * ghostState.speed * deltaTime);
          }

          // Trigger scare audio on first sight 
          if (isSeen && !ghostState.hasScared) {
            spookyAudio.playScreamer();
            ghostState.hasScared = true;
          }

          // If close or seen too long or just time limit
          if (dist < 3 || (isSeen && now - ghostState.lastSeenTime > 1500) || now - ghostState.spawnTime > 4000) {
            ghostState.state = MonsterAIState.IDLE;
            ghostState.lastSeenTime = now;
            ghostGroup.visible = false;
          }
          break;

        case MonsterAIState.PERSISTENT_CHASE: // Stage 3 & 4: Steady Chase
          ghostGroup.visible = true;
          
          let currentSpeed = ghostState.speed;
          if (stateRef.current.stage === HorrorProgression.STAGE_4 && stateRef.current.level4.currentBranch >= 5) {
            // Apply speed boost dynamically in final corridor
            currentSpeed = Math.max(currentSpeed, 4.3);
          }

          const dirChase = playerPos.clone().sub(ghostPos).normalize();
          moveGhostWithCollision(dirChase.x * currentSpeed * deltaTime, dirChase.z * currentSpeed * deltaTime);
          
          if (isSeen && !ghostState.hasScared) {
            spookyAudio.playScreamer();
            ghostState.hasScared = true;
          }
          break;

        case MonsterAIState.ULTIMATE_CHASE: 
          // Handled by override for Stage 5
          break;
      }

      // --- Ambient Effects ---
      if (ghostGroup.visible) {
        const proximity = Math.max(0, 1 - (dist / 10));
        if (stage !== HorrorProgression.STAGE_2) {
          spookyAudio.playGhostProximity(proximity);
        }
        
        // Sanity drain
        stateRef.current.sanity -= (0.5 + proximity * 2) * deltaTime;
        setSanity(Math.floor(stateRef.current.sanity));
      } else {
        spookyAudio.playGhostProximity(0);
      }

      if (dist > 0.1) {
        // In Stage 5, if seen, the ghost is perfectly frozen (no lookAt)
        const isFrozen = (stage as any) === HorrorProgression.STAGE_5 && isSeen && ghostState.state === MonsterAIState.ULTIMATE_CHASE;
        
        if (!isFrozen) {
          ghostGroup.lookAt(playerPos.x, ghostGroup.position.y, playerPos.z);
        }
        
        // Simple Monster Floating Animation
        if (ghostGroup.visible && !isFrozen) {
          // Slight tilt
          const monsterMesh = ghostGroup.children[0] as THREE.Mesh;
          if (monsterMesh) {
            monsterMesh.rotation.z = Math.sin(now * 0.001) * 0.03;
          }
        }
      }
    };

    const damagePlayerHp = (amount = 1) => {
      if (stateRef.current.isInvincible) return;
      if (stateRef.current.stage !== HorrorProgression.STAGE_6) return;
      const now = performance.now();
      const lastDamage = (stateRef.current as any).lastDamageTime || 0;
      if (now - lastDamage < 600) {
        // Still invulnerable inside the defensive buffer window
        return;
      }
      (stateRef.current as any).lastDamageTime = now;

      // Subtract HP
      const currentHp = stateRef.current.boss.playerHp !== undefined ? stateRef.current.boss.playerHp : 40;
      const nextHp = Math.max(0, currentHp - amount);
      stateRef.current.boss.playerHp = nextHp;
      setBossPlayerHp(nextHp);

      // Play audio feedback only (no screen glitching, overlay or dialogs)
      spookyAudio.playSquelch();

      if (nextHp <= 0) {
        triggerGameOver();
      }
    };

    const handlePlayerCaught = () => {
      // Use the new unified triggerGameOver logic
      triggerGameOver();
    };

    const triggerGameOver = () => {
      if (isJumpscareActive) return;

      setIsJumpscareActive(true);
      stateRef.current.isScreamerTriggered = true;
      spookyAudio.playScreamer();
      
      // Play dead.wav on STAGE_2, STAGE_3, STAGE_4, or STAGE_5 death
      const curStage = stateRef.current.stage;
      if (curStage === HorrorProgression.STAGE_2 ||
          curStage === HorrorProgression.STAGE_3 ||
          curStage === HorrorProgression.STAGE_4 ||
          curStage === HorrorProgression.STAGE_5) {
        spookyAudio.playDeadSound();
      }
      
      // Stop run music on death
      if (runMusic.current) {
        runMusic.current.pause();
        runMusic.current.currentTime = 0;
      }
      stateRef.current.isChasing = false;
      setIsChasing(false);
      if (stateRef.current.stage === HorrorProgression.STAGE_6) {
        setIsGameOver(true);
      } else {
        setIsGameOver(false);
      }
      
      // Force freeze controls and movement
      stateRef.current.controls.forward = false;
      stateRef.current.controls.backward = false;
      stateRef.current.controls.left = false;
      stateRef.current.controls.right = false;
      
      // Reset any physics/speed in state
      stateRef.current.ghost.speed = 0;
      if (stateRef.current.player.velocity) {
        stateRef.current.player.velocity.x = 0;
        stateRef.current.player.velocity.z = 0;
      }

      setTimeout(() => {
        setIsJumpscareActive(false);
        stateRef.current.isScreamerTriggered = false;

        // Reset logic
        if (stateRef.current.stage === HorrorProgression.STAGE_5) {
          // Reset to Stage 5 start point
          stateRef.current.player.x = 5;
          stateRef.current.player.z = 5;
          camera.position.set(5, 0.8, 5);
          
          const ghostState = stateRef.current.ghost;
          ghostState.state = MonsterAIState.IDLE;
          ghostState.active = true;
          ghostGroup.visible = false;
          
          // Re-trigger stage 5 visual setup if needed
          triggerLevelTransition(HorrorProgression.STAGE_5);
          
          setNpcDialogue({ text: "你被抓住了……最終章重新開始。", color: "text-red-500 font-bold" });
          setTimeout(() => setNpcDialogue(null), 3000);

        } else if (stateRef.current.stage === HorrorProgression.STAGE_4) {
          // Re-initialize Stage 4
          setupLevel4();
          
          // Reset player position explicitly to the starting room center
          stateRef.current.player.x = 5;
          stateRef.current.player.z = 5;
          camera.position.set(5, 0.8, 5);
          
          const ghostState = stateRef.current.ghost;
          ghostState.state = MonsterAIState.IDLE;
          ghostState.active = true;
          ghostGroup.visible = false;

          setNpcDialogue({ 
            text: "走錯方向了！已被邪靈吞噬！請跟隨紅色箭頭指引！", 
            color: "text-red-500 font-bold text-lg animate-pulse" 
          });
          setTimeout(() => setNpcDialogue(null), 3000);
        } else if (stateRef.current.stage === HorrorProgression.STAGE_6) {
          // Stage 6 Boss restart: pause and wait for Enter confirmation
          stateRef.current.boss.showStage6DeadScreen = true;
          setShowStage6DeadScreen(true);
          setIsGameOver(true);
          if (bossMusic.current) {
            bossMusic.current.pause();
          }
        } else {
          // Generic reset for other stages
          stateRef.current.player.x = config.startX * 2 + 1;
          stateRef.current.player.z = config.startZ * 2 + 1;
          camera.position.set(stateRef.current.player.x, 0.8, stateRef.current.player.z);
          stateRef.current.ghost.state = MonsterAIState.IDLE;
        }
        
        stateRef.current.sanity = Math.max(stateRef.current.sanity, 30); // Give some pity sanity
        setSanity(Math.floor(stateRef.current.sanity));
      }, 1500);
    };

    const spawnStunCore = () => {
      const boss = stateRef.current.boss;
      if (boss.stunCore) return;

      const geom = new THREE.SphereGeometry(0.8, 16, 16);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.name = "stunCore";

      const heightY = 38.0;
      const fovRad = 65 * Math.PI / 180;
      const vHeight = 2 * heightY * Math.tan(fovRad / 2);
      const zBottom = 12.5 + vHeight / 2;

      // Position: random placement strictly inside player's accessible area: X: [-6, 6], Z: [zBottom - 14.0, zBottom - 2.0]
      const px = (Math.random() - 0.5) * 12.0; // -6 to 6
      const pz = (zBottom - 14.0) + Math.random() * 12.0; 
      
      mesh.position.set(px, 0.8, pz);
      scene.add(mesh);
      boss.stunCore = mesh;

      // Add intense gold/yellow lighting pointing outwards
      const coreLight = new THREE.PointLight(0xffd700, 10, 15);
      coreLight.name = "stunCoreLight";
      mesh.add(coreLight);

      setNpcDialogue({ text: "Boss虛脫了！快尋找發出金色強光的【虛脫核心】，靠近按 [F] 淨化它！", color: "text-amber-400 font-extrabold animate-pulse" });
    };

    const updateBossAI = (deltaTime: number, now: number) => {
      const mainBoss = scene.getObjectByName("mainBoss");
      const boss = stateRef.current.boss;
      const playerState = stateRef.current.player;
      
      // CRITICAL: Overhead camera is stationary at (0, 38, 0) in Stage 6, so we must calculate collision & distance based on the player's real coordinates.
      const isStage6 = stateRef.current.stage === HorrorProgression.STAGE_6;
      const playerPos = isStage6 
        ? new THREE.Vector3(playerState.x, 0.8, playerState.z)
        : camera.position;

      // Ensure React State mirrors Ref
      if (bossPhase !== boss.bossPhase) {
        setBossPhase(boss.bossPhase || 'P1_SURVIVAL');
      }

      // Determine boss position and scale based on phaseIndex
      let bossDefaultPos = new THREE.Vector3(0, 0.01, -2.5);
      let bossDefaultScale = new THREE.Vector3(15.0, 15.0, 1.0);

      if (isStage6) {
        const heightY = 38.0;
        const fovRad = 65 * Math.PI / 180;
        const vHeight = 2 * heightY * Math.tan(fovRad / 2);
        const vWidth = vHeight * camera.aspect;
        const zCam = 12.5;
        const zBottom = zCam + vHeight / 2;
        const zTop = zCam - vHeight / 2;

        const bossHeight = vWidth * 0.5; // Shorter height
        let scaleFactor = 1.0;
        if (boss.bossPhase === 'VULNERABLE_P5') {
            scaleFactor = Math.max(0.1, 1.0 - (boss.p5MashProgress / 20)); // shrink smoothly based on progress
        }
        
        const currentHeight = bossHeight * scaleFactor;
        bossDefaultScale = new THREE.Vector3(vWidth * scaleFactor, currentHeight, 1.0);
        
        // Update anchor so it stays attached to the far edge (top) instead of shrinking towards center
        bossDefaultPos = new THREE.Vector3(0, 0.01, zTop + currentHeight / 2);
      }

      // Handle boss hit shake & flash
      if (boss.shakeTimer > 0) {
        boss.shakeTimer -= deltaTime;
        if (mainBoss) {
          const jitterAmp = boss.phaseIndex === 1 ? 1.0 : 0.4;
          mainBoss.position.set(
            bossDefaultPos.x + (Math.random() - 0.5) * jitterAmp,
            bossDefaultPos.y,
            bossDefaultPos.z + (Math.random() - 0.5) * jitterAmp
          );
          mainBoss.scale.copy(bossDefaultScale);
          
          const bossMesh = mainBoss as THREE.Mesh;
          if (bossMesh && bossMesh.material) {
            const mat = (Array.isArray(bossMesh.material) ? bossMesh.material[0] : bossMesh.material) as THREE.MeshStandardMaterial;
            if (mat) {
              if (Math.floor(performance.now() / 45) % 2 === 0) {
                mat.color.setHex(0xff0000);
              } else {
                mat.color.setHex(0xffffff);
              }
              if (boss.bossPhase === 'VULNERABLE_P5') {
                  mat.transparent = true;
                  mat.opacity = Math.max(0.01, 1.0 - (boss.p5MashProgress / 20));
                  mat.needsUpdate = true;
              }
            }
          }
        }
        
        if (boss.shakeTimer <= 0) {
          if (mainBoss) {
            mainBoss.position.copy(bossDefaultPos);
            mainBoss.scale.copy(bossDefaultScale);
            const bossMesh = mainBoss as THREE.Mesh;
            if (bossMesh && bossMesh.material) {
              const mat = (Array.isArray(bossMesh.material) ? bossMesh.material[0] : bossMesh.material) as THREE.MeshStandardMaterial;
              if (mat) {
                  mat.color.setHex(0xffffff);
                  if (boss.bossPhase === 'VULNERABLE_P5') {
                      mat.transparent = true;
                      mat.opacity = Math.max(0.01, 1.0 - (boss.p5MashProgress / 20));
                      mat.needsUpdate = true;
                  }
              }
            }
          }
        }
      } else {
        // Keep normal position and scale
        if (mainBoss) {
          mainBoss.position.copy(bossDefaultPos);
          mainBoss.scale.copy(bossDefaultScale);
          const bossMesh = mainBoss as THREE.Mesh;
          if (bossMesh && bossMesh.material) {
            const mat = (Array.isArray(bossMesh.material) ? bossMesh.material[0] : bossMesh.material) as THREE.MeshStandardMaterial;
            if (mat) {
                if (boss.bossPhase === 'VULNERABLE_P5') {
                    mat.transparent = true;
                    mat.opacity = Math.max(0.01, 1.0 - (boss.p5MashProgress / 20));
                    mat.needsUpdate = true;
                } else if (boss.bossPhase !== 'DEFEATED') {
                    mat.opacity = 1.0;
                }
            }
          }
        }
      }

      // Handle diagonal slash visual effect animation (fades and expands)
      if (boss.slashMeshes && boss.slashMeshes.length > 0) {
        boss.slashMeshes.forEach((mesh: any) => {
          mesh.scale.x += deltaTime * 2.5; // expand width
          if (mesh.material) {
            mesh.material.opacity = Math.max(0, mesh.material.opacity - deltaTime * 2.5);
          }
        });
        
        // Cleanup when completely faded
        if (boss.slashMeshes[0].material.opacity <= 0) {
          boss.slashMeshes.forEach((mesh: any) => {
            scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
          });
          boss.slashMeshes = [];
        }
      }

      // Handle knockback push player to the wall
      if (boss.knockbackTargetTime && boss.knockbackTargetTime > 0) {
        boss.knockbackTargetTime -= deltaTime;
        const kx = boss.knockbackDir.x;
        const kz = boss.knockbackDir.z;
        const speed = 40.0; // pushing speed
        
        stateRef.current.player.x += kx * speed * deltaTime;
        stateRef.current.player.z += kz * speed * deltaTime;
        
        // Push limits, bound player inside the Arena walls
        stateRef.current.player.x = Math.max(-23.5, Math.min(23.5, stateRef.current.player.x));
        stateRef.current.player.z = Math.max(-23.5, Math.min(23.5, stateRef.current.player.z));
        
        // Synchronise camera position (only if not in Stage 6 / Boss arena overhead mode)
        if (stateRef.current.stage !== HorrorProgression.STAGE_6) {
          camera.position.x = stateRef.current.player.x;
          camera.position.z = stateRef.current.player.z;
        }
      }

      // Helper to clear existing, and setup new, active patterns
      const setAndSyncActivePatterns = (nextPats: BarragePattern[]) => {
        const oldPats = boss.activePatterns || [];
        
        // Clean up deactivated patterns
        if (oldPats.includes(BarragePattern.SPINNING_CROSS) && !nextPats.includes(BarragePattern.SPINNING_CROSS)) {
          clearLasers();
        }
        if (oldPats.includes(BarragePattern.CEILING_STRIKE) && !nextPats.includes(BarragePattern.CEILING_STRIKE)) {
          clearOrbitalStrikes();
        }
        if (oldPats.includes(BarragePattern.IRREGULAR_GRID) && !nextPats.includes(BarragePattern.IRREGULAR_GRID)) {
          clearMatrixStrikes();
        }
        if (oldPats.includes(BarragePattern.PRISM_SNIPING) && !nextPats.includes(BarragePattern.PRISM_SNIPING)) {
          // Prism sniping doesn't have an explicit clear function, but we should clear instances
          stateRef.current.boss.prismSnipingState.active = false;
          stateRef.current.boss.prismSnipingState.instances.forEach((inst: any) => {
              if (inst.prismMesh) scene.remove(inst.prismMesh);
          });
          stateRef.current.boss.prismSnipingState.instances = [];
        }
        if (oldPats.includes(BarragePattern.BURST_BULLET) && !nextPats.includes(BarragePattern.BURST_BULLET)) {
          if (boss.burstBullets) {
            boss.burstBullets.forEach((b: any) => {
              if (b.mesh) scene.remove(b.mesh);
            });
            boss.burstBullets = [];
          }
          if (boss.normalBullets) {
            boss.normalBullets.forEach((b: any) => {
              if (b.mesh) scene.remove(b.mesh);
            });
            boss.normalBullets = [];
          }
        }
        if (oldPats.includes(BarragePattern.TRIPLE_LANE_BLAST) && !nextPats.includes(BarragePattern.TRIPLE_LANE_BLAST)) {
          clearTripleLaneBlast();
        }
        
        // Initialize newly activated patterns
        if (nextPats.includes(BarragePattern.SPINNING_CROSS) && !oldPats.includes(BarragePattern.SPINNING_CROSS)) {
          spawnLasers();
        }
        if (nextPats.includes(BarragePattern.IRREGULAR_GRID) && !oldPats.includes(BarragePattern.IRREGULAR_GRID)) {
          spawnMatrixStrikes();
        }
        if (nextPats.includes(BarragePattern.PRISM_SNIPING) && !oldPats.includes(BarragePattern.PRISM_SNIPING)) {
          // Initialize prism sniping
          stateRef.current.boss.prismSnipingState = { active: true, instances: [], spawnTimer: 0 };
        }
        if (nextPats.includes(BarragePattern.TRIPLE_LANE_BLAST) && !oldPats.includes(BarragePattern.TRIPLE_LANE_BLAST)) {
          initTripleLaneBlast();
        }
        
        boss.activePatterns = nextPats;
      };
      
      syncPatternsRef.current = setAndSyncActivePatterns;

      // Special: SPEAKING_JERRY typewriter phase before Phase 5
      if (boss.bossPhase === 'SPEAKING_JERRY') {
        boss.speakingJerryTime = (boss.speakingJerryTime || 0) + deltaTime;
        const target = "Jerry";
        const charShow = Math.min(target.length, Math.floor(boss.speakingJerryTime / 0.4));
        const currentText = target.substring(0, charShow);
        
        if (bossNpcDialogue !== currentText) {
          setBossNpcDialogue(currentText);
        }

        if (boss.speakingJerryTime >= target.length * 0.4 + 1.2) {
          // Finished typewriter speaking, clear dialogue and progress to Phase 5!
          setBossNpcDialogue(null);
          
          boss.bossPhase = 'PHASE_5';
          boss.phaseIndex = 5;
          setBossPhase('PHASE_5');
          boss.p5TotalTime = 0;

          // Robustly reset all laser variables for Phase 5 sweeps!
          boss.p4LaserSweepIndex = 0;
          boss.p4LaserTime = 0;
          boss.p4LaserCharged = false;
          boss.p4LaserBellTriggered = false;
          boss.p4LaserWarningDuration = null;
          boss.p4LaserCurrentSide = null;
          boss.p4LaserRandomZOffset = null;
          boss.p4LaserPrevWarningDuration = null;
          boss.p4LaserPrevRandomZOffset = null;
          
          setNpcDialogue({
            text: "🔥 邪靈釋放最終禁術！進入【第五階段】：終極暴走彈幕結界！",
            color: "text-red-500 font-extrabold text-sm tracking-widest animate-pulse"
          });
        }
      }

      // Special: RESTING Phase (boss resting and transforming into NPC4.png)
      if (boss.bossPhase === 'RESTING' || boss.isResting) {
        boss.restTimeLeft = (boss.restTimeLeft || 10.0) - deltaTime;
        const elapsed = 10.0 - boss.restTimeLeft;

        // Custom typewriter dialogue: 0.3s per character
        let currentText = "";
        if (elapsed < 5.0) {
          const target = "你在幹嘛?";
          const charsShow = Math.min(target.length, Math.floor(elapsed / 0.5));
          currentText = target.substring(0, charsShow);
        } else {
          const target = "不要拿走";
          const elapsedPart2 = elapsed - 5.0;
          const charsShow = Math.min(target.length, Math.floor(elapsedPart2 / 0.5));
          currentText = target.substring(0, charsShow);
        }

        if (bossNpcDialogue !== currentText) {
          setBossNpcDialogue(currentText);
        }
        
        const heightY = 38.0;
        const fovRad = 65 * Math.PI / 180;
        const vHeight = 2 * heightY * Math.tan(fovRad / 2);
        const vWidth = vHeight * camera.aspect;
        const zCam = 12.5;
        const zBottom = zCam + vHeight / 2;
        const zTop = zCam - vHeight / 2;

        const largeBossHeight = vWidth * 0.5;
        const largeBossZ = zTop + largeBossHeight / 2;
        const smallBossZ = (zBottom - 15.0) - 3.0;

        const mainBossRef = scene.getObjectByName("mainBoss") as THREE.Mesh;
        if (mainBossRef) {

          if (elapsed < 5.0) {
            // Shake the large boss plane at its original position flat on the ground
            const jitterAmp = 1.0;
            mainBossRef.position.set(
              (Math.random() - 0.5) * jitterAmp,
              0.01,
              largeBossZ + (Math.random() - 0.5) * jitterAmp
            );
            mainBossRef.scale.set(vWidth, largeBossHeight, 1.0);
            
            // Flashing
            if (mainBossRef.material) {
              const mat = (Array.isArray(mainBossRef.material) ? mainBossRef.material[0] : mainBossRef.material) as THREE.MeshStandardMaterial;
              if (mat) {
                if (Math.floor(now / 60) % 2 === 0) {
                  mat.color.setHex(0xff0000);
                  mat.opacity = 0.35;
                } else {
                  mat.color.setHex(0xffffff);
                  mat.opacity = 1.0;
                }
              }
            }
          } else {
            const finalTex = (boss.bossPhase === 'PHASE_5' || boss.bossPhase === 'P5_SURVIVAL')
              ? ((stateRef.current as any).boss5Tex || boss5Tex)
              : (boss.bossPhase === 'PHASE_4' || boss.bossPhase === 'VULNERABLE_P4')
                ? ((stateRef.current as any).boss4Tex || boss4Tex)
                : (boss.bossPhase === 'PHASE_3' || boss.bossPhase === 'P3_SURVIVAL' || boss.phaseIndex === 3)
                  ? ((stateRef.current as any).boss3Tex || boss3Tex)
                  : (boss.boss2Tex || boss2Tex);
            if (finalTex && mainBossRef.material) {
              const mat = (Array.isArray(mainBossRef.material) ? mainBossRef.material[0] : mainBossRef.material) as THREE.MeshStandardMaterial;
              if (mat && mat.map !== finalTex) {
                mat.map = finalTex;
                mat.needsUpdate = true;
                mat.color.setHex(0xffffff);
                mainBossRef.scale.set(vWidth, largeBossHeight, 1.0);
                playSynthLaserBoom(80);
              }
            }
            
            if (elapsed >= 7.0) {
              // Flash and shake effect
              mainBossRef.visible = Math.floor(now / 50) % 2 === 0;
              mainBossRef.position.set(
                (Math.random() - 0.5) * 1.5,
                0.01,
                largeBossZ + (Math.random() - 0.5) * 1.5
              );
            } else {
              mainBossRef.position.set(0, 0.01, largeBossZ);
            }
            mainBossRef.scale.set(vWidth, largeBossHeight, 1.0);
            
            // Fade-in gradient and flashing glitch
            const elapsedSinceMorph = elapsed - 5.0;
            const fadeProgress = Math.min(1.0, elapsedSinceMorph / 2.0);
            const isFlashOff = Math.floor(now / 50) % 8 === 0 && elapsedSinceMorph < 2.5;
            const flashOpacity = isFlashOff ? 0.35 : 1.0;
            
            if (mainBossRef.material) {
              const mat = (Array.isArray(mainBossRef.material) ? mainBossRef.material[0] : mainBossRef.material) as THREE.MeshStandardMaterial;
              if (mat) {
                mat.opacity = fadeProgress * flashOpacity;
                if (elapsedSinceMorph < 2.5) {
                  if (Math.floor(now / 100) % 2 === 0) {
                     mat.color.setHex(0x38bdf8);
                  } else {
                    mat.color.setHex(0x10b981);
                  }
                } else {
                  mat.color.setHex(0xffffff);
                }
              }
            }
          }
        }
        
        if (boss.restTimeLeft <= 0) {
          boss.isResting = false;
          setBossNpcDialogue(null);
          
          triggerScreenFlash(5);
          triggerCameraShake(1.5, 1000);
          
          if (mainBossRef && mainBossRef.material) {
            mainBossRef.position.set(0, 0.01, largeBossZ);
            mainBossRef.scale.set(vWidth, largeBossHeight, 1.0);
            const mat = (Array.isArray(mainBossRef.material) ? mainBossRef.material[0] : mainBossRef.material) as THREE.MeshStandardMaterial;
            if (mat) {
              mat.opacity = 1.0;
              mat.color.setHex(0xffffff);
            }
          }
          
          // Switch to active survival phases immediately without countdown
          if (boss.phaseIndex === 1) {
            boss.phaseIndex = 2;
            const startingPhase = 'P2_SURVIVAL';
            boss.bossPhase = startingPhase;
            setBossPhase(startingPhase);
            boss.p1TotalTime = 0;
            setBossTimeLeft(50);
            boss.patternDuration = 0;
            boss.sequenceIndex = 0;
            setAndSyncActivePatterns([]);
            
            setNpcDialogue({
              text: "💥 瘋狂與憤怒...【第二階段】：絶望開始！",
              color: "text-red-500 font-extrabold text-sm tracking-wide animate-pulse"
            });
          } else if (boss.phaseIndex === 2) {
            boss.phaseIndex = 3;
            const startingPhase = 'P3_SURVIVAL';
            boss.bossPhase = startingPhase;
            setBossPhase(startingPhase);
            boss.p1TotalTime = 0;
            boss.p3TotalTime = 0;
            setBossTimeLeft(65);
            boss.patternDuration = 0;
            boss.sequenceIndex = 0;
            setAndSyncActivePatterns([BarragePattern.RED_BULLETS, BarragePattern.BURST_BULLET]);
            
            setNpcDialogue({
              text: "⚡💀 邪能再次崩裂！陳家睿神情痛苦，進入【第三階段】：幾何稜鏡重砲 & 自適應三軌雷射網！",
              color: "text-red-500 font-black text-sm tracking-widest animate-pulse"
            });
          } else {
            boss.bossPhase = 'DEFEATED';
            setBossPhase('DEFEATED');
            spookyAudio.playSparkleHint();
            setNpcDialogue({ 
              text: "🎉 直搗邪靈本體，全面淨化！陳家睿的身影漸漸化成光點消散，深淵徹底破碎，你成功通關！", 
              color: "text-emerald-400 font-extrabold text-sm tracking-wide" 
            });
          }
        }
        return;
      }

      // 0. COUNTDOWN Phase
      if (boss.bossPhase === 'COUNTDOWN') {
        const remaining = (boss.countdownTime || 3.0) - deltaTime;
        boss.countdownTime = Math.max(0, remaining);
        setCountdownTime(boss.countdownTime);

        // Stay focused facing the boss during countdown without resetting player's coordinates
        stateRef.current.player.angle = Math.PI; // Face the boss North (toward 0, -15)
        
        if (boss.countdownTime <= 0) {
          const startingPhase = boss.phaseIndex === 1 ? 'P1_SURVIVAL' : boss.phaseIndex === 2 ? 'P2_SURVIVAL' : 'P3_SURVIVAL';
          boss.bossPhase = startingPhase;
          setBossPhase(startingPhase);
          boss.p1TotalTime = 0;
          boss.sequenceIndex = 0;
          boss.patternDuration = 0;
        }
        return; // Stop any bullets/attacks or timer updates during countdowns
      }

      // 1.5 Decrease P5 Mash Progress during VULNERABLE_P5
      if (boss.bossPhase === 'VULNERABLE_P5') {
        if (boss.p5MashProgress > 0) {
          // Constant decrease rate, removing throttle to keep the slide smooth and consistent
          boss.p5MashProgress = Math.max(0, boss.p5MashProgress - 4.5 * deltaTime);
          setBossMashProgress(boss.p5MashProgress);
        }
      }

      // 1. Core State Master Timer management during SURVIVAL Phase
      if (boss.bossPhase === 'P1_SURVIVAL' || boss.bossPhase === 'P2_SURVIVAL' || boss.bossPhase === 'PHASE_2' || boss.bossPhase === 'P3_SURVIVAL' || boss.bossPhase === 'PHASE_3' || boss.bossPhase === 'PHASE_4' || boss.bossPhase === 'PHASE_5') {
        const isP2 = boss.bossPhase === 'P2_SURVIVAL' || boss.bossPhase === 'PHASE_2';
        const isP3 = boss.bossPhase === 'P3_SURVIVAL' || boss.bossPhase === 'PHASE_3' || boss.phaseIndex === 3;
        const isP4 = boss.bossPhase === 'PHASE_4';
        const isP5 = boss.bossPhase === 'PHASE_5';
        let elapsed = 0;
        let limit = 40.0;
        
        if (isP2) {
          boss.p2TotalTime = (boss.p2TotalTime || 0) + deltaTime;
          elapsed = boss.p2TotalTime;
          limit = 50.0;
        } else if (isP3) {
          boss.p3TotalTime = (boss.p3TotalTime || 0) + deltaTime;
          elapsed = boss.p3TotalTime;
          limit = 65.0;
        } else if (isP4) {
          if (boss.p4Stage === 'BARRAGE') {
            boss.p4TotalTime = (boss.p4TotalTime || 0) + deltaTime;
            elapsed = boss.p4TotalTime;
          } else {
            elapsed = 0;
          }
          limit = 61.5;
        } else if (isP5) {
          boss.p5TotalTime = (boss.p5TotalTime || 0) + deltaTime;
          elapsed = boss.p5TotalTime;
          limit = 9999.0;
        } else {
          boss.p1TotalTime = (boss.p1TotalTime || 0) + deltaTime;
          elapsed = boss.p1TotalTime;
          limit = 40.0;
        }
        
        const tl = Math.max(0, limit - elapsed);
        setBossTimeLeft(tl);

        if (elapsed >= limit) {
          // End of Phase...
          if (syncPatternsRef.current) syncPatternsRef.current([]);
          boss.activePatterns = [];
          
          clearLasers();
          clearOrbitalStrikes();
          clearMatrixStrikes();
          clearPrismSniping();
          clearTripleLaneBlast();
          
          if (boss.burstBullets) {
            boss.burstBullets.forEach((bb: any) => {
              if (bb.mesh) {
                scene.remove(bb.mesh);
                if (bb.mesh.geometry) bb.mesh.geometry.dispose();
                if (bb.mesh.material) {
                  if (Array.isArray(bb.mesh.material)) bb.mesh.material.forEach((m: any) => m.dispose());
                  else bb.mesh.material.dispose();
                }
              }
            });
            boss.burstBullets = [];
          }

          if (boss.normalBullets) {
            boss.normalBullets.forEach((nb: any) => {
              if (nb.mesh) {
                scene.remove(nb.mesh);
                if (nb.mesh.geometry) nb.mesh.geometry.dispose();
                if (nb.mesh.material) {
                  if (Array.isArray(nb.mesh.material)) nb.mesh.material.forEach((m: any) => m.dispose());
                  else nb.mesh.material.dispose();
                }
              }
            });
            boss.normalBullets = [];
          }

          // Reset triggers
          boss.sequenceIndex = 0;
          if (isP2) {
            boss.p2TotalTime = 0;
            boss.bossPhase = 'VULNERABLE_P2';
            setBossPhase('VULNERABLE_P2');
          } else if (isP3) {
            boss.p3TotalTime = 0;
            boss.bossPhase = 'VULNERABLE_P3';
            setBossPhase('VULNERABLE_P3');
          } else if (isP4) {
            boss.p4TotalTime = 0;
            boss.bossPhase = 'VULNERABLE_P4';
            setBossPhase('VULNERABLE_P4');
            spookyAudio.playSparkleHint();
            setNpcDialogue({ 
              text: "⚡ 艾德加防線瓦解！趁現在按下 [F] 鍵發動最終斬擊進入第五階段！", 
              color: "text-amber-400 font-extrabold text-sm tracking-wide animate-pulse" 
            });
          } else if (isP5) {
            boss.p5TotalTime = 0;
            boss.bossPhase = 'DEFEATED';
            setBossPhase('DEFEATED');
            spookyAudio.playSparkleHint();
            setNpcDialogue({ 
              text: "🎉 直搗邪靈本體，全面淨化！陳家睿的身影漸漸化成光點消散，深淵徹底破碎，你成功通關！", 
              color: "text-emerald-400 font-extrabold text-sm tracking-wide" 
            });
          } else {
            boss.p1TotalTime = 0;
            boss.bossPhase = 'READY_TO_ATTACK';
            setBossPhase('READY_TO_ATTACK');
          }
        }
      }

      // Keep spawning active bullet hell patterns during both SURVIVAL and STUNNED phases!
      // The bullets only stop when the user actually grabs/interacts with the core.
      if (boss.bossPhase && (boss.bossPhase.endsWith('_SURVIVAL') || boss.bossPhase === 'PHASE_2' || boss.bossPhase === 'PHASE_3' || boss.bossPhase === 'PHASE_4' || boss.bossPhase === 'PHASE_5')) {
        const isP2 = boss.bossPhase === 'P2_SURVIVAL' || boss.bossPhase === 'PHASE_2';
        const isP3 = boss.bossPhase === 'P3_SURVIVAL' || boss.bossPhase === 'PHASE_3' || boss.phaseIndex === 3;
        const isP4 = boss.bossPhase === 'PHASE_4';
        const isP5 = boss.bossPhase === 'PHASE_5';

        // Run orbital strike updating (which scales discs, checks hits, and handles visuals)
        updateOrbitalStrikes(deltaTime, now);
        
        // Run matrix strike updating with warning indicators, delay, laser strike and parry.
        updateMatrixStrikes(deltaTime, now);

        // Run prism sniping updating if we are in the PRISM_SNIPING state
        if (boss.activePatterns && boss.activePatterns.includes(BarragePattern.PRISM_SNIPING)) {
          updatePrismSniping(deltaTime, now);
        }

        // Run triple lane blast updating if we are in the TRIPLE_LANE_BLAST state
        if (boss.activePatterns && boss.activePatterns.includes(BarragePattern.TRIPLE_LANE_BLAST)) {
          updateTripleLaneBlast(deltaTime, now);
        }

        if (isP4) {
          let expectedPatterns: BarragePattern[] = [];
          
          if (boss.p4Stage === 'SPEAKING') {
            expectedPatterns = [];
          } else if (boss.p4Stage === 'SWEEP_LASER') {
            expectedPatterns = [BarragePattern.GIANT_SWEEP_LASER];
            updateSweepingLaser(deltaTime, now);
          } else {
            // Stage is BARRAGE!
            const barrageTime = boss.p4TotalTime || 0;
            if (barrageTime < 12.0) {
              expectedPatterns = [BarragePattern.SPINNING_CROSS];
            } else if (barrageTime < 27.0) {
              // 調整：依用戶要求，啟動第七種彈幕(TRIPLE_LANE_BLAST) ＋ 第四種彈幕(IRREGULAR_GRID)
              expectedPatterns = [BarragePattern.TRIPLE_LANE_BLAST, BarragePattern.IRREGULAR_GRID];
            } else if (barrageTime < 43.5) {
              expectedPatterns = [BarragePattern.BURST_BULLET];
            } else if (barrageTime < 61.5) {
              // 調整：依用戶要求，第六種彈幕(PRISM_SNIPING) ＋ 第三種彈幕(CEILING_STRIKE)（不用第一種彈幕）
              expectedPatterns = [BarragePattern.PRISM_SNIPING, BarragePattern.CEILING_STRIKE];
            } else {
              expectedPatterns = [];
            }
          }

          const currentPats = boss.activePatterns || [];
          const matches = currentPats.length === expectedPatterns.length && currentPats.every((v: any, i: number) => v === expectedPatterns[i]);
          if (!matches) {
            setAndSyncActivePatterns(expectedPatterns);
          }
        } else if (isP5) {
          let expectedPatterns = [BarragePattern.GIANT_SWEEP_LASER];
          updateSweepingLaser(deltaTime, now);

          const currentPats = boss.activePatterns || [];
          const matches = currentPats.length === expectedPatterns.length && currentPats.every((v: any, i: number) => v === expectedPatterns[i]);
          if (!matches) {
            setAndSyncActivePatterns(expectedPatterns);
          }
        } else if (isP3) {
          const p3Time = boss.p3TotalTime || 0;
          let expectedPatterns: BarragePattern[] = [];
          
          if (p3Time >= 0.0 && p3Time < 14.0) {
            expectedPatterns = [BarragePattern.RED_BULLETS, BarragePattern.BURST_BULLET];
          } else if (p3Time >= 14.0 && p3Time < 30.0) {
            expectedPatterns = [BarragePattern.PRISM_SNIPING];
          } else if (p3Time >= 30.0 && p3Time < 45.0) {
            expectedPatterns = [BarragePattern.IRREGULAR_GRID, BarragePattern.SPINNING_CROSS, BarragePattern.CEILING_STRIKE];
          } else if (p3Time >= 45.0 && p3Time < 53.0) {
            expectedPatterns = [BarragePattern.SPINNING_CROSS];
          } else if (p3Time >= 53.0 && p3Time < 65.0) {
            expectedPatterns = [BarragePattern.TRIPLE_LANE_BLAST];
          } else {
            expectedPatterns = [];
          }

          const currentPats = boss.activePatterns || [];
          const matches = currentPats.length === expectedPatterns.length && currentPats.every((v: any, i: number) => v === expectedPatterns[i]);
          if (!matches) {
            setAndSyncActivePatterns(expectedPatterns);
          }
        } else if (isP2) {
          const p2Time = boss.p2TotalTime || 0;
          let expectedPatterns: BarragePattern[] = [];
          
          if (p2Time >= 0.0 && p2Time < 14.0) {
            // 1. 0.0 ~ 14.0 秒：【不規則網格封鎖】
            expectedPatterns = [BarragePattern.IRREGULAR_GRID];
          } else if (p2Time >= 14.0 && p2Time < 20.0) {
            // 2. 14.0 ~ 20.0 秒：【雷射交叉火力】
            expectedPatterns = [BarragePattern.SPINNING_CROSS, BarragePattern.CEILING_STRIKE];
          } else if (p2Time >= 20.0 && p2Time < 30.0) {
            // 3. 20.0 ~ 30.0 秒：【分裂爆彈地獄】
            expectedPatterns = [BarragePattern.BURST_BULLET];
          } else if (p2Time >= 30.0 && p2Time < 36.0) {
            // 4. 30.0 ~ 36.0 秒：【猩紅暴雨加載】
            expectedPatterns = [BarragePattern.RED_BULLETS];
          } else if (p2Time >= 36.0 && p2Time < 50.0) {
            // 5. 36.0 ~ 50.0 秒：【終局絕望火網】
            expectedPatterns = [BarragePattern.IRREGULAR_GRID, BarragePattern.SPINNING_CROSS];
          } else {
            expectedPatterns = [];
          }

          const currentPats = boss.activePatterns || [];
          const matches = currentPats.length === expectedPatterns.length && currentPats.every((v: any, i: number) => v === expectedPatterns[i]);
          if (!matches) {
            setAndSyncActivePatterns(expectedPatterns);
          }
        } else {
          // Decrement duration of active patterns to switch choices over time for standard phases
          boss.patternDuration -= deltaTime;
          if (boss.patternDuration <= 0) {
            let sequence = [
              { patterns: [BarragePattern.RED_BULLETS], duration: 11.0 },
              { patterns: [BarragePattern.SPINNING_CROSS], duration: 8.0 },
              { patterns: [BarragePattern.CEILING_STRIKE], duration: 5.0 },
              { patterns: [BarragePattern.SPINNING_CROSS], duration: 4.0 },
              { patterns: [BarragePattern.RED_BULLETS], duration: 12.0 },
            ];

            const currentIdx = boss.sequenceIndex || 0;
            const currentStep = sequence[currentIdx];
            
            setAndSyncActivePatterns(currentStep.patterns);
            boss.patternDuration = currentStep.duration;

            // Increment index and loop if needed
            boss.sequenceIndex = (currentIdx + 1) % sequence.length;
          }
        }

        const currentPats = boss.activePatterns || [BarragePattern.RED_BULLETS];

        if (currentPats.includes(BarragePattern.SPINNING_CROSS)) {
          updateLaserSurvival(deltaTime, now);
          // Loop sound sweep for laser
          if (now - (boss.lastLaserSoundTime || 0) >= 420) {
            boss.lastLaserSoundTime = now;
            playSynthLaserSweep();
          }
        }

        if (currentPats.includes(BarragePattern.BURST_BULLET)) {
          // ==========================================
          // 【彈幕五：分裂爆彈地獄】 參數調整區
          // ==========================================
          const isP4 = boss.bossPhase === 'PHASE_4';
          const bTime = isP4 ? ((boss.p4TotalTime || 0) - 0.0) : 0;
          const isP5 = boss.bossPhase === 'PHASE_5';
          const p5Time = isP5 ? (boss.p5TotalTime || 0) : 0;
          
          // 判斷是否為加強版彈幕（第四階段後半 27.0-43.5s 或 第五階段全段）
          const isBurstEnhanced = (isP4 && bTime >= 27.0 && bTime < 43.5) || isP5;

          // 參數：彈藥發射間隔時間（單位：毫秒ms）
          // 調整：依用戶要求，發射間隔時間調整至 2.0 秒（即 2000 毫秒）
          const burstInterval = 2000; 

          if (now - (boss.lastBurstBulletTime || 0) >= burstInterval) {
            boss.lastBurstBulletTime = now;
            
            // 計算底部邊界以確保子彈在玩家平台內爆炸
            const fovRad = (camera.fov * Math.PI) / 180;
            const heightY = Math.abs(camera.position.y);
            const vHeight = 2 * heightY * Math.tan(fovRad / 2);
            const zBottom = 12.5 + vHeight / 2;

            // 參數：是否生成雙發分裂彈（加強版為 true）
            const doubleSpawn = isBurstEnhanced;
            const spawnCount = doubleSpawn ? 2 : 1;

            for (let sIdx = 0; sIdx < spawnCount; sIdx++) {
              // 參數：生成座標範圍 (X 座標，在 BOSS 正前方隨機分佈)
              const randomX = (Math.random() - 0.5) * 11.5; 
              const spawnZ = zBottom - 17.5; 
              const spawnPos = new THREE.Vector3(randomX, 0.1, spawnZ);

              // 參數：目標爆炸點範圍，限制在 15x15 的格擋/閃避競技場內
              const targetX = (Math.random() - 0.5) * 10; 
              const targetZ = zBottom - 12.0 + Math.random() * 10.0; 

              // 參數：分裂大母彈飛行時間（單位：毫秒ms。此處設為 1.1s 至 1.6s 飛到目標點）
              const durationMs = (1.1 + Math.random() * 0.5) * 1000; 
              const vx = (targetX - randomX) / (durationMs / 1000);
              const vz = (targetZ - spawnZ) / (durationMs / 1000);

              const parentBulletMesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.25 * 2.5, 12, 12),
                new THREE.MeshBasicMaterial({ color: doubleSpawn ? 0xff00ff : 0xff0000 })
              );
              parentBulletMesh.position.copy(spawnPos);
              scene.add(parentBulletMesh);

              boss.burstBullets.push({
                mesh: parentBulletMesh,
                startTime: now,
                burstTime: durationMs,
                vx: vx,
                vz: vz,
                isEnhanced: isBurstEnhanced
              });
            }
          }
        } // Close BURST_BULLET active-pattern check here

        // 更新母彈位置及觸發分裂（獨立於 active-pattern check，使已發射的母彈能順利飛完、分裂、消除）
        for (let i = 0; i < boss.burstBullets.length; i++) {
          const b = boss.burstBullets[i];
          
          b.mesh.position.x += b.vx * deltaTime;
          b.mesh.position.z += b.vz * deltaTime;

          if (now - b.startTime >= (b.burstTime || 2000)) {
            // 母彈飛到時間，開始爆裂
            const origin = b.mesh.position.clone();
            scene.remove(b.mesh);
            const wasEnhanced = b.isEnhanced;
            boss.burstBullets.splice(i, 1);
            i--;
            
            // ==========================================
            // 【分裂小彈數量與速度調整】
            // ==========================================
            // 參數：分裂出來的小子彈數量（加強版為 22 顆，普通版為 14 顆）
            const count = wasEnhanced ? 22 : 14; 

            // 參數：分裂出來的小子彈速度
            // 調整：依用戶要求，分裂小子彈速度設定為 10（加強版與普通版皆調整為 10，使其方便應對與格擋）
            const childSpeed = 10; 

            for (let j = 0; j < count; j++) {
              const angle = (j / count) * Math.PI * 2;
              const vx = Math.cos(angle) * childSpeed; 
              const vz = Math.sin(angle) * childSpeed; 
              
              const child = new THREE.Mesh(
                new THREE.SphereGeometry(0.25, 6, 6),
                new THREE.MeshBasicMaterial({ color: wasEnhanced ? 0xff00cc : 0xff3300 })
              );
              child.position.copy(origin);
              scene.add(child);
              boss.normalBullets.push({ mesh: child, vx, vz });
            }
          }
        }

        if (currentPats.includes(BarragePattern.RED_BULLETS)) {
          // 彈幕一：猩紅彈雨 - Clean, dense bullet spray pattern
          const isP2Storm = isP2 && (boss.p2TotalTime >= 30.0 && boss.p2TotalTime < 36.0);
          const shootInterval = isP2Storm ? 90 : 200; // More than 2x frequency
          
          if (now - (boss.lastBulletShootTime || 0) >= shootInterval) {
            boss.lastBulletShootTime = now;
            boss.spiralAngle = (boss.spiralAngle || 0) + (isP2Storm ? 0.15 : 0.1);

            const speed = isP2Storm ? 12.0 : 10.0;
            const bulletGeom = new THREE.SphereGeometry(0.25, 6, 6);
            const bulletMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });

            if (Math.random() < 0.6) {
              playSynthSpiralShoot();
            }

            const spawnZ = (12.5 + (2 * 38.0 * Math.tan((65 * Math.PI / 180) / 2)) / 2) - 15.0;

            const arms = isP2Storm ? 8 : 4; // Double density arms!
            for (let i = 0; i < arms; i++) {
              const angle = boss.spiralAngle + i * (Math.PI * 2 / arms);
              const vx = Math.cos(angle) * speed;
              const vz = Math.sin(angle) * speed;
              const bullet = new THREE.Mesh(bulletGeom, bulletMat);
              bullet.name = "NormalBullet";
              bullet.position.set(0, 0.1, spawnZ);
              scene.add(bullet);
              boss.normalBullets.push({ mesh: bullet, vx, vz });
            }
          }
        }
      }

      // 2. Projectiles movement, hit collision check & Garbage Collection (limit boundary 40 units)
      const nextBullets: typeof boss.normalBullets = [];

      for (let i = 0; i < boss.normalBullets.length; i++) {
        const bullet = boss.normalBullets[i];
        
        bullet.mesh.position.x += bullet.vx * deltaTime;
        bullet.mesh.position.z += bullet.vz * deltaTime;

        let wasHitOrOOB = false;

        // Calculate 2D distance on X/Z flat plane for accurate bullet touching at floor level
        const dx = bullet.mesh.position.x - playerPos.x;
        const dz = bullet.mesh.position.z - playerPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 0.6) {
          if (stateRef.current.stage === HorrorProgression.STAGE_6) {
            damagePlayerHp(1);
            wasHitOrOOB = true;
          } else {
            stateRef.current.sanity = Math.max(0, stateRef.current.sanity - 15.0 * deltaTime);
            setSanity(Math.floor(stateRef.current.sanity));
            if (Math.random() < 0.15) {
              spookyAudio.playSquelch();
            }
          }
        }

        if (Math.abs(bullet.mesh.position.x) > 40 || Math.abs(bullet.mesh.position.z) > 40) {
          wasHitOrOOB = true;
        }

        if (wasHitOrOOB) {
          scene.remove(bullet.mesh);
          bullet.mesh.geometry.dispose();
          if (Array.isArray(bullet.mesh.material)) {
            bullet.mesh.material.forEach(m => m.dispose());
          } else {
            bullet.mesh.material.dispose();
          }
        } else {
          nextBullets.push(bullet);
        }
      }
      boss.normalBullets = nextBullets;

      // 3. Monitor Stun Core player check & interaction/direct touch logic
      if (boss.bossPhase === 'STUNNED') {
        if (boss.stunCore) {
            const keyboardControls = stateRef.current.controls;
            // Purged when F key interact
            if (keyboardControls.interact) {
              keyboardControls.interact = false; // Reset F click state

              // Delete stunCore mesh & lights
              scene.remove(boss.stunCore);
              if (boss.stunCore.geometry) boss.stunCore.geometry.dispose();
              if (Array.isArray(boss.stunCore.material)) {
                boss.stunCore.material.forEach(m => m.dispose());
              } else if (boss.stunCore.material) {
                boss.stunCore.material.dispose();
              }
              boss.stunCore = null;

              // Clear active bullets from the scene immediately
              if (boss.normalBullets) {
                boss.normalBullets.forEach(b => {
                  scene.remove(b.mesh);
                  b.mesh.geometry.dispose();
                  if (Array.isArray(b.mesh.material)) {
                    b.mesh.material.forEach(m => m.dispose());
                  } else {
                    b.mesh.material.dispose();
                  }
                });
              }
              boss.normalBullets = [];
              boss.bulletMode = 'NONE';

              // Clear lasers completely during transition
              clearLasers();
              clearOrbitalStrikes();
              clearMatrixStrikes();
              clearPrismSniping();
              clearTripleLaneBlast();

              // Give Core power to player for the final slash!
              boss.hasCollectedCore = true;
              setHasCollectedCoreUI(true);
              spookyAudio.playSparkleHint(); // Victory sparkling chime feedback

              setNpcDialogue({ 
                text: "★ 已成功汲取核心力量！按下 [F] 鍵將其徹底斬擊！", 
                color: "text-amber-300 font-extrabold text-sm tracking-wide animate-pulse" 
              });
            }
        }
      } else if (boss.hasCollectedCore) {
          const heightY = 38.0;
          const fovRad = 65 * Math.PI / 180;
          const vHeight = 2 * heightY * Math.tan(fovRad / 2);
          const vWidth = vHeight * camera.aspect;
          const zBottom = 12.5 + vHeight / 2;
          const zTop = 12.5 - vHeight / 2;

          // Since the player is restricted inside the play box, and the boss is at the top,
          // they can perform the final slash from anywhere.
          const keyboardControls = stateRef.current.controls;
          if (keyboardControls.interact) {
              keyboardControls.interact = false; // consume trigger
              
              // 1. Play Diagonal Slash Synthesizer audio
              playSynthSlash();
 
              const slashZ = zTop + (vWidth * 0.5) / 2;

              // 2. Spawn Billboard 3D Crossed Diagnal Slash effect
              const slashGeom1 = new THREE.PlaneGeometry(0.8, 12);
              const slashMat = new THREE.MeshBasicMaterial({
                color: 0x38bdf8, // glowing neon ice cyan-blue
                transparent: true,
                opacity: 0.95,
                side: THREE.DoubleSide
              });
              const slashMesh1 = new THREE.Mesh(slashGeom1, slashMat);
              slashMesh1.rotation.z = Math.PI / 4; // slant 45 degrees diagonal
              slashMesh1.rotation.y = Math.atan2(camera.position.x, camera.position.z - slashZ);
              slashMesh1.position.set(0, 4.0, slashZ);
              scene.add(slashMesh1);

              const slashMesh2 = new THREE.Mesh(slashGeom1, slashMat.clone());
              slashMesh2.rotation.z = -Math.PI / 4; // cross-diagonal slanting
              slashMesh2.rotation.y = Math.atan2(camera.position.x, camera.position.z - slashZ);
              slashMesh2.position.set(0, 4.0, slashZ + 0.2);
              scene.add(slashMesh2);

              boss.slashMeshes = [slashMesh1, slashMesh2];

              // 3. Shake and Flash the Boss
              boss.shakeTimer = 0.6; // duration in seconds
              boss.hasCollectedCore = false; // consume core power
              setHasCollectedCoreUI(false);

              // 4. Compute heavy outward push-back knockback direction from boss position at (0, slashZ)
              const px = playerPos.x;
              const pz = playerPos.z - slashZ;
              const len = Math.sqrt(px * px + pz * pz);
              const kx = len > 0 ? px / len : 0;
              const kz = len > 0 ? pz / len : 1;
              boss.knockbackDir = { x: kx, z: kz };
              boss.knockbackTargetTime = 0.5; // kickback slide takes 0.5s at speed

              // Sequence transition next stage via custom RESTING and morphological transition
              setTimeout(() => {
                // Clear any boss dialogue
                setBossNpcDialogue(null);
                
                // Preload NPC4 texture on the boss state if not already done
                if (!boss.boss2Tex) {
                  boss.boss2Tex = textureLoader.load('/src/boss2.png');
                }

                // Clear bullets & hazards instantly
                if (boss.normalBullets) {
                  boss.normalBullets.forEach(b => {
                    scene.remove(b.mesh);
                    b.mesh.geometry.dispose();
                    if (b.mesh.material) {
                      if (Array.isArray(b.mesh.material)) b.mesh.material.forEach(m => m.dispose());
                      else b.mesh.material.dispose();
                    }
                  });
                }
                boss.normalBullets = [];
                clearLasers();
                clearOrbitalStrikes();
                clearMatrixStrikes();
                clearPrismSniping();
                clearTripleLaneBlast();
              }, 600);
            }
      }
    };

    const transitionToP2 = () => {
      const boss = stateRef.current.boss;
      const mainBoss = scene.getObjectByName("mainBoss");
      boss.isInvulnerable = true;
      boss.status = BossStageStatus.P2_EYEBALLS;
      
      if (mainBoss) {
        // Animation scales 2x
        new Promise(resolve => {
          let scale = 1.0;
          const interval = setInterval(() => {
            scale += 0.05;
            mainBoss.scale.set(scale, scale, scale);
            if (scale >= 2.0) {
              clearInterval(interval);
              resolve(null);
            }
          }, 50);
        });
      }

      // Show eyes
      boss.eyeballs.forEach(eye => {
        eye.mesh.visible = true;
      });

      // Show hazards
      const hazardFloor = scene.getObjectByName("hazardFloor");
      if (hazardFloor) hazardFloor.visible = true;

      setNpcDialogue({ text: "[射擊角落眼球 (0/4)]", color: "text-white font-mono" });
    };

    const summonMinion = () => {
      const boss = stateRef.current.boss;
      const minionGeom = new THREE.BoxGeometry(1, 1, 1);
      const minionMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const minion = new THREE.Mesh(minionGeom, minionMat);
      
      const angle = Math.random() * Math.PI * 2;
      const radius = 25;
      minion.position.set(Math.cos(angle) * radius, 0.5, Math.sin(angle) * radius);
      scene.add(minion);
      boss.adds.push({ mesh: minion, speed: 2.0 });
    };

    const returnToP2Boss = () => {
      const boss = stateRef.current.boss;
      boss.isInvulnerable = false;
      boss.status = BossStageStatus.P2_BOSS_FIGHT;
      
      const hazardFloor = scene.getObjectByName("hazardFloor");
      if (hazardFloor) hazardFloor.visible = false;
      
      boss.adds.forEach(add => scene.remove(add.mesh));
      boss.adds = [];

      setNpcDialogue({ text: "大怪物的防禦崩潰了！攻擊它！", color: "text-red-600 font-black" });
      setTimeout(() => setNpcDialogue(null), 3000);
    };

    // 10. Frame Loop Update Functions
    let lastTime = performance.now();
    let frameId: number;

    const triggerLevelTransition = (nextStage: number) => {
      // Robustly reset all controls during any stage transition to prevent key or momentum sticky actions
      const transitionControls = stateRef.current.controls;
      if (transitionControls) {
        transitionControls.forward = false;
        transitionControls.backward = false;
        transitionControls.left = false;
        transitionControls.right = false;
        transitionControls.interact = false;
        transitionControls.jump = false;
        transitionControls.run = false;
        transitionControls.turnLeft = false;
        transitionControls.turnRight = false;
      }
      setIsTrackerVisible(false);

      // Clear obstacles group and Stage 4 arrows in any transition
      obstaclesGroup.clear();
      branchArrowsGroup.clear();
      branchArrowsGroup.visible = false;

      clearLasers();
      
      // Clean up previous Level 4 specific meshes from scene robustly
      const cleanupTargetNames = ["stage4StartingRoom", "level4Floor", "level4Ceil", "level4Exit", "sideDoor"];
      cleanupTargetNames.forEach(name => {
          let obj;
          while ((obj = scene.getObjectByName(name))) {
              disposeObject(obj);
              scene.remove(obj);
          }
      });

      // Special Intercept for State 6 typewriter transition!
      if (nextStage === HorrorProgression.STAGE_6) {
        stateRef.current.isChasing = false;
        setIsChasing(false);

        // Turn off blinking just in case it's active so we have absolute black canvas
        setIsBlinking(false);
        stateRef.current.isBlinking = false;

        // Stop BGM and stop ambient sounds completely
        spookyAudio.stopAmbient();
        spookyAudio.stopBGM1();
        if (runMusic.current) {
          runMusic.current.pause();
          runMusic.current.currentTime = 0;
        }

        // Activate typewriter modes
        setIsTypewriterActive(true);
        stateRef.current.isTypewriterActive = true;
        return;
      }

      // Automatically keep isLevel4 synchronized!
      stateRef.current.isLevel4 = (nextStage === HorrorProgression.STAGE_4);

      // Ensure player glow cube is hidden on non-stage-6
      const playerMesh = scene.getObjectByName("playerGlowCube");
      if (playerMesh) {
        playerMesh.visible = (nextStage === HorrorProgression.STAGE_6);
      }

      // Handle visibility of default floor and ceiling
      const dFloor = scene.getObjectByName("defaultFloor");
      const dCeil = scene.getObjectByName("defaultCeil");
      if (nextStage === HorrorProgression.STAGE_4 || nextStage === HorrorProgression.STAGE_6) {
        if (dFloor) dFloor.visible = false;
        if (dCeil) dCeil.visible = false;
      } else {
        if (dFloor) dFloor.visible = true;
        if (dCeil) dCeil.visible = true;
      }
      
      // Reset isChasing on any stage change
      stateRef.current.isChasing = false;
      setIsChasing(false);

      // Reset ghost variables for clean transition
      const gState = stateRef.current.ghost;
      gState.lerpProgress = 0;
      gState.lastGridX = config.ghostStartX;
      gState.lastGridZ = config.ghostStartZ;
      gState.targetGridX = config.ghostStartX;
      gState.targetGridZ = config.ghostStartZ;
      gState.x = config.ghostStartX * 2 + 1;
      gState.z = config.ghostStartZ * 2 + 1;
      ghostGroup.position.set(gState.x, 0, gState.z);
      ghostGroup.visible = false;
      gState.state = MonsterAIState.IDLE;

      if (nextStage === HorrorProgression.STAGE_1) {
        gState.active = false;
        stateRef.current.isMonsterActive = false;
        spookyAudio.playBGM1();
      } else {
        gState.active = true;
        stateRef.current.isMonsterActive = false;
        spookyAudio.stopBGM1();
      }

      if (nextStage === HorrorProgression.STAGE_4) {
        // Use standard Blink transition to match Level 1->2
        setIsBlinking(true);
        stateRef.current.isBlinking = true;
        
        // Match the delay of standard blink (400ms to snap, then setup)
        // But keep it slightly longer if setupLevel4 is heavy (800ms)
        setTimeout(() => {
          stateRef.current.stage = nextStage;
          setCurrentStageUI(nextStage);
          spookyAudio.stopBGM1();
          stateRef.current.isMonsterActive = false;
          stateRef.current.npc.interactionCount = 0;
          setNpcInteractionCount(0);
          
          setupLevel4();
          
          setTimeout(() => {
            setIsBlinking(false);
            stateRef.current.isBlinking = false;
          }, 400); // Snap eyes open
        }, 800);
      } else {
        setIsBlinking(true);
        stateRef.current.isBlinking = true;
        
        // Delay for the "eyes shut" moment
        setTimeout(() => {
          stateRef.current.stage = nextStage;
          setCurrentStageUI(nextStage);
          if (nextStage !== HorrorProgression.STAGE_1) {
            spookyAudio.stopBGM1();
          }
          stateRef.current.isMonsterActive = false;
          stateRef.current.npc.interactionCount = 0;
          setNpcInteractionCount(0);
          
          if (nextStage === HorrorProgression.STAGE_4) {
            setupLevel4();
          } else if (nextStage === HorrorProgression.STAGE_6) {
            setupBossFight();
          } else if (nextStage === HorrorProgression.STAGE_7) {
            setupFinalRoom();
          } else if (nextStage === HorrorProgression.STAGE_8) {
            setupTrueFinalRoom();
          } else {
            // REGENERATE MAZE FOR NEW LEVEL
            const newMaze = generateMaze(config.width, config.height);
            stateRef.current.mazeGrid = newMaze.grid;
            
            // Update Wall Meshes Visibility and Collisions
            stateRef.current.wallBoxes.length = 0;
            const wallMeshesMap = stateRef.current.wallMeshesMap;
            
            for (let z = 0; z < config.height; z++) {
              for (let x = 0; x < config.width; x++) {
                const wallMesh = wallMeshesMap.get(`${x},${z}`);
                const isWall = newMaze.grid[z][x] === 1;
                
                if (wallMesh) {
                  wallMesh.visible = isWall;
                  wallMesh.position.y = 1.1; // Restore standard wall height!
                }
                
                if (isWall) {
                  const wx = x * 2 + 1;
                  const wz = z * 2 + 1;
                  stateRef.current.wallBoxes.push({
                    minX: wx - 1,
                    maxX: wx + 1,
                    minZ: wz - 1,
                    maxZ: wz + 1,
                  });
                }
              }
            }
            
            // Reset player to new maze start
            stateRef.current.player.x = newMaze.startX * 2 + 1;
            stateRef.current.player.z = newMaze.startZ * 2 + 1;
            stateRef.current.player.angle = Math.PI / 2; // Facing the exit
            camera.position.set(stateRef.current.player.x, 0.8, stateRef.current.player.z);
            
            // Update NPC position to new start room left side
            if (npcSprite) {
              npcSprite.position.set(stateRef.current.player.x + 2.0, 1.25, stateRef.current.player.z);
              if (nextStage === HorrorProgression.STAGE_1 || nextStage === HorrorProgression.STAGE_2 || nextStage === HorrorProgression.STAGE_3 || nextStage === HorrorProgression.STAGE_4) {
                 npcSprite.visible = true;
              } else {
                 npcSprite.visible = false;
              }
            }
            
            // Reset collection for new level
            stateRef.current.collectedCount = 0;
            setCollectedCount(0);
            
            // Clear previous items
            itemsGroup.clear();
            currentItemMeshes.length = 0;
            currentItemLights.forEach(l => scene.remove(l));
            currentItemLights.length = 0;
            
            // RESERVE: Level 2 Item logic
            console.log(`Switched to Level ${nextStage}.`);
            spawnNextItem(); 
          }
          
          // MIGHTY BLINK: Fast fade out to simulate snapping eyes open
          setTimeout(() => {
            setIsBlinking(false);
            stateRef.current.isBlinking = false;
          }, 100);
        }, 400); 
      }
    };
    triggerRef.current = triggerLevelTransition;

    const handleTypewriterComplete = () => {
      stateRef.current.stage = HorrorProgression.STAGE_6;
      setCurrentStageUI(HorrorProgression.STAGE_6);
      stateRef.current.isMonsterActive = false;
      stateRef.current.npc.interactionCount = 0;
      setNpcInteractionCount(0);

      const dFloor = scene.getObjectByName("defaultFloor");
      const dCeil = scene.getObjectByName("defaultCeil");
      if (dFloor) dFloor.visible = false;
      if (dCeil) dCeil.visible = false;

      // Setup boss arena and start fight
      setupBossFight();
      if (stateRef.current.stage !== HorrorProgression.STAGE_6) {
        spookyAudio.startAmbient();
      }

      setIsTypewriterActive(false);
      stateRef.current.isTypewriterActive = false;
    };
    typewriterOnCompleteRef.current = handleTypewriterComplete;

    const disposeObject = (obj: THREE.Object3D) => {
    (stateRef.current as any).disposeObject = disposeObject;
        obj.traverse((child) => {
            if (child instanceof THREE.Mesh || child instanceof THREE.Sprite) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => {
                            if (m.map) m.map.dispose();
                            m.dispose();
                        });
                    } else {
                        if (child.material.map) child.material.map.dispose();
                        child.material.dispose();
                    }
                }
            }
        });
    };

    const clearLasers = () => {
      const scene = (stateRef.current as any).scene;
      const boss = stateRef.current.boss;
      if (boss.laserGroup) {
        scene.remove(boss.laserGroup);
        boss.laserGroup.traverse((child: any) => {
          if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((m: any) => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
        boss.laserGroup = null;
      }
      boss.laserLines = [];

      const sweepingGroup = scene?.getObjectByName("bossSweepingLaserGroup");
      if (sweepingGroup) {
        scene.remove(sweepingGroup);
        sweepingGroup.traverse((child: any) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
            else child.material.dispose();
          }
        });
        boss.sweepingLaserGroup = null;
        boss.p4LaserCharged = false;
        boss.p4LaserBellTriggered = false;
      }
    };

    const spawnLasers = () => {
      const boss = stateRef.current.boss;
      clearLasers();

      const heightY = 38.0;
      const fovRad = 65 * Math.PI / 180;
      const vHeight = 2 * heightY * Math.tan(fovRad / 2);
      const zBottom = 12.5 + vHeight / 2;

      const laserGroup = new THREE.Group();
      laserGroup.name = "bossLaserGroup";
      laserGroup.position.set(0, 0, zBottom - 7.5); // Center of the 15x15 play box
      scene.add(laserGroup);
      boss.laserGroup = laserGroup;
      boss.laserAngle = 0;

      // ==========================================
      // 【第二種彈幕：米字型迴旋雷射】 參數調整區
      // ==========================================
      // 參數：迴旋雷射光束的總道數（4道代表「十字形」，8道代表「米字形」）
      // 調整：依用戶最新要求，只有第四階段是米字形(8道)，其他階段皆為十字形(4道)
      const isPhase4 = boss.bossPhase === 'PHASE_4';
      const numBeams = isPhase4 ? 8 : 4;
      boss.laserLines = [];

      for (let i = 0; i < numBeams; i++) {
        const offsetAngle = i * (2 * Math.PI / numBeams);
        boss.laserLines.push(offsetAngle);

        const pivot = new THREE.Group();
        pivot.rotation.y = offsetAngle;
        laserGroup.add(pivot);

        // 參數：紅色中心實體光束的尺寸 (寬, 高, 長度60)
        const beamGeom = new THREE.BoxGeometry(0.3, 0.25, 60);
        // 參數：紅色中心實體光束的顏色與強度
        const beamMat = new THREE.MeshStandardMaterial({
          color: 0xff0000,
          emissive: 0xff0000,
          emissiveIntensity: 6.0,
          roughness: 0.1,
          metalness: 0.1,
          transparent: true,
          opacity: 0.95
        });
        const beamMesh = new THREE.Mesh(beamGeom, beamMat);
        beamMesh.position.set(0, 0.15, 30);
        pivot.add(beamMesh);

        // 參數：紅色半透明邊緣警示光軌的寬度 (原 2.8 單位寬)
        const trailGeom = new THREE.PlaneGeometry(2.8, 60);
        // 參數：警示光軌的顏色與不透明度
        const trailMat = new THREE.MeshStandardMaterial({
          color: 0xff1111,
          emissive: 0xaa0000,
          emissiveIntensity: 2.5,
          transparent: true,
          opacity: 0.25,
          depthWrite: false,
          side: THREE.DoubleSide
        });
        const trailMesh = new THREE.Mesh(trailGeom, trailMat);
        trailMesh.rotation.x = -Math.PI / 2;
        trailMesh.position.set(0, 0.01, 30);
        trailMesh.name = "GlitchTrail";
        pivot.add(trailMesh);
      }
      
      setNpcDialogue({ 
        text: isPhase4 
          ? "🚨 警告：邪靈啟動【米字型漩渦生死劫】！抓準時機按下 [Space] 跳起或 [F] 格擋！" 
          : "🚨 警告：邪靈啟動【十字漩渦斷頭台】！抓準時機按下 [Space] 跳起或 [F] 格擋！", 
        color: "text-red-500 font-extrabold text-lg tracking-widest animate-pulse drop-shadow-[0_0_12px_rgba(239,68,68,0.9)]" 
      });
      setTimeout(() => setNpcDialogue(null), 3500);
    };

    const updateLaserSurvival = (deltaTime: number, now: number) => {
      const boss = stateRef.current.boss;
      if (!boss.laserGroup) {
        spawnLasers();
      }

      const heightY = 38.0;
      const fovRad = 65 * Math.PI / 180;
      const vHeight = 2 * heightY * Math.tan(fovRad / 2);
      const zBottom = 12.5 + vHeight / 2;

      const laserGroup = boss.laserGroup;
      if (laserGroup) {
        laserGroup.position.set(0, 0, zBottom - 7.5); // Dynamically center
        // ==========================================
        // 【第二種彈幕：米字型迴旋雷射】 運作與碰撞判定
        // ==========================================
        // 參數：迴旋旋轉速度。原本 0.65 弧度每秒（負號代表順時針旋轉。数值越大旋轉越快）
        const SWEEP_SPEED = 0.65;
        boss.laserAngle = (boss.laserAngle || 0) - SWEEP_SPEED * deltaTime;
        laserGroup.rotation.y = boss.laserAngle;

        laserGroup.traverse((child: any) => {
          if (child.name === "GlitchTrail" && child.material) {
            child.scale.x = 1.0 + Math.sin(now * 0.05) * 0.25;
            child.material.opacity = 0.2 + Math.random() * 0.2;
          }
        });

        // Math is relative to the box center at (0, zBottom - 7.5) where the laser group is positioned
        const px = playerState.x;
        const pz = playerState.z - (zBottom - 7.5);
        
        // 參數：迴旋雷射光束道數（必須與 spawn 時的 numBeams 一致）
        // 調整：依用戶最新要求，只有第四階段是米字形(8道)，其他階段皆為十字形(4道)
        const isPhase4 = boss.bossPhase === 'PHASE_4';
        const numBeams = isPhase4 ? 8 : 4;
        let isPlayerHitByLaser = false;

        // The laser rotates sweet along the floor (y=0~0.275), so if player jumps (height y > 1.0), they visual-dodge it!
        if (playerState.y <= 1.0) {
          for (let k = 0; k < numBeams; k++) {
            const theta = boss.laserAngle + k * (2 * Math.PI / numBeams);
            const dirX = Math.sin(theta);
            const dirZ = Math.cos(theta);

            const proj = px * dirX + pz * dirZ;
            const tClamped = Math.max(0, Math.min(60, proj));
            const cx = tClamped * dirX;
            const cz = tClamped * dirZ;

            const dx = px - cx;
            const dz = pz - cz;
            const dSq = dx * dx + dz * dz;

            if (dSq < 1.0) {
              isPlayerHitByLaser = true;
              break;
            }
          }
        }

        if (isPlayerHitByLaser) {
          const invulnUntil = (stateRef.current as any).laserInvulnerabilityUntil || 0;
          if (now >= invulnUntil) {
            (stateRef.current as any).laserInvulnerabilityUntil = now + 1200;
            
            if (stateRef.current.stage === HorrorProgression.STAGE_6) {
              damagePlayerHp(1);
            } else {
              stateRef.current.sanity = Math.max(0, stateRef.current.sanity - 30);
              setSanity(Math.floor(stateRef.current.sanity));

              spookyAudio.playSquelch();
              spookyAudio.playStinger();

              setIsGlitching(true);
              setTimeout(() => setIsGlitching(false), 250);
            }
          }
        }
      }
    };

    // Web Audio Sound Synthesizers for Stage 6 Bullet Hell Mechanisms
    const playSynthLaserCharge = (frequency = 600) => {
      try {
        const audioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!audioCtx) return;
        if (!(window as any).__customAudioCtx) {
          (window as any).__customAudioCtx = new audioCtx();
        }
        const ctx: AudioContext = (window as any).__customAudioCtx;
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        const nowSec = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sawtooth';
        // sweep upwards for target locks
        osc.frequency.setValueAtTime(frequency, nowSec);
        osc.frequency.exponentialRampToValueAtTime(frequency * 1.4, nowSec + 0.15);
        
        gain.gain.setValueAtTime(0.03, nowSec);
        gain.gain.exponentialRampToValueAtTime(0.001, nowSec + 0.15);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(nowSec);
        osc.stop(nowSec + 0.15);
      } catch(e) {}
    };

    const playSynthLaserBoom = (frequency = 250) => {
      try {
        const audioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!audioCtx) return;
        if (!(window as any).__customAudioCtx) {
          (window as any).__customAudioCtx = new audioCtx();
        }
        const ctx: AudioContext = (window as any).__customAudioCtx;
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        const nowSec = ctx.currentTime;
        const osc = ctx.createOscillator();
        const bOsc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(frequency, nowSec);
        osc.frequency.exponentialRampToValueAtTime(45, nowSec + 0.35);

        bOsc.type = 'triangle';
        bOsc.frequency.setValueAtTime(frequency * 0.7, nowSec);
        bOsc.frequency.exponentialRampToValueAtTime(30, nowSec + 0.35);
        
        gain.gain.setValueAtTime(0.12, nowSec);
        gain.gain.exponentialRampToValueAtTime(0.001, nowSec + 0.35);
        
        osc.connect(gain);
        bOsc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(nowSec);
        bOsc.start(nowSec);
        osc.stop(nowSec + 0.35);
        bOsc.stop(nowSec + 0.35);
      } catch(e) {}
    };

    const playSynthGridWarning = (frequency = 220) => {
      try {
        const audioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!audioCtx) return;
        if (!(window as any).__customAudioCtx) {
          (window as any).__customAudioCtx = new audioCtx();
        }
        const ctx: AudioContext = (window as any).__customAudioCtx;
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        const nowSec = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, nowSec);
        osc.frequency.linearRampToValueAtTime(frequency * 1.5, nowSec + 0.12);
        
        gain.gain.setValueAtTime(0.04, nowSec);
        gain.gain.exponentialRampToValueAtTime(0.001, nowSec + 0.15);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(nowSec);
        osc.stop(nowSec + 0.15);
      } catch(e) {}
    };

    const playSynthSpiralShoot = () => {
      try {
        const audioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!audioCtx) return;
        if (!(window as any).__customAudioCtx) {
          (window as any).__customAudioCtx = new audioCtx();
        }
        const ctx: AudioContext = (window as any).__customAudioCtx;
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        const nowSec = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320 + Math.random() * 80, nowSec);
        gain.gain.setValueAtTime(0.008, nowSec); // Very soft pop
        gain.gain.exponentialRampToValueAtTime(0.0001, nowSec + 0.04);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(nowSec);
        osc.stop(nowSec + 0.04);
      } catch(e) {}
    };

    const playSynthLaserSweep = () => {
      try {
        const audioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!audioCtx) return;
        if (!(window as any).__customAudioCtx) {
          (window as any).__customAudioCtx = new audioCtx();
        }
        const ctx: AudioContext = (window as any).__customAudioCtx;
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        const nowSec = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(240, nowSec);
        osc.frequency.exponentialRampToValueAtTime(80, nowSec + 0.35);
        gain.gain.setValueAtTime(0.015, nowSec);
        gain.gain.exponentialRampToValueAtTime(0.0001, nowSec + 0.38);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(nowSec);
        osc.stop(nowSec + 0.38);
      } catch(e) {}
    };

    const playSynthSlash = () => {
      try {
        const audioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!audioCtx) return;
        if (!(window as any).__customAudioCtx) {
          (window as any).__customAudioCtx = new audioCtx();
        }
        const ctx: AudioContext = (window as any).__customAudioCtx;
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        const nowSec = ctx.currentTime;
        
        // Noise buffer
        const bufferSize = ctx.sampleRate * 0.25;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1200, nowSec);
        filter.frequency.exponentialRampToValueAtTime(350, nowSec + 0.22);
        
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.2, nowSec);
        gain.gain.exponentialRampToValueAtTime(0.001, nowSec + 0.23);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        
        noise.start(nowSec);
        noise.stop(nowSec + 0.25);

        // Sweeping oscillator for solid feedback sound
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(380, nowSec);
        osc.frequency.linearRampToValueAtTime(70, nowSec + 0.22);
        
        oscGain.gain.setValueAtTime(0.15, nowSec);
        oscGain.gain.exponentialRampToValueAtTime(0.001, nowSec + 0.25);
        
        osc.connect(oscGain);
        oscGain.connect(ctx.destination);
        
        osc.start(nowSec);
        osc.stop(nowSec + 0.25);
      } catch(e) {}
    };

    const spawnOrbitalStrike = (targetX: number, targetZ: number, index = 0, isEnhanced = false) => {
      const boss = stateRef.current.boss;

      // a. Fixed gray outer ring: radius 1.5 (thinner), flat on the ground.
      const ringGeom = new THREE.RingGeometry(1.45, 1.55, 24);
      ringGeom.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x888888, side: THREE.DoubleSide });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.position.set(targetX, 0.015, targetZ);
      scene.add(ringMesh);

      // b. Charging solid red inner disc: CircleGeometry of base radius 1.5, initially scaled to 0.01 radius equivalent.
      const circleGeom = new THREE.CircleGeometry(1.5, 24);
      circleGeom.rotateX(-Math.PI / 2);
      const circleMat = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, transparent: true, opacity: 0.65 });
      const circleMesh = new THREE.Mesh(circleGeom, circleMat);
      circleMesh.scale.set(0.0066, 0.0066, 0.0066);
      circleMesh.position.set(targetX, 0.02, targetZ);
      scene.add(circleMesh);

      if (!boss.orbitalStrikes) {
        boss.orbitalStrikes = [];
      }

      boss.orbitalStrikes.push({
        ringMesh,
        circleMesh,
        playerX: targetX,
        playerZ: targetZ,
        elapsed: 0.0,
        laserMesh: null,
        strikeTriggered: false,
        durationLimit: isEnhanced ? 1.5 : 3.0
      });

      // Play lock-on warning chirp sound with slight stagger
      setTimeout(() => {
        playSynthLaserCharge(450 + index * 90);
      }, index * 60);
    };

    const clearOrbitalStrikes = () => {
      const scene = (stateRef.current as any).scene;
      const boss = stateRef.current.boss;
      const strikes = boss.orbitalStrikes || [];
      strikes.forEach((strike: any) => {
        if (strike.ringMesh) {
          scene.remove(strike.ringMesh);
          if (strike.ringMesh.geometry) strike.ringMesh.geometry.dispose();
          if (strike.ringMesh.material) {
            if (Array.isArray(strike.ringMesh.material)) strike.ringMesh.material.forEach((m: any) => m.dispose());
            else strike.ringMesh.material.dispose();
          }
        }
        if (strike.circleMesh) {
          scene.remove(strike.circleMesh);
          if (strike.circleMesh.geometry) strike.circleMesh.geometry.dispose();
          if (strike.circleMesh.material) {
            if (Array.isArray(strike.circleMesh.material)) strike.circleMesh.material.forEach((m: any) => m.dispose());
            else strike.circleMesh.material.dispose();
          }
        }
        if (strike.laserMesh) {
          scene.remove(strike.laserMesh);
          if (strike.laserMesh.geometry) strike.laserMesh.geometry.dispose();
          if (strike.laserMesh.material) {
            if (Array.isArray(strike.laserMesh.material)) strike.laserMesh.material.forEach((m: any) => m.dispose());
            else strike.laserMesh.material.dispose();
          }
        }
      });
      boss.orbitalStrikes = [];
    };

    const updateOrbitalStrikes = (deltaTime: number, now: number) => {
      const boss = stateRef.current.boss;
      if (!boss.orbitalStrikes) {
        boss.orbitalStrikes = [];
      }

      // 1. If currently in CEILING_STRIKE pattern, spawn cluster of strikes around the player
      const hasOrbital = boss.activePatterns && boss.activePatterns.includes(BarragePattern.CEILING_STRIKE);
      const isSurvivalPhase = boss.bossPhase && (
        boss.bossPhase.endsWith('_SURVIVAL') || 
        boss.bossPhase === 'STUNNED' || 
        boss.bossPhase === 'PHASE_2' || 
        boss.bossPhase === 'PHASE_3' || 
        boss.bossPhase === 'PHASE_4'
      );

      const isP4 = boss.bossPhase === 'PHASE_4';
      const bTime = isP4 ? ((boss.p4TotalTime || 0) - 0.0) : 0;
      const isEnhanced = isP4 && bTime >= 27.0 && bTime < 61.5;

      if (hasOrbital && isSurvivalPhase) {
        const elapsedSinceLast = now - (boss.lastOrbitalStrikeSpawnTime || 0);
        const spawnInterval = isEnhanced ? 600 : 1000;

        if (elapsedSinceLast >= spawnInterval) {
          boss.lastOrbitalStrikeSpawnTime = now;
          
          const px = playerState.x;
          const pz = playerState.z;
          const count = isEnhanced ? 8 : 5; // Spawn more independent targets simultaneously!

          const heightY = 38.0;
          const fovRad = 65 * Math.PI / 180;
          const vHeight = 2 * heightY * Math.tan(fovRad / 2);
          const zBottom = 12.5 + vHeight / 2;

          for (let i = 0; i < count; i++) {
            // Pick offset from player position
            const offsetRad = 1.0 + Math.random() * 9.0;
            const offsetAng = Math.random() * Math.PI * 2;
            const targetX = Math.max(-7.0, Math.min(7.0, px + Math.cos(offsetAng) * offsetRad));
            const targetZ = Math.max((zBottom - 15.0) + 0.5, Math.min(zBottom - 0.5, pz + Math.sin(offsetAng) * offsetRad));
            
            spawnOrbitalStrike(targetX, targetZ, i, isEnhanced);
          }
        }
      }

      // 2. Update existing strikes
      const nextStrikes: any[] = [];
      boss.orbitalStrikes.forEach((strike: any) => {
        strike.elapsed += deltaTime;
        const durLimit = strike.durationLimit || 3.0;

        // Scale the solid red disc linearly until duration limit is hit
        if (strike.elapsed < durLimit) {
          const progress = Math.min(1.0, strike.elapsed / durLimit);
          const currentScale = 0.0066 + (1.0 - 0.0066) * progress;
          if (strike.circleMesh) {
            strike.circleMesh.scale.set(currentScale, currentScale, currentScale);
          }
        } else {
          // Duration limit reached! Spawn laser visual & do check
          if (!strike.strikeTriggered) {
            strike.strikeTriggered = true;

            const laserHeight = 100;
            const laserGeom = new THREE.CylinderGeometry(1.5, 1.5, laserHeight, 16, 1);
            const laserMat = new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.85 });
            const laserMesh = new THREE.Mesh(laserGeom, laserMat);
            laserMesh.position.set(strike.playerX, laserHeight / 2, strike.playerZ);
            scene.add(laserMesh);
            strike.laserMesh = laserMesh;

            // Synthesis Audio Impact Blast for this specific laser!
            playSynthLaserBoom(180 + Math.random() * 60);

            // Damage & parry check
            const dx = playerState.x - strike.playerX;
            const dz = playerState.z - strike.playerZ;
            const distToCenter = Math.sqrt(dx * dx + dz * dz);

            if (distToCenter <= 1.5) {
              if (stateRef.current.stage === HorrorProgression.STAGE_6) {
                damagePlayerHp(1);
              } else {
                // Inside the impact zone! Take 25% sanity damage
                stateRef.current.sanity = Math.max(0, stateRef.current.sanity - 25);
                setSanity(Math.floor(stateRef.current.sanity));

                spookyAudio.playSquelch();
                spookyAudio.playStinger();

                setNpcDialogue({ 
                  text: "💥 受到天基雷射直擊重創！ (-25 心智)", 
                  color: "text-red-500 font-black text-sm" 
                });
                setTimeout(() => setNpcDialogue(null), 1500);

                setIsGlitching(true);
                setTimeout(() => setIsGlitching(false), 250);
              }
            } else {
              // Safely dodged!
              spookyAudio.playClick();
            }
          }

          if (strike.laserMesh) {
            strike.laserMesh.material.opacity = 0.4 + Math.random() * 0.45;
          }
        }

        if (strike.elapsed >= (durLimit + 0.2)) {
          // Cleanup
          if (strike.ringMesh) {
            scene.remove(strike.ringMesh);
            if (strike.ringMesh.geometry) strike.ringMesh.geometry.dispose();
            if (strike.ringMesh.material) {
              if (Array.isArray(strike.ringMesh.material)) strike.ringMesh.material.forEach((m: any) => m.dispose());
              else strike.ringMesh.material.dispose();
            }
          }
          if (strike.circleMesh) {
            scene.remove(strike.circleMesh);
            if (strike.circleMesh.geometry) strike.circleMesh.geometry.dispose();
            if (strike.circleMesh.material) {
              if (Array.isArray(strike.circleMesh.material)) strike.circleMesh.material.forEach((m: any) => m.dispose());
              else strike.circleMesh.material.dispose();
            }
          }
          if (strike.laserMesh) {
            scene.remove(strike.laserMesh);
            if (strike.laserMesh.geometry) strike.laserMesh.geometry.dispose();
            if (strike.laserMesh.material) {
              if (Array.isArray(strike.laserMesh.material)) strike.laserMesh.material.forEach((m: any) => m.dispose());
              else strike.laserMesh.material.dispose();
            }
          }
        } else {
          nextStrikes.push(strike);
        }
      });

      boss.orbitalStrikes = nextStrikes;
    };

    const spawnMatrixStrikes = () => {
      const boss = stateRef.current.boss;

      const heightY = 38.0;
      const fovRad = 65 * Math.PI / 180;
      const vHeight = 2 * heightY * Math.tan(fovRad / 2);
      const zBottom = 12.5 + vHeight / 2;

      // Identify safety center Oasis near the player (running distance)
      const playerX = playerState.x;
      const playerZ = playerState.z;
      
      const angleToCenter = Math.random() * Math.PI * 2;
      const distToCenter = 3.5 + Math.random() * 5; // safe zone is in running distance for smaller arena
      const safeX = Math.max(-5.5, Math.min(5.5, playerX + Math.cos(angleToCenter) * distToCenter));
      const safeZ = Math.max((zBottom - 15.0) + 1.5, Math.min(zBottom - 1.5, playerZ + Math.sin(angleToCenter) * distToCenter));

      // Define laser parameters
      const linesCount = 8; // 4 Horizontal, 4 Vertical for a crisp grid
      const lineWidth = 1.2; 
      const lineLength = 120;
      const lanes: any[] = [];

      for (let i = 0; i < linesCount; i++) {
        // Grid pattern: 0-3 are vertical-ish, 4-7 are horizontal-ish
        const isVertical = i < 4;
        let angle = isVertical ? Math.PI / 2 : 0;
        
        // Add a slight random tilt to the whole grid for dynamic look
        const gridTilt = (Math.random() - 0.5) * 0.2;
        angle += gridTilt;

        // Position the lines in a grid formation
        // Vertical lines vary in xc, horizontal lines vary in zc
        let xc = 0;
        let zc = 0;
        const spacing = 3.5;
        const offset = (i % 4 - 1.5) * spacing;

        if (isVertical) {
          xc = offset;
          zc = zBottom - 7.5;
        } else {
          xc = 0;
          zc = (zBottom - 7.5) + offset;
        }

        // MATHEMATICALLY PROJECT AWAY FROM SAFE ZONE:
        const nx = -Math.sin(angle);
        const nz = Math.cos(angle);
        const d = (safeX - xc) * nx + (safeZ - zc) * nz;
        const absD = Math.abs(d);
        const reqDist = 3.0; 
        if (absD < reqDist) {
          const shift = reqDist - absD;
          const sign = d >= 0 ? 1 : -1;
          xc -= sign * nx * shift;
          zc -= sign * nz * shift;
        }

        // Create the geometry and material
        const geom = new THREE.PlaneGeometry(lineLength, lineWidth);
        geom.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({
          color: 0x555555,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(xc, 0.1, zc);
        mesh.rotation.y = angle;
        
        // Force world matrix update immediately for proper worldToLocal collision calculations later!
        mesh.updateMatrixWorld(true);
        scene.add(mesh);

        lanes.push({
          mesh,
          material: mat,
          coordinateX: xc,
          coordinateZ: zc,
          angle
        });
      }

      // Add a small visual circle marker on the ground where the Safe Oasis is!
      const safeRingMesh: any = null;

      if (!boss.matrixStrikes) {
        boss.matrixStrikes = [];
      }

      boss.matrixStrikes.push({
        lanes,
        safeRingMesh,
        elapsed: 0.0,
        lastBeepTime: 0.0,
        strikeTriggered: false,
        finished: false
      });
    };

    const updateSweepingLaser = (deltaTime: number, now: number) => {
      const boss = stateRef.current.boss;
      if ((boss.bossPhase !== 'PHASE_4' || boss.p4Stage !== 'SWEEP_LASER') && boss.bossPhase !== 'PHASE_5') {
        const laserGroup = (stateRef.current as any).scene?.getObjectByName("bossSweepingLaserGroup");
        if (laserGroup) {
          (stateRef.current as any).scene?.remove(laserGroup);
          laserGroup.traverse((child: any) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
              else child.material.dispose();
            }
          });
          boss.sweepingLaserGroup = null;
        }
        return;
      }

      // Initialize index and sweep properties if not present
      if (boss.p4LaserSweepIndex === undefined || boss.p4LaserSweepIndex === null) {
        boss.p4LaserSweepIndex = 0;
      }

      if (boss.p4LaserWarningDuration === undefined || boss.p4LaserWarningDuration === null) {
        // Pairs of mirrored sweeps layout: (0,1), (2,3), (4,5)
        const isPairRight = (boss.p4LaserSweepIndex % 2 === 1);

        if (isPairRight && boss.p4LaserPrevWarningDuration !== undefined && boss.p4LaserPrevWarningDuration !== null) {
          // Re-use previous values for perfect mirroring on the opposite side
          boss.p4LaserWarningDuration = boss.p4LaserPrevWarningDuration;
          boss.p4LaserRandomZOffset = boss.p4LaserPrevRandomZOffset;
          boss.p4LaserCurrentSide = 'RIGHT_TO_LEFT';
        } else {
          // Generate new values for left-to-right sweep
          const minDuration = 0.5;
          const maxDuration = boss.bossPhase === 'PHASE_4' ? 2.0 : 1.5;
          boss.p4LaserWarningDuration = minDuration + Math.random() * (maxDuration - minDuration);
          boss.p4LaserRandomZOffset = 0.0; // Set to fixed offset (0.0) instead of random
          boss.p4LaserCurrentSide = 'LEFT_TO_RIGHT';

          // Cache these values to be perfectly mirrored next turn
          boss.p4LaserPrevWarningDuration = boss.p4LaserWarningDuration;
          boss.p4LaserPrevRandomZOffset = boss.p4LaserRandomZOffset;
        }
      }

      boss.p4LaserTime = (boss.p4LaserTime || 0) + deltaTime;
      const laserTime = boss.p4LaserTime;

      // Calculate base floor layout Z reference
      const heightY = 38.0;
      const fovRad = 65 * Math.PI / 180;
      const vHeight = 2 * heightY * Math.tan(fovRad / 2);
      const zBottom = 12.5 + vHeight / 2;

      // Compute side-specific parameters
      const currentSide = boss.p4LaserCurrentSide || 'LEFT_TO_RIGHT';
      const pivotX = currentSide === 'RIGHT_TO_LEFT' ? 17.5 : -17.5;
      const pivotZ = zBottom - 26.0 + (boss.p4LaserRandomZOffset || 0);
      const startRad = 0.0; // Start completely straight so there is no blind spot on the edges
      
      const targetRad = currentSide === 'RIGHT_TO_LEFT' ? -1.57 : 1.57;

      let laserGroup = (stateRef.current as any).scene?.getObjectByName("bossSweepingLaserGroup");
      if (!laserGroup) {
        laserGroup = new THREE.Group();
        laserGroup.name = "bossSweepingLaserGroup";
        
        // Set pivot coordinates dynamically
        laserGroup.position.set(pivotX, 0.5, pivotZ);
        laserGroup.rotation.y = startRad;

        // Create the laser geometries (very long and sharp blade-like laser!)
        const L = 100.0;
        const outerRadius = 3.5; // Thicker per user request (Was 2.0)
        const innerRadius = 1.0; // Thicker per user request (Was 0.65)

        const isLeft = (currentSide === 'LEFT_TO_RIGHT');
        // Left laser -> lbone.png, Right laser -> rbone.png (since rbone is absent, use lboneTex as fallback!)
        const originalTex = isLeft 
          ? (stateRef.current as any).lboneTex 
          : ((stateRef.current as any).rboneTex || (stateRef.current as any).lboneTex);
        
        let targetTex = null;
        let visualLength = 25.0; // Dynamic visual length to preserve bone aspect ratio without deformation

        if (originalTex) {
          targetTex = originalTex.clone();
          targetTex.wrapS = THREE.RepeatWrapping; // Use RepeatWrapping to support mirroring
          targetTex.wrapT = THREE.ClampToEdgeWrapping;
          
          if (!isLeft) {
            // Mirror left bone horizontally for rbone!
            targetTex.repeat.set(-1, 1);
            targetTex.center.set(0.5, 0.5);
          } else {
            targetTex.repeat.set(1, 1);
          }

          // Clean, static, hardcoded dimensions of the bone image to prevent loading-timing glitches!
          const imgW = 768;
          const imgH = 1408;
          const aspect = imgW / imgH; // 0.545455

          // Compute correct visualLength so that (2 * outerRadius) / visualLength matches aspect
          if (aspect > 0) {
            visualLength = (2 * outerRadius) / aspect;
          }
          // Constrain visualLength within a perfect range [30, 70] to guarantee massive impact
          visualLength = Math.max(30.0, Math.min(70.0, visualLength));
          targetTex.needsUpdate = true;
        }

        // Outer Crimson Laser / Bone (kept completely transparent/invisible for mechanics)
        const outerGeom = new THREE.CylinderGeometry(outerRadius, outerRadius, visualLength, 32);
        outerGeom.rotateX(Math.PI / 2); // Align cylinder along local +Z axis
        const outerMat = new THREE.MeshBasicMaterial({
          color: 0xff0033,
          transparent: true,
          opacity: 0.0, // Fully transparent
          visible: false,
          depthWrite: false
        });
        const outerMesh = new THREE.Mesh(outerGeom, outerMat);
        outerMesh.name = "outerMesh";
        // Position cylinder center at visualLength/2 along Z so that the base is exactly at pivot point (0, 0, 0)
        outerMesh.position.set(0, 0, visualLength / 2);
        laserGroup.add(outerMesh);

        // Inner White Laser Core / Bone (kept completely transparent/invisible for mechanics)
        const innerGeom = new THREE.CylinderGeometry(innerRadius, innerRadius, visualLength, 32);
        innerGeom.rotateX(Math.PI / 2);
        const innerMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.0, // Fully transparent
          visible: false,
          depthWrite: false
        });
        const innerMesh = new THREE.Mesh(innerGeom, innerMat);
        innerMesh.name = "innerMesh";
        innerMesh.position.set(0, 0, visualLength / 2);
        laserGroup.add(innerMesh);

        // CREATE EXTRA-THICK BONE PLANE ON TOP ("在上面蓋上一層骨頭手臂圖片")
        const boneWidth = 22.0; // Increased width to make bone arm larger
        const boneGeom = new THREE.PlaneGeometry(boneWidth, visualLength);
        
        // Orient the hand/bone flat on XZ plane with normal facing UP
        boneGeom.rotateX(-Math.PI / 2); 
        
        const boneMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          map: targetTex || null,
          transparent: true,
          opacity: 1.0, // DO NOT LET lbone.png BECOME TRANSPARENT (Keep fully solid 1.0)
          side: THREE.DoubleSide,
          depthWrite: true
        });
        const boneMesh = new THREE.Mesh(boneGeom, boneMat);
        boneMesh.name = "boneMesh";
        // Elevate bone slightly (Y = 0.05 local offset) to float just above the floor arena beautifully
        boneMesh.position.set(0, 0.05, visualLength / 2); 
        laserGroup.add(boneMesh);

        // Helper to construct a beautiful star mesh
        const createStarMesh = (color: number, size: number) => {
          const shape = new THREE.Shape();
          const pointsCount = 4; // Sharp cross-lens style star
          const rOuter = size;
          const rInner = size * 0.15; // Extremely pinched inside for realistic starflare look
          for (let i = 0; i < pointsCount * 2; i++) {
            const angle = (i * Math.PI) / pointsCount;
            const r = i % 2 === 0 ? rOuter : rInner;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            if (i === 0) shape.moveTo(x, y);
            else shape.lineTo(x, y);
          }
          shape.closePath();
          const starGeom = new THREE.ShapeGeometry(shape);
          const starMat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 1.0,
            side: THREE.DoubleSide,
            depthWrite: false
          });
          return new THREE.Mesh(starGeom, starMat);
        };

        const createFullStar = () => {
          const starGroup = new THREE.Group();
          
          const outerStar = createStarMesh(0xffeb3b, 4.0); // Large Golden-yellow starflare
          outerStar.name = "outerStar";
          starGroup.add(outerStar);
          
          const innerStar = createStarMesh(0xffffff, 1.8); // Smaller hot white core star
          innerStar.name = "innerStar";
          innerStar.position.z = 0.05;
          starGroup.add(innerStar);
          
          return starGroup;
        };

        // Spawn 4 pairs of warning star flare indicators flanking both sides of the laser length
        const starDistances = [18.0, 36.0, 54.0, 72.0];
        starDistances.forEach((zPos, idx) => {
          // Left Star
          const starL = createFullStar();
          starL.name = `warning_star_l_${idx}`;
          starL.position.set(-6.5, 0, zPos); // Placed next to the laser (at offset x = -6.5)
          starL.scale.set(0.001, 0.001, 0.001); // Small initially
          laserGroup.add(starL);
          
          // Right Star
          const starR = createFullStar();
          starR.name = `warning_star_r_${idx}`;
          starR.position.set(6.5, 0, zPos); // Placed next to the laser (at offset x = 6.5)
          starR.scale.set(0.001, 0.001, 0.001); // Small initially
          laserGroup.add(starR);
        });

        (stateRef.current as any).scene?.add(laserGroup);
        boss.sweepingLaserGroup = laserGroup;

        // Warning sound at start
        try {
          playSynthLaserCharge(120);
        } catch (e) {}

        setNpcDialogue({ 
          text: "{看準時機按F格擋}", 
          color: "text-amber-400 font-extrabold text-lg tracking-widest animate-pulse text-center drop-shadow-[0_0_12px_rgba(245,158,11,1)]" 
        });
      }

      const outerMesh = laserGroup.getObjectByName("outerMesh") as THREE.Mesh;
      const innerMesh = laserGroup.getObjectByName("innerMesh") as THREE.Mesh;
      const boneMesh = laserGroup.getObjectByName("boneMesh") as THREE.Mesh;

      const warningDuration = boss.p4LaserWarningDuration || 0.4;
      const isP4 = boss.bossPhase === 'PHASE_4';
      const sweepDuration = 0.1;  // Speed adjusted to 0.1s according to user request
      const fadeDuration = 0.0;   // Remove fade duration

      // Calculate relative threshold (0.4 seconds before warning duration ends) to pop stars and ring bell
      const warningThreshold = Math.max(0.1, warningDuration - 0.4);

      if (laserTime < warningDuration) {
        // 1. WIND-UP STAGE: Arm pulls back slowly (ease-out)
        laserGroup.position.set(pivotX, 10.0, pivotZ);
        
        const windUpProg = Math.min(1.0, laserTime / warningDuration);
        const easeOutProg = 1.0 - Math.pow(1.0 - windUpProg, 3); // ease-out cubic curve
        const pullBackOffset = currentSide === 'RIGHT_TO_LEFT' ? 0.25 : -0.25; // Pulls backward slightly
        laserGroup.rotation.y = startRad + easeOutProg * pullBackOffset;

        const scalePulse = 1.0;
        if (outerMesh) {
          outerMesh.scale.set(scalePulse, scalePulse, 1);
          const mat = outerMesh.material as THREE.MeshBasicMaterial;
          if (mat) {
            mat.opacity = 0.0; // Keep laser transparent
            mat.visible = false;
            mat.needsUpdate = true;
          }
        }
        if (innerMesh) {
          innerMesh.scale.set(scalePulse, scalePulse, 1);
          const mat = innerMesh.material as THREE.MeshBasicMaterial;
          if (mat) {
            mat.opacity = 0.0; // Keep laser transparent
            mat.visible = false;
            mat.needsUpdate = true;
          }
        }
        if (boneMesh) {
          boneMesh.scale.set(1.0, 1.0, 1.0);
          const mat = boneMesh.material as THREE.MeshBasicMaterial;
          if (mat) {
            mat.opacity = 1.0; // DO NOT LET lbone.png BECOME TRANSPARENT (Keep fully solid 1.0)
            mat.needsUpdate = true;
          }
        }

        // --- BILLBOARD AND ANIMATE THE STAR FLARES NEXT TO THE LASER ---
        const camera = (stateRef.current as any).camera;
        const starCount = 4;
        for (let i = 0; i < starCount; i++) {
          const starL = laserGroup.getObjectByName(`warning_star_l_${i}`) as THREE.Group;
          const starR = laserGroup.getObjectByName(`warning_star_r_${i}`) as THREE.Group;
          
          [starL, starR].forEach(star => {
            if (star) {
              // Orient the star flares to face the camera flat-on
              if (camera) {
                star.quaternion.copy(camera.quaternion);
              }
              
              if (laserTime >= warningThreshold) {
                const starAge = laserTime - warningThreshold;
                // Pop scale values up to large size immediately on the bell ring
                const popScale = Math.min(1.0, starAge / 0.08); // rapid pop-in speed
                const pulse = 1.0 + 0.35 * Math.sin(starAge * 45.0); // very fast pulsing visual warning
                star.scale.setScalar(popScale * pulse * 1.5); // elegant, warning size multiplier
                
                // Spin opposite directions
                const outer = star.getObjectByName("outerStar") as THREE.Mesh;
                const inner = star.getObjectByName("innerStar") as THREE.Mesh;
                if (outer) outer.rotation.z = starAge * 15.0;
                if (inner) inner.rotation.z = -starAge * 22.0;

                // Alternate colors rapidly between yellow and white
                const toggle = Math.floor(starAge * 30.0) % 2 === 0;
                if (outer) {
                  const m = outer.material as THREE.MeshBasicMaterial;
                  m.color.setHex(toggle ? 0xffeb3b : 0xffffff);
                  m.opacity = toggle ? 1.0 : 0.5;
                  m.needsUpdate = true;
                }
                if (inner) {
                  const m = inner.material as THREE.MeshBasicMaterial;
                  m.color.setHex(toggle ? 0xffffff : 0xffeb3b);
                  m.opacity = toggle ? 0.5 : 1.0;
                  m.needsUpdate = true;
                }
              } else {
                // Keep them invisible before the bell is struck
                star.scale.set(0.001, 0.001, 0.001);
              }
            }
          });
        }

        // Trigger yellow-white warning stars and bell sound right before swinging
        if (laserTime >= warningThreshold && !boss.p4LaserBellTriggered) {
          boss.p4LaserBellTriggered = true;
          try {
            const calculatedVolume = (volumeRef.current / 100) * 2.5;

            // Ensure audio engine triggers the sound through the user-unlocked main audio context
            try {
              spookyAudio.playBell(calculatedVolume);
            } catch (ea) {
              console.warn("spookyAudio playBell failed", ea);
            }

            // Play direct bell instances at maximum/boosted volume to output a highly striking, louder warning sound
            for (let i = 0; i < 3; i++) {
              const bell = new Audio('/bell.wav');
              bell.volume = Math.min(1.0, calculatedVolume);
              bell.play().catch(e => console.log(`Failed to play direct bell instance ${i}`, e));
            }
          } catch (e) {
            console.warn("Failed to trigger warning cues", e);
          }
        }
      } else if (laserTime >= warningDuration && laserTime < warningDuration + sweepDuration) {
        // B. SWEEPING FORCEFULLY STAGE: Thickens instantly & sweeps!
        if (setSubtitleVisible) setSubtitleVisible(false);

        // Hide warning star flares instantly when the laser sweeps
        const starCount = 4;
        for (let i = 0; i < starCount; i++) {
          const starL = laserGroup.getObjectByName(`warning_star_l_${i}`) as THREE.Group;
          const starR = laserGroup.getObjectByName(`warning_star_r_${i}`) as THREE.Group;
          if (starL) starL.scale.set(0.001, 0.001, 0.001);
          if (starR) starR.scale.set(0.001, 0.001, 0.001);
        }

        // Drop laser to combat height when sweeping
        laserGroup.position.set(pivotX, 0.5, pivotZ);

        const prog = (laserTime - warningDuration) / sweepDuration; // 0.0 to 1.0

        // In warning load transitions, let's play the BOOM exactly once upon hit
        if (!boss.p4LaserCharged) {
          boss.p4LaserCharged = true;
          try {
            playSynthLaserBoom(80);
            playSynthLaserSweep();
          } catch (e) {}
          triggerCameraShake(4.0, 600);
          
          setNpcDialogue({ 
            text: "{看準時機按F格擋}",
            color: "text-amber-400 font-extrabold text-lg tracking-widest animate-pulse text-center drop-shadow-[0_0_12px_rgba(245,158,11,1)]" 
          });
        }

        // Return scale to full thickness "很粗很長"
        const scalePulse = 1.0 + Math.sin(now * 0.15) * 0.08;
        if (outerMesh) {
          outerMesh.scale.set(scalePulse, scalePulse, 1);
          const mat = outerMesh.material as THREE.MeshBasicMaterial;
          if (mat) {
            mat.opacity = 0.0; // Keep laser transparent
            mat.visible = false;
            mat.needsUpdate = true;
          }
        }
        if (innerMesh) {
          innerMesh.scale.set(scalePulse * 0.9, scalePulse * 0.9, 1);
          const mat = innerMesh.material as THREE.MeshBasicMaterial;
          if (mat) {
            mat.opacity = 0.0; // Keep laser transparent
            mat.visible = false;
            mat.needsUpdate = true;
          }
        }
        if (boneMesh) {
          boneMesh.scale.set(1.0, 1.0, 1.0); // Constant bone arm size during sweep
          const mat = boneMesh.material as THREE.MeshBasicMaterial;
          if (mat) {
            mat.opacity = 1.0; // DO NOT LET lbone.png BECOME TRANSPARENT (Keep fully solid 1.0)
            mat.needsUpdate = true;
          }
        }

        // 2. STRIKE STAGE: Extremely fast sweep (ease-in physics)
        // Adjust start rotation to account for wind-up offset
        const pullBackOffset = currentSide === 'RIGHT_TO_LEFT' ? 0.25 : -0.25;
        const actualStartRad = startRad + pullBackOffset;
        
        // Custom linear strike feel!
        const easeInProg = prog; // Linear sweep
        laserGroup.rotation.y = actualStartRad + easeInProg * (targetRad - actualStartRad);

        // Play sweeping sound effect
        if (Math.floor(laserTime * 10) % 4 === 0) {
          try { playSynthLaserSweep(); } catch (e) {}
        }

        // Damage Player Collision Check:
        const px = playerState.x;
        const pz = playerState.z;

        // Current vector angle
        const angle = laserGroup.rotation.y;
        const dirX = Math.sin(angle);
        const dirZ = Math.cos(angle);

        // Seg length
        const L = 100.0;

        // Projection
        const dx = px - pivotX;
        const dz = pz - pivotZ;
        const tProj = dx * dirX + dz * dirZ;
        const h = Math.max(0, Math.min(L, tProj));

        // Closest point
        const cx = pivotX + h * dirX;
        const cz = pivotZ + h * dirZ;

        // Dist
        const dist = Math.sqrt((px - cx) * (px - cx) + (pz - cz) * (pz - cz));

        const laserRadius = 2.0 * scalePulse; // Uses updated thicker outerRadius
        const playerRadius = playerState.radius || 0.4;

        // Implement high-speed anti-tunneling sweep sector calculation
        const prevLaserTime = Math.max(warningDuration, laserTime - deltaTime);
        const prevProg = (prevLaserTime - warningDuration) / sweepDuration;
        const prevEaseInProg = Math.pow(prevProg, 3);
        const prevAngle = actualStartRad + prevEaseInProg * (targetRad - actualStartRad);
        
        const minAng = Math.min(prevAngle, angle) - 0.05;
        const maxAng = Math.max(prevAngle, angle) + 0.05;
        
        const playerAngle = Math.atan2(dx, dz);
        const playerDistToPivot = Math.sqrt(dx * dx + dz * dz);
        const isSweptInSector = (playerAngle >= minAng && playerAngle <= maxAng) && (playerDistToPivot <= L);

        if (dist < (laserRadius + playerRadius) || isSweptInSector) {
          // Player is within laser beam horizontally!
          // Can they dodge by leaping in mid-air? Ground base is 0.8
          if (playerState.y <= 1.2) {
            const nowTime = performance.now();
            const parryActiveUntil = (stateRef.current as any).parryActiveUntil || 0;
            const invulnUntil = (stateRef.current as any).laserInvulnerabilityUntil || 0;
            
            if (nowTime < parryActiveUntil) {
              if ((boss as any).lastParriedSweepIndex === boss.p4LaserSweepIndex || (boss as any).lastHitSweepIndex === boss.p4LaserSweepIndex) {
                // Prevent duplicate parry triggers on the same sweep (or parrying after being hit) but clear their cooldown so they don't get punished for mashing F
                (stateRef.current as any).parryCooldownUntil = 0;
              } else {
                (boss as any).lastParriedSweepIndex = boss.p4LaserSweepIndex;
                // --- PARRY SUCCESS! ---
                (stateRef.current as any).laserInvulnerabilityUntil = nowTime + 1200;
                (stateRef.current as any).parryFreezeTimeLeft = 0.1;
                
                // Reset failure CD and parrying active status
                (stateRef.current as any).parryCooldownUntil = 0;
                (stateRef.current as any).parryActiveUntil = 0;
                
                if (stateRef.current.stage === HorrorProgression.STAGE_6) {
                    boss.health -= 50; 
                }

                if (fallbackTimeoutRef.current) {
                    clearTimeout(fallbackTimeoutRef.current);
                    fallbackTimeoutRef.current = null;
                }
                
                setParryStatus('READY');
                setParryCdMs(0);
                
                // Spawn beautiful clashing parrysword texture effect on the player's body
                try {
                  spawnParrySwordEffect(playerState.x, playerState.z);
                } catch (e) {
                  console.warn("Failed to spawn parry sword effect:", e);
                }
                
                // Play parry.wav sound element with audio layering for maximum impact and loudness
                try {
                  spookyAudio.playParry();
                  // Overlay a second instance after 12 milliseconds to double the audible volume and power
                  setTimeout(() => {
                    try {
                      spookyAudio.playParry();
                    } catch (e) {}
                  }, 12);
                } catch (e) {
                  console.warn("Error playing parry.wav", e);
                }
                
                // Severe screen rattle / camera shake
                triggerCameraShake(7.0, 600);
                
                // Spawn golden sparks at player's location
                try {
                  spawnParrySparks(playerState.x, playerState.z);
                } catch (e) {
                  console.warn("Failed to spawn sparks:", e);
                }
                
                // Display feedback
                setNpcDialogue({
                  text: "⚡ 完美格擋！(PARRY SUCCESS) ⚡\n你憑藉神速的反應擋下了陳家睿的滅世死光！",
                  color: "text-amber-400 font-extrabold text-base tracking-widest animate-bounce drop-shadow-[0_0_15px_rgba(245,158,11,1)] text-center whitespace-pre-wrap"
                });
                setTimeout(() => setNpcDialogue(null), 2500);
              }
            } else if (nowTime >= invulnUntil) {
              // --- TAKEN DAMAGE ---
              (boss as any).lastHitSweepIndex = boss.p4LaserSweepIndex;
              (stateRef.current as any).laserInvulnerabilityUntil = nowTime + 1200;
                
                if (stateRef.current.stage === HorrorProgression.STAGE_6) {
                  damagePlayerHp(3); // 3 HP heavy damage
                }
                try { spookyAudio.playSquelch(); } catch (e) {}
                triggerCameraShake(4.0, 500);
                
                setNpcDialogue({ 
                  text: "💥 被軌道死光切開重創！ (-3 生命值)", 
                  color: "text-red-600 font-extrabold text-base tracking-wide text-center" 
                });
                setTimeout(() => setNpcDialogue(null), 2000);
              }
            }
          }
      } else if (laserTime >= warningDuration + sweepDuration && laserTime < warningDuration + sweepDuration + fadeDuration) {
        // 3. RECOVERY STAGE: Fade out and subtle follow-through
        laserGroup.position.set(pivotX, 0.5, pivotZ);
        const pFade = (laserTime - (warningDuration + sweepDuration)) / fadeDuration; // 0.0 to 1.0
        
        const followThruOffset = currentSide === 'RIGHT_TO_LEFT' ? -0.15 : 0.15;
        laserGroup.rotation.y = targetRad + pFade * followThruOffset;
        
        // Retract/thin down outer and inner lasers while fading opacity
        const scalePulse = (1.0 - pFade);
        if (outerMesh) {
          outerMesh.scale.set(scalePulse, scalePulse, 1);
          const mat = outerMesh.material as THREE.MeshBasicMaterial;
          if (mat) {
            mat.opacity = 0.0; // Keep laser transparent
            mat.needsUpdate = true;
          }
        }
        if (innerMesh) {
          innerMesh.scale.set(scalePulse, scalePulse, 1);
          const mat = innerMesh.material as THREE.MeshBasicMaterial;
          if (mat) {
            mat.opacity = 0.0; // Keep laser transparent
            mat.needsUpdate = true;
          }
        }
        if (boneMesh) {
          boneMesh.scale.set(1.0, 1.0, 1.0); // Constant bone arm size during fade
          const mat = boneMesh.material as THREE.MeshBasicMaterial;
          if (mat) {
            mat.opacity = 1.0 - pFade; // Smoothly fade out at the end of sweep duration
            mat.needsUpdate = true;
          }
        }
      } else {
        // D. SWEEP TRANSITION FOR 6 TOTAL SWEEPS
        boss.p4LaserSweepIndex = (boss.p4LaserSweepIndex || 0) + 1;

        if (laserGroup) {
          (stateRef.current as any).scene?.remove(laserGroup);
          laserGroup.traverse((child: any) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
              else child.material.dispose();
            }
          });
        }
        boss.sweepingLaserGroup = null;
        boss.p4LaserCharged = false;
        boss.p4LaserBellTriggered = false;
        boss.p4LaserWarningDuration = null;
        boss.p4LaserCurrentSide = null;
        boss.p4LaserRandomZOffset = null;

        const maxSweeps = boss.bossPhase === 'PHASE_5' ? 18 : 6;
        if (boss.p4LaserSweepIndex < maxSweeps) {
          // Reset laser sweep time to begin the next random sweep
          boss.p4LaserTime = 0;
          setNpcDialogue({ 
            text: "{看準時機按F格擋}", 
            color: "text-amber-400 font-extrabold text-lg tracking-widest animate-pulse text-center drop-shadow-[0_0_12px_rgba(245,158,11,1)]" 
          });
          setTimeout(() => setNpcDialogue(null), 1000);
        } else {
          if (boss.bossPhase === 'PHASE_5') {
            boss.bossPhase = 'VULNERABLE_P5';
            setBossPhase('VULNERABLE_P5');
            spookyAudio.playSparkleHint();
            
            setNpcDialogue({ 
              text: "連按 [F] 鍵發動最終淨化斬擊！", 
              color: "text-amber-400 font-extrabold text-xl tracking-widest animate-pulse" 
            });
          } else {
            // Transition directly to Phase 4 BARRAGE bullet streams after completing all 6 sweeps
            boss.p4Stage = 'BARRAGE';
            boss.p4TotalTime = 0; 
            boss.p4LaserPrevWarningDuration = null;
            boss.p4LaserPrevRandomZOffset = null; 
            
            setNpcDialogue({ 
              text: "🔥 艾德加發狂了！全力躲避終極秘術彈幕！", 
              color: "text-amber-500 font-black tracking-wide text-lg animate-pulse" 
            });
            setTimeout(() => setNpcDialogue(null), 3000);
          }
        }
      }

      // ----- GLOBAL COLLISION CHECK FOR RECOVERY AND SWEEP PHASES -----
      const isSweepingPhase = laserTime >= warningDuration && laserTime < warningDuration + sweepDuration;
      const isRecoveryPhase = laserTime >= warningDuration + sweepDuration && laserTime < warningDuration + sweepDuration + fadeDuration/2;
      if (isSweepingPhase || isRecoveryPhase) {
        const px = playerState.x;
        const pz = playerState.z;
        const angle = laserGroup.rotation.y;
        const dirX = Math.sin(angle);
        const dirZ = Math.cos(angle);
        const L = 100.0;
        const dx = px - pivotX;
        const dz = pz - pivotZ;
        const tProj = dx * dirX + dz * dirZ;
        const h = Math.max(0, Math.min(L, tProj));
        const cx = pivotX + h * dirX;
        const cz = pivotZ + h * dirZ;
        const dist = Math.sqrt((px - cx) * (px - cx) + (pz - cz) * (pz - cz));
        
        // Huge radius to ensure touching bone takes damage
        const laserRadius = 3.5; 
        const playerRadius = playerState.radius || 0.4;

        if (dist < (laserRadius + playerRadius)) {
          if (playerState.y <= 1.2) {
            const nowTime = performance.now();
            const invulnUntil = (stateRef.current as any).laserInvulnerabilityUntil || 0;
            if (nowTime >= invulnUntil) {
                (boss as any).lastHitSweepIndex = boss.p4LaserSweepIndex;
                (stateRef.current as any).laserInvulnerabilityUntil = nowTime + 1200;
                if (stateRef.current.stage === HorrorProgression.STAGE_6) {
                  damagePlayerHp(3); // 3 HP heavy damage
                }
                try { spookyAudio.playSquelch(); } catch (e) {}
                triggerCameraShake(4.0, 500);
                
                setNpcDialogue({ 
                  text: "💥 被死光殘骸撕裂重傷！ (-3 生命值)", 
                  color: "text-red-600 font-extrabold text-base tracking-wide text-center" 
                });
                setTimeout(() => setNpcDialogue(null), 2000);
            }
          }
        }
      }
    };

    const clearMatrixStrikes = () => {
      const scene = (stateRef.current as any).scene;
      const boss = stateRef.current.boss;
      const strikes = boss.matrixStrikes || [];
      strikes.forEach((strike: any) => {
        if (strike.lanes) {
          strike.lanes.forEach((lane: any) => {
            if (lane.mesh) {
              scene.remove(lane.mesh);
              if (lane.mesh.geometry) lane.mesh.geometry.dispose();
              if (lane.mesh.material) {
                if (Array.isArray(lane.mesh.material)) lane.mesh.material.forEach((m: any) => m.dispose());
                else lane.mesh.material.dispose();
              }
            }
          });
        }
        if (strike.safeRingMesh) {
          scene.remove(strike.safeRingMesh);
          if (strike.safeRingMesh.geometry) strike.safeRingMesh.geometry.dispose();
          if (strike.safeRingMesh.material) {
            if (Array.isArray(strike.safeRingMesh.material)) strike.safeRingMesh.material.forEach((m: any) => m.dispose());
            else strike.safeRingMesh.material.dispose();
          }
        }
      });
      boss.matrixStrikes = [];
    };

    const updateMatrixStrikes = (deltaTime: number, now: number) => {
      const boss = stateRef.current.boss;
      if (!boss.matrixStrikes) {
        boss.matrixStrikes = [];
      }

      // 1. If currently in IRREGULAR_GRID pattern, spawn a new matrix strike every 3.2 seconds
      const hasMatrix = boss.activePatterns && boss.activePatterns.includes(BarragePattern.IRREGULAR_GRID);
      const isSurvivalPhase = boss.bossPhase && (
        boss.bossPhase.endsWith('_SURVIVAL') || 
        boss.bossPhase === 'STUNNED' || 
        boss.bossPhase === 'PHASE_2' || 
        boss.bossPhase === 'PHASE_3' ||
        boss.bossPhase === 'PHASE_4' ||
        boss.bossPhase === 'PHASE_5'
      );
      if (hasMatrix && isSurvivalPhase) {
        const elapsedSinceLast = now - (boss.lastMatrixStrikeSpawnTime || 0);
        if (elapsedSinceLast >= 3200) {
          boss.lastMatrixStrikeSpawnTime = now;
          spawnMatrixStrikes();
        }
      }

      // 2. Update existing strikes
      const nextStrikes: any[] = [];
      boss.matrixStrikes.forEach((strike: any) => {
        strike.elapsed += deltaTime;

        if (strike.elapsed < 2.5) {
          // Accelerating beeper warning sound during the charging countdown!
          const beepInterval = 0.45 - (strike.elapsed / 2.5) * 0.30;
          const elapsedSinceBeep = strike.elapsed - (strike.lastBeepTime || 0);
          if (elapsedSinceBeep >= beepInterval) {
            strike.lastBeepTime = strike.elapsed;
            playSynthGridWarning(200 + (strike.elapsed / 2.5) * 120);
          }

          // 2.5s charge-up pre-alert: flicker/pulsate opacity to signify impending strike
          const progressRatio = strike.elapsed / 2.5;
          const flashSpeed = 8 + progressRatio * 20; // pulsates faster!
          // oscillate opacity between 0.3 and 0.7
          const opacityVal = 0.35 + Math.sin(strike.elapsed * Math.PI * 2 * (flashSpeed / 4)) * 0.25;

          strike.lanes.forEach((lane: any) => {
            lane.material.opacity = opacityVal;
          });
        } else if (strike.elapsed >= 2.5 && strike.elapsed < 2.8) {
          // Strike triggered!
          if (!strike.strikeTriggered) {
            strike.strikeTriggered = true;

            // Instantly transition to bright red
            strike.lanes.forEach((lane: any) => {
              lane.material.color.setHex(0xff0000);
              lane.material.opacity = 0.95;
            });

            // Play matrix big laser blast sound!
            playSynthLaserBoom(140);

            // Perform collision check
            let isPlayerHit = false;
            const playerWorldPos = new THREE.Vector3(playerState.x, 0.1, playerState.z);

            strike.lanes.forEach((lane: any) => {
              // Transform player coordinate into local space of the rotated plane
              const localPlayer = lane.mesh.worldToLocal(playerWorldPos.clone());
              
              // Plane details: length of 120 (X local [-60, 60]), width of 1.5 (Z local [-0.75, 0.75])
              if (Math.abs(localPlayer.z) <= 0.75 && Math.abs(localPlayer.x) <= 60) {
                isPlayerHit = true;
              }
            });

            if (isPlayerHit) {
              if (stateRef.current.stage === HorrorProgression.STAGE_6) {
                damagePlayerHp(1);
              } else {
                // Damage player: remove 25 sanity
                stateRef.current.sanity = Math.max(0, stateRef.current.sanity - 25);
                setSanity(Math.floor(stateRef.current.sanity));

                spookyAudio.playSquelch();
                spookyAudio.playStinger();

                setNpcDialogue({ 
                  text: "💥 遭交錯雷射矩陣切割重創！ (-25 心智)", 
                  color: "text-red-500 font-black text-sm" 
                });
                setTimeout(() => setNpcDialogue(null), 1500);

                setIsGlitching(true);
                setTimeout(() => setIsGlitching(false), 250);
              }
            } else {
              // Safely dodged!
              spookyAudio.playClick();
            }
          }

          // Random flickering during laser strike frame
          strike.lanes.forEach((lane: any) => {
            lane.material.opacity = 0.7 + Math.random() * 0.25;
          });
        }

        if (strike.elapsed >= 2.8) {
          // GC: dispose geometry and material perfectly to prevent memory leaks
          strike.lanes.forEach((lane: any) => {
            if (lane.mesh) {
              scene.remove(lane.mesh);
              if (lane.mesh.geometry) lane.mesh.geometry.dispose();
              if (lane.mesh.material) {
                if (Array.isArray(lane.mesh.material)) lane.mesh.material.forEach((m: any) => m.dispose());
                else lane.mesh.material.dispose();
              }
            }
          });
          if (strike.safeRingMesh) {
            scene.remove(strike.safeRingMesh);
            if (strike.safeRingMesh.geometry) strike.safeRingMesh.geometry.dispose();
            if (strike.safeRingMesh.material) {
              if (Array.isArray(strike.safeRingMesh.material)) strike.safeRingMesh.material.forEach((m: any) => m.dispose());
              else strike.safeRingMesh.material.dispose();
            }
          }
        } else {
          nextStrikes.push(strike);
        }
      });

      boss.matrixStrikes = nextStrikes;
    };

    const initPrismSniping = () => {
      const boss = stateRef.current.boss;
      boss.prismSnipingState = {
        active: true,
        instances: [] as any[],
        spawnTimer: 0.0,
      };
    };

    const clearPrismSniping = () => {
      const scene = (stateRef.current as any).scene;
      const boss = stateRef.current.boss;
      if (boss.prismSnipingState) {
        const state = boss.prismSnipingState;
        if (state.instances) {
          state.instances.forEach((inst: any) => {
            if (inst.prismMesh) {
              scene.remove(inst.prismMesh);
              inst.prismMesh.traverse((child: any) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                  if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
                  else child.material.dispose();
                }
              });
            }
          });
        }
        boss.prismSnipingState = null;
      }
    };

    const spawnNewPrismSnipingInstance = () => {
      const boss = stateRef.current.boss;
      const state = boss.prismSnipingState;
      if (!state || !state.active) return;

      // =========================================================================
      // 【第六種彈幕：幾何稜鏡重砲狙擊】 模型外觀與亮度參數調整區
      // =========================================================================
      // 調整：根據用戶要求，將第六種彈幕的模型長度調整為 5.5（原 8.0 調整為 5.5，底面半徑 3.0，使整體比例合適更明亮）。
      const PRISM_RADIUS = 3.0;      // 參數：幾何稜鏡底面半徑（原 1.5 -> 現為 3.0，底座寬）
      const PRISM_HEIGHT = 5.5;      // 參數：幾何稜鏡的長度（原 4.0 -> 加大為 8.0 -> 依用戶最新要求調整為 5.5）
      const COLOR_MAIN = 0x00f3ff;     // 參數：幾何稜鏡主體本色（電光霓虹青色）
      const COLOR_EMISSIVE = 0x00aaff; // 參數：幾何稜鏡自發光色彩（電光湛藍）
      const EMISSIVE_INTENSITY = 4.0; // 參數：自發光亮度和強度（原 1.0 -> 現調整為 4.0，實現高光霓虹感）
      const OPACITY_MAIN = 0.95;       // 參數：幾何稜鏡主體透明度（原 0.9 -> 現調整為 0.95，實體感更強）

      // 稜鏡生成的固定長寬邊界 (距離世界中心點的距離)
      const BOUNDS_X = 11;
      const BOUNDS_Z = 11;

      let spawnX = 0;
      let spawnZ = 0;

      // 隨機決定要生在上下邊 (0) 還是 左右邊 (1)
      const side = Math.floor(Math.random() * 2);

      if (side === 0) {
          // 生在 上邊 或 下邊
          spawnX = (Math.random() - 0.5) * (BOUNDS_X * 2); // X 在 -BOUNDS_X 到 BOUNDS_X 之間
          spawnZ = Math.random() > 0.5 ? BOUNDS_Z : -BOUNDS_Z; // Z 鎖死在邊緣
      } else {
          // 生在 左邊 或 右邊
          spawnX = Math.random() > 0.5 ? BOUNDS_X : -BOUNDS_X; // X 鎖死在邊緣
          spawnZ = (Math.random() - 0.5) * (BOUNDS_Z * 2); // Z 在 -BOUNDS_Z 到 BOUNDS_Z 之間
      }

      // 緊貼地板：高度完全貼齊地板 (Y = 0)
      const prismPos = new THREE.Vector3(spawnX, 0, spawnZ);

      // Main Triangular Pyramid Prism
      const prismGeom = new THREE.CylinderGeometry(0, PRISM_RADIUS, PRISM_HEIGHT, 3);
      prismGeom.rotateX(Math.PI / 2);
      const prismMat = new THREE.MeshStandardMaterial({
        color: COLOR_MAIN,
        emissive: COLOR_EMISSIVE,
        emissiveIntensity: EMISSIVE_INTENSITY,
        roughness: 0.1,
        metalness: 0.9,
        transparent: true,
        opacity: OPACITY_MAIN
      });
      const prismMesh = new THREE.Mesh(prismGeom, prismMat);
      prismMesh.position.copy(prismPos);
      prismMesh.lookAt(stateRef.current.player.x, 0, stateRef.current.player.z);
      scene.add(prismMesh);

      // Front-aiming laser emitter point (glowing orb at the pyramid tip)
      // 參數：頂端發光球體半徑（原 0.35 -> 現比例放大至 0.70）
      const TIP_ORB_RADIUS = 0.70;
      const tipOrbGeom = new THREE.SphereGeometry(TIP_ORB_RADIUS, 8, 8);
      const tipOrbMat = new THREE.MeshBasicMaterial({ color: 0xff0033 });
      const tipOrb = new THREE.Mesh(tipOrbGeom, tipOrbMat);
      // 位置：調整至 +Z 的端點 (PRISM_HEIGHT / 2 = 4.0)
      tipOrb.position.set(0, 0, PRISM_HEIGHT / 2);
      prismMesh.add(tipOrb);

      // Pointy direction snout/pointer (Nozzle tip) pointing forward (+Z) so direction is obvious!
      // 參數：前端指向錐體底面半徑與高度（原 0.35, 1.6 -> 現比例放大至 0.70, 3.2）
      const SNOUT_RADIUS = 0.70;
      const SNOUT_HEIGHT = 3.2;
      const snoutGeom = new THREE.ConeGeometry(SNOUT_RADIUS, SNOUT_HEIGHT, 4);
      snoutGeom.rotateX(Math.PI / 2); // align pointing towards +Z
      const snoutMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
      const snout = new THREE.Mesh(snoutGeom, snoutMat);
      // 位置：延伸出發光球體頂端（PRISM_HEIGHT/2 + SNOUT_HEIGHT/2 = 4.0 + 1.6 = 5.6）
      snout.position.set(0, 0, (PRISM_HEIGHT / 2) + (SNOUT_HEIGHT / 2)); 
      prismMesh.add(snout);

      // Backplate platform frame at the flat base of the pyramid
      // 參數：後側底座框架尺寸與位移（原 1.6, 1.8, 0.4 -> 現比例放大至 3.2, 3.6, 0.8）
      const BASE_R1 = 3.2;
      const BASE_R2 = 3.6;
      const BASE_HEIGHT = 0.8;
      const baseGeom = new THREE.CylinderGeometry(BASE_R1, BASE_R2, BASE_HEIGHT, 3);
      baseGeom.rotateX(Math.PI / 2);
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.6,
        metalness: 0.8
      });
      const baseMesh = new THREE.Mesh(baseGeom, baseMat);
      // 位置：調整至 -Z 的底座邊緣（-PRISM_HEIGHT/2 - BASE_HEIGHT/2 = -4.0 - 0.4 = -4.4，原設定略偏外即 -4.2）
      baseMesh.position.set(0, 0, -(PRISM_HEIGHT / 2) - (BASE_HEIGHT / 2));
      prismMesh.add(baseMesh);

      scene.add(prismMesh);

      // LOOKAT ONCE AND ONLY ONCE DURING SPAWN GAME EVENT
      // Aim horizontal to match exact ground plane heights (Y = 0) perfectly
      prismMesh.lookAt(playerState.x, 0, playerState.z);

      // Freeze snapshot direction along localized positive Z axis
      const snapDir = new THREE.Vector3(0, 0, 1).applyQuaternion(prismMesh.quaternion).normalize();

      // 參數：傳送、蓄能音效音量 & 起始音頻
      playSynthLaserCharge(300);

      state.instances.push({
         id: Math.random(),
         age: 0,
         stage: 'WARNING',
         prismMesh: prismMesh,
         tipOrb: tipOrb,
         snout: snout,
         laserMesh: null as THREE.Mesh | null,
         innerLaserMesh: null as THREE.Mesh | null,
         prismPos: prismPos,
         laserDir: snapDir,
      });
    };

    const checkSinglePrismCollision = (inst: any, now: number) => {
      const A = inst.prismPos;
      const D = inst.laserDir;
      if (!D) return;

      const pX = playerState.x;
      const pZ = playerState.z;

      const vX = pX - A.x;
      const vZ = pZ - A.z;

      const t = vX * D.x + vZ * D.z;
      const tClamped = Math.max(0, Math.min(150, t));

      const nearestX = A.x + tClamped * D.x;
      const nearestZ = A.z + tClamped * D.z;

      const dX = pX - nearestX;
      const dZ = pZ - nearestZ;
      const distSq = dX * dX + dZ * dZ;

      // ==========================================
      // 【第六種彈幕：幾何稜鏡重砲狙擊 碰撞判定與受擊效果】
      // ==========================================
      // 參數：雷射光束的判定物理寬度
      // 調整：依用戶要求，雷射變細一點點點點，由 3.0 變更為 2.2
      const thresholdRadius = 2.2 + playerState.radius; // 符合重砲雷射束 2.2 單位的粗細
      if (distSq < thresholdRadius * thresholdRadius) {
        const invulnUntil = (stateRef.current as any).laserInvulnerabilityUntil || 0;
        if (now >= invulnUntil) {
          (stateRef.current as any).laserInvulnerabilityUntil = now + 1000; // 1秒無敵時間
          
          if (stateRef.current.stage === HorrorProgression.STAGE_6) {
            damagePlayerHp(2); // 扣血量
          } else {
            stateRef.current.sanity = Math.max(0, stateRef.current.sanity - 35);
            setSanity(Math.floor(stateRef.current.sanity));
          }

          if (stateRef.current.stage !== HorrorProgression.STAGE_6) { 
              spookyAudio.playSquelch();
              spookyAudio.playStinger();
          }

          // 調整：根據用戶要求，被第六種彈幕打到的時候【不要有任何的畫面出現在螢幕前】（取消全螢幕閃屏 & 特效）
          // 註：在此註銷 setIsGlitching 的調用，使得玩家被打到時不會出現 SYSTEM ERROR Fullscreen Glitch Overlay。
          // setIsGlitching(true);
          // setTimeout(() => setIsGlitching(false), 250);
        }
      }
    };

    const updatePrismSniping = (deltaTime: number, now: number) => {
      const boss = stateRef.current.boss;
      const state = boss.prismSnipingState;
      if (!state || !state.active) return;

      // Stream manager generator: spawn a new prism instance every 1.0s overlapped as requested
      state.spawnTimer = (state.spawnTimer || 0) + deltaTime;
      if (state.spawnTimer >= 1.0) {
        state.spawnTimer = 0;
        spawnNewPrismSnipingInstance();
      }

      const nextInstances: any[] = [];
      state.instances.forEach((inst: any) => {
        inst.age += deltaTime;

        if (inst.age >= 2.5) {
          // Dispose and remove 2.5s life cycle end
          if (inst.prismMesh) {
            scene.remove(inst.prismMesh);
            inst.prismMesh.traverse((child: any) => {
              if (child.geometry) child.geometry.dispose();
              if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
                else child.material.dispose();
              }
            });
          }
        } else {
          nextInstances.push(inst);

          const instAge = inst.age;
          if (instAge < 2.0) {
            // WARNING Charging Phase (0.0s to 2.0s): Blinking emitter values, absolutely NO thin warning lines!
            if (inst.prismMesh && inst.prismMesh.material) {
              const mat = inst.prismMesh.material as THREE.MeshStandardMaterial;
              const flashFreq = 0.05 + (instAge / 2.0) * 0.15;
              const tFlash = Math.sin(now * flashFreq) > 0;
              mat.color.setHex(tFlash ? 0xff0033 : 0x3b82f6);
              mat.emissive.setHex(tFlash ? 0xaa0022 : 0x1d4ed8);
              mat.needsUpdate = true;
            }
            if (inst.tipOrb && inst.tipOrb.material) {
              const mat = inst.tipOrb.material as THREE.MeshBasicMaterial;
              const sizePulse = 1.0 + 0.8 * (instAge / 2.0) * Math.abs(Math.sin(now * 0.08));
              inst.tipOrb.scale.set(sizePulse, sizePulse, sizePulse);
              const pulseRed = Math.sin(now * 0.05) > 0;
              mat.color.setHex(pulseRed ? 0xff0000 : 0xffaa00);
            }
          } else {
            // FIRING Phase (2.0s to 2.5s)
            if (inst.stage === 'WARNING') {
              inst.stage = 'FIRING';

              // Instantly shoot very thick red laser beam
              const laserLength = 150;
              // 調整：依用戶要求，第六種彈幕雷射變細一點點點點（3.0 -> 2.2）
              const laserRadius = 2.2; 

              const laserGeom = new THREE.CylinderGeometry(laserRadius, laserRadius, laserLength, 16);
              laserGeom.rotateX(Math.PI / 2);
              const laserMat = new THREE.MeshBasicMaterial({
                color: 0xff0033,
                transparent: true,
                opacity: 0.9
              });
              const laserMesh = new THREE.Mesh(laserGeom, laserMat);
              laserMesh.position.set(0, 0, laserLength / 2);
              inst.prismMesh.add(laserMesh);
              inst.laserMesh = laserMesh;

              // 調整：內部白色雷射光柱也等比例變細（1.0 -> 0.7）
              const innerGeom = new THREE.CylinderGeometry(0.7, 0.7, laserLength, 16);
              innerGeom.rotateX(Math.PI / 2);
              const innerMat = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.95
              });
              const innerMesh = new THREE.Mesh(innerGeom, innerMat);
              innerMesh.position.set(0, 0, laserLength / 2);
              inst.prismMesh.add(innerMesh);
              inst.innerLaserMesh = innerMesh;

              playSynthLaserBoom(120);
              triggerCameraShake(2.0, 400); // Earthshaking rumble but NO fullscreen white flash!
            }

            if (inst.stage === 'FIRING') {
              if (inst.laserMesh) {
                const scalePulse = 0.95 + Math.sin(now * 0.1) * 0.05;
                inst.laserMesh.scale.set(scalePulse, scalePulse, 1);
              }
              checkSinglePrismCollision(inst, now);
            }
          }
        }
      });

      state.instances = nextInstances;
    };

    const createExclamationSprite = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = 'bold 96px Arial, Helvetica, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ff0000';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 10;
        ctx.strokeText('❗️', 64, 64);
        ctx.fillText('❗️', 64, 64);
      }
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(7, 7, 1);
      return sprite;
    };

    const initTripleLaneBlast = () => {
      const boss = stateRef.current.boss;
      boss.tripleLaneBlastState = {
        active: true,
        state: 'COOLDOWN',
        timer: 0.5,
        lanes: [] as any[],
      };
    };

    const clearTripleLaneBlast = () => {
      const scene = (stateRef.current as any).scene;
      const boss = stateRef.current.boss;
      if (boss.tripleLaneBlastState) {
        const state = boss.tripleLaneBlastState;
        if (state.lanes) {
          state.lanes.forEach((lane: any) => {
            if (lane.warningMesh) {
              scene.remove(lane.warningMesh);
              if (lane.warningMesh.geometry) lane.warningMesh.geometry.dispose();
              if (lane.warningMesh.material) {
                if (Array.isArray(lane.warningMesh.material)) lane.warningMesh.material.forEach((m: any) => m.dispose());
                else lane.warningMesh.material.dispose();
              }
            }
            if (lane.spriteMesh) {
              scene.remove(lane.spriteMesh);
              if (lane.spriteMesh.material && lane.spriteMesh.material.map) {
                lane.spriteMesh.material.map.dispose();
              }
              if (lane.spriteMesh.material) {
                lane.spriteMesh.material.dispose();
              }
            }
            if (lane.laserMesh) {
              scene.remove(lane.laserMesh);
              if (lane.laserMesh.geometry) lane.laserMesh.geometry.dispose();
              if (lane.laserMesh.material) {
                if (Array.isArray(lane.laserMesh.material)) lane.laserMesh.material.forEach((m: any) => m.dispose());
                else lane.laserMesh.material.dispose();
              }
            }
          });
        }
        boss.tripleLaneBlastState = null;
      }
    };

    const spawnNewTripleLaneBlast = () => {
      const boss = stateRef.current.boss;
      const state = boss.tripleLaneBlastState;
      if (!state) return;

      // Calculate the boundaries of the play arena dynamically from bossArenaFloor or standard layout
      const heightY = 38.0;
      const fovRad = 65 * Math.PI / 180;
      const vHeight = 2 * heightY * Math.tan(fovRad / 2);
      const zBottom = 12.5 + vHeight / 2;

      let minX = -7.5;
      let maxX = 7.5;
      let minZ = zBottom - 15.0;
      let maxZ = zBottom;

      const floor = scene.getObjectByName("bossArenaFloor") as THREE.Mesh;
      if (floor && floor.geometry) {
        floor.geometry.computeBoundingBox();
        const geomBox = floor.geometry.boundingBox;
        if (geomBox) {
          const width = geomBox.max.x - geomBox.min.x;
          const depth = geomBox.max.y - geomBox.min.y; // Geometry is Plane, so Y is depth before rotation
          minX = floor.position.x - width / 2;
          maxX = floor.position.x + width / 2;
          minZ = floor.position.z - depth / 2;
          maxZ = floor.position.z + depth / 2;
        }
      }

      const totalWidth = maxX - minX;
      const totalDepth = maxZ - minZ;
      const laneWidth = totalWidth / 3;

      const laneConfigs = [
        { index: 0, centerX: minX + laneWidth * 0.5, name: "Left Lane" },
        { index: 1, centerX: minX + laneWidth * 1.5, name: "Middle Lane" },
        { index: 2, centerX: minX + laneWidth * 2.5, name: "Right Lane" }
      ];

      // Randomly select 1 or 2 lanes to become dangerous zones (1 or 2 indices)
      const numDangerous = Math.random() < 0.5 ? 1 : 2;
      const shuffled = [...laneConfigs].sort(() => Math.random() - 0.5);
      const selectedLanes = shuffled.slice(0, numDangerous);

      state.lanes = selectedLanes.map((cfg) => {
        // Warning Mesh: flat plane laying on the floor, perfectly covered inside limits
        // 調整：依用戶要求，驚嘆號時只需要有「白色的框框顯示區域」，紅色的才是有傷害的雷射
        const geom = new THREE.PlaneGeometry(laneWidth, totalDepth);
        geom.rotateX(-Math.PI / 2);
        const edges = new THREE.EdgesGeometry(geom);
        const warningMesh = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 })
        );
        warningMesh.position.set(cfg.centerX, 0.05, minZ + totalDepth / 2);
        scene.add(warningMesh);

        // UI: Sprite exclamation mark at center of lane within limits
        const spriteMesh = createExclamationSprite();
        spriteMesh.position.set(cfg.centerX, 2.5, minZ + totalDepth / 2);
        scene.add(spriteMesh);

        return {
          index: cfg.index,
          centerX: cfg.centerX,
          width: laneWidth,
          warningMesh,
          spriteMesh,
          laserMesh: null as THREE.Mesh | null,
        };
      });

      state.state = 'WARNING';
      state.timer = 1.2;

      playSynthGridWarning(185);
    };

    const fireTripleLaneBlast = () => {
      const boss = stateRef.current.boss;
      const state = boss.tripleLaneBlastState;
      if (!state) return;

      // Calculate the boundaries of the play arena dynamically
      const heightY = 38.0;
      const fovRad = 65 * Math.PI / 180;
      const vHeight = 2 * heightY * Math.tan(fovRad / 2);
      const zBottom = 12.5 + vHeight / 2;

      let minZ = zBottom - 15.0;
      let maxZ = zBottom;

      const floor = scene.getObjectByName("bossArenaFloor") as THREE.Mesh;
      if (floor && floor.geometry) {
        floor.geometry.computeBoundingBox();
        const geomBox = floor.geometry.boundingBox;
        if (geomBox) {
          const depth = geomBox.max.y - geomBox.min.y;
          minZ = floor.position.z - depth / 2;
          maxZ = floor.position.z + depth / 2;
        }
      }
      const totalDepth = maxZ - minZ;

      state.lanes.forEach((lane: any) => {
        if (lane.warningMesh) {
          scene.remove(lane.warningMesh);
          if (lane.warningMesh.geometry) lane.warningMesh.geometry.dispose();
          if (lane.warningMesh.material) {
            if (Array.isArray(lane.warningMesh.material)) lane.warningMesh.material.forEach((m: any) => m.dispose());
            else lane.warningMesh.material.dispose();
          }
          lane.warningMesh = null;
        }
        if (lane.spriteMesh) {
          scene.remove(lane.spriteMesh);
          if (lane.spriteMesh.material && lane.spriteMesh.material.map) {
            lane.spriteMesh.material.map.dispose();
          }
          if (lane.spriteMesh.material) {
            lane.spriteMesh.material.dispose();
          }
          lane.spriteMesh = null;
        }

        // Spawn a bright ground-filling red energy flat mesh instead of a vertical laser column
        // Width: lane.width, height: 0.1 (low-lying flat ground-filling slab), depth: totalDepth
        const beamGeo = new THREE.BoxGeometry(lane.width, 0.1, totalDepth);
        const beamMat = new THREE.MeshBasicMaterial({
          color: 0xff0022, // Glowing neon scarlet red
          transparent: true,
          opacity: 0.95,
        });
        const laserMesh = new THREE.Mesh(beamGeo, beamMat);
        // Positioned flush with the ground inside the play zone
        laserMesh.position.set(lane.centerX, 0.05, minZ + totalDepth / 2);
        scene.add(laserMesh);
        lane.laserMesh = laserMesh;
      });

      state.state = 'BLAST';
      state.timer = 0.8;

      playSynthLaserBoom(95);
      triggerCameraShake(3.0, 800);
      // Removed full screen white flash according to user request
      // triggerScreenFlash(4);
    };

    const checkTripleLaneBlastCollision = (now: number) => {
      const boss = stateRef.current.boss;
      const state = boss.tripleLaneBlastState;
      if (!state || state.state !== 'BLAST') return;

      const pX = playerState.x;
      const pZ = playerState.z;

      // Get boundaries dynamically from the same-level logic
      const heightY = 38.0;
      const fovRad = 65 * Math.PI / 180;
      const vHeight = 2 * heightY * Math.tan(fovRad / 2);
      const zBottom = 12.5 + vHeight / 2;

      let minX = -7.5;
      let maxX = 7.5;
      let minZ = zBottom - 15.0;
      let maxZ = zBottom;

      const floor = scene.getObjectByName("bossArenaFloor") as THREE.Mesh;
      if (floor && floor.geometry) {
        floor.geometry.computeBoundingBox();
        const geomBox = floor.geometry.boundingBox;
        if (geomBox) {
          const width = geomBox.max.x - geomBox.min.x;
          const depth = geomBox.max.y - geomBox.min.y;
          minX = floor.position.x - width / 2;
          maxX = floor.position.x + width / 2;
          minZ = floor.position.z - depth / 2;
          maxZ = floor.position.z + depth / 2;
        }
      }

      state.lanes.forEach((lane: any) => {
        const halfWidth = lane.width / 2;
        const leftBound = lane.centerX - halfWidth;
        const rightBound = lane.centerX + halfWidth;

        // Player touches lane bounds on X and Z axis strictly within boundaries
        const xOverlaps = pX >= leftBound - playerState.radius && pX <= rightBound + playerState.radius;
        const zOverlaps = pZ >= minZ - playerState.radius && pZ <= maxZ + playerState.radius;

        if (xOverlaps && zOverlaps) {
          const invulnUntil = (stateRef.current as any).laserInvulnerabilityUntil || 0;
          if (now >= invulnUntil) {
            (stateRef.current as any).laserInvulnerabilityUntil = now + 1000;
            
            // ==========================================
            // 【第七種彈幕：自適應三軌雷射轟炸 碰撞傷害參數】
            // ==========================================
            // 參數：被打到時扣減的 HP 血量 (BOSS 戰) 或 Sanity 精神值 (迷宮階段)
            const DAMAGE_HP = 3;        // 參數：BOSS 戰扣減 HP (3 滴血)
            const DAMAGE_SANITY = 45;   // 參數：迷宮階段扣減精神值 (45 點)

            if (stateRef.current.stage === HorrorProgression.STAGE_6) {
              damagePlayerHp(DAMAGE_HP);
            } else {
              stateRef.current.sanity = Math.max(0, stateRef.current.sanity - DAMAGE_SANITY);
              setSanity(Math.floor(stateRef.current.sanity));
            }

            if (stateRef.current.stage !== HorrorProgression.STAGE_6) {
              spookyAudio.playSquelch();
              spookyAudio.playStinger();
            }

            // 調整：根據用戶要求，被第七種彈幕打到的時候【不要有任何的畫面出現在螢幕前】（取消全螢幕閃屏 & 特效）
            // 註：在此註銷 setIsGlitching 的調用，使得玩家被打到時不會出現 SYSTEM ERROR Fullscreen Glitch Overlay。
            // setIsGlitching(true);
            // setTimeout(() => setIsGlitching(false), 250);
          }
        }
      });
    };

    const destroyTripleLaneBlastAndCooldown = () => {
      const boss = stateRef.current.boss;
      const state = boss.tripleLaneBlastState;
      if (!state) return;

      state.lanes.forEach((lane: any) => {
        if (lane.laserMesh) {
          scene.remove(lane.laserMesh);
          if (lane.laserMesh.geometry) lane.laserMesh.geometry.dispose();
          if (lane.laserMesh.material) {
            if (Array.isArray(lane.laserMesh.material)) lane.laserMesh.material.forEach((m: any) => m.dispose());
            else lane.laserMesh.material.dispose();
          }
          lane.laserMesh = null;
        }
      });

      state.lanes = [];
      state.state = 'COOLDOWN';
      state.timer = 0.5;
    };

    const updateTripleLaneBlast = (deltaTime: number, now: number) => {
      const boss = stateRef.current.boss;
      const state = boss.tripleLaneBlastState;
      if (!state || !state.active) return;

      state.timer -= deltaTime;

      if (state.state === 'COOLDOWN') {
        if (state.timer <= 0) {
          spawnNewTripleLaneBlast();
        }
      } else if (state.state === 'WARNING') {
        state.lanes.forEach((lane: any) => {
          if (lane.warningMesh && lane.warningMesh.material) {
            const ratio = Math.max(0, state.timer / 1.2);
            (lane.warningMesh.material as any).opacity = 0.2 + 0.3 * (Math.sin(now * 0.02) + 1.0) * (1.2 - ratio);
            lane.warningMesh.material.needsUpdate = true;
          }
          if (lane.spriteMesh) {
            const bounce = 6.0 + Math.sin(now * 0.015) * 1.0;
            lane.spriteMesh.scale.set(bounce, bounce, 1);
          }
        });

        if (state.timer <= 0) {
          fireTripleLaneBlast();
        }
      } else if (state.state === 'BLAST') {
        state.lanes.forEach((lane: any) => {
          if (lane.laserMesh && lane.laserMesh.material) {
            (lane.laserMesh.material as any).opacity = 0.75 + Math.random() * 0.2;
            lane.laserMesh.material.needsUpdate = true;
          }
        });

        checkTripleLaneBlastCollision(now);

        if (state.timer <= 0) {
          destroyTripleLaneBlastAndCooldown();
        }
      }
    };

    const setupFinalRoom = () => {
      // Create a 50x50 empty room using the maze generation mechanism,
      // or directly placing walls. Let's just generate a big empty maze.
      const sizeW = config.width;
      const sizeH = config.height;
      const newGrid = Array(sizeH).fill(0).map(() => Array(sizeW).fill(0));
      for (let i = 0; i < sizeH; i++) {
        for (let j = 0; j < sizeW; j++) {
          if (i === 0 || i === sizeH - 1 || j === 0 || j === sizeW - 1) {
            newGrid[i][j] = 1;
          } else {
            newGrid[i][j] = 0;
          }
        }
      }

      stateRef.current.mazeGrid = newGrid;

      // Update Wall Meshes Visibility and Collisions
      stateRef.current.wallBoxes.length = 0;
      const wallMeshesMap = stateRef.current.wallMeshesMap;
      if (wallMeshesMap) {
        // Clear all old walls in map (set invisible)
        Object.values(wallMeshesMap).forEach((mesh: THREE.Mesh) => {
          mesh.visible = false;
        });

        // Instantiate new layout
        for (let i = 0; i < sizeH; i++) {
          for (let j = 0; j < sizeW; j++) {
            if (newGrid[i][j] === 1) {
              const key = `final_${j},${i}`;
              let currentWall = wallMeshesMap[key];
              if (!currentWall) {
                const geom = new THREE.BoxGeometry(2, 40, 2);
                const loader = new THREE.TextureLoader();
                const tex = loader.load(wall3Url);
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(1, 20);
                const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0x555555, roughness: 0.9 });
                currentWall = new THREE.Mesh(geom, mat);
                currentWall.position.set(j * 2, 20.0, i * 2);
                scene.add(currentWall);
                wallMeshesMap[key] = currentWall;
              }
              currentWall.visible = true;
              const box = new THREE.Box3().setFromObject(currentWall);
              stateRef.current.wallBoxes.push(box);
            }
          }
        }
      }

      // Position player at the edge facing center
      const centerPosX = 40;
      const centerPosZ = 40;
      
      const edgeX = 4; // Safely near inner edge wall (index=2)
      const edgeZ = centerPosZ;
      
      const camera = (stateRef.current as any).camera;
      if (camera) {
        camera.position.set(edgeX, 1.0, edgeZ);
        // Point angle towards center correctly across axes
        const dx = centerPosX - edgeX;
        const dz = centerPosZ - edgeZ;
        // In this app, render rotation is angle + Math.PI.
        // We want rotation.y = Math.atan2(-dx, -dz)
        stateRef.current.player.angle = Math.atan2(-dx, -dz) - Math.PI;
      }
      stateRef.current.player.x = edgeX;
      stateRef.current.player.z = edgeZ;
      stateRef.current.player.pitch = 0.5; // Look slightly up towards jerry
      
      // Cleanup boss
      const boss = scene.getObjectByName("mainBoss");
      if (boss) boss.visible = false;
      const floor = scene.getObjectByName("bossArenaFloor");
      if (floor) floor.visible = false;
      const dFloor = scene.getObjectByName("defaultFloor");
      const dCeil = scene.getObjectByName("defaultCeil");
      if (dFloor) dFloor.visible = true;
      if (dCeil) {
        dCeil.visible = true;
        dCeil.position.y = 40.0;
      }

      // Change background/music back
      spookyAudio.stopAmbient();
      spookyAudio.playTung();
      scene.background = new THREE.Color(0x0a0a0a);
      scene.fog = new THREE.Fog(0x0a0a0a, 2, 80);

      // --- FINAL ROOM SPECIAL EFFECTS ---
      // 1. Lots of Gold/White Flashes and Lights
      const beamGeom = new THREE.CylinderGeometry(2.5, 2.5, 40, 32);
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xffeebb, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
      const beam = new THREE.Mesh(beamGeom, beamMat);
      beam.position.set(centerPosX, 20.0, centerPosZ);
      scene.add(beam);
      stateRef.current.finalBeam = beam; // To rotate it in update loop

      const beamLight = new THREE.PointLight(0xffdf80, 4.0, 50);
      beamLight.position.set(centerPosX, 3.0, centerPosZ);
      scene.add(beamLight);
      
      const ambientGoldLight = new THREE.PointLight(0xffffff, 2.0, 80);
      ambientGoldLight.position.set(centerPosX, 20.0, centerPosZ);
      scene.add(ambientGoldLight);

      // Create 3D star sparkle effects around the center
      const starsGroup = new THREE.Group();
      starsGroup.position.set(centerPosX, 0, centerPosZ);
      scene.add(starsGroup);
      stateRef.current.finalStarsGroup = starsGroup;

      for (let i = 0; i < 30; i++) {
        // Simple star shape using two crossed planes or just thin cylinders
        const starGeom = new THREE.PlaneGeometry(0.5, 0.5);
        const starMat = new THREE.MeshBasicMaterial({ color: 0xffeebb, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
        const star = new THREE.Mesh(starGeom, starMat);
        
        star.position.set(
          (Math.random() - 0.5) * 6,
          Math.random() * 30, // From floor to high up
          (Math.random() - 0.5) * 6
        );
        star.rotation.z = Math.random() * Math.PI;
        star.rotation.y = Math.random() * Math.PI;
        
        // Random scale animation offsets
        star.userData = {
          speed: 1.0 + Math.random() * 2.0,
          offset: Math.random() * Math.PI * 2,
          baseScale: 0.5 + Math.random() * 1.5,
          spinSpeed: (Math.random() - 0.5) * 2.0
        };
        starsGroup.add(star);
      }

      // 2. The 6th Item (Jerry) slowly floating down from above
      const loader = new THREE.TextureLoader();
      const jerryTex = loader.load('/jerry.jpg');
      const itemGeom = new THREE.PlaneGeometry(1.5, 1.5);
      const itemMat = new THREE.MeshBasicMaterial({ map: jerryTex, transparent: true, side: THREE.DoubleSide });
      const jerryItem = new THREE.Mesh(itemGeom, itemMat);
      
      // Start very high above the player out of reach
      jerryItem.position.set(centerPosX, 40.0, centerPosZ);
      jerryItem.userData = { isJerry: true };
      scene.add(jerryItem);
      
      stateRef.current.finalJerryItem = jerryItem;
    };

    const setupTrueFinalRoom = () => {
      const sceneObject = (stateRef.current as any).scene;
      
      // Clean up previous final room objects
      const beam = stateRef.current.finalBeam;
      if (beam && sceneObject) sceneObject.remove(beam);
      const starsGroup = stateRef.current.finalStarsGroup;
      if (starsGroup && sceneObject) sceneObject.remove(starsGroup);
      
      // Clear old walls
      const wallMeshesMap = stateRef.current.wallMeshesMap;
      if (wallMeshesMap) {
        Object.values(wallMeshesMap).forEach((mesh: THREE.Mesh) => {
          mesh.visible = false;
        });
      }
      stateRef.current.wallBoxes.length = 0;

      const sizeW = 4;
      const sizeH = 4;
      const wallHeight = 2;
      
      const loader = new THREE.TextureLoader();
      const finalTex = loader.load('/final.png');
      finalTex.wrapS = THREE.RepeatWrapping;
      finalTex.wrapT = THREE.RepeatWrapping;

      for (let i = 0; i < sizeH; i++) {
        for (let j = 0; j < sizeW; j++) {
          if (i === 0 || i === sizeH - 1 || j === 0 || j === sizeW - 1) {
            const key = `true_final_${j},${i}`;
            const geom = new THREE.BoxGeometry(2, wallHeight, 2);
            
            const useTex = finalTex.clone();
            useTex.repeat.set(1, wallHeight / 2);
            useTex.needsUpdate = true;
            
            const mat = new THREE.MeshStandardMaterial({ map: useTex, roughness: 0.9, color: 0xffffff });
            const currentWall = new THREE.Mesh(geom, mat);
            currentWall.position.set(j * 2, wallHeight / 2, i * 2);
            sceneObject.add(currentWall);
            wallMeshesMap[key] = currentWall;
            
            stateRef.current.wallBoxes.push({
              minX: j * 2 - 1,
              maxX: j * 2 + 1,
              minZ: i * 2 - 1,
              maxZ: i * 2 + 1
            });
          }
        }
      }
      
      // Create a floor & ceiling for this room so it doesn't look completely empty if they look down
      const floorGeom = new THREE.PlaneGeometry(sizeW * 2, sizeH * 2);
      const ceilGeom = new THREE.PlaneGeometry(sizeW * 2, sizeH * 2);

      const fTex = finalTex.clone();
      fTex.repeat.set(sizeW / 2, sizeH / 2);
      fTex.needsUpdate = true;
      const fMat = new THREE.MeshStandardMaterial({ map: fTex, color: 0xffffff });
      
      const tfFloor = new THREE.Mesh(floorGeom, fMat);
      tfFloor.rotation.x = -Math.PI / 2;
      tfFloor.position.set((sizeW * 2) / 2 - 1, 0, (sizeH * 2) / 2 - 1);
      sceneObject.add(tfFloor);
      
      const tfCeil = new THREE.Mesh(ceilGeom, fMat);
      tfCeil.rotation.x = Math.PI / 2;
      tfCeil.position.set((sizeW * 2) / 2 - 1, wallHeight, (sizeH * 2) / 2 - 1);
      sceneObject.add(tfCeil);

      // Hide the global floors, ceilings
      const dFloor = sceneObject.getObjectByName("defaultFloor");
      const dCeil = sceneObject.getObjectByName("defaultCeil");
      if (dFloor) dFloor.visible = false;
      if (dCeil) dCeil.visible = false;

      // Move player into middle of 15x15 room
      const px = Math.floor(sizeW / 2) * 2;
      const pz = Math.floor(sizeH / 2) * 2;
      stateRef.current.player.x = px;
      stateRef.current.player.z = pz;
      
      const camera = (stateRef.current as any).camera;
      if (camera) {
        camera.position.set(px, 1.0, pz);
      }
      
      // Clear lighting
      const lights = sceneObject.children.filter((c: any) => c.isLight);
      lights.forEach((l: any) => sceneObject.remove(l));
      
      // Add bright ambient light and a point light
      const dimLight = new THREE.AmbientLight(0xffffff, 2.0);
      sceneObject.add(dimLight);
      
      const pLight = new THREE.PointLight(0xffffff, 3.0, 50);
      pLight.position.set(px, 5.0, pz);
      sceneObject.add(pLight);
      
      // Force white background/fog
      sceneObject.background = new THREE.Color(0xffffff);
      sceneObject.fog = new THREE.Fog(0xffffff, 5, 40);
    };

    const setupBossFight = () => {
      const boss = stateRef.current.boss;
      const ghostState = stateRef.current.ghost;
      
      boss.playerHp = 40;
      setBossPlayerHp(40);

      const npcSprite = (stateRef.current as any).npcSprite;
      if (npcSprite) {
        npcSprite.visible = false;
      }
      stateRef.current.isTalking = false;
      setIsTalking(false);
      setNpcDialogue(null);
      
      boss.status = BossStageStatus.P1_NORMAL;
      boss.health = 1000;
      boss.isInvulnerable = false;
      boss.eyeballs = [];
      boss.adds = [];
      boss.hazards = [];
      boss.hasCollectedCore = false;
      boss.hasBeenAttacked = false;
      boss.phaseIndex = 1;
      boss.activePatterns = [BarragePattern.RED_BULLETS];
      setHasCollectedCoreUI(false);
      
      // Clean up previous bullets
      if (boss.normalBullets) {
        boss.normalBullets.forEach(b => {
          scene.remove(b.mesh);
          b.mesh.geometry.dispose();
          if (Array.isArray(b.mesh.material)) {
            b.mesh.material.forEach(m => m.dispose());
          } else {
            b.mesh.material.dispose();
          }
        });
      }
      boss.normalBullets = [];
      boss.bulletMode = 'SPIRAL';
      boss.spiralAngle = 0;
      boss.lastSpiralShootTime = 0;
      boss.lastBulletShootTime = 0;

      clearLasers();
      clearOrbitalStrikes();
      clearMatrixStrikes();
      clearPrismSniping();
      clearTripleLaneBlast();
      (stateRef.current as any).lastParryAttemptTime = 0;
      (stateRef.current as any).boss.lastOrbitalStrikeSpawnTime = 0;
      (stateRef.current as any).boss.lastMatrixStrikeSpawnTime = 0;
      (stateRef.current as any).laserInvulnerabilityUntil = 0;

      // Clean up previous stunCore if any
      if (boss.stunCore) {
        scene.remove(boss.stunCore);
        if (boss.stunCore.geometry) boss.stunCore.geometry.dispose();
        if (Array.isArray(boss.stunCore.material)) {
          boss.stunCore.material.forEach(m => m.dispose());
        } else if (boss.stunCore.material) {
          boss.stunCore.material.dispose();
        }
        boss.stunCore = null;
      }

      // Initialize Survival Mode states
      boss.bossPhase = 'COUNTDOWN';
      boss.countdownTime = 3.0;
      boss.p1TotalTime = 0;
      boss.sequenceIndex = 0;
      boss.currentPattern = BarragePattern.RED_BULLETS;
      boss.patternDuration = 0; 
      
      setBossPhase('COUNTDOWN');
      setCountdownTime(3.0);
      setBossTimeLeft(40);
      
      stateRef.current.stage = HorrorProgression.STAGE_6;
      setCurrentStageUI(HorrorProgression.STAGE_6);
      ghostState.active = false;
      ghostGroup.visible = false;
      
      // Clear all wall collisions
      stateRef.current.wallBoxes = [];
      
      // 1. 【全面清空舊殘留物 (Purge Legacy)】
      const groupsToClear = [itemsGroup, eyesGroup, hintGroup, ghostGroup, branchArrowsGroup, obstaclesGroup, hintsGroup, eyelidsGroup];
      groupsToClear.forEach(g => {
        if (g) {
          disposeObject(g);
          g.clear();
          g.visible = false;
        }
      });
      // Reactivate for the new arena
      obstaclesGroup.visible = true;
      
      // Hide all standard maze walls and move them deep underground
      stateRef.current.wallMeshesMap.forEach(mesh => {
        mesh.visible = false;
        mesh.position.y = -200;
      });
      
      // Clear level specific meshes that might be in scene root
      const cleanupTargetNames = [
        "stage4StartingRoom", "level4Floor", "level4Ceil", "level4Exit", "sideDoor", 
        "grassFloor", "skyBox", "mainBoss", "bossArenaFloor", "bossArenaCeil"
      ];
      scene.children.slice().forEach(child => {
        if (cleanupTargetNames.includes(child.name)) {
          disposeObject(child);
          scene.remove(child);
        }
      });
      
      // Remove any existing lights from previous stage 6 setup
      scene.children.slice().forEach(child => {
        if (child instanceof THREE.SpotLight || child instanceof THREE.AmbientLight) {
          if ((child as any) !== ambientLight && (child as any) !== sunLight) {
            scene.remove(child);
          }
        }
      });

      const heightY = 38.0;
      const fovRad = 65 * Math.PI / 180;
      const vHeight = 2 * heightY * Math.tan(fovRad / 2);
      const vWidth = vHeight * camera.aspect;
      const zCam = 12.5;
      const zBottom = zCam + vHeight / 2;
      const zTop = zCam - vHeight / 2;

      // Move player to start position in the new arena
      stateRef.current.player.x = 0;
      stateRef.current.player.z = zBottom - 4.0;
      stateRef.current.player.angle = Math.PI; // Face the boss directly (North / towards -Z)
      camera.position.set(0, 38.0, 12.5);
      
      // Create glowing blue flat circular player mesh for overhead 2D top-down view
      let playerMesh = scene.getObjectByName("playerGlowCube") as THREE.Mesh;
      if (!playerMesh) {
        const playerGeom = new THREE.CircleGeometry(0.4, 32);
        playerGeom.rotateX(-Math.PI / 2); // Lay flat on the floor
        const playerMat = new THREE.MeshStandardMaterial({
          color: 0x00d2ff,
          emissive: 0x00a2ff,
          emissiveIntensity: 1.5,
          roughness: 0.1,
          metalness: 0.8,
          side: THREE.DoubleSide
        });
        playerMesh = new THREE.Mesh(playerGeom, playerMat);
        playerMesh.name = "playerGlowCube";
        
        // Add glowing light
        const playerLight = new THREE.PointLight(0x00d2ff, 12, 15);
        playerLight.name = "playerGlowLight";
        playerMesh.add(playerLight);
        
        scene.add(playerMesh);
      }
      playerMesh.visible = true;
      playerMesh.position.set(0, 0.02, zBottom - 4.0);
      
      // 2. 【只渲染全新乾淨地圖 (Clean Map Only)】
      const arenaHeight = 20;
      const darkColor = 0x000000; // Pitch black void

      scene.background = new THREE.Color(darkColor);
      scene.fog = new THREE.FogExp2(darkColor, 0.015);

      // Floor - restricted precisely to the 15x15 player play area (X: -7.5 to 7.5, Z: zBottom-15 to zBottom)
      const arenaFloorGeom = new THREE.PlaneGeometry(15, 15);
      const arenaFloorMat = new THREE.MeshStandardMaterial({ 
        color: 0x111115, // elegant slate very dark zinc gray
        roughness: 0.9,
        metalness: 0.1 
      });
      const arenaFloor = new THREE.Mesh(arenaFloorGeom, arenaFloorMat);
      arenaFloor.rotation.x = -Math.PI / 2;
      arenaFloor.position.set(0, 0, zBottom - 7.5); // Center of the playing platform
      arenaFloor.name = "bossArenaFloor";
      obstaclesGroup.add(arenaFloor);

      // Transparent Walls matching the 15x15 arena play zone boundary
      const wallMat = new THREE.MeshStandardMaterial({
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
      });
      const wallGeomH = new THREE.BoxGeometry(15, arenaHeight, 1);
      const wallGeomV = new THREE.BoxGeometry(1, arenaHeight, 15);
      
      const wallN = new THREE.Mesh(wallGeomH, wallMat);
      wallN.position.set(0, arenaHeight / 2, zBottom - 15.0); // Northern edge Z = zBottom - 15
      obstaclesGroup.add(wallN);
      
      const wallS = new THREE.Mesh(wallGeomH, wallMat);
      wallS.position.set(0, arenaHeight / 2, zBottom); // Southern edge flush with screen bottom at Z = zBottom
      obstaclesGroup.add(wallS);
      
      const wallW = new THREE.Mesh(wallGeomV, wallMat);
      wallW.position.set(-7.5, arenaHeight / 2, zBottom - 7.5); // Western edge at X = -7.5
      obstaclesGroup.add(wallW);
      
      const wallE = new THREE.Mesh(wallGeomV, wallMat);
      wallE.position.set(7.5, arenaHeight / 2, zBottom - 7.5); // Eastern edge at X = 7.5
      obstaclesGroup.add(wallE);


      // 3. 【燈光氛圍】
      // Global lights sync - dark horror setting but significantly brighter for superb readability
      sunLight.visible = true;
      sunLight.intensity = 2.0; // Raised from 0.15
      ambientLight.intensity = 1.2; // Raised from 0.15

      // Local SpotLight (still provides a focused light pool in the center)
      const bossSpot = new THREE.SpotLight(0xffffff, 1200); // Raised from 600
      bossSpot.position.set(0, 20, -5.0);
      bossSpot.target.position.set(0, 0, zBottom - 7.5);
      bossSpot.angle = Math.PI / 3;
      bossSpot.penumbra = 0.3;
      bossSpot.decay = 2;
      bossSpot.distance = 100;
      obstaclesGroup.add(bossSpot);
      obstaclesGroup.add(bossSpot.target);

      // Create static Monster using boss.png flat on the ground for Stage 6
      const bossTex = textureLoader.load('/src/boss.png');
      const bossGeom = new THREE.PlaneGeometry(1, 1);
      const bossMat = new THREE.MeshStandardMaterial({ 
        map: bossTex, 
        transparent: true,
        color: 0xffffff,
        side: THREE.DoubleSide
      });
      const bossPlane = new THREE.Mesh(bossGeom, bossMat);
      bossPlane.name = "mainBoss";
      bossPlane.rotation.x = -Math.PI / 2; // Rotate the Mesh flat on the ground instead of geometry to prevent squishing scale
      
      // Positioned centered at the top region outside the play box, scaled so top-left and top-right precisely match viewport
      const bossHeight = vWidth * 0.5;
      bossPlane.position.set(0, 0.01, zTop + bossHeight / 2);
      bossPlane.scale.set(vWidth, bossHeight, 1.0);
      scene.add(bossPlane);

      // Four glowing red warning border edges that outline the player's smaller 15x15 play zone:
      const borderMat = new THREE.MeshBasicMaterial({ 
        color: 0xff0044, 
        transparent: true, 
        opacity: 0.85 
      });
      const borderThickness = 0.15;
      const borderHeight = 0.05;

      // North Boundary Edge
      const edgeN = new THREE.Mesh(new THREE.BoxGeometry(15.3, borderHeight, borderThickness), borderMat);
      edgeN.position.set(0, 0.01, zBottom - 15.0);
      obstaclesGroup.add(edgeN);

      // South Boundary Edge
      const edgeS = new THREE.Mesh(new THREE.BoxGeometry(15.3, borderHeight, borderThickness), borderMat);
      edgeS.position.set(0, 0.01, zBottom);
      obstaclesGroup.add(edgeS);

      // West Boundary Edge
      const edgeW = new THREE.Mesh(new THREE.BoxGeometry(borderThickness, borderHeight, 15.3), borderMat);
      edgeW.position.set(-7.5, 0.01, zBottom - 7.5);
      obstaclesGroup.add(edgeW);

      // East Boundary Edge
      const edgeE = new THREE.Mesh(new THREE.BoxGeometry(borderThickness, borderHeight, 15.3), borderMat);
      edgeE.position.set(7.5, 0.01, zBottom - 7.5);
      obstaclesGroup.add(edgeE);
    };

    const handleStage6Restart = () => {
      // 1. Reset state Ref & UI values
      stateRef.current.boss.showStage6DeadScreen = false;
      setShowStage6DeadScreen(false);
      
      stateRef.current.boss.playerHp = 40;
      setBossPlayerHp(40);
      
      // 2. Clear any screamer status if any
      setIsJumpscareActive(false);
      stateRef.current.isScreamerTriggered = false;
      setIsGameOver(false);
      
      // 3. Set up the boss fight cleanly
      setupBossFight();
      
      setNpcDialogue({ 
        text: "💀 邪晶爆裂，防線崩塌！核心淨化失敗，戰鬥重啟！", 
        color: "text-red-500 font-extrabold text-lg animate-pulse tracking-wider" 
      });
      setTimeout(() => setNpcDialogue(null), 3500);
    };

    stage6RestartRef.current = handleStage6Restart;

    const setupLevel4 = () => {
      const ghostState = stateRef.current.ghost;
      ghostState.pathIdx = 0; // CRITICAL: Reset path index for Level 4 AI
      ghostState.speed = 0;   // Reset speed
      stateRef.current.stage = HorrorProgression.STAGE_4;
      setCurrentStageUI(HorrorProgression.STAGE_4);
      stateRef.current.isLevel4 = true;
      stateRef.current.collectedCount = 0;
      setCollectedCount(0);
      setBranchesCleared(0); // Reset UI state
      
      disposeObject(itemsGroup);
      itemsGroup.clear();
      disposeObject(obstaclesGroup);
      obstaclesGroup.clear(); // Clear BEFORE spawning
      disposeObject(branchArrowsGroup);
      branchArrowsGroup.clear(); // Clear arrows BEFORE spawning
      branchArrowsGroup.visible = true; // Ensure branch arrows are visible in Stage 4 chase!
      stateRef.current.level4.isDeadEnd = false; // Reset dead end state on setup
      
      currentItemMeshes.length = 0;

      // CRITICAL: Clean up previous Level 4 specific meshes from scene
      const cleanupTargetNames = ["stage4StartingRoom", "level4Floor", "level4Ceil", "level4Exit", "sideDoor"];
      cleanupTargetNames.forEach(name => {
          let obj;
          while ((obj = scene.getObjectByName(name))) {
              disposeObject(obj);
              scene.remove(obj);
          }
      });

      // Hide default floor and ceiling to prevent Z-fighting with Level 4 custom flooring
      const dFloor = scene.getObjectByName("defaultFloor");
      if (dFloor) dFloor.visible = false;
      const dCeil = scene.getObjectByName("defaultCeil");
      if (dCeil) dCeil.visible = false;

      // Narrow Corridor Map Generation
      const gridH = 120; // Expanded to 120 grid units long specifically for Level 4
      const gridW = 16; // Reduced from 40 to 16 to remove unused space
      
      const l4Config = generateBranchSelectionMaze(gridW, gridH);
      const grid = l4Config.grid;
      const branches = l4Config.branches;
      const pathPoints = l4Config.pathPoints;

      // Initialize Level 4 state variables
      stateRef.current.mazeGrid = grid;
      stateRef.current.level4.branches = branches;
      stateRef.current.level4.obstacles = []; // Initialize logic array

      stateRef.current.level4.currentBranch = 0;
      stateRef.current.level4.isSceneLoaded = false;
      stateRef.current.level4.pathPoints = pathPoints;
      stateRef.current.level4.itemSpawned = false;
      stateRef.current.level4.finalExitX = l4Config.finalExitX;
      stateRef.current.level4.finalExitZ = l4Config.finalExitZ;

      // Add a Level 4 specific starting room with optimized PlaneGeometry
      const wall2TexMain = textureLoader.load("/wall2.png");
      wall2TexMain.wrapS = wall2TexMain.wrapT = THREE.RepeatWrapping;
      wall2TexMain.repeat.set(2, 1);
      const wallMatL4Start = new THREE.MeshStandardMaterial({ map: wall2TexMain, roughness: 0.8 });
      
      const grass2TexMain = textureLoader.load("/grass2.png");
      grass2TexMain.wrapS = grass2TexMain.wrapT = THREE.RepeatWrapping;
      grass2TexMain.repeat.set(3, 3);
      const grassMatL4Start = new THREE.MeshStandardMaterial({ map: grass2TexMain, roughness: 1.0 });

      const roomGroup = new THREE.Group();
      roomGroup.name = "stage4StartingRoom";

      const rSize = 6;
      const rH = 2.18;
      const rCX = 5;
      const rCZ = 5;

      // Floor (Y=0.01) - Plane geometry for performance
      const s4Floor = new THREE.Mesh(new THREE.PlaneGeometry(rSize, rSize), grassMatL4Start);
      s4Floor.rotation.x = -Math.PI / 2;
      s4Floor.position.set(rCX, 0.01, rCZ);
      s4Floor.receiveShadow = true;
      roomGroup.add(s4Floor);

      // Ceiling (Y=2.19)
      const s4Ceil = new THREE.Mesh(new THREE.PlaneGeometry(rSize, rSize), wallMatL4Start);
      s4Ceil.rotation.x = Math.PI / 2;
      s4Ceil.position.set(rCX, 2.19, rCZ);
      roomGroup.add(s4Ceil);

      // Back Wall (X=2.01) - Use thick BoxGeometry (thickness 10) to prevent clipping
      const wallBack = new THREE.Mesh(new THREE.BoxGeometry(10, rH + 1, rSize), wallMatL4Start);
      wallBack.position.set(2.01 - 5, 1.1, rCZ); // Shift center so surface is at 2.01
      roomGroup.add(wallBack);

      // Left Wall (Z=2.01)
      const wallLeft = new THREE.Mesh(new THREE.PlaneGeometry(rSize, rH), wallMatL4Start);
      wallLeft.position.set(rCX, 1.1, 2.01);
      roomGroup.add(wallLeft);

      // Right Wall (Z=7.99)
      const wallRight = new THREE.Mesh(new THREE.PlaneGeometry(rSize, rH), wallMatL4Start);
      wallRight.position.set(rCX, 1.1, 7.99);
      wallRight.rotation.y = Math.PI;
      roomGroup.add(wallRight);

      // Front Wall Exit Pieces (X=7.99)
      const wallFrontTop = new THREE.Mesh(new THREE.PlaneGeometry(rSize, 0.77), wallMatL4Start);
      wallFrontTop.position.set(7.99, 1.805, rCZ);
      wallFrontTop.rotation.y = -Math.PI / 2;
      roomGroup.add(wallFrontTop);

      const wallFrontBottom = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.41), wallMatL4Start);
      wallFrontBottom.position.set(7.99, 0.715, 4);
      wallFrontBottom.rotation.y = -Math.PI / 2;
      roomGroup.add(wallFrontBottom);

      scene.add(roomGroup);

      // Add Level 4 specific gigantic floor and ceiling (dimension matches gridExactly)
      const level4FloorGeom = new THREE.PlaneGeometry(gridW * 2, gridH * 2);
      const level4Floor = new THREE.Mesh(level4FloorGeom, floorMat);
      level4Floor.rotation.x = -Math.PI / 2;
      level4Floor.position.set(gridW, -0.05, gridH); // Position matches grid center (gridW*2 / 2, gridH*2 / 2)
      level4Floor.receiveShadow = true;
      level4Floor.name = "level4Floor";
      scene.add(level4Floor);

      const level4CeilGeom = new THREE.PlaneGeometry(gridW * 2, gridH * 2);
      const level4Ceil = new THREE.Mesh(level4CeilGeom, ceilMat);
      level4Ceil.rotation.x = Math.PI / 2;
      level4Ceil.position.set(gridW, 2.25, gridH); 
      level4Ceil.name = "level4Ceil";
      scene.add(level4Ceil);

      // Populate red spray paint graffiti arrows on the facing walls of forks using self-luminous meshes
      branchArrowsGroup.clear();
      branches.forEach(b => {
        const planeGeom = new THREE.PlaneGeometry(1.6, 1.6);
        
        let arrowTexture;
        if (b.correctDir === 'left') {
          // Pointing left raw to approaching player
          arrowTexture = arrowRightTexture;
        } else {
          // Pointing right raw to approaching player
          arrowTexture = arrowLeftTexture;
        }

        const planeMat = new THREE.MeshBasicMaterial({
          map: arrowTexture,
          transparent: true,
          polygonOffset: true,
          polygonOffsetFactor: -1.5,
          polygonOffsetUnits: -1.5,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const planeMesh = new THREE.Mesh(planeGeom, planeMat);
        planeMesh.rotation.y = Math.PI; // Face the approaching player precisely
        
        const graffiti = new THREE.Group();
        graffiti.add(planeMesh);

        // Put the plane exactly on the front-facing surface of the wall block facing the player (approaching from smaller Z)
        graffiti.position.set(b.facingWallX, 1.1, b.facingWallZ - 1.015);
        branchArrowsGroup.add(graffiti);
      });

      // Update Walls visibility and collision boxes
      const wallMeshesMap = stateRef.current.wallMeshesMap;
      
      // CRITICAL: Hide ALL wall meshes first to clear residues from previous level dimensions
      wallMeshesMap.forEach(mesh => {
          mesh.visible = false;
      });
      
      stateRef.current.wallBoxes.length = 0;
      for (let z = 0; z < gridH; z++) {
        for (let x = 0; x < gridW; x++) {
          let wallMesh = wallMeshesMap.get(`${x},${z}`);
          const isWall = grid[z][x] === 1;
          
          if (!wallMesh) {
            // Dynamically instantiate the additional walls for Level 4 that are beyond the initial 40x40 grid!
            const dynamicWallGeom = new THREE.BoxGeometry(2.02, 2.2, 2.02);
            wallMesh = new THREE.Mesh(dynamicWallGeom, wallMat);
            wallMesh.position.set(x * 2 + 1, 1.1, z * 2 + 1);
            wallMesh.receiveShadow = true;
            wallMesh.castShadow = true;
            scene.add(wallMesh);
            wallMeshesMap.set(`${x},${z}`, wallMesh);
          }
          
          if (wallMesh) {
            wallMesh.material = wallMat; // Ensure it uses Stage 4 material even if recycled
            
            // Initially, only show the starting room parts via roomGroup planes. 
            // Standard wall boxes MUST stay hidden to prevent Z-fighting in starting area.
            wallMesh.visible = false;
            wallMesh.position.y = 1.1; // Restore standard wall height!
          }
          
          if (isWall) {
             stateRef.current.wallBoxes.push({
                minX: x * 2, maxX: x * 2 + 2,
                minZ: z * 2, maxZ: z * 2 + 2,
             });
          }
        }
      }

      // Start player inside the room, facing the corridor exit (positive x direction) exactly like in Stage 1/2/3
      stateRef.current.player.x = config.startX * 2 + 1;
      stateRef.current.player.z = config.startZ * 2 + 1;
      stateRef.current.player.angle = Math.PI / 2; // Facing the exit door
      camera.position.set(stateRef.current.player.x, 0.8, stateRef.current.player.z);

      // Preserve NPC: Keep him in the starting room only in Stage 1 and Stage 4
      if (npcSprite && (stateRef.current.stage === HorrorProgression.STAGE_1 || stateRef.current.stage === HorrorProgression.STAGE_4)) {
        npcSprite.material.map = stateRef.current.stage === HorrorProgression.STAGE_4 ? npc4Tex : npcTex;
        npcSprite.material.needsUpdate = true;
        npcSprite.visible = true;
        npcSprite.position.set(stateRef.current.player.x + 2.0, 1.25, stateRef.current.player.z); 
      } else if (npcSprite) {
        npcSprite.visible = false;
      }

      // Final level exit door
      const finalDoorGeom = new THREE.BoxGeometry(2, 3, 0.5);
      const finalDoorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x444444 });
      const finalDoor = new THREE.Mesh(finalDoorGeom, finalDoorMat);
      finalDoor.name = "level4Exit";
      finalDoor.position.set(l4Config.finalExitX, 1.5, l4Config.finalExitZ);
      scene.add(finalDoor);

      // Ghost is inactive initially while player is inside the room
      ghostState.active = false;
      ghostGroup.visible = false;

      // Add Side Door mesh for Stage 4 starting room exit
      const sideDoorGeom = new THREE.BoxGeometry(0.2, 2.2, 2.0);
      const sideDoorMat = new THREE.MeshStandardMaterial({ 
        color: 0x333333, 
        metalness: 0.8, 
        roughness: 0.2,
        emissive: 0x110000 
      });
      const sideDoor = new THREE.Mesh(sideDoorGeom, sideDoorMat);
      sideDoor.name = "sideDoor";
      // Starting room exit is at grid x=4, y=3 -> world x=9, z=7. Boundary at world x=8.
      sideDoor.position.set(8.0, 1.1, 7.0); 
      scene.add(sideDoor);

      // --- ADD MANUAL COLLISIONS FOR THE STARTING ROOM HERE (After wallBoxes reset) ---
      
      // 1. Back Wall (Thick box 10 units deep)
      stateRef.current.wallBoxes.push({
          minX: 2.01 - 10, maxX: 2.01,
          minZ: rCZ - rSize / 2, maxZ: rCZ + rSize / 2
      });

      // 2. Left Wall
      stateRef.current.wallBoxes.push({
          minX: rCX - rSize / 2, maxX: rCX + rSize / 2,
          minZ: 2.01 - 0.1, maxZ: 2.01 + 0.1
      });

      // 3. Right Wall
      stateRef.current.wallBoxes.push({
          minX: rCX - rSize / 2, maxX: rCX + rSize / 2,
          minZ: 7.99 - 0.1, maxZ: 7.99 + 0.1
      });

      // 4. Front Wall Top
      stateRef.current.wallBoxes.push({
          minX: 7.99 - 0.1, maxX: 7.99 + 0.1,
          minZ: rCZ - rSize / 2, maxZ: rCZ + rSize / 2
      });

      // 5. Front Wall Bottom (Solid parts next to door)
      stateRef.current.wallBoxes.push({
          minX: 7.99 - 0.1, maxX: 7.99 + 0.1,
          minZ: 2, maxZ: 6
      });

      // 6. THE DOOR (Made solid until interaction)
      stateRef.current.wallBoxes.push({
          minX: 8.0 - 0.2, maxX: 8.0 + 0.2,
          minZ: 7.0 - 1.0, maxZ: 7.0 + 1.0
      });
    };

    const gameLoop = (now: number) => {
      const npcSprite = (stateRef.current as any).npcSprite;
      const arrowCamera = (stateRef.current as any).camera;
      if (stateRef.current.isTypewriterActive) {
        lastTime = now;
        renderer.render(scene, camera);
        frameId = requestAnimationFrame(gameLoop);
        return;
      }

      // 0. Priority Death Detection (Strict Bounding Box 0.9)
      const ghostState = stateRef.current.ghost;
      if (ghostState.active && ghostGroup.visible && ghostState.state !== MonsterAIState.IDLE) {
          const px = stateRef.current.player.x;
          const pz = stateRef.current.player.z;
          const gx = ghostState.x;
          const gz = ghostState.z;
          
          if (Math.abs(px - gx) < 0.9 && Math.abs(pz - gz) < 0.9) {
              triggerGameOver();
              lastTime = now;
              frameId = requestAnimationFrame(gameLoop);
              return;
          }
      }

      if (isPaused || stateRef.current.isScreamerTriggered || (stateRef.current as any).isPausedInternal || (stateRef.current as any).showMenu || (stateRef.current as any).boss.showStage6DeadScreen) {
        lastTime = now;
        frameId = requestAnimationFrame(gameLoop);
        return;
      }

      // Run Music Stop Logic
      if (stateRef.current.stage !== HorrorProgression.STAGE_4 || !stateRef.current.isChasing) {
        if (runMusic.current && !runMusic.current.paused) {
          runMusic.current.pause();
          runMusic.current.currentTime = 0;
        }
      }


      let deltaTime = Math.min(0.06, (now - lastTime) / 1000); 
      lastTime = now;

      if (stateRef.current.stage === HorrorProgression.STAGE_1 && !stateRef.current.isBlinking) {
        spookyAudio.playBGM1();
      }

      const keyboardControls = stateRef.current.controls;
      
      // Stamina Logic
      const isRunning = keyboardControls.run && (
        stateRef.current.stage === HorrorProgression.STAGE_1 || 
        stateRef.current.stage === HorrorProgression.STAGE_2 || 
        stateRef.current.stage === HorrorProgression.STAGE_3 || 
        stateRef.current.stage === HorrorProgression.STAGE_5
      );
      const isMoving = keyboardControls.forward || keyboardControls.backward || keyboardControls.left || keyboardControls.right;

      if (isRunning && isMoving) {
        if (stateRef.current.stamina > 0) {
          stateRef.current.stamina = Math.max(0, stateRef.current.stamina - (100 / 5) * deltaTime);
          stateRef.current.isRecovering = false;
          stateRef.current.lastRunTime = now;
        }
      } else {
        if (now - (stateRef.current.lastRunTime || 0) > 1000) {
          stateRef.current.isRecovering = true;
          stateRef.current.stamina = Math.min(100, stateRef.current.stamina + (100 / 7) * deltaTime);
        }
      }


      // Item Spawn Check (Faster start for first item in joyful stage)
      if (!stateRef.current.hasSpawnedFirstItems && now - stateRef.current.gameStartTime > 3000) {
        spawnNextItem();
      }

      // --- Quiet Rhythm & Ghost Trigger Tracking ---
      const deltaMs = deltaTime * 1000;
      const isActuallyMoving = (keyboardControls.forward || keyboardControls.backward || keyboardControls.left || keyboardControls.right);

      // Track continuous movement for trigger
      if (isActuallyMoving) {
        stateRef.current.continuousMoveTime += deltaMs;
        stateRef.current.stayTime = 0;
      } else {
        stateRef.current.stayTime += deltaMs;
        stateRef.current.continuousMoveTime = 0;
      }

      // Track Corner Passing
      const currentGridX = Math.floor(playerState.x / 2);
      const currentGridZ = Math.floor(playerState.z / 2);
      if (currentGridX !== stateRef.current.lastGridPosition.x || currentGridZ !== stateRef.current.lastGridPosition.z) {
        const moveDirX = currentGridX - stateRef.current.lastGridPosition.x;
        const moveDirZ = currentGridZ - stateRef.current.lastGridPosition.z;
        
        // If grid direction changed, it's a corner
        if ((moveDirX !== stateRef.current.lastMoveDir.x || moveDirZ !== stateRef.current.lastMoveDir.z) && stateRef.current.lastGridPosition.x !== -1) {
          stateRef.current.cornersPassed++;
        }
        
        stateRef.current.lastGridPosition = { x: currentGridX, z: currentGridZ };
        stateRef.current.lastMoveDir = { x: moveDirX, z: moveDirZ };
      }

      // Rule-based Spawning Trigger
      const timeSinceLastSpawn = now - ghostState.lastSeenTime;
      
      // Infinite quiet limit for Stage 0 (no spawns)
      const quietLimit = stateRef.current.stage === HorrorProgression.STAGE_1 
        ? Infinity 
        : stateRef.current.pressureRhythm / (stateRef.current.stage + 1);

      if (ghostState.state === MonsterAIState.IDLE && timeSinceLastSpawn > quietLimit) {
        let triggerReason = "";
        const movementThreshold = (stateRef.current as any).stage === 0 ? 3000 : 15000;
const cornerThreshold = (stateRef.current as any).stage === 0 ? 1 : 4;

if (stateRef.current.continuousMoveTime > movementThreshold) triggerReason = "movement";
if ((stateRef.current as any).stage !== 0 && stateRef.current.stayTime > 10000) triggerReason = "stay";

        if (triggerReason && (stateRef.current.stage !== HorrorProgression.STAGE_4 || stateRef.current.level4.isSceneLoaded)) {
          triggerGhostSpawn();
        }
      }

      // Shrink safety window over time
      if (stateRef.current.pressureRhythm > 2500) {
        stateRef.current.pressureRhythm -= deltaTime * 10;
      }

      // Noise & Tension logic
      const isPlayerActuallyRunning = isActuallyMoving && keyboardControls.run;
      
      if (isPlayerActuallyRunning) {
        stateRef.current.noise += deltaTime * 2.0;
        stateRef.current.tension += deltaTime * 0.5;
      } else if (isActuallyMoving) {
        stateRef.current.noise += deltaTime * 0.5;
      } else {
        stateRef.current.noise = Math.max(0, stateRef.current.noise - deltaTime);
      }

      // Chase Trigger (Tension based)
      if (stateRef.current.tension > 40) {
        triggerGhostSpawn(true);
        stateRef.current.tension = 0;
      }

      // 10.2.1 Jump Physics
      let moveX = 0;
      let moveZ = 0;
      if (!stateRef.current.isPlayingVideo) {
        if (keyboardControls.jump && !playerState.isJumping) {
          playerState.vy = 4.5; // Jump strength
          playerState.isJumping = true;
        }

        if (playerState.isJumping) {
          playerState.vy -= 12.0 * deltaTime; // Gravity
          playerState.y += playerState.vy * deltaTime;
          if (playerState.y <= 0.8) {
            playerState.y = 0.8;
            playerState.vy = 0;
            playerState.isJumping = false;
          }
        }
        camera.position.y = playerState.y;

        // 10.2 Character Look & Rotation calculations
        const rotationSpeed = 1.45 * deltaTime;

        if (keyboardControls.turnLeft) {
          playerState.angle += rotationSpeed;
        }
        if (keyboardControls.turnRight) {
          playerState.angle -= rotationSpeed;
        }

        // 10.3 Movement vector WASD calculations
        const baseSpeed = 2.8; // Player base speed adjusted slightly slower per user request
        
        const isStage6 = stateRef.current.stage === HorrorProgression.STAGE_6;
        
        // Stamina check: if stamina <= 0, force run off
        const canRun = stateRef.current.stamina > 0;
        
        let speedVal = 4.0;
        if (isStage6) {
          // Holding Shift in Stage 6 slows the player down for precise bullet hell navigation
          speedVal = (keyboardControls.run && canRun) ? 4.5 : 12.0;
        } else if (stateRef.current.isLevel4) {
          speedVal = 6.0;
        } else {
          speedVal = (keyboardControls.run && canRun) ? 7.0 : 4.0;
        }
        const moveSpeed = speedVal * deltaTime; 

        if (isStage6) {
          // Top-down absolute X/Z flat movement: W/S moves along Z, A/D moves along X
          if (keyboardControls.forward) {
            moveZ -= 1; // W moves Up (decrease Z)
          }
          if (keyboardControls.backward) {
            moveZ += 1; // S moves Down (increase Z)
          }
          if (keyboardControls.left) {
            moveX -= 1; // A moves Left (decrease X)
          }
          if (keyboardControls.right) {
            moveX += 1; // D moves Right (increase X)
          }

          // Normalize absolute movement direction vector
          const moveMagSq = moveX * moveX + moveZ * moveZ;
          if (moveMagSq > 0) {
            const moveMag = Math.sqrt(moveMagSq);
            moveX = (moveX / moveMag) * moveSpeed;
            moveZ = (moveZ / moveMag) * moveSpeed;
          } else {
            moveX = 0;
            moveZ = 0;
          }
        } else {
          // FPS relative movement: calculate directional components based on yaw angle
          const forwardX = Math.sin(playerState.angle);
          const forwardZ = Math.cos(playerState.angle);

          if (keyboardControls.forward) {
            moveX += forwardX;
            moveZ += forwardZ;
          }
          if (keyboardControls.backward) {
            moveX -= forwardX;
            moveZ -= forwardZ;
          }

          // Sideways movement: strictly calculated starting from absolute 0 each frame
          let strafeX = 0;
          let strafeZ = 0;

          // Swap direction signs to fix inverted A/D controls:
          // A (Left) moves relative left; D (Right) moves relative right.
          if (keyboardControls.left) {
            strafeX += forwardZ;
            strafeZ -= forwardX;
          }
          if (keyboardControls.right) {
            strafeX -= forwardZ;
            strafeZ += forwardX;
          }

          // Ensure that releasing A/D forces horizontal speed contribution to equal EXACTLY ZERO
          if (!keyboardControls.left && !keyboardControls.right) {
            strafeX = 0;
            strafeZ = 0;
          }

          moveX += strafeX;
          moveZ += strafeZ;

          // Normalize movement direction to prevent faster diagonal walking and fix unintended drift
          const moveMagSq = moveX * moveX + moveZ * moveZ;
          if (moveMagSq > 0) {
            const moveMag = Math.sqrt(moveMagSq);
            moveX = (moveX / moveMag) * moveSpeed;
            moveZ = (moveZ / moveMag) * moveSpeed;
          } else {
            moveX = 0;
            moveZ = 0;
          }
        }
      } else {
        moveX = 0;
        moveZ = 0;
      }

      // Level 4 Corridor Auto-Alignment: Automatically locks player to centerline when travelling along straight passages
      if (stateRef.current.isLevel4 && stateRef.current.mazeGrid.length > 0) {
        const cx = Math.floor(playerState.x / 2);
        const cz = Math.floor(playerState.z / 2);
        const gridH = stateRef.current.mazeGrid.length;
        const gridW = stateRef.current.mazeGrid[0].length;
        const grid = stateRef.current.mazeGrid;

        // Skip starting room bounds (x <= 4 && z <= 4) to allow free visual exploration inside the room
        if (cx >= 0 && cx < gridW && cz >= 0 && cz < gridH && (cx > 4 || cz > 4)) {
          // Check if we are in a vertical corridor segment
          const isVertCorridor = 
            (cz - 1 >= 0 && grid[cz - 1][cx] === 0) &&
            (cz + 1 < gridH && grid[cz + 1][cx] === 0) &&
            (cx - 1 < 0 || grid[cz][cx - 1] === 1) &&
            (cx + 1 >= gridW || grid[cz][cx + 1] === 1);

          // Check if we are in a horizontal corridor segment
          const isHorizCorridor =
            (cx - 1 >= 0 && grid[cz][cx - 1] === 0) &&
            (cx + 1 < gridW && grid[cz][cx + 1] === 0) &&
            (cz - 1 < 0 || grid[cz - 1][cx] === 1) &&
            (cz + 1 >= gridH || grid[cz + 1][cx] === 1);

          // Both orientations align player to centerline ONLY when NOT actively strafing
          if (isVertCorridor && !keyboardControls.left && !keyboardControls.right) {
            // Gently nudge player's X coordinate to corridor centerline
            const targetX = cx * 2 + 1;
            playerState.x += (targetX - playerState.x) * 0.15;
          } else if (isHorizCorridor && !keyboardControls.left && !keyboardControls.right) {
            // Gently nudge player's Z coordinate to corridor centerline
            const targetZ = cz * 2 + 1;
            playerState.z += (targetZ - playerState.z) * 0.15;
          }
        }
      }

      // Apply collision checks and slide smoothly
      if (moveX !== 0 || moveZ !== 0) {
        let testX = playerState.x + moveX;
        let testZ = playerState.z + moveZ;

        // Physical obstacle collision checking (REMOVED - user requested deletion of roadblocks)
        const nextPos = checkWallCollision(testX, testZ);
        playerState.x = nextPos.x;
        playerState.z = nextPos.z;

        // Subtle head bobbing simulation when moving
        if (!playerState.isJumping) {
          camera.position.y = playerState.y + Math.sin(now * 0.008) * 0.035;
        }
      } else {
        if (!playerState.isJumping) {
          camera.position.y = playerState.y + Math.sin(now * 0.0025) * 0.01;
        }
      }

      // Position camera & project angles
      const isStage6 = stateRef.current.stage === HorrorProgression.STAGE_6;
      if (isStage6) {
        // Overhead camera: completely fixed in the center of the 15x15 stage (0, 38.0, 12.5)
        camera.position.set(0, 38.0, 12.5);
        
        // Sync player mesh position
        const pMesh = scene.getObjectByName("playerGlowCube") as THREE.Mesh;
        if (pMesh) {
          pMesh.position.set(playerState.x, 0.02, playerState.z);
          const lastDamage = (stateRef.current as any).lastDamageTime || 0;
          const hitElapsed = performance.now() - lastDamage;
          const nowTime = performance.now();
          const parryActiveUntil = (stateRef.current as any).parryActiveUntil || 0;

          if (nowTime < parryActiveUntil) {
            // Player is actively parrying: make them fully golden/orange glow!
            pMesh.visible = true;
            const pMat = pMesh.material as THREE.MeshStandardMaterial;
            const pLight = pMesh.getObjectByName("playerGlowLight") as THREE.PointLight;
            if (pMat) {
              pMat.color.setHex(0xffd700); // Golden Yellow
              pMat.emissive.setHex(0xffaa00); // Warm Amber
              if (pLight) pLight.color.setHex(0xffd700);
            }
          } else if (hitElapsed < 800) {
            // Rapidly blink between red neon and standard neon
            const isFlash = Math.floor(hitElapsed / 100) % 2 === 0;
            const pMat = pMesh.material as THREE.MeshStandardMaterial;
            const pLight = pMesh.getObjectByName("playerGlowLight") as THREE.PointLight;
            if (pMat) {
              if (isFlash) {
                pMat.color.setHex(0xff3333);
                pMat.emissive.setHex(0xff0000);
                if (pLight) pLight.color.setHex(0xff0000);
              } else {
                pMat.color.setHex(0x00d2ff);
                pMat.emissive.setHex(0x00a2ff);
                if (pLight) pLight.color.setHex(0x00d2ff);
              }
            }
            // Also flash visibility rapid blinking
            pMesh.visible = Math.floor(hitElapsed / 50) % 2 === 0;
          } else {
            pMesh.visible = true;
            const pMat = pMesh.material as THREE.MeshStandardMaterial;
            const pLight = pMesh.getObjectByName("playerGlowLight") as THREE.PointLight;
            if (pMat) {
              pMat.color.setHex(0x00d2ff);
              pMat.emissive.setHex(0x00a2ff);
              if (pLight) pLight.color.setHex(0x00d2ff);
            }
          }
        }

        // --- UPDATE PARRY SPARKS ---
        const parrySparks = (stateRef.current as any).parrySparks || [];
        const activeSparks: any[] = [];
        parrySparks.forEach((s: any) => {
          s.life += deltaTime;
          if (s.life < s.maxLife) {
            s.mesh.position.x += s.vx * deltaTime;
            s.mesh.position.y += s.vy * deltaTime;
            s.mesh.position.z += s.vz * deltaTime;
            
            // Gravity downward pull
            s.vy -= 9.8 * deltaTime;
            
            // ground bounce
            if (s.mesh.position.y < 0.05) {
              s.mesh.position.y = 0.05;
              s.vy = -s.vy * 0.4;
            }
            
            // Fade out opacity
            const mat = s.mesh.material as THREE.MeshBasicMaterial;
            if (mat) {
              mat.opacity = 1.0 - (s.life / s.maxLife);
              mat.needsUpdate = true;
            }
            activeSparks.push(s);
          } else {
            scene.remove(s.mesh);
            if (s.mesh.geometry) s.mesh.geometry.dispose();
            if (s.mesh.material) {
              if (Array.isArray(s.mesh.material)) s.mesh.material.forEach((m: any) => m.dispose());
              else s.mesh.material.dispose();
            }
          }
        });
        (stateRef.current as any).parrySparks = activeSparks;

        // --- UPDATE PARRY SWORD EFFECTS ---
        const parrySwordEffects = (stateRef.current as any).parrySwordEffects || [];
        const activeEffects: any[] = [];
        parrySwordEffects.forEach((e: any) => {
          e.life += deltaTime;
          if (e.life < e.maxLife) {
            // Keep centered on the player so it follows them perfectly!
            e.mesh.position.set(playerState.x, 0.08, playerState.z);
            
            // No spinning rotation per user request!
            // e.mesh.rotation.z += 8.0 * deltaTime;
            
            // Expansion scale animation
            const p = e.life / e.maxLife;
            const currentScale = e.startScale + (e.endScale - e.startScale) * p;
            e.mesh.scale.set(currentScale, currentScale, 1.0);
            
            // Smoothly fade transparency
            const mat = e.mesh.material as THREE.MeshBasicMaterial;
            if (mat) {
              mat.opacity = 1.0 - p;
              mat.needsUpdate = true;
            }
            activeEffects.push(e);
          } else {
            scene.remove(e.mesh);
            if (e.mesh.geometry) e.mesh.geometry.dispose();
            if (e.mesh.material) e.mesh.material.dispose();
          }
        });
        (stateRef.current as any).parrySwordEffects = activeEffects;

      } else {
        camera.position.x = playerState.x;
        camera.position.z = playerState.z;
        // Make sure glow cube is hidden
        const pMesh = scene.getObjectByName("playerGlowCube");
        if (pMesh) pMesh.visible = false;
        // Clean shield
        const parryShield = scene.getObjectByName("playerParryShield");
        if (parryShield) {
          scene.remove(parryShield);
        }
      }
      
      // 10.3.2 Level 4 Mechanics: Obstacles & Branches
      if (stateRef.current.isLevel4 && stateRef.current.stage === HorrorProgression.STAGE_4) {
          // A. Scene loader trigger when exiting the starting room
          if (!stateRef.current.level4.isSceneLoaded) {
              if (playerState.x >= 7.2 && playerState.x <= 8.5 && playerState.z >= 6.0 && playerState.z <= 8.0) {
                  // Show prompt when near the door
                  if (!stateRef.current.isBlinking && !stateRef.current.isPlayingVideo) {
                    setShowStage4EnterPrompt(true);
                  } else {
                    setShowStage4EnterPrompt(false);
                  }
                  
                  if (stateRef.current.controls.interact) {
                    setIsPlayingVideo(true);
                    stateRef.current.isPlayingVideo = true;
                    setShowStage4EnterPrompt(false);
                  }
              } else {
                  setShowStage4EnterPrompt(prev => prev ? false : false);
              }
          }

          // 1. Animate safety strobe lights on roadblock obstacles (REMOVED - user requested deletion of roadblocks)
          
          // Flicker Level 4 graffiti red glow (REMOVED GLINT per user request)
          branchArrowsGroup.children.forEach((graffiti) => {
              const light = graffiti.children[1] as THREE.PointLight;
              if (light) {
                  light.intensity = 0;
              }
          });

          // 2. Branch detection
          const curBranchIdx = stateRef.current.level4.currentBranch;
          if (curBranchIdx < 5) {
              const b = stateRef.current.level4.branches[curBranchIdx];
              if (b) {
                  // The fork center is at b.z + 2 in world coordinates (since cz starts before the junction block)
                  const playerRelZ = playerState.z - b.z;
                  
                  if (playerRelZ > -0.5 && playerRelZ < 3.5) {
                      const branchChoiceX = playerState.x - b.x;
                      
                      // Check if the player has entered the left or right hallway
                      if (Math.abs(branchChoiceX) > 1.2) {
                          const correct = (b.correctDir === 'left' && branchChoiceX < -1.2) || 
                                          (b.correctDir === 'right' && branchChoiceX > 1.2);
                          if (correct) {
                              const nextBranch = stateRef.current.level4.currentBranch + 1;
                              stateRef.current.level4.currentBranch = nextBranch;
                              setBranchesCleared(nextBranch);
                              spookyAudio.playClick();
                              
                              // CRITICAL: REMOVE & DESTROY PRECEDING FORK'S DEAD-END WALL AND PHYSICAL COLLIDER
                              const wallGridX = Math.floor(b.facingWallX / 2);
                              const wallGridZ = Math.floor(b.facingWallZ / 2);
                              const wallKey = `${wallGridX},${wallGridZ}`;
                              
                              const oldWallMesh = stateRef.current.wallMeshesMap.get(wallKey);
                              if (oldWallMesh) {
                                  scene.remove(oldWallMesh);
                                  if (oldWallMesh.geometry) oldWallMesh.geometry.dispose();
                                  if (oldWallMesh.material) {
                                      if (Array.isArray(oldWallMesh.material)) {
                                          oldWallMesh.material.forEach(m => m.dispose());
                                      } else {
                                          oldWallMesh.material.dispose();
                                      }
                                  }
                                  stateRef.current.wallMeshesMap.delete(wallKey);
                              }
                              
                              // Flatten cell in active maze data
                              if (stateRef.current.mazeGrid[wallGridZ]) {
                                  stateRef.current.mazeGrid[wallGridZ][wallGridX] = 0;
                              }
                              
                              // Slice/Delete wall collider from physics wallBoxes array
                              stateRef.current.wallBoxes = stateRef.current.wallBoxes.filter(box => {
                                  const boxCenterX = (box.minX + box.maxX) / 2;
                                  const boxCenterZ = (box.minZ + box.maxZ) / 2;
                                  const isMatch = Math.abs(boxCenterX - b.facingWallX) < 1.1 && 
                                                  Math.abs(boxCenterZ - b.facingWallZ) < 1.1;
                                  return !isMatch;
                              });

                              // Clean up the painted arrow graffiti on facing wall to make sure everything at the crossroads has been fully cleared
                              const graffitiToRemove = branchArrowsGroup.children.find(child => {
                                  return child.position.distanceTo(new THREE.Vector3(b.facingWallX, 1.1, b.facingWallZ - 1.015)) < 1.1;
                              });
                              if (graffitiToRemove) {
                                  branchArrowsGroup.remove(graffitiToRemove);
                                  graffitiToRemove.traverse(node => {
                                      if (node instanceof THREE.Mesh) {
                                          if (node.geometry) node.geometry.dispose();
                                          if (node.material) {
                                              if (Array.isArray(node.material)) {
                                                  node.material.forEach(m => m.dispose());
                                              } else {
                                                  node.material.dispose();
                                              }
                                          }
                                      }
                                  });
                              }
                              
                              if (stateRef.current.level4.currentBranch === 5 && !stateRef.current.level4.itemSpawned) {
                                  stateRef.current.level4.itemSpawned = true;
                                  spawnStage4EndItem();
                              }
                          } else if (!stateRef.current.level4.isDeadEnd) {
                              // Wrong turn -> instant death!
                              stateRef.current.level4.isDeadEnd = true;
                              triggerGameOver();
                          }
                      }
                  }
              }
          }

          // 3. Dead end catch up
          if (stateRef.current.level4.isDeadEnd) {
              ghostState.speed = 12.0; 
          }

          // 4. End Door Transition
          const exitDoor = scene.getObjectByName("level4Exit");
          if (exitDoor && camera.position.distanceTo(exitDoor.position) < 2.0) {
              if (stateRef.current.collectedCount >= 1) {
                  triggerLevelTransition(HorrorProgression.STAGE_5);
              } else {
                  setInteractHintText("門鎖住了，必須先找到右手……");
                  setShowInteractHint(true);
              }
          } else if (exitDoor && camera.position.distanceTo(exitDoor.position) >= 2.0 && showInteractHint && interactHintText === "門鎖住了，必須先找到右手……") {
              setShowInteractHint(false);
          }
      }
      
      // Order of rotation: Apply vertical pitch first, then horizontal yaw (or lock straight down for overhead view on Stage 6)
      if (stateRef.current.stage === HorrorProgression.STAGE_6) {
        camera.rotation.set(-Math.PI / 2, 0, 0); // vertically straight down
      } else {
        camera.rotation.set(playerState.pitch, playerState.angle + Math.PI, 0, 'YXZ');
      }

      // 10.4 Items spins & pickup check loops
      const eyeLookTarget = camera.position;
      eyesGroup.children.forEach((eye) => {
        eye.lookAt(eyeLookTarget);
        // Subtle rhythmic twitch
        const twitch = Math.sin(now * 0.01 + Math.random() * 10) * 0.05;
        eye.scale.set(1 + twitch, 1 + twitch, 1);
      });

      for (let i = currentItemMeshes.length - 1; i >= 0; i--) {
        const mesh = currentItemMeshes[i];
        mesh.rotation.y += 1.25 * deltaTime;
        mesh.position.y = 0.6 + Math.sin(now * 0.003 + i) * 0.1;
        
        const distSq = (mesh.position.x - playerState.x)**2 + (mesh.position.z - playerState.z)**2;
        if (distSq < 0.7) {
          if (mesh.userData.isFake) {
            // Fake item: Trigger monster!
            triggerGhostSpawn(true);
            itemsGroup.remove(mesh);
            currentItemMeshes.splice(i, 1);
            // Flashlight glitch or something?
            setIsGlitching(true);
            setTimeout(() => setIsGlitching(false), 200);
          } else {
            // Real item
            spookyAudio.playItemCollect();
            playItemGetSound();
            stateRef.current.collectedCount++;
            setCollectedCount(stateRef.current.collectedCount);
            onItemCollected(stateRef.current.collectedCount);
            setIsTrackerVisible(true);
            
            // REMOVE ITEM FROM SCENE AND ARRAY
            itemsGroup.remove(mesh);
            currentItemMeshes.splice(i, 1);

            if (stateRef.current.isLevel4) {
              setNpcDialogue({ text: "你拾取了陳家睿的右手！時空開始崩塌……最終章啟用！", color: "text-red-500 font-black tracking-widest text-lg animate-pulse" });
              setTimeout(() => setNpcDialogue(null), 4000);
              triggerLevelTransition(HorrorProgression.STAGE_5);
            } else {
              // Shifting Maze!
              shiftMaze();
            }

            if (stateRef.current.collectedCount >= 1) { 
              if (stateRef.current.stage === HorrorProgression.STAGE_5) {
                // Finale item collected - Move to Boss Fight!
                triggerLevelTransition(HorrorProgression.STAGE_6);
              } else {
                console.log("Mission items collected. Return to NPC.");
              }
            }
            // Real item picked up
            break; 
          }
        }
      }

      // 10.5 Final Stage 7 Jerry Item Logic
      if (stateRef.current.stage === HorrorProgression.STAGE_7) {
        const jerry = stateRef.current.finalJerryItem;
        const beam = stateRef.current.finalBeam;
        const starsGroup = stateRef.current.finalStarsGroup;
        
        if (beam) {
           beam.rotation.y += 0.5 * deltaTime;
        }
        
        if (starsGroup) {
           starsGroup.children.forEach(star => {
               const u = star.userData;
               // Twinkle (pulse scale)
               const s = u.baseScale * (0.5 + 0.5 * Math.sin(now * 0.003 * u.speed + u.offset));
               star.scale.set(s, s, s);
               star.rotation.z += u.spinSpeed * deltaTime;
               star.rotation.y += u.spinSpeed * 0.5 * deltaTime;
               
               // Slowly float up
               star.position.y += 0.5 * deltaTime;
               if (star.position.y > 30) {
                   star.position.y = 0;
               }
           });
        }
        
        if (jerry) {
           // Float down to y = 1.0 slowly over a long time
           if (jerry.userData.baseY === undefined) {
               jerry.userData.baseY = jerry.position.y;
           }

           if (jerry.userData.baseY > 1.0) {
               jerry.userData.baseY -= 2.0 * deltaTime; // Speed
           }
           
           // Spin smoothly
           jerry.rotation.y += 1.0 * deltaTime;
           
           // Bob softly
           jerry.position.y = jerry.userData.baseY + Math.sin(now * 0.002) * 0.2; 
           
           const distSq = (jerry.position.x - playerState.x)**2 + (jerry.position.z - playerState.z)**2;
           if (jerry.position.y <= 2.5 && distSq < 1.0) {
               // Collect Jerry
               const sceneObject = (stateRef.current as any).scene;
               if (sceneObject) sceneObject.remove(jerry);
               try { spookyAudio.playItemCollect(); } catch(e){}
               try { playItemGetSound(); } catch(e){}
               stateRef.current.finalJerryItem = null;
               
               setIsVictoryFading(true);
               
               setNpcDialogue({
                   text: "🎉 獲得最終物品！\n「遊戲結束，感謝您的遊玩！」",
                   color: "text-emerald-400 font-extrabold text-3xl tracking-widest animate-pulse drop-shadow-[0_0_15px_rgba(52,211,153,1)] whitespace-pre-wrap text-center bg-black/80 p-6 rounded-lg",
               });

               setTimeout(() => {
                   spookyAudio.stopTung();
                   setNpcDialogue(null);
                   try {
                     triggerLevelTransition(HorrorProgression.STAGE_8);
                     setTimeout(() => {
                       setIsVictoryFading(false);
                     }, 850);
                   } catch (err) {
                     console.error("transition to stage 8 error", err);
                   }
               }, 5000);
           }
        }
      }

      // Stage Progression and Visual Updates - NO LONGER AUTOMATIC
      // Visual changes now triggered when stage changes officially via transition logic
      if (false && stateRef.current.stage > 1) { // DISABLED
        const newStageMap = [
          HorrorProgression.STAGE_1, // Index 0
          HorrorProgression.STAGE_2, // Index 1
          HorrorProgression.STAGE_3, // Index 2
          HorrorProgression.STAGE_4, // Index 3
          HorrorProgression.STAGE_5  // Index 4
        ];
        
        // For Level 2+, we can enable progression if items are found, but for Level 1, we stay at STAGE_1.
        const targetStageIndex = Math.min(4, stateRef.current.collectedCount + (stateRef.current.stage - 1));
        const targetStage = newStageMap[Math.min(4, targetStageIndex)];
        
        if (stateRef.current.stage < targetStage) {
            stateRef.current.stage = targetStage;
            stateRef.current.stageStartTime = performance.now();
        }
      }

      if (stateRef.current.stage !== lastVisualStage) {
          const s = stateRef.current.stage;
          lastVisualStage = s;
          const userFlashlight = (stateRef.current as any).flashlight as THREE.SpotLight | undefined;
          
          if (s === HorrorProgression.STAGE_5) {
            wallMat.map = createWallTexture(s);
            floorMat.map = createFloorTexture(s);
            ceilMat.map = createCloudTexture(s);
            ceilMat.emissiveIntensity = 0;
            scene.background = new THREE.Color(0x000000);
            scene.fog = new THREE.FogExp2(0x000000, 0.08);
            sunLight.visible = true;
            sunLight.intensity = 0;
            ambientLight.intensity = 0.12; // Raised from 0.05 to make Stage 5 slightly brighter
            if (userFlashlight) userFlashlight.intensity = 1.5;
          } else {
            // Apply overhauled textures based on stage
            if (s === HorrorProgression.STAGE_1) {
              if (wall1Tex) wallMat.map = wall1Tex;
              if (ceil1Tex) ceilMat.map = ceil1Tex;
              if (grass1Tex) floorMat.map = grass1Tex;
              floorMat.color.set(0xffffff); 
              ceilMat.color.set(0xffffff);
              wallMat.color.set(0xffffff);
              scene.background = new THREE.Color(0xd1fae5); 
              scene.fog = new THREE.FogExp2(0xd1fae5, 0.005);
              sunLight.visible = true; 
              sunLight.intensity = 3.2; 
              ambientLight.intensity = 0.7;
              if (userFlashlight) userFlashlight.intensity = 0;
            } else if (s === HorrorProgression.STAGE_2) {
              if (wall2Tex) wallMat.map = wall2Tex;
              if (ceil2Tex) ceilMat.map = ceil2Tex;
              if (grass2Tex) floorMat.map = grass2Tex;
              wallMat.color.set(0xffffff);
              ceilMat.color.set(0xffffff);
              floorMat.color.set(0xffffff);
              ceilMat.emissiveIntensity = 0.0;
              scene.background = new THREE.Color(0x000000);
              scene.fog = new THREE.FogExp2(0x000000, 0.08);
              sunLight.visible = true;
              sunLight.intensity = 0;
              ambientLight.intensity = 0.015; // Lowered from 0.05 to make Stage 2 darker
              if (userFlashlight) userFlashlight.intensity = 1.5;
            } else if (s === HorrorProgression.STAGE_3) {
              if (wall2Tex) wallMat.map = wall2Tex;
              if (ceil2Tex) ceilMat.map = ceil2Tex;
              if (grass2Tex) floorMat.map = grass2Tex;
              wallMat.color.set(0xffffff);
              ceilMat.color.set(0xffffff); 
              floorMat.color.set(0xffffff);
              ceilMat.emissiveIntensity = 0.0;
              scene.background = new THREE.Color(0x000000);
              scene.fog = new THREE.FogExp2(0x000000, 0.08);
              sunLight.visible = true;
              sunLight.intensity = 0;
              ambientLight.intensity = 0.015; // Lowered from 0.05 to make Stage 3 darker
              if (userFlashlight) userFlashlight.intensity = 1.5;
            } else if (s === HorrorProgression.STAGE_4) {
              if (wall2Tex) wallMat.map = wall2Tex;
              if (ceil2Tex) ceilMat.map = ceil2Tex;
              if (grass2Tex) floorMat.map = grass2Tex;
              wallMat.color.set(0xffffff);
              ceilMat.color.set(0xffffff);
              floorMat.color.set(0xffffff);
              scene.background = new THREE.Color(0x000000);
              scene.fog = new THREE.FogExp2(0x000000, 0.08);
              sunLight.visible = true;
              sunLight.intensity = 0;
              ambientLight.intensity = 0.05;
              if (userFlashlight) userFlashlight.intensity = 1.5;
            } else if (s === HorrorProgression.STAGE_6) {
              // Boss Stage lighting (Stage 6) - Dark Atmosphere but significantly brighter details
              sunLight.visible = true;
              sunLight.intensity = 2.0; // Raised from 0.15
              ambientLight.intensity = 1.2; // Raised from 0.15
              scene.background = new THREE.Color(0x050101); // Dark horror color
              scene.fog = new THREE.FogExp2(0x050101, 0.008); // Thicker fog reduced for grand visibility
              if (userFlashlight) userFlashlight.intensity = 0;
            }
            
            if (s === HorrorProgression.STAGE_1) {
              ceilMat.emissiveIntensity = 0.15;
            } else if (s === HorrorProgression.STAGE_4) {
              ceilMat.emissiveIntensity = 0.0; // Stage 4 user requested "delete mapping", but now requested wall2, we might want it non-emissive
            }
            
            if (s !== HorrorProgression.STAGE_1) {
                // Ensure emissive is handled by specific stage blocks
            } else {
                ceilMat.emissiveIntensity = 0.15;
            }
          }
          
          if (s === HorrorProgression.STAGE_1) {
            eyesGroup.clear();
            const rb = scene.getObjectByName('rainbowSprite');
            if (rb) rb.visible = true;
          } else {
            const rb = scene.getObjectByName('rainbowSprite');
            if (rb) rb.visible = false;
          }

          if (s === HorrorProgression.STAGE_5 || s === HorrorProgression.STAGE_6) {
            ghostSprite.visible = false;
            shadowEntity.visible = true;
            npcSprite.visible = false;
            if (s === HorrorProgression.STAGE_5) {
              spawnEyelidsForStage5();
            }
            eyesGroup.clear();
          }

          ceilMat.needsUpdate = true;
          wallMat.needsUpdate = true;
          floorMat.needsUpdate = true;
          spookyAudio.playClick();
          
          const ghostState = stateRef.current.ghost;
          ghostState.state = MonsterAIState.IDLE;
          ghostState.lastSeenTime = now;
      }

      // 10. Lighting Updates
      // Removed flicker logic for "breathing light" request
      if (stateRef.current.stage === HorrorProgression.STAGE_5) {
        const playerPos = camera.position;
        const pulse = (Math.sin(now * 0.002) + 1) * 0.5;
        ambientLight.intensity = 0.12; // Set to constant 0.12 (raised from 0.05 to make Stage 5 slightly brighter)
        ceilMat.emissiveIntensity = 0; // Completely disable emissive material property in Stage 5 
        
        // Shadow Entity animations
        // Sprites auto-face camera via billboard logic
        
        if (!ghostState.isSeen) {
          // Jitter / Shake effect while chasing
          const jitterAmount = 0.18;
          shadowFace.position.x = (Math.random() - 0.5) * jitterAmount;
          shadowFace.position.y = 1.4 + (Math.random() - 0.5) * jitterAmount;
          
          // Violent scaling jitter
          const s = 1.0 + (Math.random() - 0.5) * 0.05;
          shadowFace.scale.set(2.2 * s, 2.8 * s, 1);
        } else {
          // Dead stillness when observed
          shadowFace.position.x = 0;
          shadowFace.position.y = 1.4;
          shadowFace.scale.set(2.2, 2.8, 1);
        }

        // Eyelids (Wall Eyes) animation
        eyelidsGroup.children.forEach(child => {
          const eye = child as THREE.Mesh;
          const d = eye.position.distanceTo(playerPos);
          if (d < 6) {
            eye.scale.lerp(new THREE.Vector3(1.2, 1.2, 1.2), 0.1);
            // All eyes turn to player simultaneously if monster is seen, or follow player normally
            eye.lookAt(playerPos);
          } else {
            eye.scale.lerp(new THREE.Vector3(0, 0, 0), 0.1);
          }
        });

        // Squelch sounds when monster moves (not seen)
        if (!ghostState.isSeen && ghostState.state === MonsterAIState.ULTIMATE_CHASE) {
           if (Math.floor(now / 500) !== Math.floor((now - deltaTime * 1000) / 500)) {
             spookyAudio.playSquelch();
           }
        }

        // Footstep squelch for player
        const isMoving = stateRef.current.controls.forward || stateRef.current.controls.backward || stateRef.current.controls.left || stateRef.current.controls.right;
        if (isMoving && Math.floor(now / 400) !== Math.floor((now - deltaTime * 1000) / 400)) {
          spookyAudio.playSquelch();
        }
      }

      // Stage 0 Sparkle Hint Proximity Check
      if (stateRef.current.stage === HorrorProgression.STAGE_1 && currentItemMeshes.length > 0) {
        const realItem = currentItemMeshes.find(m => !m.userData.isFake);
        if (realItem) {
          const itemDist = realItem.position.distanceTo(camera.position);
          if (itemDist < 18) {
            // Intermittent sparkle sound when near
            if (Math.floor(now / 1500) % 2 === 0 && Math.random() < 0.015) {
              spookyAudio.playSparkleHint();
            }
          }
        }
      }

      // Random fake footstep echoes (Stage 1+)
      if (stateRef.current.stage >= 1 && stateRef.current.stage !== HorrorProgression.STAGE_6 && Math.random() < 0.003) {
        spookyAudio.playFootstepEcho();
      }

      // Update NPC texture based on stage
      let currentNpcTex = npcTex;
      if (stateRef.current.stage === HorrorProgression.STAGE_2) currentNpcTex = npc2Tex;
      else if (stateRef.current.stage === HorrorProgression.STAGE_3) currentNpcTex = npc3Tex;
      else if (stateRef.current.stage === HorrorProgression.STAGE_4) currentNpcTex = npc4Tex;

      if (npcSprite.material.map !== currentNpcTex && npcSprite.material.map !== monsterFaceTex) {
        npcSprite.material.map = currentNpcTex;
      }

      // Update AI movement
      if (stateRef.current.stage === HorrorProgression.STAGE_6) {
        updateBossAI(deltaTime, now);
      } else {
        updateGhostAI(deltaTime, now);
      }






      // --- Consolidated Interaction Hint System ---
      let frameHintText = "";
      let frameShowHint = false;

      // 1. Proximity Scanning for Items (< 2.5m)
      let nearestItemDSq = 6.25; 
      for (const mesh of currentItemMeshes) {
          const dSq = (mesh.position.x - playerState.x)**2 + (mesh.position.z - playerState.z)**2;
          if (dSq < nearestItemDSq) {
              nearestItemDSq = dSq;
              frameHintText = mesh.userData.name || "碎片";
              frameShowHint = true;
          }
      }

      // 1.5. Proximity Scanning for Stage 6 Stun Core (< 2.5m)
      const stage6Boss = stateRef.current.boss;
      if (stateRef.current.stage === HorrorProgression.STAGE_6) {
          if ((stage6Boss.bossPhase === 'READY_TO_ATTACK' && !stage6Boss.hasBeenAttacked) || stage6Boss.bossPhase === 'VULNERABLE_P2' || stage6Boss.bossPhase === 'VULNERABLE_P3' || stage6Boss.bossPhase === 'VULNERABLE_P4') {
              frameHintText = "按F攻擊boss";
              frameShowHint = true;
          }
      }


      // Update screen-space edge indicator arrow to NPC
      const stage = stateRef.current.stage;
      const collectedCount = stateRef.current.collectedCount;

      if (arrowRef.current && npcSprite && arrowCamera && stage <= 3 && collectedCount > 0 && npcSprite.visible) {
        // 1. Calculate relative position in camera space
        const npcPos = npcSprite.position.clone();
        const localPos = npcPos.applyMatrix4(arrowCamera.matrixWorldInverse);

        // 2. Calculate horizontal angle relative to camera view
        // In local camera space, -Z is forward, +X is right.
        const angle = Math.atan2(localPos.x, -localPos.z);

        // 3. Project ray in that direction to find intersection with screen edges box [-1, 1]
        const dx = Math.sin(angle);
        const dy = Math.cos(angle);

        let scale = 1.0;
        if (Math.abs(dx) > 1e-5 || Math.abs(dy) > 1e-5) {
          const tx = Math.abs(dx) > 1e-5 ? 1.0 / Math.abs(dx) : Infinity;
          const ty = Math.abs(dy) > 1e-5 ? 1.0 / Math.abs(dy) : Infinity;
          scale = Math.min(tx, ty);
        }

        const screenX = dx * scale; // [-1, 1] (left to right)
        const screenY = dy * scale; // [-1, 1] (bottom to top)

        // Map to pixel coordinate inset from viewport borders
        const padX = 64; // Inset padding in pixels
        const padY = 64; 

        const xPx = (window.innerWidth / 2) + screenX * (window.innerWidth / 2 - padX);
        const yPx = (window.innerHeight / 2) - screenY * (window.innerHeight / 2 - padY);

        arrowRef.current.style.left = `${xPx}px`;
        arrowRef.current.style.top = `${yPx}px`;
        // Rotate the arrow icon to point towards the direction of the target NPC
        arrowRef.current.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
        arrowRef.current.style.opacity = '1';
      } else if (arrowRef.current) {
        arrowRef.current.style.opacity = '0';
      }
      // 2. NPC Interaction Guidance
      const currentStage = stateRef.current.stage;
      const npcDist = (stateRef.current as any).camera.position.distanceTo(npcSprite.position);
      const isNpcAvailable = (currentStage >= HorrorProgression.STAGE_1 && currentStage <= HorrorProgression.STAGE_5) && !stateRef.current.isBlinking && npcSprite.visible;
      const dist = isNpcAvailable ? npcDist : 999;

      if (dist > 2.5) {
          // 這是強制保險，只要距離超過 2.5，立刻關閉所有狀態
          setIsTalking(false);
          stateRef.current.isTalking = false;
          setCanInteract(false);
          stateRef.current.canInteract = false;
          setIsNearNPC(false);
          stateRef.current.npc.isOpen = false;
          setNpcDialogue(null);
          setIsDialogueShaking(false);
          frameShowHint = false;
      } else {
          setCanInteract(true);
          stateRef.current.canInteract = true;
          setIsNearNPC(true);
      }

      // Check if F key triggered a dialogue state update
      if (stateRef.current.npcToggleTriggered) {
          stateRef.current.npcToggleTriggered = false;

          if (stateRef.current.isTalking) {
              // 開啟對話框
              stateRef.current.npc.lastInteractionTime = now;
              
              if (stateRef.current.collectedCount >= 1 && !stateRef.current.isBlinking) {
                  // 任務完成與遞交
                  if (currentStage < HorrorProgression.STAGE_4) {
                      // Set dialogue first based on stage
                      if (currentStage === HorrorProgression.STAGE_3) {
                          setNpcDialogue({ text: "為什麼...", color: "text-red-500 font-bold" });
                          setIsDialogueShaking(true);
                      } else {
                          setNpcDialogue({ text: "謝謝你", color: "text-white" });
                          setIsDialogueShaking(false);
                      }
                      
                      // Delay transition to let user read the message
                      setTimeout(() => {
                          setNpcDialogue(null);
                          setIsDialogueShaking(false);
                          triggerLevelTransition(currentStage + 1);
                      }, 1800);
                  } else if (currentStage === HorrorProgression.STAGE_4) {
                      // Stage 4 transition is handled by picking up the item in the corridor
                      triggerLevelTransition(HorrorProgression.STAGE_5);
                  } else if (currentStage === HorrorProgression.STAGE_5) {
                      // Transition from Final Stage pursuit to Boss Fight
                      triggerLevelTransition(HorrorProgression.STAGE_6);
                  } else {
                      // 終章
                      setNpcDialogue({ text: "你找齊了所有碎片...", color: "text-red-500 font-bold" });
                      setTimeout(() => {
                          setNpcDialogue(null);
                          setIsTalking(false);
                          stateRef.current.isTalking = false;
                      }, 3000);
                  }
              } else {
                  // 正常對話流程，設定為 Open 並推進 interactionCount
                  stateRef.current.npc.isOpen = true;
                  stateRef.current.npc.interactionCount++;
                  const count = stateRef.current.npc.interactionCount;
                  setNpcInteractionCount(count);
                  
                  if (currentStage === HorrorProgression.STAGE_1) {
                      // Stage 1 specific dialogue
                      if (count >= 11) {
                        setNpcDialogue({ text: "...", color: "text-white" });
                        setIsDialogueShaking(false);
                      } else if (count === 10) {
                        setNpcDialogue({ text: "快。", color: "text-red-600 font-bold" });
                        setIsDialogueShaking(true);
                        npcSprite.material.map = monsterFaceTex;
                        npcSprite.scale.set(4.0, 4.0, 1);
                        spookyAudio.playScreamer();
                        
                        setTimeout(() => {
                          npcSprite.material.map = npcTex;
                          npcSprite.scale.set(2.5, 2.5, 1);
                        }, 150);
                      } else if (count > 5) {
                        setNpcDialogue({ text: "快。", color: "text-red-600 font-bold" });
                        setIsDialogueShaking(true);
                      } else if (count === 5) {
                        setNpcDialogue({ text: "快。", color: "text-white" });
                        setIsDialogueShaking(false);
                      } else if (count === 4) {
                        setNpcDialogue({ text: "快", color: "text-white" });
                        setIsDialogueShaking(false);
                      } else if (count === 3) {
                        setNpcDialogue({ text: "快點", color: "text-white" });
                        setIsDialogueShaking(false);
                      } else if (count === 2) {
                        setNpcDialogue({ text: `去吧 把${ITEM_NAMES[currentStage]}找回來給我`, color: "text-white" });
                        setIsDialogueShaking(false);
                      } else {
                        setNpcDialogue({ text: `hi 幫我把${ITEM_NAMES[currentStage]}找回來`, color: "text-white" });
                        setIsDialogueShaking(false);
                      }
                  } else if (currentStage === HorrorProgression.STAGE_2) {
                      // Stage 2 specific dialogue
                      if (count >= 11) {
                        setNpcDialogue({ text: "...", color: "text-white" });
                        setIsDialogueShaking(false);
                      } else if (count === 10) {
                        setNpcDialogue({ text: "...", color: "text-white" });
                        setIsDialogueShaking(false);
                        npcSprite.material.map = monsterFaceTex;
                        npcSprite.scale.set(4.0, 4.0, 1);
                        spookyAudio.playScreamer();
                        
                        setTimeout(() => {
                          npcSprite.material.map = npc2Tex;
                          npcSprite.scale.set(2.5, 2.5, 1);
                        }, 150);
                      } else if (count >= 5) {
                        setNpcDialogue({ text: "快。", color: "text-red-600 font-bold" });
                        setIsDialogueShaking(true);
                      } else if (count === 4) {
                        setNpcDialogue({ text: "快", color: "text-white" });
                        setIsDialogueShaking(false);
                      } else if (count === 3) {
                        setNpcDialogue({ text: "走", color: "text-white" });
                        setIsDialogueShaking(false);
                      } else if (count === 2) {
                        setNpcDialogue({ text: "走阿", color: "text-white" });
                        setIsDialogueShaking(false);
                      } else {
                        setNpcDialogue({ text: "hi 去找陳家睿的左腳吧", color: "text-white" });
                        setIsDialogueShaking(false);
                      }
                  } else if (currentStage === HorrorProgression.STAGE_3) {
                      // Stage 3 specific dialogue
                      if (count >= 11) {
                        setNpcDialogue({ text: "...", color: "text-white" });
                        setIsDialogueShaking(false);
                      } else if (count === 10) {
                        setNpcDialogue({ text: "...", color: "text-white" });
                        setIsDialogueShaking(false);
                        npcSprite.material.map = monsterFaceTex;
                        npcSprite.scale.set(4.0, 4.0, 1);
                        spookyAudio.playScreamer();
                        
                        setTimeout(() => {
                          npcSprite.material.map = npc3Tex;
                          npcSprite.scale.set(2.5, 2.5, 1);
                        }, 150);
                      } else if (count === 9) {
                        setNpcDialogue({ text: "...", color: "text-white" });
                        setIsDialogueShaking(false);
                      } else if (count === 8) {
                        setNpcDialogue({ text: "嗨 去找吧", color: "text-white" });
                        setIsDialogueShaking(false);
                      } else if (count === 7) {
                        setNpcDialogue({ text: "快!!!!!!!!", color: "text-red-600 font-bold" });
                        setIsDialogueShaking(true);
                      } else if (count === 6) {
                        setNpcDialogue({ text: "趕快去找 走", color: "text-white" });
                        setIsDialogueShaking(false);
                      } else if (count === 5) {
                        setNpcDialogue({ text: "快點去找", color: "text-white" });
                        setIsDialogueShaking(false);
                      } else if (count === 4) {
                        setNpcDialogue({ text: "快走", color: "text-white" });
                        setIsDialogueShaking(false);
                      } else if (count === 3) {
                        setNpcDialogue({ text: "走", color: "text-white" });
                        setIsDialogueShaking(false);
                      } else if (count === 2) {
                        setNpcDialogue({ text: "要來不及了", color: "text-white" });
                        setIsDialogueShaking(false);
                      } else {
                        setNpcDialogue({ text: "快點找右腳", color: "text-white" });
                        setIsDialogueShaking(false);
                      }
                  } else if (currentStage === HorrorProgression.STAGE_4) {
                      // Stage 4 specific dialogue
                      if (count >= 11) {
                        setNpcDialogue({ text: "……", color: "text-white" });
                        setIsDialogueShaking(false);
                      } else if (count === 10) {
                        setNpcDialogue({ text: "……", color: "text-white" });
                        setIsDialogueShaking(false);
                        npcSprite.material.map = monsterFaceTex;
                        npcSprite.scale.set(4.0, 4.0, 1);
                        spookyAudio.playScreamer();
                        
                        setTimeout(() => {
                          npcSprite.material.map = boss2Tex;
                        }, 150);
                      } else if (count >= 2) {
                        setNpcDialogue({ text: "……", color: "text-white" });
                        setIsDialogueShaking(false);
                      } else {
                        setNpcDialogue({ text: "右手...", color: "text-white" });
                        setIsDialogueShaking(false);
                      }
                  }
                  playNpcSaySound();
              }
          } else {
              // 關閉對話框
              stateRef.current.npc.isOpen = false;
              setNpcDialogue(null);
              setIsDialogueShaking(false);
          }
      }

      // Sync React state for hints (only for other hints, as NPC hint is handled by canInteract directly)
      if (showInteractHint !== frameShowHint || (frameShowHint && interactHintText !== frameHintText)) {
          setShowInteractHint(frameShowHint);
          if (frameShowHint) setInteractHintText(frameHintText);
      }

      // Rendering
      renderer.render(scene, camera);

      frameId = requestAnimationFrame(gameLoop);
    };

    frameId = requestAnimationFrame(gameLoop);

    // Dynamic resize handler Hook
    const handleResize = () => {
      if (!containerRef.current) return;
      width = containerRef.current.clientWidth;
      height = containerRef.current.clientHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    // Clean up function on unmount
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      containerRef.current?.removeEventListener('click', handleCanvasClick);
      containerRef.current?.removeEventListener('mouseenter', handleMouseEnterCanvas);
      window.removeEventListener('mousemove', handleMouseMoveByPointer);
      containerRef.current?.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      containerRef.current?.removeEventListener('touchend', handleTouchEnd);

      // Geometry and Material cleanups
      scene.clear();
      wallGeom.dispose();
      wallMat.dispose();
      floorGeom.dispose();
      floorMat.dispose();
      ceilGeom.dispose();
      ceilMat.dispose();
      itemGeom.dispose();
      
      ghostGroup.traverse((child) => {
        if ((child as any).geometry) (child as any).geometry.dispose();
        if ((child as any).material) {
          const material = (child as any).material;
          if (Array.isArray(material)) {
            material.forEach((m: any) => m.dispose());
          } else {
            material.dispose();
          }
        }
      });

      renderer.dispose();
      if (wall1Tex) wall1Tex.dispose();
      if (ceil1Tex) ceil1Tex.dispose();
      if (wall2Tex) wall2Tex.dispose();
      if (ceil2Tex) ceil2Tex.dispose();
      if (grass1Tex) grass1Tex.dispose();
      if (grass2Tex) grass2Tex.dispose();
      skyTex.dispose();
      eyeTex.dispose();
    };
  }, [gameActive, config, isPaused, texturesLoaded]);

  // Accessibility Joystick Controllers for Mobile / Arrow clicks
  const handleTouchControl = (dir: keyof PlayerControls | 'turnLeft' | 'turnRight', isPressed: boolean) => {
    stateRef.current.controls[dir] = isPressed;
    spookyAudio.resume();
  };

  // Helper values for HUD representation
  const stage = currentStageUI;
  const isHorror = stage >= HorrorProgression.STAGE_3;

  // Subliminal color logic
  const getSubliminalClass = () => {
    if (stage === HorrorProgression.STAGE_1) return 'text-yellow-400';
    if (stage === HorrorProgression.STAGE_2) return 'text-[#FFD700]';
    if (stage === HorrorProgression.STAGE_5) return 'text-red-900 font-bold drop-shadow-[0_0_10px_red]';
    return 'text-red-600 drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]'; // Red-Black for 3-5
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    try {
      if ((spookyAudio as any).bgm1) {
        (spookyAudio as any).bgm1.volume = (newVol / 100) * 0.5;
      }
    } catch(e) {
      // Ignored
    }
  };

  const handlePlayClick = () => {
    setShowMenu(false);
    (stateRef.current as any).showMenu = false;
    (stateRef.current as any).hasPlayed = true;
    setIsPausedInternal(false);
    (stateRef.current as any).isPausedInternal = false;
    spookyAudio.playClick();
    
    // Attempt pointer lock immediately
    try {
      containerRef.current?.requestPointerLock();
    } catch(e) {
      // Silently capture any pointer lock constraints
    }
  };

  // Proximity-based monster TV static/noise effect
  const isMonsterStage = stage >= HorrorProgression.STAGE_1 && stage <= HorrorProgression.STAGE_5;
  const isMonsterActiveState = stateRef.current?.isMonsterActive;
  const monsterNoiseIntensity = (isMonsterStage && isMonsterActiveState && distToMonster < 18)
    ? Math.max(0, 1 - (distToMonster - 2) / (18 - 2))
    : 0;

  return (
    <div 
      id="game-viewport-container"
      ref={containerRef} 
      className={`absolute inset-0 bg-black flex flex-col items-center justify-center select-none overflow-hidden ${isShaking ? "shake-violent" : ""}`}
    >
        {showStage6DeadScreen && (
          <div id="stage6-dead-screen" className="absolute inset-0 bg-red-950/95 backdrop-blur-md z-[3500] flex flex-col items-center justify-center text-center animate-in fade-in duration-700">
            <div className="max-w-md w-full px-6 py-10 bg-black/85 border border-red-500 rounded-2xl shadow-[0_0_50px_rgba(220,38,38,0.5)] space-y-8 animate-in zoom-in duration-500 flex flex-col items-center">
              
              {/* Custom animated skull / icon */}
              <div className="w-16 h-16 rounded-full bg-red-950 border border-red-500 flex items-center justify-center animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.4)]">
                <span className="text-red-500 font-bold text-3xl font-mono">💀</span>
              </div>

              <div className="space-y-3">
                <h1 className="text-red-600 font-extrabold text-3xl md:text-4xl tracking-[0.15em] font-serif uppercase animate-pulse text-center">
                  戰 鬥 淨 化 失 敗
                </h1>
                <p className="text-neutral-400 font-mono text-sm tracking-wide">
                  你的靈魂已被陳家睿的狂暴意志吞噬。
                </p>
              </div>

              <div className="w-full h-px bg-gradient-to-r from-transparent via-red-900 to-transparent" />

              <div className="space-y-4 w-full flex flex-col items-center">
                <button 
                  onClick={() => {
                    if (stage6RestartRef.current) stage6RestartRef.current();
                  }}
                  className="px-8 py-4 bg-red-600 hover:bg-red-500 border border-red-400 text-white font-mono font-black text-base rounded-xl tracking-widest shadow-[0_0_25px_rgba(239,68,68,0.6)] cursor-pointer active:scale-95 transition-all text-center animate-bounce min-w-[240px]"
                >
                  確 認 重 新 開 始
                </button>
                
                <span className="text-neutral-500 font-mono text-xs tracking-wider opacity-80 animate-pulse">
                  或 按下 <kbd className="px-2 py-1 bg-stone-900 border border-stone-800 rounded text-stone-300 font-bold ml-1 mr-1">Enter</kbd> 鍵以重啟挑戰
                </span>
              </div>

            </div>
          </div>
        )}
        <style>{`
            @keyframes screen-shake {
              0% { transform: translate(2px, 2px) rotate(0deg); }
              10% { transform: translate(-2px, -3px) rotate(-1.5deg); }
              20% { transform: translate(-4px, 0px) rotate(1.5deg); }
              30% { transform: translate(0px, 3px) rotate(0deg); }
              40% { transform: translate(2px, -2px) rotate(1.5deg); }
              50% { transform: translate(-2px, 3px) rotate(-1.5deg); }
              60% { transform: translate(-4px, 2px) rotate(0deg); }
              70% { transform: translate(3px, 2px) rotate(-1.5deg); }
              80% { transform: translate(-2px, -2px) rotate(1.5deg); }
              90% { transform: translate(3px, 3px) rotate(0deg); }
              100% { transform: translate(2px, -3px) rotate(-1.5deg); }
            }
            .shake-violent {
              animation: screen-shake 0.08s infinite;
            }
        `}</style>
        {isFlashing && (
          <div className="absolute inset-0 bg-white z-[3000] pointer-events-none animate-pulse" />
        )}
        
        {/* NEW Ending Sequence White Screen Overlay */}
        <AnimatePresence>
          {isEndingWhiteScreen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 4.0 } }}
              exit={{ opacity: 0, transition: { duration: 0 } }} // Instant fade out to reveal scene seamlessly
              className="absolute inset-0 bg-white z-[4000] pointer-events-none flex items-center justify-center"
            >
              <div className="text-black font-serif text-5xl tracking-[0.5em] font-bold">
                {endingText}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Subtitle box */}
        {subtitleVisible && (
          <div className="absolute top-10 left-0 right-0 flex justify-center z-[2000]">
             <div className="bg-black/70 p-4 rounded text-white text-2xl font-bold border border-white/20">
                {subtitle}
             </div>
          </div>
        )}

      {showMenu && (
        <div 
          className="bg-black/95 flex flex-col items-center justify-center p-8 select-none pointer-events-auto"
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 1000 }}
        >
          {!showSettings ? (
            <div className="flex flex-col items-center text-center space-y-12 animate-in fade-in duration-500 max-w-xl">
              {/* Very top, tiny red text */}
              <p className="text-red-500 font-mono text-[10px] md:text-xs tracking-[0.4em] uppercase font-black">
                恐怖遊戲
              </p>
              
              {/* Main title */}
              <h1 className="text-stone-300 font-extrabold text-5xl md:text-7xl tracking-tighter uppercase drop-shadow-[0_0_20px_rgba(255,255,255,0.15)] font-serif">
                迷宮探險
              </h1>
              
              {/* Prominent, huge Warning text */}
              <div className="bg-red-950/20 border border-red-950/60 p-6 md:p-8 rounded-lg shadow-2xl skew-x-1 animate-pulse max-w-lg">
                <p className="text-red-500 font-black text-3xl md:text-4xl lg:text-5xl tracking-widest leading-tight drop-shadow-[0_0_25px_rgba(239,68,68,0.7)] font-sans">
                  極度建議佩戴耳機<br />或外放聲音<br />
                  <span className="text-xl md:text-2xl opacity-80">因為有音樂所以要開聲音或戴耳機</span>
                </p>
              </div>
              
              {/* Buttons */}
              <div className="flex flex-col space-y-5 w-72 pt-4">
                <button
                  onClick={handlePlayClick}
                  className="w-full py-5 bg-red-900/35 hover:bg-red-800/40 border border-red-600/50 text-red-100 font-black text-base uppercase tracking-[0.3em] transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(239,68,68,0.35)] flex items-center justify-center cursor-pointer"
                >
                  PLAY (開始遊戲)
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center space-y-8 animate-in zoom-in-95 duration-300 max-w-md w-full bg-stone-950/90 border border-stone-800 p-8 rounded shadow-2xl">
              <h2 className="text-stone-300 font-black text-2xl tracking-widest border-b border-stone-900 pb-3 w-full uppercase">設定 (SETTINGS)</h2>
              <div className="w-full space-y-6 pt-4 text-left font-mono">
                {/* Audio Setting Volume Row/Slider */}
                <div className="bg-stone-900/50 p-6 border border-stone-900 rounded-lg flex flex-col space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-stone-300 text-sm tracking-wider font-bold">遊戲音量 (VOLUME)</span>
                    <span className="text-red-500 font-mono font-black text-lg">{volume}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={volume} 
                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
                    className="w-full h-1.5 bg-stone-950 rounded-lg appearance-none cursor-pointer accent-red-600"
                  />
                  <div className="flex justify-between text-[10px] text-stone-600 font-mono">
                    <span>靜音</span>
                    <span>50%</span>
                    <span>最大</span>
                  </div>
                </div>

                {/* Keyboard controls */}
                <div className="text-stone-400 text-xs leading-relaxed space-y-1 border-t border-stone-900 pt-4">
                  <p>【WASD】移動角色</p>
                  <p>【Shift】角色奔跑</p>
                  <p>【Space】角色跳躍</p>
                  <p>【F / E】開啟對話 / 互動</p>
                  <p>【Tab】隨時切換主選單</p>
                </div>
              </div>

              <button
                onClick={() => {
                  setShowSettings(false);
                  spookyAudio.playClick();
                }}
                className="w-full mt-6 py-4 bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 font-bold text-xs uppercase tracking-[0.2em] transition-all cursor-pointer"
              >
                返回選單 (BACK)
              </button>
            </div>
          )}
        </div>
      )}
      {/* RUN Warning Overlay */}
      {showRunIndicator && (
        <div className="absolute top-[28%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-[250] pointer-events-none select-none flex flex-col items-center">
          <motion.div
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ 
              scale: [1, 1.25, 0.95, 1.15, 1],
              opacity: 1,
              x: [0, -6, 6, -5, 5, -6, 6, 0],
              y: [0, 4, -4, 5, -5, 4, -4, 0]
            }}
            transition={{ 
              scale: { duration: 0.4 },
              opacity: { duration: 0.2 },
              x: { repeat: Infinity, duration: 0.1 },
              y: { repeat: Infinity, duration: 0.1 }
            }}
            className="text-center font-black text-8xl md:text-9xl text-red-650 tracking-[0.1em] font-mono drop-shadow-[0_0_35px_rgba(220,38,38,0.95)] select-none uppercase pointer-events-none"
          >
            RUN
          </motion.div>
        </div>
      )}

      {/* Subliminal Overlays */}
      {subliminalText && (
        <div 
          className="fixed inset-0 pointer-events-none flex items-center justify-center z-[100]"
          style={{ 
            opacity: 0.15 + distortion * 0.5,
            transform: `translate(${(Math.random()-0.5)*30}px, ${(Math.random()-0.5)*30}px)`
          }}
        >
          <span className={`${getSubliminalClass()} text-7xl font-bold blur-[1px] tracking-[0.3em] opacity-60`}>{subliminalText}</span>
        </div>
      )}
      
      {(distortion > 0.1 || isHorror) && (
        <div 
          className={`fixed inset-0 pointer-events-none z-[80] ${isHorror ? 'bg-red-950/10' : 'bg-red-800/10'}`}
          style={{ 
            opacity: Math.max(distortion * 0.4, isHorror ? 0.2 : 0),
            mixBlendMode: 'multiply'
          }}
        />
      )}

      {/* Atmospheric Fog/Noise Layer for Horror stages */}
      {isHorror && (
        <div className="fixed inset-0 pointer-events-none opacity-10 z-[70] bg-black" />
      )}

      {/* Stage 5 Pulsating Flesh Vignette */}
      {stage === HorrorProgression.STAGE_5 && (
        <div 
          className="fixed inset-0 pointer-events-none z-[75] shadow-[inset_0_0_120px_60px_rgba(153,0,0,0.4)] animate-pulse"
          style={{
            animationDuration: `${Math.max(0.2, (distToMonster / 15)) * 1.5}s`
          }}
        />
      )}

      {/* Three.js Canvas */}
      <canvas 
        id="three-canvas"
        ref={canvasRef} 
        className="block w-full h-full cursor-crosshair" 
      />

      {/* NPC Interaction Hint */}
      {canInteract && !isTalking && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-12 z-50">
          <div className="bg-black/85 border border-red-900/40 px-5 py-2.5 rounded-sm shadow-[0_0_20px_rgba(0,0,0,0.8)] backdrop-blur-sm animate-pulse">
            <span className="text-white font-mono text-xs tracking-widest uppercase">按下 <span className="text-red-500 font-bold font-sans"> [F] </span> 進行對話</span>
          </div>
        </div>
      )}

      {/* Stage 4 Enter Prompt */}
      {showStage4EnterPrompt && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-12 z-50">
          <div className="bg-black/90 border border-red-500 px-6 py-3 rounded-sm shadow-[0_0_30px_rgba(255,0,0,0.4)] backdrop-blur-md animate-pulse scale-110 transition-transform">
            <span className="text-white font-black text-lg tracking-[0.2em] uppercase">按下 <span className="text-red-500 underline underline-offset-4"> [F] </span> 進入</span>
          </div>
        </div>
      )}

      {/* NPC Dialogue Box */}
      {isTalking && npcDialogue && (
        <div className={`dialogue absolute bottom-24 left-1/2 -translate-x-1/2 z-[150] w-full max-w-2xl px-6 ${isDialogueShaking ? 'animate-bounce' : ''}`}>
          <div className={`bg-black/80 border-2 border-neutral-800 p-6 rounded-sm shadow-[0_0_50px_rgba(0,0,0,1)] relative overflow-hidden ${isDialogueShaking ? 'border-red-900 shadow-red-900/50' : ''}`}>
            <div className={`absolute top-0 left-0 w-full h-1 ${isDialogueShaking ? 'bg-red-600' : 'bg-neutral-900'}`} />
            <div className="flex flex-col space-y-4">
              <div className="flex justify-between items-center border-b border-neutral-900 pb-2">
                 <span className="text-neutral-500 font-mono text-[10px] tracking-widest uppercase">陌生人</span>
                 <span className="text-neutral-500 font-mono text-[8px] uppercase">Talk Count: {npcInteractionCount}</span>
              </div>
              <p className={`${npcDialogue.color} text-xl md:text-2xl font-serif tracking-tight leading-relaxed transition-colors duration-500`}>
                {npcDialogue.text}
              </p>
            </div>
            <div className="mt-4 flex justify-end">
               <span className="text-neutral-600 font-mono text-[9px] animate-pulse">按 [F] 關閉對話</span>
            </div>
          </div>
        </div>
      )}

      {/* JumpScare Overlay */}
      <AnimatePresence>
        {isJumpscareActive && (
          <motion.div
            initial={{ opacity: 0, scale: 1.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] bg-black flex items-center justify-center overflow-hidden pointer-events-auto"
          >
            <img 
              src="/monster.jpg" 
              alt="Jumpscare"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover brightness-[0.6]"
            />
            <div className="absolute inset-0 bg-red-900/20 mix-blend-overlay animate-pulse" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Screen Blink Overlay */}
      <div 
        id="blink-layer"
        className={`fixed inset-0 z-[1000] bg-black transition-opacity duration-300 pointer-events-none ${isBlinking ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Spooky Vignette Overlay Layer - REMOVED per user request */}
      {/* 
      <div 
        id="darkness-vignette"
        className={`absolute inset-0 pointer-events-none transition-all duration-1000 
          ${isHorror 
            ? 'shadow-[inset_0_0_150px_100px_rgba(0,0,0,1)]' 
            : 'shadow-[inset_0_0_180px_150px_rgba(0,0,0,1)]'}
          ${isGlitching ? 'bg-red-900/40 mix-blend-overlay ring-[20px] ring-red-600/50' : ''}
        `}
      />
      */}

      {/* Glitch Overlay */}
      {isGlitching && (
        <div className="absolute inset-0 z-50 pointer-events-none bg-black flex items-center justify-center overflow-hidden">
             <div className="text-red-600 font-mono text-4xl animate-pulse glitch-text">
                SYSTEM ERROR: COGNITIVE COLLAPSE
             </div>
             <div className="absolute inset-0 bg-[url('https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNGJ5Y2Z5Y2Z5Y2Z5Y2Z5Y2Z5Y2Z5Y2Z5Y2Z5Y2Z5Y2Z5JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/3o7TKMGBy1GvVCS7uM/giphy.gif')] opacity-20 mix-blend-screen" />
        </div>
      )}

      {/* Ambient static crackle noise overlay for deep jumpscare threat */}
      <div 
        id="threat-grain-layer"
        className="absolute inset-0 pointer-events-none opacity-[0.03] mix-blend-overlay"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")',
        }}
      />

      {/* Proximity-Based Active Horror Noise Layers */}
      {monsterNoiseIntensity > 0 && (
        <>
          {/* Base high-frequency analog static layer */}
          <div 
            id="proximity-noise-layer-1"
            className="absolute inset-0 pointer-events-none z-[85] bg-repeat animate-noise-shift"
            style={{
              backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilterRealtime\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilterRealtime)\'/%3E%3C/svg%3E")',
              mixBlendMode: 'color-dodge',
              opacity: monsterNoiseIntensity * 0.38,
            }}
          />
          {/* Secondary coarse grains for rich organic look */}
          <div 
            id="proximity-noise-layer-2"
            className="absolute inset-0 pointer-events-none z-[86] bg-repeat animate-noise-shift"
            style={{
              backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 150 150\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter2\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.95\' numOctaves=\'2\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter2)\'/%3E%3C/svg%3E")',
              mixBlendMode: 'overlay',
              opacity: monsterNoiseIntensity * 0.48,
            }}
          />
          {/* Black warning border vignette */}
          <div 
            id="proximity-black-vignette"
            className="absolute inset-0 pointer-events-none z-[84] transition-all duration-150"
            style={{
              boxShadow: `inset 0 0 ${50 + monsterNoiseIntensity * 90}px ${15 + monsterNoiseIntensity * 45}px rgba(0, 0, 0, ${monsterNoiseIntensity * 0.85})`,
            }}
          />
        </>
      )}

      {/* Pause Menu Overlay */}
      {isPausedInternal && (
        <div 
          className="bg-black/95 flex items-center justify-center backdrop-blur-md pointer-events-auto"
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 1000 }}
        >
          {!showPauseSettings ? (
            <div className="flex flex-col items-center space-y-10 animate-in fade-in zoom-in duration-300">
              <div className="text-center space-y-2">
                <h2 className="text-stone-300 font-extrabold text-6xl tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.15)] font-serif">暫停</h2>
                <p className="text-neutral-500 font-mono text-xs tracking-widest uppercase">P A U S E D</p>
              </div>
              
              <div className="flex flex-col space-y-4 w-72">
                <button 
                  onClick={() => {
                    playMenuClickSound();
                    setIsPausedInternal(false);
                    (stateRef.current as any).isPausedInternal = false;
                    setShowMenu(false);
                    (stateRef.current as any).showMenu = false;
                    spookyAudio.playClick();
                  }}
                  className="w-full py-5 bg-red-900/35 hover:bg-red-800/45 border border-red-600/50 text-red-100 font-bold text-sm uppercase tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center shadow-lg cursor-pointer"
                >
                  繼續遊戲 (CONTINUE)
                </button>

                <button 
                  onClick={() => {
                    playMenuClickSound();
                    setShowPauseSettings(true);
                    spookyAudio.playClick();
                  }}
                  className="w-full py-5 bg-stone-900 hover:bg-stone-850 border border-stone-800/60 text-stone-300 font-bold text-sm uppercase tracking-[0.2em] transition-all active:scale-95 cursor-pointer"
                >
                  設定 (SETTINGS)
                </button>
                
                <button 
                  onClick={() => {
                    playMenuClickSound();
                    spookyAudio.playClick();
                    // Clean reset/back to main starting screen
                    window.location.reload(); 
                  }}
                  className="w-full py-5 bg-stone-950 hover:bg-stone-900 border border-stone-900 text-stone-400 font-bold text-sm uppercase tracking-[0.2em] transition-all active:scale-95 cursor-pointer"
                >
                  退出遊戲 (EXIT TO MENU)
                </button>
              </div>

              {/* Developer Mode in Pause Menu Bottom Right */}
              <div className="absolute bottom-10 right-10 flex flex-col items-end">
                  {devMode ? (
                      <div className="bg-black/80 border border-red-900/50 p-4 rounded-lg font-mono text-xs text-red-500 shadow-xl pointer-events-auto w-64 animate-in fade-in slide-in-from-bottom-5">
                          <div className="mb-2 font-bold uppercase tracking-wider border-b border-red-900/30 pb-1 flex justify-between">
                              <span>Dev Mode</span>
                              <button onClick={() => setDevMode(false)} className="text-[10px] hover:text-white font-black">HIDE</button>
                          </div>
                          <div className="space-y-1">
                              <div className="grid grid-cols-2 gap-1 mb-2">
                                <button 
                                  onClick={() => {
                                    stateRef.current.spawnDevItem?.();
                                  }}
                                  className="bg-emerald-900/40 hover:bg-emerald-800/60 p-1 rounded text-[10px] text-emerald-200 cursor-pointer"
                                >
                                  +1 Item
                                </button>
                                <button 
                                  onClick={() => {
                                    setSanity(100);
                                    spookyAudio.playClick();
                                  }}
                                  className="bg-blue-900/40 hover:bg-blue-800/60 p-1 rounded text-[10px] text-blue-200 cursor-pointer"
                                >
                                  Restore Sanity
                                </button>
                                <button 
                                  onClick={() => {
                                    stateRef.current.isInvincible = !stateRef.current.isInvincible;
                                    spookyAudio.playClick();
                                  }}
                                  className="bg-purple-900/40 hover:bg-purple-800/60 p-1 rounded text-[10px] text-purple-200 cursor-pointer"
                                >
                                  Invincible: {stateRef.current.isInvincible ? 'ON' : 'OFF'}
                                </button>
                                <button 
                                  onClick={() => {
                                     const boss = stateRef.current.boss;
                                     const scene = (stateRef.current as any).scene;
                                     if (boss && scene) {
                                       // Cleanup bullets
                                       boss.normalBullets.forEach((b: any) => scene.remove(b.mesh));
                                       boss.normalBullets = [];
                                       boss.burstBullets.forEach((b: any) => scene.remove(b.mesh));
                                       boss.burstBullets = [];
                                       boss.bulletMode = 'NONE';
                                       
                                       // Cleanup other patterns
                                       clearLasers();
                                       clearOrbitalStrikes();
                                       clearMatrixStrikes();
                                       clearPrismSniping();
                                       clearTripleLaneBlast();
                                       boss.activePatterns = [];
                                       
                                       // Transition phase
                                       if (['P1_SURVIVAL', 'PHASE_1'].includes(boss.bossPhase)) {
                                           boss.p1TotalTime = boss.p1Duration || 0; // Force end
                                           boss.bossPhase = 'READY_TO_ATTACK';
                                           setBossPhase('READY_TO_ATTACK');
                                        } else if (['PHASE_4', 'VULNERABLE_P4'].includes(boss.bossPhase)) {
                                            boss.p4TotalTime = boss.p4Duration || 0;
                                            boss.p4LaserSweepIndex = 6;
                                            boss.bossPhase = 'VULNERABLE_P4';
                                            setBossPhase('VULNERABLE_P4');
                                            spookyAudio.playSparkleHint();
                                            setNpcDialogue({ 
                                              text: "⚡ 艾德加防線瓦解！趁現在按下 [F] 鍵發動最終斬擊進入第五階段！", 
                                              color: "text-amber-400 font-extrabold text-sm tracking-wide animate-pulse" 
                                            });
                                        } else if (['PHASE_5', 'VULNERABLE_P5'].includes(boss.bossPhase)) {
                                            boss.p5TotalTime = boss.p5Duration || 0;
                                            boss.p4LaserSweepIndex = 3;
                                            boss.bossPhase = 'VULNERABLE_P5';
                                            setBossPhase('VULNERABLE_P5');
                                            spookyAudio.playSparkleHint();
                                            setNpcDialogue({ 
                                              text: "連按 [F] 鍵發動最終淨化斬擊！", 
                                              color: "text-amber-400 font-extrabold text-xl tracking-widest animate-pulse" 
                                            });
                                       } else if (['P2_SURVIVAL', 'PHASE_2'].includes(boss.bossPhase)) {
                                           boss.p2TotalTime = boss.p2Duration || 0;
                                           boss.bossPhase = 'VULNERABLE_P2';
                                           setBossPhase('VULNERABLE_P2');
                                       } else if (['P3_SURVIVAL', 'PHASE_3'].includes(boss.bossPhase)) {
                                           boss.p3TotalTime = boss.p3Duration || 0;
                                           boss.bossPhase = 'VULNERABLE_P3';
                                           setBossPhase('VULNERABLE_P3');
                                       }
                                       
                                       spookyAudio.playClick();
                                     }
                                  }}
                                  className="bg-yellow-900/40 hover:bg-yellow-800/60 p-1 rounded text-[10px] text-yellow-200 cursor-pointer"
                                >
                                  Skip Barrage
                                </button>
                              </div>
                              <div className="text-[9px] text-neutral-500 mb-1 font-bold uppercase">Jump to Stage:</div>
                              {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                              <button 
                                  key={s}
                                  onClick={() => {
                                    triggerRef.current?.(s);
                                    spookyAudio.playClick();
                                  }}
                                  className={`w-full text-left px-2 py-1 rounded hover:bg-red-900/20 cursor-pointer ${stage === s ? 'bg-red-900/40 text-red-200' : ''}`}
                                >
                                  Stage {s}: {['第一關 (Safe)', '第二關 (Flash)', '第三關 (Approach)', '第四關 (Chase)', '第五關 (Ultimate)', '第六關 (Boss)', '第七關 (The End)'][s-1]}
                                </button>
                              ))}
                          </div>
                      </div>
                  ) : (
                      <button 
                          onClick={() => setDevMode(true)}
                          className="bg-black/20 hover:bg-red-900/40 p-2 rounded text-[10px] text-white/30 hover:text-red-500 transition-colors uppercase tracking-widest border border-transparent hover:border-red-900/50 cursor-pointer"
                      >
                          Enable Developer Mode
                      </button>
                  )}
              </div>

              <div className="mt-8 text-neutral-700 font-mono text-[9px] uppercase tracking-tighter text-center max-w-xs opacity-50">
                Chen Chia-rui is still watching.<br />
                He is behind the walls.
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center space-y-8 animate-in zoom-in-95 duration-300 max-w-md w-full bg-stone-950/90 border border-stone-800 p-8 rounded shadow-2xl">
              <h2 className="text-stone-300 font-black text-2xl tracking-widest border-b border-stone-900 pb-3 w-full uppercase">設定 (SETTINGS)</h2>
              <div className="w-full space-y-6 pt-4 text-left font-mono">
                {/* Audio Setting Volume Row/Slider */}
                <div className="bg-stone-900/50 p-6 border border-stone-900 rounded-lg flex flex-col space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-stone-300 text-sm tracking-wider font-bold">遊戲音量 (VOLUME)</span>
                    <span className="text-red-500 font-mono font-black text-lg">{volume}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={volume} 
                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
                    className="w-full h-1.5 bg-stone-950 rounded-lg appearance-none cursor-pointer accent-red-600"
                  />
                  <div className="flex justify-between text-[10px] text-stone-600 font-mono">
                    <span>靜音</span>
                    <span>50%</span>
                    <span>最大</span>
                  </div>
                </div>

                {/* Keyboard controls */}
                <div className="text-stone-400 text-xs leading-relaxed space-y-1 border-t border-stone-900 pt-4">
                  <p>【WASD】移動角色</p>
                  <p>【Shift】角色奔跑</p>
                  <p>【Space】角色跳躍</p>
                  <p>【F / E】開啟對話 / 互動</p>
                  <p>【Tab】隨時切換主選單</p>
                </div>
              </div>

              <button
                onClick={() => {
                  setShowPauseSettings(false);
                  playMenuClickSound();
                  spookyAudio.playClick();
                }}
                className="w-full mt-6 py-4 bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 font-bold text-xs uppercase tracking-[0.2em] transition-all cursor-pointer"
              >
                返回選單 (BACK)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating prompt on Boss's face when player has Collected the Core */}
      {stage === HorrorProgression.STAGE_6 && (!stateRef.current.boss.hasBeenAttacked || bossPhase === 'VULNERABLE_P2' || bossPhase === 'VULNERABLE_P3' || bossPhase === 'VULNERABLE_P4') && (bossPhase === 'READY_TO_ATTACK' || bossPhase === 'VULNERABLE_P2' || bossPhase === 'VULNERABLE_P3' || bossPhase === 'VULNERABLE_P4') && (
        <div id="boss-face-f-attack-hint" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[41] pointer-events-none flex flex-col items-center">
          <div className="bg-red-950/95 border border-red-500 text-white font-mono text-base font-black tracking-widest px-8 py-4 rounded-xl shadow-[0_0_35px_rgba(239,68,68,0.7)] text-center flex flex-col items-center space-y-1 backdrop-blur-md">
            <span className="text-white text-base font-black tracking-wider pt-0.5">
              按F攻擊boss
            </span>
          </div>
        </div>
      )}

      {/* NEW stage 6 P5 Mash UI */}
      {stage === HorrorProgression.STAGE_6 && bossPhase === 'VULNERABLE_P5' && (
        <div id="p5-mash-ui" className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[150] pointer-events-none flex flex-col items-center justify-center">
          <div className="relative flex items-center justify-center">
            <svg width="180" height="180" className="absolute transform -rotate-90 scale-110 drop-shadow-[0_0_20px_rgba(220,38,38,0.8)]">
              <circle 
                cx="90" cy="90" r="75" 
                fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="16" 
              />
              <circle 
                cx="90" cy="90" r="75" 
                fill="none" stroke="#ef4444" strokeWidth="16" 
                strokeDasharray="471.24" 
                strokeDashoffset={471.24 * (1 - Math.min(1, bossMashProgress / 20))}
                className="transition-all duration-[30ms] ease-out"
                strokeLinecap="round"
              />
            </svg>

            {/* Pulse layer that fires on each key press */}
            {mashCount > 0 && (
              <div key={`pulse-${mashCount}`} className="absolute w-full h-full flex items-center justify-center animate-mash-pulse pointer-events-none">
                <div className={`w-32 h-32 rounded-full border-[6px] ${bossMashProgress > 15 ? 'border-amber-400 bg-amber-500/30' : 'border-red-400 bg-red-500/30'} flex items-center justify-center shadow-[0_0_50px_rgba(239,68,68,1)] mix-blend-screen`}>
                   <span className="text-white text-6xl font-black drop-shadow-[0_0_10px_rgba(255,255,255,1)]">F</span>
                </div>
              </div>
            )}

            {/* Base F button background */}
            <div className={`w-32 h-32 bg-red-800/90 rounded-full border-[6px] ${bossMashProgress > 15 ? 'border-amber-500 scale-110 shadow-[0_0_80px_rgba(245,158,11,1)] animate-jitter' : bossMashProgress > 8 ? 'border-red-500 scale-105 shadow-[0_0_60px_rgba(239,68,68,1)]' : 'border-red-600 scale-100 shadow-[0_0_30px_rgba(239,68,68,1)]'} flex items-center justify-center backdrop-blur-md transition-all duration-150`}>
               <span className={`text-white text-6xl font-black tracking-tighter mix-blend-screen drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${bossMashProgress > 15 ? 'text-amber-100 drop-shadow-[0_0_20px_rgba(245,158,11,1)]' : ''}`}>F</span>
            </div>
            
            {/* Intensity particles/flares at late progress */}
            {bossMashProgress > 10 && (
              <>
                 <div className="absolute top-0 left-0 w-full h-full animate-[spin_2s_linear_infinite] pointer-events-none mix-blend-screen opacity-70">
                    <div className="absolute top-[-5%] left-[50%] w-1.5 h-12 bg-red-400 blur-sm transform -translate-x-[50%]"></div>
                    <div className="absolute bottom-[-5%] left-[50%] w-1.5 h-12 bg-red-400 blur-sm transform -translate-x-[50%]"></div>
                 </div>
              </>
            )}
            {bossMashProgress > 15 && (
              <>
                 <div className="absolute top-0 left-0 w-full h-full animate-[spin_3s_linear_infinite] pointer-events-none mix-blend-screen">
                    <div className="absolute top-[-10%] left-[50%] w-2 h-16 bg-amber-400 blur-sm transform -translate-x-[50%]"></div>
                    <div className="absolute bottom-[-10%] left-[50%] w-2 h-16 bg-amber-400 blur-sm transform -translate-x-[50%]"></div>
                 </div>
                 <div className="absolute top-0 left-0 w-full h-full animate-[spin_4s_linear_infinite_reverse] pointer-events-none mix-blend-screen">
                    <div className="absolute top-[50%] left-[-10%] h-2 w-16 bg-amber-300 blur-sm transform -translate-y-[50%]"></div>
                    <div className="absolute top-[50%] right-[-10%] h-2 w-16 bg-amber-300 blur-sm transform -translate-y-[50%]"></div>
                 </div>
              </>
            )}
            {bossMashProgress > 18 && (
              <>
                 <div className="absolute top-[-20%] left-[50%] transform -translate-x-[50%] animate-pulse-glitch opacity-80 pointer-events-none mix-blend-screen text-amber-200 font-bold text-xl drop-shadow-[0_0_15px_rgba(245,158,11,1)]">
                   打破極限！
                 </div>
                 <div className="absolute top-0 left-0 w-full h-full animate-[spin_1s_linear_infinite] pointer-events-none mix-blend-screen">
                    <div className="absolute top-[-15%] left-[50%] w-3 h-20 bg-white blur-md transform -translate-x-[50%]"></div>
                    <div className="absolute bottom-[-15%] left-[50%] w-3 h-20 bg-white blur-md transform -translate-x-[50%]"></div>
                 </div>
              </>
            )}
          </div>
          <p className={`mt-12 font-black text-3xl tracking-[0.3em] ${bossMashProgress > 15 ? 'text-amber-400 drop-shadow-[0_0_30px_rgba(245,158,11,1)] scale-125' : 'text-red-400 drop-shadow-[0_0_20px_rgba(239,68,68,1)] scale-100'} transition-all duration-200 animate-pulse`}>
            {bossMashProgress > 15 ? '即將瓦解！' : '連按攻擊！'}
          </p>
        </div>
      )}

      {/* Target subtitle dialog at the top center */}
      {stage === HorrorProgression.STAGE_6 && bossNpcDialogue && (
        <div id="boss-top-dialogue-subtitle" className="absolute top-[8%] left-1/2 -translate-x-1/2 z-[100] w-full max-w-lg px-4 flex flex-col items-center pointer-events-none select-none">
          <div className="bg-neutral-950/95 border-2 border-red-950/90 rounded-2xl p-6 shadow-[0_0_50px_rgba(239,68,68,0.4)] backdrop-blur-md w-full flex flex-col items-center text-center space-y-1 w-full max-w-md">
            <span className="text-red-500 font-mono text-[10px] tracking-[0.25em] uppercase font-black">
              陳 家 睿 的 意 念 顫 動
            </span>
            <span className="text-stone-300 font-mono text-xs opacity-60">
              [ 意識殘留之低語 ]
            </span>
            <p className="text-white font-sans font-black text-xl md:text-2xl tracking-[0.1em] pt-3 leading-relaxed whitespace-pre-line text-red-50">
              {bossNpcDialogue}
            </p>
          </div>
        </div>
      )}

      {/* Stage 6 Parry Subtitle and Status Display */}
      {stage === HorrorProgression.STAGE_6 && ((bossPhase === 'PHASE_4' && stateRef.current.boss.p4Stage === 'SWEEP_LASER') || bossPhase === 'PHASE_5') && (
        <div id="boss-parry-subtitle-overlay" className="absolute top-[22%] left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4 flex flex-col items-center pointer-events-none select-none text-center space-y-4 animate-in fade-in duration-300">
          <div className="bg-black/92 border-[3.5px] border-amber-500 rounded-2xl px-8 py-5 shadow-[0_0_50px_rgba(245,158,11,0.7)] backdrop-blur-md w-full flex flex-col items-center justify-center space-y-1.5">
            <span className="text-amber-400 font-sans font-black text-3xl md:text-4xl tracking-wider block drop-shadow-[0_0_15px_rgba(245,158,11,1)]">
              看準時機按F格擋
            </span>
          </div>
        </div>
      )}

      {/* Stage 6 Boss - Player HP display (Bottom-Left Corner) */}
      {stage === HorrorProgression.STAGE_6 && bossPhase !== 'NONE' && (
        <div 
          id="stage-6-player-hp" 
          className={`fixed z-[42] bg-black/85 border border-red-500/45 rounded-xl p-3.5 shadow-[0_0_25px_rgba(239,68,68,0.35)] backdrop-blur-md flex flex-col space-y-1.5 min-w-[210px] select-none pointer-events-none transition-all duration-300
            ${showTouchControls ? 'bottom-36 left-6' : 'bottom-6 left-6'}`}
        >
          <div className="flex justify-between items-center">
            <span className="text-red-500 font-mono text-[10px] tracking-[0.2em] font-black uppercase">
              Player HP
            </span>
            <span className="text-white font-black font-mono text-base tracking-wider animate-pulse flex items-center gap-1">
              <span className="text-red-500 font-sans text-xs animate-ping absolute rounded-full h-2 w-2 bg-red-400 opacity-75"></span>
              <span className="text-red-500 font-sans text-xs relative">♥</span>
              <span>{bossPlayerHp}</span>
              <span className="text-neutral-500 text-xs">/ 40</span>
            </span>
          </div>

          <div className="w-full bg-neutral-950 h-2.5 rounded-full overflow-hidden mt-1.5 border border-red-950/40">
            <div 
              className="h-full bg-red-600 transition-all duration-200 shadow-[0_0_8px_#ef4444]" 
              style={{ width: `${(bossPlayerHp / 40) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Stage 6 Countdown Overlay */}
      {stage === HorrorProgression.STAGE_6 && bossPhase === 'COUNTDOWN' && (
        <div id="countdown-overlay" className="absolute inset-0 z-[45] flex flex-col items-center justify-center bg-black/60 backdrop-blur-[1px] pointer-events-none select-none">
          <div className="text-center">
            <div className="text-red-500 font-sans font-black text-8xl md:text-9xl tracking-widest drop-shadow-[0_0_32px_rgba(239,68,68,0.8)]">
              {Math.ceil(countdownTime)}
            </div>
            <div className="text-neutral-400 font-mono text-[10px] tracking-[0.25em] uppercase mt-8 drop-shadow-md animate-pulse">
              邪 靈 降 臨 中 . . . 準 備 迎 戰 ！
            </div>
          </div>
        </div>
      )}

      {/* Victory Fade Overlay */}
      {isVictoryFading && (
        <div 
           className="absolute inset-0 z-[5000] pointer-events-none bg-black" 
           style={{
             animation: "victoryFadeIn 3s ease-in-out forwards"
           }} 
        />
      )}
      <style>{`
        @keyframes victoryFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
      `}</style>
      
      {/* STAMINA BAR (STAGE 1, 2, 3, 5) */}
      {(stage === HorrorProgression.STAGE_1 || stage === HorrorProgression.STAGE_2 || stage === HorrorProgression.STAGE_3 || stage === HorrorProgression.STAGE_5) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[40] w-[400px] h-3 bg-neutral-900/60 border border-neutral-800 rounded-full overflow-hidden backdrop-blur-sm">
          <div 
            className="h-full bg-amber-500 transition-all duration-100 ease-linear shadow-[0_0_10px_rgba(245,158,11,0.6)]"
            style={{ width: `${(stateRef.current.stamina / 100) * 100}%` }}
          />
        </div>
      )}

      {/* Horror HUD Displays */}
      <div id="horror-hud-bars" className="absolute inset-x-0 top-0 p-5 z-20 flex flex-row items-start justify-between pointer-events-none font-sans select-none">
        
        {/* Left Stats Side */}
        <div id="hud-stats-left" className="space-y-3.5 max-w-[200px]">
          {/* Item counter */}
          <div id="item-collected-tracker" className={`bg-black/60 border border-neutral-900/80 rounded px-3 py-2 text-white shadow-lg backdrop-blur-sm flex-col space-y-1 overflow-hidden ${!isTrackerVisible || stage === HorrorProgression.STAGE_6 || stage === HorrorProgression.STAGE_7 || stage === HorrorProgression.STAGE_8 ? 'hidden' : 'flex'}`}>
            <span className={`text-[10px] font-mono tracking-[0.15em] uppercase font-bold transition-colors duration-1000 ${isHorror ? 'text-red-600 animate-jitter' : 'text-amber-500'}`}>
              {isHorror ? (stage === HorrorProgression.STAGE_4 ? '尋找陳家睿的右手' : '尋找陳家睿的右腳') : `尋獲物品：${ITEM_NAMES[stage] || '陳家睿的軀幹'}`}
            </span>
            <div className="flex items-center space-x-2">
              <span className={`text-2xl font-bold font-mono tracking-widest transition-colors duration-1000 ${isHorror ? 'text-red-700 animate-jitter' : 'text-amber-400'}`}>
                {collectedCount} <span className="text-xs text-neutral-600">/ 1</span>
              </span>
              <div className="flex space-x-1">
                {[...Array(1)].map((_, idx) => (
                  <div 
                    key={idx}
                    className={`w-4 h-4 rounded-full border transition-all duration-1000
                      ${isHorror ? 'border-red-900' : 'border-amber-600/50'}
                      ${idx < collectedCount 
                        ? (isHorror 
                             ? 'bg-red-800 shadow-[0_0_8px_rgba(153,27,27,0.9)] scale-110' 
                             : 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]') 
                        : 'bg-transparent'}
                    `}
                  />
                ))}
              </div>
            </div>
            {stateRef.current.isLevel4 && (
              <div id="branch-progress-tracker" className="pt-2 border-t border-red-950/40 flex flex-col space-y-1">
                <span className="text-[10px] font-mono tracking-[0.15em] uppercase font-bold text-red-500 animate-pulse">
                  分岔路通關進度
                </span>
                <span className="text-xl font-bold font-mono tracking-widest text-red-500">
                  {branchesCleared} <span className="text-xs text-neutral-600">/ 5</span>
                </span>
              </div>
            )}
          </div>

        </div>

        {/* Right Utility Side */}
        {/* NPC Direction Arrow: Red screen-space edge indicator */}
        <div 
          ref={arrowRef}
          className="fixed z-50 text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.95)] opacity-0 transition-opacity duration-300 pointer-events-none"
        >
          <ArrowUp size={64} strokeWidth={4} />
        </div>
      </div>



      {/* On-Screen Touch Controls */}
      {showTouchControls && (
        <div 
          id="onscreen-joystick-overlay"
          className="absolute inset-x-0 bottom-6 z-30 flex justify-between items-end px-6 pointer-events-none select-none"
        >
          {/* Left Side: Movement D-Pad */}
          <div id="touch-move-dpad" className="flex flex-col items-center space-y-1.5 pointer-events-auto shrink-0 bg-neutral-950/40 p-2 rounded-xl border border-neutral-900/40">
            <button
              onTouchStart={() => handleTouchControl('forward', true)}
              onTouchEnd={() => handleTouchControl('forward', false)}
              className="w-14 h-11 bg-neutral-900/80 active:bg-neutral-850/95 border border-neutral-700/60 rounded text-neutral-150 font-bold text-sm shadow-md flex items-center justify-center cursor-pointer select-none"
            >
              W
            </button>
            <div className="flex space-x-1.5">
              <button
                onTouchStart={() => handleTouchControl('left', true)}
                onTouchEnd={() => handleTouchControl('left', false)}
                className="w-13 h-11 bg-neutral-900/80 active:bg-neutral-850/95 border border-neutral-700/60 rounded text-neutral-150 font-bold text-sm shadow-md flex items-center justify-center cursor-pointer select-none"
              >
                A
              </button>
              <button
                onTouchStart={() => handleTouchControl('backward', true)}
                onTouchEnd={() => handleTouchControl('backward', false)}
                className="w-13 h-11 bg-neutral-900/80 active:bg-neutral-850/95 border border-neutral-700/60 rounded text-neutral-150 font-bold text-sm shadow-md flex items-center justify-center cursor-pointer select-none"
              >
                S
              </button>
              <button
                onTouchStart={() => handleTouchControl('right', true)}
                onTouchEnd={() => handleTouchControl('right', false)}
                className="w-13 h-11 bg-neutral-900/80 active:bg-neutral-850/95 border border-neutral-700/60 rounded text-neutral-150 font-bold text-sm shadow-md flex items-center justify-center cursor-pointer select-none"
              >
                D
              </button>
            </div>
          </div>

          {/* Right Side: Direction Rotation buttons */}
          <div id="touch-turning-pad" className="flex flex-col items-end space-y-2.5 pointer-events-auto">
            {/* Turning Joy Left/Right */}
            <div className="flex space-x-1.5 bg-neutral-950/40 p-2 rounded-xl border border-neutral-900/40">
              <button
                onTouchStart={() => handleTouchControl('turnLeft', true)}
                onTouchEnd={() => handleTouchControl('turnLeft', false)}
                className="w-13 h-11 bg-neutral-900/80 active:bg-neutral-850/95 border border-neutral-700/60 rounded text-neutral-150 font-bold text-xs shadow-md flex items-center justify-center cursor-pointer select-none"
              >
                ◀ 旋轉
              </button>
              <button
                onTouchStart={() => handleTouchControl('turnRight', true)}
                onTouchEnd={() => handleTouchControl('turnRight', false)}
                className="w-13 h-11 bg-neutral-900/80 active:bg-neutral-850/95 border border-neutral-700/60 rounded text-neutral-200 font-bold text-xs shadow-md flex items-center justify-center cursor-pointer select-none"
              >
                旋轉 ▶
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stage 4 Cutscene Video */}
      {isPlayingVideo && (
        <div className="fixed inset-0 z-[3000] bg-black flex items-center justify-center pointer-events-auto">
          <video 
            ref={videoRef}
            src="/anime.mp4" 
            autoPlay 
            className="w-full h-full object-cover"
            onEnded={() => {
              setIsPlayingVideo(false);
              stateRef.current.isPlayingVideo = false;
              
              const playerState = stateRef.current.player;
              const scene = (stateRef.current as any).scene;
              const camera = (stateRef.current as any).camera;
              const ghostGroup = (stateRef.current as any).ghostGroup;
              const npcSprite = (stateRef.current as any).npcSprite;
              const disposeObject = (stateRef.current as any).disposeObject;
              const wallMat = (stateRef.current as any).wallMat;

              stateRef.current.level4.isSceneLoaded = true;
              setIsBlinking(true);
              stateRef.current.isBlinking = true;
              
              // Teleport player to the start of the long corridor (+Z direction)
              playerState.x = 11;
              playerState.z = 9;
              playerState.angle = 0; // facing +Z
              
              if (camera) {
                camera.position.set(11, playerState.y, 9);
                camera.rotation.y = 0;
              }

              // Position monster behind correctly at x=11, z=4
              if (ghostGroup) {
                ghostGroup.position.set(11, 0, 4);
                ghostGroup.visible = true;
              }

              // Physically remove the side door and starting room mesh when the chase "loads"
              if (scene) {
                const sideDoor = scene.getObjectByName("sideDoor");
                if (sideDoor) {
                    if (disposeObject) disposeObject(sideDoor);
                    scene.remove(sideDoor);
                }

                const startRoom = scene.getObjectByName("stage4StartingRoom");
                if (startRoom) {
                    if (disposeObject) disposeObject(startRoom);
                    scene.remove(startRoom);
                }
                
                // CRITICAL: Update walls and hitboxes for Stage 4 corridor (16x120)
                const mazeGrid = stateRef.current.mazeGrid;
                const gridH = mazeGrid.length;
                const gridW = mazeGrid[0].length;
                const wallMeshesMap = stateRef.current.wallMeshesMap;
                const wallBoxes = stateRef.current.wallBoxes;
                
                // 1. Hide ALL existing wall meshes in the map
                wallMeshesMap.forEach(mesh => {
                    mesh.visible = false;
                });
                
                // 2. Clear old hitboxes
                wallBoxes.length = 0;

                // 3. Populate Level 4 walls and hitboxes
                for (let z = 0; z < gridH; z++) {
                    for (let x = 0; x < gridW; x++) {
                        const isWall = mazeGrid[z][x] === 1;
                        if (isWall) {
                            let wallMesh = wallMeshesMap.get(`${x},${z}`);
                            
                            // If mesh doesn't exist for this coordinate (common for z >= 40), create it
                            if (!wallMesh && wallMat) {
                                const wallGeom = new THREE.BoxGeometry(2.02, 2.2, 2.02);
                                wallMesh = new THREE.Mesh(wallGeom, wallMat);
                                const wx = x * 2 + 1;
                                const wz = z * 2 + 1;
                                wallMesh.position.set(wx, 1.1, wz);
                                wallMesh.receiveShadow = true;
                                wallMesh.castShadow = true;
                                scene.add(wallMesh);
                                wallMeshesMap.set(`${x},${z}`, wallMesh);
                            }
                            
                            if (wallMesh) wallMesh.visible = true;

                            // Add hitbox for collisions
                            const wx = x * 2 + 1;
                            const wz = z * 2 + 1;
                            wallBoxes.push({
                                minX: wx - 1,
                                maxX: wx + 1,
                                minZ: wz - 1,
                                maxZ: wz + 1,
                            });
                        }
                    }
                }
              }

              if (npcSprite) {
                  npcSprite.visible = false;
              }

              setTimeout(() => {
                  setIsBlinking(false);
                  stateRef.current.isBlinking = false;
                  
                  // Start Chase Music and Monster AI precisely when chase starts after loading
                  const gState = stateRef.current.ghost;
                  gState.active = true;
                  gState.state = MonsterAIState.PERSISTENT_CHASE;
                  gState.speed = 5.9;
                  
                  stateRef.current.isMonsterActive = true;
                  stateRef.current.isChasing = true;
                  setIsChasing(true);
                  
                  // Display "RUN" indicator on-screen after transition
                  setShowRunIndicator(true);
                  setTimeout(() => {
                      setShowRunIndicator(false);
                  }, 5000);
              }, 1500);
            }}
          />
        </div>
      )}

      {/* Typewriter Transition */}
      {isTypewriterActive && (
        <TypewriterTransition onComplete={() => typewriterOnCompleteRef.current?.()} />
      )}
    </div>
  );
};
