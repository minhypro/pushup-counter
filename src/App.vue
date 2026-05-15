<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePoseDetection } from './composables/usePoseDetection'

const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const {
  isLoading,
  isRunning,
  repCount,
  currentAngle,
  phase,
  isFlashing,
  error,
  start,
  stop,
  reset,
} = usePoseDetection(videoRef, canvasRef)

function toggleWorkout() {
  isRunning.value ? stop() : start()
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
</script>

<template>
  <div class="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center px-4 py-8 select-none">

    <!-- ── Header ────────────────────────────────────────────────── -->
    <header class="mb-6 text-center">
      <h1 class="text-xs font-semibold tracking-[0.4em] uppercase text-zinc-500">
        AI Push-up Counter
      </h1>
    </header>

    <div class="w-full max-w-xl flex flex-col gap-5">

      <!-- ── Video / Canvas container ─────────────────────────────── -->
      <div
        class="relative w-full rounded-2xl overflow-hidden bg-zinc-900 transition-all duration-75"
        :class="[
          isFlashing
            ? 'ring-4 ring-emerald-400 shadow-[0_0_40px_rgba(52,211,153,0.35)]'
            : 'ring-1 ring-zinc-800',
        ]"
        style="aspect-ratio: 4/3"
      >
        <!-- Hidden source video element (off-screen, used as texture source) -->
        <video
          ref="videoRef"
          class="absolute opacity-0 pointer-events-none w-0 h-0"
          muted
          playsinline
          aria-hidden="true"
        />

        <!-- Canvas — receives both the mirrored video and skeleton overlay -->
        <canvas
          ref="canvasRef"
          class="absolute inset-0 w-full h-full"
          style="transform: scaleX(-1)"
        />

        <!-- ── Idle placeholder ──────────────────────────────────── -->
        <Transition
          enter-active-class="transition-opacity duration-300"
          enter-from-class="opacity-0"
          leave-active-class="transition-opacity duration-200"
          leave-to-class="opacity-0"
        >
          <div
            v-if="!isRunning && !isLoading"
            class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-600"
          >
            <svg class="w-14 h-14" fill="none" stroke="currentColor" stroke-width="1.2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M15.75 10.5l4.72-2.796a.75.75 0 011.03.68v6.232a.75.75 0 01-1.03.68L15.75 13.5M3.75 6.75h10.5a2.25 2.25 0 012.25 2.25v6a2.25 2.25 0 01-2.25 2.25H3.75a2.25 2.25 0 01-2.25-2.25v-6A2.25 2.25 0 013.75 6.75z" />
            </svg>
            <p class="text-sm font-medium">Camera is off</p>
            <p class="text-xs text-zinc-700">Position sideways · Press Start</p>
          </div>
        </Transition>

        <!-- ── Loading spinner ───────────────────────────────────── -->
        <Transition
          enter-active-class="transition-opacity duration-300"
          enter-from-class="opacity-0"
          leave-active-class="transition-opacity duration-200"
          leave-to-class="opacity-0"
        >
          <div
            v-if="isLoading"
            class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950/80 backdrop-blur-sm"
          >
            <div class="w-10 h-10 rounded-full border-4 border-zinc-700 border-t-emerald-400 animate-spin" />
            <p class="text-sm text-zinc-400 font-medium">Loading AI model…</p>
          </div>
        </Transition>

        <!-- ── Live HUD — phase badge + angle ───────────────────── -->
        <Transition
          enter-active-class="transition-opacity duration-500"
          enter-from-class="opacity-0"
        >
          <div v-if="isRunning" class="absolute top-3 left-3 flex items-center gap-2">
            <span
              class="px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wider transition-all duration-200"
              :class="phaseClass"
            >
              {{ phaseLabel }}
            </span>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-mono bg-black/40 text-zinc-300 ring-1 ring-zinc-700/60">
              {{ currentAngle }}°
            </span>
          </div>
        </Transition>

        <!-- Green flash overlay (subtle tint on top of canvas) -->
        <div
          v-if="isFlashing"
          class="absolute inset-0 bg-emerald-400/10 pointer-events-none rounded-2xl"
        />
      </div>

      <!-- ── Error banner ──────────────────────────────────────────── -->
      <Transition
        enter-active-class="transition-all duration-300"
        enter-from-class="opacity-0 -translate-y-1"
        leave-active-class="transition-all duration-200"
        leave-to-class="opacity-0"
      >
        <div
          v-if="error"
          class="flex items-start gap-3 rounded-xl bg-red-950/50 border border-red-700/40 px-4 py-3 text-red-400 text-sm"
        >
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
          <p class="text-zinc-600 uppercase text-xs tracking-[0.35em] font-semibold mt-2">
            Reps
          </p>
        </div>
      </div>

      <!-- ── Controls ───────────────────────────────────────────────── -->
      <div class="flex gap-3">
        <!-- Start / Stop -->
        <button
          @click="toggleWorkout"
          :disabled="isLoading"
          class="flex-1 py-4 rounded-xl font-bold text-sm tracking-wide uppercase transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
          :class="
            isRunning
              ? 'bg-red-600/90 hover:bg-red-500 text-white shadow-lg shadow-red-900/30'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40'
          "
        >
          <span v-if="isLoading" class="flex items-center justify-center gap-2">
            <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
            Loading…
          </span>
          <span v-else-if="isRunning">Stop Workout</span>
          <span v-else>Start Workout</span>
        </button>

        <!-- Reset -->
        <button
          @click="reset"
          :disabled="isLoading"
          class="px-6 py-4 rounded-xl font-bold text-sm tracking-wide uppercase bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
          title="Reset rep count"
        >
          Reset
        </button>
      </div>

      <!-- ── Instructions ───────────────────────────────────────────── -->
      <p class="text-center text-zinc-700 text-xs leading-relaxed px-2">
        Stand/position your camera to the <strong class="text-zinc-600">side</strong> of your body
        for best accuracy. &nbsp;Arms fully extended = UP (&gt;160°) · Arms bent = DOWN (&lt;90°).
      </p>
    </div>
  </div>
</template>
