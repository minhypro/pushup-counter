<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePoseDetection } from './composables/usePoseDetection'

const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const {
  videoAspect,
  workoutMode,
  targetReps,
  totalLaps,
  restDuration,
  isLoading,
  isModelReady,
  isBodyVisible,
  isRunning,
  repCount,
  currentAngle,
  phase,
  isFlashing,
  error,
  countdown,
  lapCount,
  currentLapReps,
  lapHistory,
  isOnBreak,
  restTimeLeft,
  isCompleted,
  gaugeProgress,
  gaugeReady,
  start,
  stop,
  reset,
  endLap,
  resumeLap,
} = usePoseDetection(videoRef, canvasRef)

function toggleWorkout() {
  isRunning.value ? stop() : start()
}

function setMode(mode: 'free' | 'structured') {
  workoutMode.value = mode
}

const phaseLabel = computed(() => {
  if (phase.value === 'UP') return 'UP'
  if (phase.value === 'DOWN') return 'DOWN'
  return '—'
})

const phaseClass = computed(() => {
  if (phase.value === 'UP') return 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40'
  if (phase.value === 'DOWN') return 'bg-sky-500/20 text-sky-400 ring-1 ring-sky-500/40'
  return 'bg-zinc-700/40 text-zinc-500 ring-1 ring-zinc-600/40'
})

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

const SLIDER_MAX = 20
const sliderChips = computed(() => {
  if (workoutMode.value === 'structured') return Math.min(targetReps.value, SLIDER_MAX)
  return SLIDER_MAX
})
const sliderFilled = computed(() => {
  if (workoutMode.value === 'structured') return Math.min(currentLapReps.value, SLIDER_MAX)
  return currentLapReps.value % (SLIDER_MAX + 1)
})
</script>

