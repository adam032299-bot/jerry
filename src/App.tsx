import { useState, useCallback } from 'react';
import { GameState, MazeConfig } from './types';
import { MainMenu } from './components/MainMenu';
import { GameOver } from './components/GameOver';
import { GameCanvas } from './components/GameCanvas';
import { generateMaze } from './utils/mazeGenerator';
import { spookyAudio } from './components/AudioEngine';
import { playMenuClickSound } from './lib/uiSounds';

export default function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [mazeConfig, setMazeConfig] = useState<MazeConfig | null>(null);
  const [collectedItemsCount, setCollectedItemsCount] = useState<number>(0);
  const [screamerFlicker, setScreamerFlicker] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);

  // Initialize a new maze and start the game
  const handleStartGame = useCallback(() => {
    // Generate a super huge 40x40 maze
    const nextConfig = generateMaze(40, 40);
    setMazeConfig(nextConfig);
    setCollectedItemsCount(0);
    setGameState(GameState.PLAYING);
    setScreamerFlicker(false);
    setRetryCount(prev => prev + 1);
  }, []);

  // Handle item collected count from canvas loops
  const handleItemCollected = useCallback((count: number) => {
    setCollectedItemsCount(count);
  }, []);

  // Trigger scary screamer flashing overlay
  const handleTriggerJumpScare = useCallback(() => {
    setGameState(GameState.JUMPSCARE);
    
    // Rapidly toggle screamer visibility to simulate creepy flashing
    let counter = 0;
    const interval = setInterval(() => {
      setScreamerFlicker((prev) => !prev);
      counter++;
      if (counter > 15) {
        clearInterval(interval);
      }
    }, 90);
  }, []);

  const handleGameOverLose = useCallback(() => {
    setGameState(GameState.GAMEOVER_LOSE);
    spookyAudio.stopAmbient();
  }, []);

  const handleGameOverWin = useCallback(() => {
    setGameState(GameState.GAMEOVER_WIN);
    spookyAudio.stopAmbient();
  }, []);

  const handleRestart = useCallback(() => {
    setGameState(GameState.PLAYING);
    handleStartGame();
  }, [handleStartGame]);

  const handleGoBackToMenu = () => {
    playMenuClickSound();
    spookyAudio.playClick();
    spookyAudio.stopAmbient();
    setGameState(GameState.MENU);
  };

  return (
    <div id="horror-game-root" className="relative w-screen h-screen bg-black overflow-hidden select-none select-none text-white font-sans">
      
      {/* 1. Main Menu Screen */}
      {gameState === GameState.MENU && (
        <MainMenu onStartGame={handleStartGame} />
      )}

      {/* 2. Active 3D Playing Canvas Screen */}
      {gameState === GameState.PLAYING && mazeConfig && (
        <GameCanvas
          key={retryCount}
          config={mazeConfig}
          onItemCollected={handleItemCollected}
          onTriggerJumpScare={handleTriggerJumpScare}
          onGameOverLose={handleGameOverLose}
          onGameOverWin={handleGameOverWin}
          isPaused={false}
          gameActive={true}
        />
      )}

      {/* 3. Terrifying Jumpscare Screamer Screen */}
      {gameState === GameState.JUMPSCARE && (
        <div 
          id="screamer-overlay"
          className="absolute inset-0 z-50 flex flex-col justify-center items-center overflow-hidden transition-all duration-75"
          style={{
            backgroundColor: screamerFlicker ? '#7f1d1d' : '#030000',
          }}
        >
          {/* Zooming bloody silhouette / glowing eyes skeleton face */}
          <div 
            id="skeleton-face-screamer"
            className="w-135 h-135 relative flex justify-center items-center scale-150 animate-bounce duration-300"
          >
            {/* Draw procedural skull face using clean SVG lines without external loaders */}
            <svg 
              viewBox="0 0 200 200" 
              className="w-full h-full text-red-650 opacity-90 drop-shadow-[0_0_40px_rgba(239,68,68,0.95)]"
              fill="currentColor"
            >
              {/* Skull dome */}
              <path d="M100,20 C50,20 40,60 40,100 C40,125 55,145 70,155 L70,175 C70,183 80,180 100,180 C120,180 130,183 130,175 L130,155 C145,145 160,125 160,100 C160,60 150,20 100,20 Z" />
              {/* Hollow Eye cavities */}
              <ellipse cx="75" cy="95" rx="20" ry="25" fill="#000000" />
              <ellipse cx="125" cy="95" rx="20" ry="25" fill="#000000" />
              {/* Glowing iris pointers */}
              <circle cx="75" cy="95" r="5" fill="#ef4444" />
              <circle cx="125" cy="95" r="5" fill="#ef4444" />
              {/* Nose triangle cavity */}
              <polygon points="100,105 110,125 90,125" fill="#000000" />
              {/* Screaming gaping teeth lines */}
              <path d="M80,145 L120,145 A 20,20 0 0 1 100,165 A 20,20 0 0 1 80,145 Z" fill="#000000" />
              <line x1="85" y1="145" x2="85" y2="155" stroke="#7f1d1d" strokeWidth="4" />
              <line x1="100" y1="145" x2="100" y2="155" stroke="#7f1d1d" strokeWidth="4" />
              <line x1="115" y1="145" x2="115" y2="155" stroke="#7f1d1d" strokeWidth="4" />
            </svg>
          </div>

          {/* Glitching title text labels */}
          <div id="glitch-screams" className="relative mt-8 text-center space-y-2.5 px-6 select-none uppercase">
            <h2 className="text-red-500 font-extrabold text-3xl md:text-4xl tracking-widest animate-ping">
              陳家睿！！！
            </h2>
            <p className="text-neutral-500 font-mono text-xs tracking-widest">
              G O N E . L O S T . T O . T H E . S I L E N C E
            </p>
          </div>
        </div>
      )}

      {/* 4. Game Over States Screen (Win/Lose) */}
      {(gameState === GameState.GAMEOVER_WIN || gameState === GameState.GAMEOVER_LOSE) && (
        <div id="over-wrapper" className="absolute inset-0 z-40 flex items-center justify-center">
          <button 
            id="go-back-btn"
            onClick={handleGoBackToMenu}
            className="absolute top-5 left-5 z-50 py-2 px-4 bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-800 text-xs font-mono font-bold uppercase rounded cursor-pointer transition-all active:scale-95"
          >
            ◀ 回首頁 (Back to Menu)
          </button>
          <GameOver
            isWin={gameState === GameState.GAMEOVER_WIN}
            onRestart={handleRestart}
            itemsFound={collectedItemsCount}
          />
        </div>
      )}
    </div>
  );
}
