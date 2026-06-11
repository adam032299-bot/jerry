import React from 'react';
import { spookyAudio } from './AudioEngine';
import { playMenuClickSound } from '../lib/uiSounds';

interface MainMenuProps {
  onStartGame: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onStartGame }) => {
  const handlePlayClick = () => {
    playMenuClickSound();
    spookyAudio.playClick();
    
    // Allow short audio init stabilization delay
    setTimeout(() => {
      spookyAudio.startAmbient();
      onStartGame();
    }, 400);
  };

  return (
    <div
      id="main-menu"
      className="absolute inset-0 bg-neutral-950 flex flex-col justify-center items-center font-sans tracking-wide overflow-hidden select-none select-none text-white px-6 py-8"
      style={{
        backgroundImage: 'radial-gradient(circle, #2d2a2a 0%, #030303 100%)',
      }}
    >
      {/* Dynamic Ambient Background Element */}
      <div 
        id="vignette-shadow"
        className="absolute inset-0 bg-transparent pointer-events-none transition-all duration-1000 shadow-[inset_0_0_120px_60px_rgba(0,0,0,0.95)]"
      />
      
      {/* Pulsing Flashlight Beam Backlight */}
      <div 
        id="bg-ambient-flashlight"
        className="absolute w-80 h-80 rounded-full bg-red-950/20 blur-[100px] -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/3 animate-pulse pointer-events-none" 
      />

      {/* Main Ominous Container */}
      <div 
        id="menu-content"
        className="relative z-10 max-w-lg w-full flex flex-col items-center text-center space-y-8 px-4"
      >
        {/* Title Badge representing depth */}
        <div id="horror-badge" className="text-red-600/70 text-xs font-mono tracking-[0.3em] font-semibold uppercase select-none">
          Survival Horror Experience
        </div>

        {/* Title */}
        <div id="game-title-container" className="space-y-2 select-none">
          <h1 
            id="game-large-title" 
            className="text-5xl md:text-6xl font-extrabold tracking-tight text-neutral-100 filter drop-shadow-[0_4px_16px_rgba(239,68,68,0.5)] select-none uppercase font-sans animate-pulse"
            style={{ textShadow: '2px 2px 20px rgba(0,0,0,1), -1px -1px 0 rgba(239,68,68,0.3)' }}
          >
            迷宮探險
          </h1>
          <p id="game-subtitle" className="text-red-500 font-medium tracking-[0.15em] text-sm uppercase">
            尋找陳家睿
          </p>
        </div>

        {/* Story Intro Card */}
        <div 
          id="instruction-card" 
          className="w-full bg-neutral-900/60 border border-neutral-800/80 p-5 rounded-lg text-left backdrop-blur-sm shadow-2xl space-y-4"
        >
          <p id="story-text" className="text-sm text-neutral-400 leading-relaxed">
            你被困在一個不斷循環的深灰色牆壁迷宮中。
            要打破這座邪惡的結界，你必須在迷霧中尋找到五個被詛咒的實體：<strong className="text-red-500 font-semibold tracking-wider font-sans">「陳家睿」</strong>。
          </p>

          {/* Controls instructions */}
          <div id="controls-section" className="space-y-2.5 pt-2 border-t border-neutral-800/80">
            <h4 id="controls-header" className="text-xs font-mono text-neutral-550 font-bold uppercase tracking-wider">
              🎮 遊戲操作方式
            </h4>
            <div id="keyboard-controls-grid" className="grid grid-cols-2 gap-3 text-xs font-sans text-neutral-380">
              <div id="ws-container" className="flex items-center space-x-2">
                <span className="bg-neutral-800 border border-neutral-700 px-2 py-1.5 rounded text-neutral-200 font-mono font-bold font-semibold shadow-md shrink-0">W / S</span>
                <span>前進 / 後退</span>
              </div>
              <div id="ad-container" className="flex items-center space-x-2">
                <span className="bg-neutral-800 border border-neutral-700 px-2 py-1.5 rounded text-neutral-200 font-mono font-bold font-semibold shadow-md shrink-0">A / D</span>
                <span>往左 / 往右 平移</span>
              </div>
              <div id="arrow-keys-container" className="flex items-center space-x-2 col-span-2">
                <span className="bg-neutral-800 border border-neutral-700 px-2 py-1.5 rounded text-neutral-200 font-mono font-bold font-semibold shadow-md shrink-0">← / →</span>
                <span>旋轉視角 (或滑鼠滑動 / 拖曳面板)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Warn & Action */}
        <div id="play-button-box" className="w-full flex flex-col items-center space-y-4 pt-4 select-none">
          <p id="audio-pref-warning" className="text-neutral-500 font-mono text-xxs tracking-wider space-y-1">
            <span>※ 建議佩戴耳機以獲得最佳恐怖立體聲效</span><br/>
            <span className="text-red-400/80">※ 因為有音樂所以要開聲音或戴耳機</span>
          </p>

          <button
            id="play-button"
            onClick={handlePlayClick}
            className="group relative w-48 py-3.5 px-6 bg-red-950/40 hover:bg-red-850/60 border border-red-700/80 text-red-100 font-bold tracking-widest text-base rounded-md shadow-lg shadow-red-950/40 cursor-pointer overflow-hidden transition-all duration-300 transform active:scale-95"
          >
            {/* Pulsing button borders */}
            <span className="absolute inset-0 bg-gradient-to-r from-red-650/10 via-transparent to-red-650/10 animate-pulse pointer-events-none" />
            
            <span className="relative z-10 flex items-center justify-center space-x-2">
              <span>PLAY</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