<template>
  <div class="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center px-4 py-8 select-none">

    <!-- ── Header ────────────────────────────────────────────────── -->
    <header class="mb-6 text-center">
      <h1 class="text-xs font-semibold tracking-[0.4em] uppercase text-zinc-500 flex items-center justify-center gap-2">
        AI Push-up Counter
        <span
          class="inline-block w-1.5 h-1.5 rounded-full transition-colors duration-500"
          :class="isModelReady ? 'bg-emerald-400' : 'bg-zinc-600 animate-pulse'"
          :title="isModelReady ? 'AI ready' : 'Loading AI…'"
        />
      </h1>
    </header>

    <div class="w-full max-w-xl flex flex-col gap-5">

      <!-- ── Video / Canvas container ─────────────────────────────── -->
      <div
        class="relative w-full rounded-2xl overflow-hidden bg-zinc-900 transition-all duration-75"
        :class="[
          isFlashing
            ? 'ring-4 ring-emerald-400 shadow-[0_0_40px_rgba(52,211,153,0.35)]'
            : isRunning && countdown === null && !isOnBreak && !isBodyVisible
              ? 'ring-2 ring-amber-500/60'
              : 'ring-1 ring-zinc-800',
        ]"
        :style="{ aspectRatio: videoAspect }"
      >
        <video ref="videoRef" class="absolute opacity-0 pointer-events-none w-0 h-0" muted playsinline aria-hidden="true" />
        <canvas ref="canvasRef" class="absolute inset-0 w-full h-full" style="transform: scaleX(-1)" />

        <!-- ── Idle placeholder ──────────────────────────────────── -->
        <Transition enter-active-class="transition-opacity duration-300" enter-from-class="opacity-0"
          leave-active-class="transition-opacity duration-200" leave-to-class="opacity-0">
          <div v-if="!isRunning && !isLoading && !isCompleted"
            class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-600">
            <svg class="w-14 h-14" fill="none" stroke="currentColor" stroke-width="1.2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M15.75 10.5l4.72-2.796a.75.75 0 011.03.68v6.232a.75.75 0 01-1.03.68L15.75 13.5M3.75 6.75h10.5a2.25 2.25 0 012.25 2.25v6a2.25 2.25 0 01-2.25 2.25H3.75a2.25 2.25 0 01-2.25-2.25v-6A2.25 2.25 0 013.75 6.75z" />
            </svg>
            <p class="text-sm font-medium">Camera is off</p>
            <p class="text-xs text-zinc-700">Position sideways · Press Start</p>
          </div>
        </Transition>

        <!-- ── Loading spinner ───────────────────────────────────── -->
        <Transition enter-active-class="transition-opacity duration-300" enter-from-class="opacity-0"
          leave-active-class="transition-opacity duration-200" leave-to-class="opacity-0">
          <div v-if="isLoading"
            class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950/80 backdrop-blur-sm">
            <div class="w-10 h-10 rounded-full border-4 border-zinc-700 border-t-emerald-400 animate-spin" />
            <p class="text-sm text-zinc-400 font-medium">Loading AI model…</p>
          </div>
        </Transition>

        <!-- ── Completion overlay ────────────────────────────────── -->
        <Transition enter-active-class="transition-opacity duration-500" enter-from-class="opacity-0">
          <div v-if="isCompleted && !isRunning"
            class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950/90">
            <div
              class="w-16 h-16 rounded-full bg-emerald-500/20 ring-2 ring-emerald-500/50 flex items-center justify-center">
              <svg class="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" stroke-width="2.5"
                viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <div class="text-center">
              <p class="text-emerald-400 font-black text-2xl tracking-wide">Workout Complete</p>
              <p class="text-zinc-500 text-sm mt-1">
                {{ lapHistory.length }} laps · {{ repCount }} total reps
              </p>
            </div>
          </div>
        </Transition>

        <!-- ── Countdown / Posture guide overlay ────────────────── -->
        <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0"
          leave-active-class="transition-opacity duration-300" leave-to-class="opacity-0">
          <div v-if="countdown !== null"
            class="absolute inset-0 flex flex-col items-center bg-zinc-950/75">

            <!-- Silhouette + number -->
            <div class="flex-1 flex flex-col items-center justify-center gap-4">
              <!-- Push-up position silhouette (hidden on GO) -->
              <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0"
                leave-active-class="transition-opacity duration-150" leave-to-class="opacity-0">
                <svg v-if="countdown !== 0" viewBox="0 0 100 160" class="w-28 opacity-50" fill="white">
                  <circle cx="50" cy="13" r="11"/>
                  <path d="M38 23 Q50 26 62 23 L65 75 Q50 78 35 75 Z"/>
                  <path d="M39 30 L12 82 L17 84 L43 34 Z"/>
                  <circle cx="14" cy="85" r="4.5"/>
                  <path d="M61 30 L88 82 L83 84 L57 34 Z"/>
                  <circle cx="86" cy="85" r="4.5"/>
                  <path d="M37 73 L63 73 L60 94 L40 94 Z"/>
                  <path d="M44 93 L42 125 L47 125 L48 93 Z"/>
                  <path d="M56 93 L58 125 L53 125 L52 93 Z"/>
                </svg>
              </Transition>

              <!-- Countdown number -->
              <Transition mode="out-in" enter-active-class="transition-all duration-150"
                enter-from-class="opacity-0 scale-150" leave-active-class="transition-all duration-100"
                leave-to-class="opacity-0 scale-75">
                <div :key="countdown" class="font-black leading-none"
                  :class="countdown === 0 ? 'text-emerald-400 text-7xl tracking-[0.15em]' : 'text-white text-8xl'">
                  {{ countdown === 0 ? 'GO!' : countdown }}
                </div>
              </Transition>
            </div>

            <!-- Instruction text (not shown on GO) -->
            <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0"
              leave-active-class="transition-opacity duration-100" leave-to-class="opacity-0">
              <div v-if="countdown !== 0" class="pb-8 px-8 text-center">
                <p class="text-white/90 text-base leading-relaxed drop-shadow">
                  Get into <strong>push-up position</strong><br>
                  and hold until <strong class="text-emerald-400">"GO"</strong>
                </p>
              </div>
            </Transition>
          </div>
        </Transition>

        <!-- ── REST overlay during break ────────────────────────── -->
        <Transition enter-active-class="transition-opacity duration-300" enter-from-class="opacity-0"
          leave-active-class="transition-opacity duration-200" leave-to-class="opacity-0">
          <div v-if="isRunning && isOnBreak"
            class="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-zinc-950/70">
            <span class="text-4xl font-black tracking-[0.3em] text-amber-400">REST</span>
            <template v-if="workoutMode === 'structured'">
              <div class="font-black text-7xl tabular-nums mt-2 transition-colors duration-300"
                :class="restTimeLeft <= 3 ? 'text-red-400' : 'text-white'">
                {{ restTimeLeft }}
              </div>
              <p class="text-zinc-500 text-xs uppercase tracking-widest">seconds</p>
            </template>
            <p v-else class="text-zinc-500 text-xs uppercase tracking-widest mt-1">Ready for next lap</p>
          </div>
        </Transition>

        <!-- ── Live HUD — phase + angle (top-left) ──────────────── -->
        <Transition enter-active-class="transition-opacity duration-500" enter-from-class="opacity-0">
          <div v-if="isRunning && countdown === null" class="absolute top-3 left-3 flex items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wider transition-all duration-200"
              :class="phaseClass">
              {{ phaseLabel }}
            </span>
            <span
              class="px-2.5 py-0.5 rounded-full text-xs font-mono bg-black/40 text-zinc-300 ring-1 ring-zinc-700/60">
              {{ currentAngle }}°
            </span>
          </div>
        </Transition>

        <!-- ── Lap HUD (top-right) ───────────────────────────────── -->
        <Transition enter-active-class="transition-opacity duration-500" enter-from-class="opacity-0">
          <div v-if="isRunning && countdown === null" class="absolute top-3 right-3">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-black/40 text-zinc-300 ring-1 ring-zinc-700/60">
              <template v-if="workoutMode === 'structured'">
                {{ lapCount }}/{{ totalLaps }} · {{ currentLapReps }}/{{ targetReps }}
              </template>
              <template v-else>
                Lap {{ lapCount }} · {{ currentLapReps }}
              </template>
            </span>
          </div>
        </Transition>

        <!-- ── Body-out-of-frame overlay ──────────────────────────── -->
        <Transition enter-active-class="transition-opacity duration-300" enter-from-class="opacity-0"
          leave-active-class="transition-opacity duration-200" leave-to-class="opacity-0">
          <div v-if="isRunning && countdown === null && !isOnBreak && !isBodyVisible"
            class="absolute inset-0 flex flex-col bg-black/55">

            <!-- Silhouette centred in the upper portion -->
            <div class="flex-1 flex items-center justify-center">
              <svg viewBox="0 0 200 260" class="h-4/5 max-h-64 opacity-70 drop-shadow-lg" fill="white">
                <!-- Head -->
                <circle cx="100" cy="24" r="21"/>
                <!-- Neck -->
                <path d="M91 44 L109 44 L110 58 L90 58 Z"/>
                <!-- Torso -->
                <path d="M58 62 Q100 67 142 62 L138 148 Q100 153 62 148 Z"/>
                <!-- Left upper arm -->
                <path d="M60 69 L22 118 L29 122 L65 75 Z"/>
                <!-- Left forearm -->
                <path d="M22 118 L8 166 L18 168 L30 122 Z"/>
                <!-- Left hand -->
                <ellipse cx="13" cy="170" rx="9" ry="6" transform="rotate(-20 13 170)"/>
                <!-- Right upper arm -->
                <path d="M140 69 L178 118 L171 122 L135 75 Z"/>
                <!-- Right forearm -->
                <path d="M178 118 L192 166 L182 168 L170 122 Z"/>
                <!-- Right hand -->
                <ellipse cx="187" cy="170" rx="9" ry="6" transform="rotate(20 187 170)"/>
                <!-- Shorts -->
                <path d="M64 146 L136 146 L132 192 L68 192 Z"/>
                <!-- Left leg -->
                <path d="M72 190 L68 240 L78 240 L80 190 Z"/>
                <!-- Right leg -->
                <path d="M128 190 L132 240 L122 240 L120 190 Z"/>
              </svg>
            </div>

            <!-- Instruction -->
            <div class="pb-6 px-6 text-center shrink-0">
              <p class="text-white text-base leading-snug drop-shadow-md font-medium">
                Keep <strong>arms & shoulders</strong> fully visible
              </p>
              <p class="text-white/60 text-xs mt-1 font-medium tracking-wide uppercase">Counting paused</p>
            </div>
          </div>
        </Transition>

        <!-- ── Rep slider at bottom of video ────────────────────── -->
        <Transition enter-active-class="transition-opacity duration-300" enter-from-class="opacity-0"
          leave-active-class="transition-opacity duration-200" leave-to-class="opacity-0">
          <div v-if="isRunning && countdown === null && !isOnBreak"
            class="absolute bottom-0 left-0 right-0 flex gap-1 px-3 pb-3 pt-10 bg-gradient-to-t from-black/60 to-transparent pointer-events-none">
            <div
              v-for="i in sliderChips"
              :key="i"
              class="h-1.5 flex-1 rounded-full transition-colors duration-200"
              :style="{ maxWidth: '28px' }"
              :class="i <= sliderFilled ? 'bg-white/90' : 'bg-white/20'"
            />
          </div>
        </Transition>

        <!-- ── Right-side depth gauge ────────────────────────────── -->
        <Transition enter-active-class="transition-opacity duration-500" enter-from-class="opacity-0"
          leave-active-class="transition-opacity duration-300" leave-to-class="opacity-0">
          <div
            v-if="isRunning && countdown === null && !isOnBreak && gaugeReady && isBodyVisible"
            class="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none"
            style="height: 38%"
          >
            <!-- Top limit marker -->
            <div class="w-5 h-0.5 bg-white rounded-full shrink-0" />

            <!-- Track -->
            <div class="relative flex-1 flex justify-center">
              <div class="w-px h-full bg-white/30 rounded-full" />
              <!-- Orange indicator bar -->
              <div
                class="absolute w-5 h-1.5 rounded-full bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.85)]"
                :style="{
                  top: `${gaugeProgress * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  left: '50%',
                  transition: 'top 80ms ease-out',
                }"
              />
            </div>

            <!-- Bottom limit marker -->
            <div class="w-5 h-0.5 bg-white rounded-full shrink-0" />
          </div>
        </Transition>

        <!-- Green flash overlay -->
        <div v-if="isFlashing"
          class="absolute inset-0 bg-emerald-400/10 pointer-events-none rounded-2xl" />
      </div>

      <!-- ── Error banner ──────────────────────────────────────────── -->
      <Transition enter-active-class="transition-all duration-300" enter-from-class="opacity-0 -translate-y-1"
        leave-active-class="transition-all duration-200" leave-to-class="opacity-0">
        <div v-if="error"
          class="flex items-start gap-3 rounded-xl bg-red-950/50 border border-red-700/40 px-4 py-3 text-red-400 text-sm">
          <svg class="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" clip-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-9.25a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zm.75 6.5a.875.875 0 100-1.75.875.875 0 000 1.75z" />
          </svg>
          <span>{{ error }}</span>
        </div>
      </Transition>

      <!-- ── Rep counter ────────────────────────────────────────────── -->
      <div class="flex items-center justify-center py-2">
        <div class="text-center">
          <div
            class="font-black leading-none tabular-nums tracking-tight transition-colors duration-150"
            :class="[
              isFlashing ? 'text-emerald-400' : 'text-white',
              repCount >= 100 ? 'text-8xl' : 'text-[9rem]',
            ]"
          >
            {{ repCount }}
          </div>
          <p class="text-zinc-600 uppercase text-xs tracking-[0.35em] font-semibold mt-2">Total Reps</p>
        </div>
      </div>

      <!-- ── Structured mode progress bar ─────────────────────────── -->
      <Transition enter-active-class="transition-all duration-300" enter-from-class="opacity-0"
        leave-active-class="transition-all duration-200" leave-to-class="opacity-0">
        <div v-if="isRunning && workoutMode === 'structured' && !isOnBreak && countdown === null"
          class="space-y-1.5">
          <div class="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              class="h-full bg-emerald-500 rounded-full transition-all duration-300 ease-out"
              :style="{ width: `${Math.min(100, (currentLapReps / targetReps) * 100)}%` }"
            />
          </div>
          <div class="flex justify-between text-xs text-zinc-600 px-0.5">
            <span>{{ currentLapReps }} / {{ targetReps }} reps this lap</span>
            <span>Lap {{ lapCount }} of {{ totalLaps }}</span>
          </div>
        </div>
      </Transition>

      <!-- ── Workout config (shown pre-workout, free mode has no extra inputs) ── -->
      <Transition enter-active-class="transition-all duration-300" enter-from-class="opacity-0 translate-y-1"
        leave-active-class="transition-all duration-200" leave-to-class="opacity-0">
        <div v-if="!isRunning && !isCompleted" class="rounded-xl bg-zinc-900 ring-1 ring-zinc-800 overflow-hidden">
          <!-- Mode tabs -->
          <div class="flex p-1 gap-1">
            <button
              @click="setMode('free')"
              class="flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
              :class="workoutMode === 'free' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'"
            >
              Free
            </button>
            <button
              @click="setMode('structured')"
              class="flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
              :class="workoutMode === 'structured' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'"
            >
              Structured
            </button>
          </div>
          <!-- Structured settings -->
          <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0 -translate-y-1"
            leave-active-class="transition-all duration-150" leave-to-class="opacity-0">
            <div v-if="workoutMode === 'structured'"
              class="grid grid-cols-3 gap-3 px-4 pb-4 pt-2 border-t border-zinc-800">
              <div class="flex flex-col gap-1.5">
                <label class="text-xs text-zinc-500 uppercase tracking-wider text-center">Reps / Lap</label>
                <input
                  type="number"
                  v-model.number="targetReps"
                  min="1" max="100"
                  class="bg-zinc-800 rounded-lg px-2 py-2.5 text-white text-center font-bold text-lg w-full focus:outline-none focus:ring-1 focus:ring-zinc-600"
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-xs text-zinc-500 uppercase tracking-wider text-center">Laps</label>
                <input
                  type="number"
                  v-model.number="totalLaps"
                  min="1" max="20"
                  class="bg-zinc-800 rounded-lg px-2 py-2.5 text-white text-center font-bold text-lg w-full focus:outline-none focus:ring-1 focus:ring-zinc-600"
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-xs text-zinc-500 uppercase tracking-wider text-center">Rest (s)</label>
                <input
                  type="number"
                  v-model.number="restDuration"
                  min="5" max="300"
                  class="bg-zinc-800 rounded-lg px-2 py-2.5 text-white text-center font-bold text-lg w-full focus:outline-none focus:ring-1 focus:ring-zinc-600"
                />
              </div>
            </div>
          </Transition>
        </div>
      </Transition>

      <!-- ── Controls ───────────────────────────────────────────────── -->
      <div class="flex gap-3">
        <!-- New Workout (post-completion) / Start / Stop -->
        <button
          v-if="isCompleted"
          @click="reset"
          class="flex-1 py-4 rounded-xl font-bold text-sm tracking-wide uppercase bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 transition-all duration-200 active:scale-95"
        >
          New Workout
        </button>
        <button
          v-else
          @click="toggleWorkout"
          :disabled="isLoading"
          class="flex-1 py-4 rounded-xl font-bold text-sm tracking-wide uppercase transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
          :class="isRunning
            ? 'bg-red-600/90 hover:bg-red-500 text-white shadow-lg shadow-red-900/30'
            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40'"
        >
          <span v-if="isLoading" class="flex items-center justify-center gap-2">
            <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
            Loading…
          </span>
          <span v-else-if="isRunning">Stop</span>
          <span v-else>Start Workout</span>
        </button>

        <!-- Lap / Resume (visible only while running) -->
        <button
          v-if="isRunning && !isOnBreak"
          @click="endLap"
          class="px-5 py-4 rounded-xl font-bold text-sm tracking-wide uppercase bg-amber-600 hover:bg-amber-500 text-white transition-all duration-200 active:scale-95 shadow-lg shadow-amber-900/30"
        >
          Lap
        </button>
        <button
          v-else-if="isRunning && isOnBreak"
          @click="resumeLap"
          class="px-5 py-4 rounded-xl font-bold text-sm tracking-wide uppercase bg-sky-600 hover:bg-sky-500 text-white transition-all duration-200 active:scale-95 shadow-lg shadow-sky-900/30"
        >
          Resume
        </button>

        <!-- Reset -->
        <button
          @click="reset"
          :disabled="isLoading"
          class="px-6 py-4 rounded-xl font-bold text-sm tracking-wide uppercase bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
        >
          Reset
        </button>
      </div>

      <!-- ── Lap history ─────────────────────────────────────────────── -->
      <Transition enter-active-class="transition-all duration-300" enter-from-class="opacity-0 translate-y-1"
        leave-active-class="transition-all duration-200" leave-to-class="opacity-0">
        <div v-if="lapHistory.length > 0" class="rounded-xl bg-zinc-900 ring-1 ring-zinc-800 overflow-hidden">
          <div class="px-4 py-2.5 border-b border-zinc-800">
            <span class="text-xs font-semibold uppercase tracking-widest text-zinc-500">Lap History</span>
          </div>
          <div class="divide-y divide-zinc-800/60">
            <div v-for="lap in lapHistory" :key="lap.lap"
              class="flex items-center justify-between px-4 py-3 text-sm">
              <span class="text-zinc-500 font-medium">Lap {{ lap.lap }}</span>
              <div class="flex items-center gap-5">
                <span class="font-bold text-white tabular-nums">{{ lap.reps }} reps</span>
                <span class="text-zinc-500 font-mono tabular-nums text-xs">{{ formatDuration(lap.durationMs) }}</span>
              </div>
            </div>
          </div>
        </div>
      </Transition>

      <!-- ── Instructions ───────────────────────────────────────────── -->
      <p v-if="!isRunning && !isCompleted" class="text-center text-zinc-700 text-xs leading-relaxed px-2">
        Stand/position your camera to the <strong class="text-zinc-600">side</strong> of your body
        for best accuracy. &nbsp;Arms fully extended = UP (&gt;160°) · Arms bent = DOWN (&lt;90°).
      </p>
    </div>
  </div>
</template>
