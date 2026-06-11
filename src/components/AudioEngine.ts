/**
 * Spooky Web Audio API horror sound synthesizer.
 * No external file dependencies, completely local and reliable.
 */
class SpookyAudioEngine {
  private ctx: AudioContext | null = null;
  private ambientOsc1: OscillatorNode | null = null;
  private ambientOsc2: OscillatorNode | null = null;
  private ambientGain: GainNode | null = null;
  private bgm1: HTMLAudioElement | null = null;
  private heartbeatInterval: any = null;
  private heartbeatBPM: number = 60;
  private ghostSynthInterval: any = null;

  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        // Warm up / resume on user interaction
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
      }
    } catch (e) {
      console.error('Failed to initialize AudioContext:', e);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  startAmbient() {
    // Ambient sound removed to comply with request
  }

  private heartbeatAudio1: HTMLAudioElement | null = null;
  private heartbeatAudio2: HTMLAudioElement | null = null;
  private heartbeatAudio3: HTMLAudioElement | null = null;
  private comeAudio: HTMLAudioElement | null = null;

  private initComeAudio() {
    if (!this.comeAudio) {
      this.comeAudio = new Audio('/come.mp3');
      this.comeAudio.loop = true;
      this.comeAudio.volume = 0;
    }
  }

  updateComeAudio(closestDistance: number, isDead: boolean, isWrongStage: boolean) {
    if (isDead || isWrongStage) {
      this.stopComeAudio();
      return;
    }

    this.initComeAudio();
    if (!this.comeAudio) return;

    // Calculate volume based on distance (starts fade-in at distance 20, max volume at distance 2)
    const maxAudibleDist = 20.0;
    const minAudibleDist = 2.0;
    let volume = 0;
    if (closestDistance < maxAudibleDist) {
      volume = 1.0 - (closestDistance - minAudibleDist) / (maxAudibleDist - minAudibleDist);
      volume = Math.max(0.0, Math.min(1.0, volume));
    }

    this.comeAudio.volume = volume;

    if (volume > 0) {
      if (this.comeAudio.paused) {
        this.comeAudio.play().catch(e => console.warn("comeAudio play failed:", e));
      }
    } else {
      if (!this.comeAudio.paused) {
        this.comeAudio.pause();
      }
    }
  }

  stopComeAudio() {
    if (this.comeAudio) {
      this.comeAudio.pause();
      this.comeAudio.currentTime = 0;
    }
  }

  private initHeartbeatAudios() {
    if (!this.heartbeatAudio1) {
      this.heartbeatAudio1 = new Audio('/heart.mp3');
      this.heartbeatAudio1.loop = true;
      this.heartbeatAudio1.volume = 0.3;
    }
    if (!this.heartbeatAudio2) {
      this.heartbeatAudio2 = new Audio('/heart2.mp3');
      this.heartbeatAudio2.loop = true;
      this.heartbeatAudio2.volume = 0; // Start at 0
    }
    if (!this.heartbeatAudio3) {
      this.heartbeatAudio3 = new Audio('/heart3.mp3');
      this.heartbeatAudio3.loop = true;
      this.heartbeatAudio3.volume = 0; // Start at 0
    }
  }

  updateHeartbeat(closestDistance: number, isDead: boolean, isWrongStage: boolean) {
    if (isDead || isWrongStage) {
      this.stopHeartbeat();
      return;
    }

    this.initHeartbeatAudios();

    // Reset all
    const audios = [this.heartbeatAudio1, this.heartbeatAudio2, this.heartbeatAudio3];

    if (closestDistance > 15) {
      // heart1 only, volume 0.3, rate 1.0
      this.playAndSync(this.heartbeatAudio1, 0.3, 1.0);
      this.pauseOthers(this.heartbeatAudio1);
    } else if (closestDistance > 10) {
      // heart1 only, volume 0.4, rate 1.2
      this.playAndSync(this.heartbeatAudio1, 0.4, 1.2);
      this.pauseOthers(this.heartbeatAudio1);
    } else if (closestDistance > 5) {
      // heart2 only, volume 0.7, rate 1.0 - 1.3
      const rate = 1.0 + (1 - (closestDistance - 5) / 5) * 0.3;
      this.playAndSync(this.heartbeatAudio2, 0.7, rate);
      this.pauseOthers(this.heartbeatAudio2);
    } else {
      // heart3 only, volume 1.0, rate 1.0 - 1.5
      const rate = 1.0 + (1 - closestDistance / 5) * 0.5;
      this.playAndSync(this.heartbeatAudio3, 1.0, rate);
      this.pauseOthers(this.heartbeatAudio3);
    }
  }

  private playAndSync(audio: HTMLAudioElement | null, volume: number, rate: number) {
    if (!audio) return;
    audio.volume = volume;
    audio.playbackRate = rate;
    if (audio.paused) {
      audio.play().catch(e => console.warn("Heartbeat playback failed:", e));
    }
  }

  private pauseOthers(active: HTMLAudioElement | null) {
    [this.heartbeatAudio1, this.heartbeatAudio2, this.heartbeatAudio3].forEach(a => {
      if (a && a !== active && !a.paused) {
        a.pause();
        a.currentTime = 0;
      }
    });
  }

  stopHeartbeat() {
    [this.heartbeatAudio1, this.heartbeatAudio2, this.heartbeatAudio3].forEach(a => {
      if (a) {
        a.pause();
        a.currentTime = 0;
      }
    });
  }

  private startHeartbeatLoop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    const triggerHeartbeat = () => {
      this.playHeartbeatDoublet();
    };

    triggerHeartbeat();
    const intervalMs = (60 / this.heartbeatBPM) * 1000;
    this.heartbeatInterval = setInterval(triggerHeartbeat, intervalMs);
  }

  private playHeartbeatDoublet() {
    if (!this.ctx || this.ctx.state === 'suspended') return;

    try {
      const now = this.ctx.currentTime;
      
      // Lub beat
      this.playHeartSubBeat(now, 45, 0.4, 0.12);
      
      // Dub beat (slightly higher pitching, delayed by ~0.18s)
      this.playHeartSubBeat(now + 0.18, 48, 0.35, 0.12);
    } catch (e) {
      // Ignore audio synthesis minor failures
    }
  }

  private playHeartSubBeat(time: number, freq: number, volume: number, duration: number) {
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    // Rapidly drop frequency to give a thumping sound
    osc.frequency.exponentialRampToValueAtTime(10, time + duration);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(80, time);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + duration);
  }

  private tungBgm: HTMLAudioElement | null = null;

  playTung() {
    if (this.tungBgm) {
      if (this.tungBgm.paused) {
        this.tungBgm.play().catch(e => console.warn("Tung play blocked:", e));
      }
      return;
    }
    this.tungBgm = new Audio('/tung2.mp3');
    this.tungBgm.loop = true;
    this.tungBgm.volume = 0.5;
    this.tungBgm.play().catch(e => console.warn("Tung play failed:", e));
  }

  stopTung() {
    if (this.tungBgm) {
      this.tungBgm.pause();
      this.tungBgm.currentTime = 0;
      this.tungBgm = null;
    }
  }

  playBGM1() {
    if (this.bgm1) {
      if (this.bgm1.paused) {
        this.bgm1.play().catch(e => console.warn("BGM play blocked:", e));
      }
      return;
    }
    this.bgm1 = new Audio('/1.mp3');
    this.bgm1.loop = true;
    this.bgm1.volume = 0.35;
    this.bgm1.play().catch(e => console.warn("BGM play failed:", e));
  }

  stopBGM1() {
    if (this.bgm1) {
      this.bgm1.pause();
      this.bgm1.currentTime = 0;
      this.bgm1 = null;
    }
  }

  playItemCollect() {
    if (!this.ctx) return;
    this.resume();

    try {
      const now = this.ctx.currentTime;
      // Beautiful harmonic arpeggio (C Major 9)
      const frequencies = [261.63, 329.63, 392.00, 493.88, 659.25]; // C4, E4, G4, B4, E5
      
      frequencies.forEach((f, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        const filter = this.ctx!.createBiquadFilter();

        osc.type = 'sine';
        // Ascending sparkle
        osc.frequency.setValueAtTime(f, now + i * 0.08);
        osc.frequency.exponentialRampToValueAtTime(f * 1.05, now + i * 0.08 + 0.5);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, now + i * 0.08);

        gain.gain.setValueAtTime(0, now + i * 0.08);
        gain.gain.linearRampToValueAtTime(0.12, now + i * 0.08 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2 + i * 0.1);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(now + i * 0.08);
        osc.stop(now + 1.5 + i * 0.1);
      });

      // Shimmering high sparkle
      const shimmer = this.ctx.createOscillator();
      const shimmerGain = this.ctx.createGain();
      shimmer.type = 'triangle';
      shimmer.frequency.setValueAtTime(1200, now + 0.4);
      shimmer.frequency.linearRampToValueAtTime(2400, now + 1.2);

      shimmerGain.gain.setValueAtTime(0, now + 0.4);
      shimmerGain.gain.linearRampToValueAtTime(0.03, now + 0.6);
      shimmerGain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

      shimmer.connect(shimmerGain);
      shimmerGain.connect(this.ctx.destination);
      shimmer.start(now + 0.4);
      shimmer.stop(now + 1.5);

    } catch (e) {
      console.error('Failed to play item collect sound:', e);
    }
  }

  playGhostProximity(intensity: number) {
    // Play static creepy drone interference when ghost is close
    if (!this.ctx || this.ctx.state === 'suspended') return;
    if (intensity < 0.1) return;

    try {
      const now = this.ctx.currentTime;
      // Generate some white noise scratch
      const bufferSize = this.ctx.sampleRate * 0.1; // 100ms chunks
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noiseNode = this.ctx.createBufferSource();
      noiseNode.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 300 + Math.random() * 500;
      filter.Q.value = 10;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.02 * intensity; // Proportional to closeness

      noiseNode.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noiseNode.start(now);
    } catch (e) {
      // safe fail
    }
  }

  playScreamer() {
    // Jumpscare sound removed
  }

  playStinger() {
    // Stinger sound removed
  }

  playGhostSpawn() {
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.linearRampToValueAtTime(55, now + 0.6);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.82);
    } catch (e) {
      // safe fail
    }
  }

  playFootstepEcho() {
    if (!this.ctx || this.ctx.state === 'suspended') return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      // Sharp, muffled thud
      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, now);
      osc.frequency.exponentialRampToValueAtTime(10, now + 0.1);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(120, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.04, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) {
      // safe fail
    }
  }

  playClick() {
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120, now);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.06);
    } catch (e) {
      // safe fail
    }
  }

  playTypewriterStrike() {
    this.init();
    if (!this.ctx || this.ctx.state === 'suspended') return;
    try {
      const now = this.ctx.currentTime;
      
      // 1. Initial key-lever action (Transient high snap)
      const clickOsc = this.ctx.createOscillator();
      const clickGain = this.ctx.createGain();
      clickOsc.type = 'triangle';
      clickOsc.frequency.setValueAtTime(1500 + Math.random() * 300, now);
      clickOsc.frequency.exponentialRampToValueAtTime(300, now + 0.025);
      clickGain.gain.setValueAtTime(0.08, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
      clickOsc.connect(clickGain);
      clickGain.connect(this.ctx.destination);
      clickOsc.start(now);
      clickOsc.stop(now + 0.03);

      // 2. Hollow metal hammer impact on paper platen (Deep organic wood/felt thud)
      const thudOsc = this.ctx.createOscillator();
      const thudGain = this.ctx.createGain();
      thudOsc.type = 'sine';
      thudOsc.frequency.setValueAtTime(180, now);
      thudOsc.frequency.exponentialRampToValueAtTime(90, now + 0.08);
      thudGain.gain.setValueAtTime(0.18, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      thudOsc.connect(thudGain);
      thudGain.connect(this.ctx.destination);
      thudOsc.start(now);
      thudOsc.stop(now + 0.1);

      // 3. Vintage metallic frame chassis ringing resonance (Simulates vintage carriage bell/tin ring)
      const ringOsc = this.ctx.createOscillator();
      const ringGain = this.ctx.createGain();
      ringOsc.type = 'sine';
      ringOsc.frequency.setValueAtTime(3800 + Math.random() * 400, now);
      ringGain.gain.setValueAtTime(0.006, now);
      ringGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      ringOsc.connect(ringGain);
      ringGain.connect(this.ctx.destination);
      ringOsc.start(now);
      ringOsc.stop(now + 0.15);

      // 4. Subtle friction scratch (very soft noise hiss of Key Striker mechanism reset)
      const bufferSize = this.ctx.sampleRate * 0.02;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const bpf = this.ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.value = 2500 + Math.random() * 500;
      bpf.Q.value = 4;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.015, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
      noise.connect(bpf);
      bpf.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      noise.start(now);
    } catch (e) {}
  }

  playRedFloodSound() {
    this.init();
    if (!this.ctx || this.ctx.state === 'suspended') return;
    try {
      const now = this.ctx.currentTime;
      const duration = 2.5;

      // 1. Chilling Sub-Bass Sweep (Ominous depth layer)
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(95, now);
      subOsc.frequency.linearRampToValueAtTime(45, now + duration);
      subGain.gain.setValueAtTime(0.001, now);
      subGain.gain.linearRampToValueAtTime(0.24, now + 0.3);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      subOsc.connect(subGain);
      subGain.connect(this.ctx.destination);
      subOsc.start(now);
      subOsc.stop(now + duration + 0.1);

      // 2. Psychological Discordant Beating Tones (Creepy background tension helper)
      const beatOsc1 = this.ctx.createOscillator();
      const beatOsc2 = this.ctx.createOscillator();
      const beatGain = this.ctx.createGain();

      beatOsc1.type = 'triangle';
      beatOsc2.type = 'triangle';
      
      // Pitching slightly offset so they beat intensely against each other
      beatOsc1.frequency.setValueAtTime(140, now);
      beatOsc2.frequency.setValueAtTime(143.5, now);

      beatGain.gain.setValueAtTime(0.001, now);
      beatGain.gain.linearRampToValueAtTime(0.08, now + 0.4);
      beatGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      // Gentle filter to remove harsh highs so it resides beautifully as pure sub-warmth tension
      const lpf = this.ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.setValueAtTime(280, now);

      beatOsc1.connect(lpf);
      beatOsc2.connect(lpf);
      lpf.connect(beatGain);
      beatGain.connect(this.ctx.destination);

      beatOsc1.start(now);
      beatOsc2.start(now);
      beatOsc1.stop(now + duration + 0.1);
      beatOsc2.stop(now + duration + 0.1);
    } catch (e) {}
  }

  playSparkleHint() {
    if (!this.ctx || this.ctx.state === 'suspended') return;
    try {
      const now = this.ctx.currentTime;
      // Soft, high-pitched crystalline twinkle
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200 + Math.random() * 400, now);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.03, now + 0.1);
      gain.gain.linearRampToValueAtTime(0, now + 0.5);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(now);
      osc.stop(now + 0.6);
    } catch (e) {
      // safe fail
    }
  }

  playSquelch() {
    if (!this.ctx || this.ctx.state === 'suspended') return;
    try {
      const now = this.ctx.currentTime;
      // High frequency squelch (fleshy)
      const bufferSize = this.ctx.sampleRate * 0.15;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.sin(i * 0.1);
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 800 + Math.random() * 400;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start(now);
    } catch (e) {}
  }

  playSlasher() {
    if (!this.ctx || this.ctx.state === 'suspended') return;
    try {
      const now = this.ctx.currentTime;
      // 1. Whoosh/Slash sound (filtered white noise)
      const bufferSize = this.ctx.sampleRate * 0.3; // Longer slash
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2); // Decay
      }
      const noiseNode = this.ctx.createBufferSource();
      noiseNode.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(500, now);
      filter.frequency.exponentialRampToValueAtTime(8000, now + 0.2);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.3, now); // Louder
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      noiseNode.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noiseNode.start(now);
      noiseNode.stop(now + 0.3);

      // 2. Metallic clang (impact)
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sawtooth'; // More aggressive
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.1);

      oscGain.gain.setValueAtTime(0.2, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(oscGain);
      oscGain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);

    } catch (e) {
      // safe fail
    }
  }

  playWeapon() {
    this.init();
    // Layering two audio instances to achieve an effective volume of 1.5,
    // as HTMLAudioElement.volume is capped at 1.0 by browsers.
    const weapon1 = new Audio('/weapon.wav');
    weapon1.volume = 1.0;
    weapon1.play().catch(e => console.warn("Weapon 1 play failed:", e));

    const weapon2 = new Audio('/weapon.wav');
    weapon2.volume = 0.5;
    weapon2.play().catch(e => console.warn("Weapon 2 play failed:", e));
  }

  playBell(volumeOpt?: number) {
    this.init();
    const baseVal = volumeOpt !== undefined ? volumeOpt : 1.0;
    // Layer 3 sound instances with amplified gain to output a much louder, crisper alert chime
    for (let i = 0; i < 3; i++) {
      const bell = new Audio('/bell.wav');
      bell.volume = Math.min(1.0, baseVal * 1.8);
      bell.play().catch(e => console.warn(`Bell play layer ${i} failed:`, e));
    }
  }

  private parryAudio: HTMLAudioElement | null = null;
  private parryBuffer: AudioBuffer | null = null;

  async preloadParry() {
    this.init();
    if (!this.ctx || this.parryBuffer) return;
    try {
        const response = await fetch('/parry.wav');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        this.parryBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    } catch (e) {
        console.warn("Failed to preload parry buffer, falling back to pure synthesis:", e);
    }
  }

  playSynthesizedParry() {
    if (!this.ctx) return;
    this.resume();
    try {
      const now = this.ctx.currentTime;
      
      // 1. Strike transient (extremely quick noisy pop)
      const bufferSize = this.ctx.sampleRate * 0.05; // 50ms pulse
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.sin(i * 0.1);
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1500, now);
      filter.Q.value = 5;
      
      const clickGain = this.ctx.createGain();
      clickGain.gain.setValueAtTime(0.12, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      
      noise.connect(filter);
      filter.connect(clickGain);
      clickGain.connect(this.ctx.destination);
      noise.start(now);

      // 2. High-pitched metallic ring (multiple resonance peaks that decay slowly)
      const ringFrequencies = [2100, 3200, 4400, 5600];
      ringFrequencies.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const oscGain = this.ctx!.createGain();
        
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.linearRampToValueAtTime(freq * 0.95, now + 0.6);
        
        oscGain.gain.setValueAtTime(0, now);
        oscGain.gain.linearRampToValueAtTime(0.06 / ringFrequencies.length, now + 0.01);
        oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8 / (idx + 1));
        
        osc.connect(oscGain);
        oscGain.connect(this.ctx!.destination);
        
        osc.start(now);
        osc.stop(now + 1.0);
      });
    } catch (e) {
      console.warn("Failed to play synthesized parry:", e);
    }
  }

  playParry() {
    this.init();
    if (this.ctx && this.parryBuffer) {
        try {
            const source = this.ctx.createBufferSource();
            source.buffer = this.parryBuffer;
            source.connect(this.ctx.destination);
            source.start();
        } catch (e) {
            console.warn("Buffer play failed, using synthesis:", e);
            this.playSynthesizedParry();
        }
    } else {
        // Fallback to beautiful pure synthesis
        this.playSynthesizedParry();
        
        // Try HTMLAudioElement play, ignore failure
        if (typeof Audio !== 'undefined') {
            try {
                if (!this.parryAudio) {
                    this.parryAudio = new Audio('/parry.wav');
                }
                this.parryAudio.currentTime = 0;
                this.parryAudio.volume = 0.2;
                this.parryAudio.play().catch(e => console.warn("Parry audio element play discarded:", e));
            } catch (err) {
                // ignore
            }
        }
    }
  }

  playWind() {
    this.init();
    const wind = new Audio('/wind.wav');
    wind.volume = 0.4;
    wind.play().catch(e => console.warn("Wind play failed:", e));
  }

  playDeadSound() {
    this.init();
    try {
      const audio = new Audio('/src/dead.wav');
      audio.volume = 0.05;
      audio.play().catch(e => {
        console.warn("Play /src/dead.wav failed, trying /dead.wav...", e);
        const fallback = new Audio('/dead.wav');
        fallback.volume = 0.05;
        fallback.play().catch(err => console.warn("dead.wav play failed:", err));
      });
    } catch (err) {
      console.warn("dead.wav play failed:", err);
    }
  }

  playVisceralDrone() {
    if (!this.ctx || this.ctx.state === 'suspended') return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(40, now); // Very low gut rumble
      osc.frequency.linearRampToValueAtTime(35, now + 2);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 1);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      return { osc, gain };
    } catch (e) { return null; }
  }

  stopAmbient() {
    try {
      this.stopBGM1();
      this.stopTung();
      this.stopComeAudio();
      if (this.ambientOsc1) {
        this.ambientOsc1.stop();
        this.ambientOsc1.disconnect();
        this.ambientOsc1 = null;
      }
      if (this.ambientOsc2) {
        this.ambientOsc2.stop();
        this.ambientOsc2.disconnect();
        this.ambientOsc2 = null;
      }
      if (this.ambientGain) {
        this.ambientGain.disconnect();
        this.ambientGain = null;
      }
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
    } catch (e) {
      console.warn('Error while stopping ambient audio:', e);
    }
  }
}

export const spookyAudio = new SpookyAudioEngine();
