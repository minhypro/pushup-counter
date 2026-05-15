export function useAudio() {
  let ctx: AudioContext | null = null

  function getCtx(): AudioContext {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  }

  function tone(freq: number, at: number, dur: number, vol = 0.3): void {
    const c = getCtx()
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    g.gain.setValueAtTime(vol, at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    osc.connect(g)
    g.connect(c.destination)
    osc.start(at)
    osc.stop(at + dur + 0.01)
  }

  // Calls onTick with 3, 2, 1, 0 (=Go) at 1-second intervals; resolves after Go
  function playCountdown(onTick: (n: number) => void): Promise<void> {
    const c = getCtx()
    const now = c.currentTime
    for (let i = 0; i < 3; i++) {
      tone(440, now + i, 0.18, 0.4)
      setTimeout(() => onTick(3 - i), i * 1000)
    }
    tone(880, now + 3, 0.35, 0.55)
    setTimeout(() => onTick(0), 3000)
    return new Promise(resolve => setTimeout(resolve, 3800))
  }

  function playRepChime(): void {
    const c = getCtx()
    const now = c.currentTime
    tone(1047, now, 0.07, 0.22)
    tone(1319, now + 0.065, 0.065, 0.16)
  }

  // ── Beat engine ────────────────────────────────────────────────────────────

  function kick(at: number, vol = 0.7): void {
    const c = getCtx()
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(160, at)
    osc.frequency.exponentialRampToValueAtTime(50, at + 0.15)
    g.gain.setValueAtTime(vol, at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.28)
    osc.connect(g)
    g.connect(c.destination)
    osc.start(at)
    osc.stop(at + 0.3)
  }

  function hihat(at: number): void {
    const c = getCtx()
    const bufLen = Math.floor(c.sampleRate * 0.045)
    const buf = c.createBuffer(1, bufLen, c.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1
    const src = c.createBufferSource()
    const filt = c.createBiquadFilter()
    const g = c.createGain()
    filt.type = 'highpass'
    filt.frequency.value = 8000
    g.gain.setValueAtTime(0.07, at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.04)
    src.buffer = buf
    src.connect(filt)
    filt.connect(g)
    g.connect(c.destination)
    src.start(at)
    src.stop(at + 0.05)
  }

  let beatTimer: ReturnType<typeof setInterval> | null = null
  let nextBeat = 0
  let beatIdx = 0

  function startBeat(bpm = 82): void {
    if (beatTimer !== null) return
    const c = getCtx()
    const beatDur = 60 / bpm
    nextBeat = c.currentTime + 0.05
    beatIdx = 0
    beatTimer = setInterval(() => {
      const now = getCtx().currentTime
      while (nextBeat < now + 0.5) {
        const step = beatIdx % 4
        if (step === 0) kick(nextBeat, 0.7)
        else if (step === 2) kick(nextBeat, 0.45)
        else hihat(nextBeat)
        beatIdx++
        nextBeat += beatDur
      }
    }, 100)
  }

  function stopBeat(): void {
    if (beatTimer !== null) {
      clearInterval(beatTimer)
      beatTimer = null
    }
  }

  function destroy(): void {
    stopBeat()
    ctx?.close()
    ctx = null
  }

  function playRestWarning(): void {
    const c = getCtx()
    const now = c.currentTime
    tone(660, now, 0.1, 0.35)
    tone(660, now + 0.16, 0.1, 0.35)
  }

  function playComplete(): void {
    const c = getCtx()
    const now = c.currentTime
    tone(523, now, 0.25, 0.35)
    tone(659, now + 0.15, 0.25, 0.3)
    tone(784, now + 0.3, 0.25, 0.28)
    tone(1047, now + 0.45, 0.55, 0.4)
  }

  return { playCountdown, playRepChime, playRestWarning, playComplete, startBeat, stopBeat, destroy }
}
