import React from 'react';
import { spookyAudio } from './AudioEngine';
import { playMenuClickSound } from '../lib/uiSounds';

interface GameOverProps {
  isWin: boolean;
  onRestart: () => void;
  itemsFound: number;
}

export const GameOver: React.FC<GameOverProps> = ({ isWin, onRestart, itemsFound }) => {
  const handleRetryClick = () => {
    playMenuClickSound();
    spookyAudio.playClick();
    spookyAudio.stopAmbient();
    
    // Give time for sound cleanup, then trigger reset loop
    setTimeout(() => {
      spookyAudio.startAmbient();
      onRestart();
    }, 450);
  };

  return (
    <div
      id="game-over-screen"
      className="absolute inset-0 bg-neutral-980 flex flex-col justify-center items-center font-sans tracking-wide overflow-hidden select-none select-none text-white px-6 py-8"
      style={{
        backgroundImage: isWin
          ? 'radial-gradient(circle, #0e1e12 0%, #020603 100%)'
          : 'radial-gradient(circle, #200404 0%, #030000 100%)',
      }}
    >
      {/* Absolute full vignette */}
      <div 
        id="go-vignette-shadow"
        className="absolute inset-0 bg-transparent pointer-events-none shadow-[inset_0_0_150px_70px_rgba(0,0,0,0.98)]" 
      />

      <div 
        id="go-container"
        className="relative z-10 max-w-md w-full flex flex-col items-center text-center space-y-8 px-4"
      >
        {/* State icon / title */}
        {isWin ? (
          <div id="win-group" className="space-y-4">
            <div id="win-shining-ring" className="inline-flex justify-center items-center w-20 h-20 rounded-full bg-emerald-950/40 border-2 border-emerald-500/50 text-emerald-400 text-3xl animate-bounce">
              ✓
            </div>
            <h1 
              id="win-title"
              className="text-4xl md:text-5xl font-extrabold tracking-tight text-emerald-100 uppercase"
              style={{ textShadow: '0 0 20px rgba(16,185,129,0.3)' }}
            >
              結界解除！
            </h1>
            <p id="win-p" className="text-emerald-555 font-semibold text-sm tracking-widest uppercase">
              成功收回所有「陳家睿」
            </p>
          </div>
        ) : (
          <div id="lose-group" className="space-y-4">
            <div id="lose-spooky-face" className="inline-flex justify-center items-center w-20 h-20 rounded-full bg-red-950/50 border-2 border-red-500/70 text-red-500 text-4xl font-mono tracking-tighter select-none animate-ping duration-1000">
              ☠
            </div>
            <h1 
              id="lose-title"
              className="text-4xl md:text-5xl font-extrabold tracking-wide text-red-650 uppercase animate-pulse"
              style={{ textShadow: '0 5px 30px rgba(0,0,0,1), 0 0 15px rgba(220,38,38,0.7)' }}
            >
              理智崩潰...
            </h1>
            <p id="lose-p" className="text-red-550 font-bold text-sm tracking-widest uppercase">
              你的靈魂已迷失在迷宮探險中
            </p>
          </div>
        )}

        {/* Info card */}
        <div id="stat-card" className="w-full bg-black/60 border border-neutral-850 p-6 rounded-lg backdrop-blur-md shadow-2xl text-center space-y-3">
          <p id="stat-intro" className="text-sm text-neutral-400">
            {isWin 
              ? "你順利逃出了詛咒迷宮。那迴盪在深灰牆壁間的低語，終於漸漸平息..." 
              : "在黑暗中，你沒能躲過如影隨形的視線。幽閉的牆壁慢慢將你合圍..."
            }
          </p>
          
          <div id="stat-items" className="text-xs font-mono text-neutral-500 border-t border-neutral-900 pt-3 flex justify-between">
            <span>回收的「陳家睿」數量:</span>
            <span className={isWin ? "text-emerald-400 font-bold" : "text-red-500 font-bold"}>
              {itemsFound} / 4 個
            </span>
          </div>
        </div>

        {/* Retry Button */}
        <button
          id="btn-restart"
          onClick={handleRetryClick}
          className={`relative py-3.5 px-10 rounded-md font-bold tracking-widest uppercase transition-all duration-300 transform active:scale-95 cursor-pointer shadow-lg outline-none
            ${isWin 
              ? 'bg-emerald-950/50 hover:bg-emerald-800/80 border border-emerald-600 text-emerald-100' 
              : 'bg-red-950/50 hover:bg-red-850/80 border border-red-600 text-red-100'
            }
          `}
        >
          {isWin ? '重新體驗迷宮' : '再次挑戰'}
        </button>
      </div>
    </div>
  );
};
