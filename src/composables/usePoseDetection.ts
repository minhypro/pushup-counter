import { ref, onUnmounted, type Ref } from 'vue'
import * as tf from '@tensorflow/tfjs'
import * as poseDetection from '@tensorflow-models/pose-detection'
import { calculateAngle } from '../utils/angle'
import { useAudio } from './useAudio'

// ─── Constants ────────────────────────────────────────────────────────────────

const UP_THRESHOLD = 160   // degrees – used only to calibrate shoulderBaseY
const DOWN_THRESHOLD = 100  // degrees – fallback phase detection before gauge is ready
const MIN_SCORE = 0.3      // minimum keypoint confidence for drawing
const MIN_BODY_SCORE = 0.45 // stricter threshold for counting
const FRAME_MARGIN = 0.05  // keypoints this close to any edge = out of frame
const SHOULDER_DOWN_DELTA = 0.07  // 7% of frame height – minimum gauge range
const GAUGE_DOWN_THRESHOLD = 0.85 // orange bar must reach 85% to register DOWN
const GAUGE_UP_THRESHOLD = 0.25   // orange bar must return to 25% to register UP

const KP = {
  LEFT_SHOULDER: 5,
  RIGHT_SHOULDER: 6,
  LEFT_ELBOW: 7,
  RIGHT_ELBOW: 8,
  LEFT_WRIST: 9,
  RIGHT_WRIST: 10,
} as const

const SKELETON: [number, number][] = [
  [KP.LEFT_SHOULDER, KP.LEFT_ELBOW],
  [KP.LEFT_ELBOW, KP.LEFT_WRIST],
  [KP.RIGHT_SHOULDER, KP.RIGHT_ELBOW],
  [KP.RIGHT_ELBOW, KP.RIGHT_WRIST],
  [KP.LEFT_SHOULDER, KP.RIGHT_SHOULDER],
]

// ─── Types ────────────────────────────────────────────────────────────────────

export type Phase = 'UP' | 'DOWN' | 'UNKNOWN'
export type WorkoutMode = 'free' | 'structured'

export interface LapRecord {
  lap: number
  reps: number
  durationMs: number
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function usePoseDetection(
  videoRef: Ref<HTMLVideoElement | null>,
  canvasRef: Ref<HTMLCanvasElement | null>,
) {
  const audio = useAudio()

  // ── Workout config (user-settable before starting) ──────────────────────────
  const workoutMode = ref<WorkoutMode>('free')
  const targetReps = ref(10)
  const totalLaps = ref(3)
  const restDuration = ref(30) // seconds

  // ── Video aspect ratio (updated once first frame dimensions are known) ───────
  const videoAspect = ref('4 / 3')

  // ── Runtime state ────────────────────────────────────────────────────────────
  const isLoading = ref(false)
  const isRunning = ref(false)
  const isModelReady = ref(false)
  const isBodyVisible = ref(false)
  const repCount = ref(0)
  const currentAngle = ref(0)
  const phase = ref<Phase>('UNKNOWN')
  const isFlashing = ref(false)
  const error = ref('')
  const countdown = ref<number | null>(null)
  const lapCount = ref(1)
  const currentLapReps = ref(0)
  const lapHistory = ref<LapRecord[]>([])
  const isOnBreak = ref(false)
  const restTimeLeft = ref(0)
  const isCompleted = ref(false)
  const gaugeProgress = ref(0)   // 0 = shoulder at UP baseline, 1 = shoulder at DOWN limit
  const gaugeReady = ref(false)  // true once shoulderBaseY is calibrated

  let detector: poseDetection.PoseDetector | null = null
  let detectorPromise: Promise<void> | null = null
  let stream: MediaStream | null = null
  let rafId: number | null = null
  let phaseState: Phase = 'UNKNOWN'
  let flashTimer: ReturnType<typeof setTimeout> | null = null
  let restTimer: ReturnType<typeof setInterval> | null = null
  let lapStartMs = 0
  let startGen = 0
  let currentFrameW = 640
  let currentFrameH = 480
  const SHOULDER_BUFFER_SIZE = 90  // ~3 s at 30 fps
  let shoulderYBuffer: number[] = []

  // ── Body-in-frame check ──────────────────────────────────────────────────────

  function checkBodyInFrame(keypoints: poseDetection.Keypoint[]): boolean {
    const mx = currentFrameW * FRAME_MARGIN
    const my = currentFrameH * FRAME_MARGIN
    for (let id = KP.LEFT_SHOULDER; id <= KP.RIGHT_WRIST; id++) {
      const kp = keypoints[id]
      if (!kp || (kp.score ?? 0) < MIN_BODY_SCORE) return false
      if (kp.x < mx || kp.x > currentFrameW - mx) return false
      if (kp.y < my || kp.y > currentFrameH - my) return false
    }
    return true
  }

  // ── Model init ───────────────────────────────────────────────────────────────

  function initDetector(): Promise<void> {
    if (detectorPromise) return detectorPromise
    detectorPromise = (async () => {
      await tf.setBackend('webgl')
      await tf.ready()
      detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING },
      )
      isModelReady.value = true
    })()
    return detectorPromise
  }

  // Pre-warm the model as soon as the composable is created
  initDetector().catch(() => { detectorPromise = null })

  // ── Camera ───────────────────────────────────────────────────────────────────

  async function startCamera() {
    // No height constraint — let the device use its natural orientation
    // (portrait phones deliver ~480×640; landscape delivers ~640×480)
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 } },
    })
    const video = videoRef.value!
    video.srcObject = stream
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => video.play().then(resolve).catch(reject)
    })
  }

  // ── Drawing ──────────────────────────────────────────────────────────────────

  function drawFrame(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    keypoints?: poseDetection.Keypoint[],
  ) {
    const { videoWidth: w, videoHeight: h } = video
    const canvas = ctx.canvas
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w || 640
      canvas.height = h || 480
      currentFrameW = canvas.width
      currentFrameH = canvas.height
      // Keep the CSS container in sync with the actual video aspect ratio
      if (w > 0 && h > 0) videoAspect.value = `${w} / ${h}`
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    if (!keypoints) return

    ctx.strokeStyle = 'white'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    for (const [a, b] of SKELETON) {
      const kpA = keypoints[a]
      const kpB = keypoints[b]
      if (!kpA || !kpB) continue
      if ((kpA.score ?? 0) < MIN_SCORE || (kpB.score ?? 0) < MIN_SCORE) continue
      ctx.beginPath()
      ctx.moveTo(kpA.x, kpA.y)
      ctx.lineTo(kpB.x, kpB.y)
      ctx.stroke()
    }

    // Vertical shoulder travel indicator
    const ls = keypoints[KP.LEFT_SHOULDER]
    const rs = keypoints[KP.RIGHT_SHOULDER]
    const visibleShoulders = [ls, rs].filter(kp => kp && (kp.score ?? 0) >= MIN_SCORE)
    if (visibleShoulders.length > 0) {
      const sx = visibleShoulders.reduce((s, kp) => s + kp!.x, 0) / visibleShoulders.length
      const sy = visibleShoulders.reduce((s, kp) => s + kp!.y, 0) / visibleShoulders.length

      ctx.save()
      // Dashed vertical reference line
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 2
      ctx.setLineDash([10, 8])
      ctx.beginPath()
      ctx.moveTo(sx, 0)
      ctx.lineTo(sx, canvas.height)
      ctx.stroke()
      ctx.setLineDash([])

      // Current shoulder Y tick
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(sx - 18, sy)
      ctx.lineTo(sx + 18, sy)
      ctx.stroke()

      ctx.restore()
    }
  }

  // ── Push-up state machine ────────────────────────────────────────────────────

  function processPushup(keypoints: poseDetection.Keypoint[]) {
    if (!checkBodyInFrame(keypoints)) {
      isBodyVisible.value = false
      phaseState = 'UNKNOWN'
      phase.value = 'UNKNOWN'
      return
    }
    isBodyVisible.value = true

    const left = {
      shoulder: keypoints[KP.LEFT_SHOULDER],
      elbow: keypoints[KP.LEFT_ELBOW],
      wrist: keypoints[KP.LEFT_WRIST],
    }
    const right = {
      shoulder: keypoints[KP.RIGHT_SHOULDER],
      elbow: keypoints[KP.RIGHT_ELBOW],
      wrist: keypoints[KP.RIGHT_WRIST],
    }

    const scoreOf = (s: typeof left) =>
      Math.min(s.shoulder.score ?? 0, s.elbow.score ?? 0, s.wrist.score ?? 0)
    const leftScore = scoreOf(left)
    const rightScore = scoreOf(right)
    if (Math.max(leftScore, rightScore) < MIN_SCORE) return

    const side = leftScore >= rightScore ? left : right
    const angle = calculateAngle(side.shoulder, side.elbow, side.wrist)
    currentAngle.value = Math.round(angle)

    // Rolling buffer — gauge range = actual observed movement in the last ~3 s
    shoulderYBuffer.push(side.shoulder.y)
    if (shoulderYBuffer.length > SHOULDER_BUFFER_SIZE) shoulderYBuffer.shift()

    const bufMinY = Math.min(...shoulderYBuffer)
    const bufMaxY = Math.max(...shoulderYBuffer)
    const rangeH = Math.max(bufMaxY - bufMinY, currentFrameH * SHOULDER_DOWN_DELTA)
    gaugeProgress.value = Math.max(0, Math.min(1, (side.shoulder.y - bufMinY) / rangeH))
    gaugeReady.value = shoulderYBuffer.length >= 20

    // ── Phase state machine — gauge is the single source of truth ───────────
    // Fall back to angle thresholds only before the gauge is calibrated.
    const goingDown = gaugeReady.value
      ? gaugeProgress.value >= GAUGE_DOWN_THRESHOLD
      : angle < DOWN_THRESHOLD

    const goingUp = gaugeReady.value
      ? gaugeProgress.value <= GAUGE_UP_THRESHOLD
      : angle > UP_THRESHOLD

    if (goingUp) {
      if (phaseState === 'DOWN' && countdown.value === null && !isOnBreak.value) {
        repCount.value++
        currentLapReps.value++
        triggerFlash()
        audio.playRepChime()
        if (workoutMode.value === 'structured' && currentLapReps.value >= targetReps.value) {
          endLap()
        }
      }
      phaseState = 'UP'
      phase.value = 'UP'
    } else if (goingDown) {
      phaseState = 'DOWN'
      phase.value = 'DOWN'
    }
  }

  function triggerFlash() {
    if (flashTimer) clearTimeout(flashTimer)
    isFlashing.value = true
    flashTimer = setTimeout(() => { isFlashing.value = false }, 500)
  }

  // ── Detection loop ───────────────────────────────────────────────────────────

  async function detectionLoop() {
    if (!isRunning.value) return

    const video = videoRef.value
    const canvas = canvasRef.value
    const ctx = canvas?.getContext('2d')

    if (video && canvas && ctx && detector && video.readyState >= 2) {
      try {
        const poses = await detector.estimatePoses(video, { flipHorizontal: false })
        if (!isRunning.value) return
        if (poses.length > 0) {
          drawFrame(ctx, video, poses[0].keypoints)
          processPushup(poses[0].keypoints)
        } else {
          drawFrame(ctx, video)
          isBodyVisible.value = false
        }
      } catch {
        if (video && canvas && ctx) drawFrame(ctx, video)
      }
    }

    if (isRunning.value) {
      rafId = requestAnimationFrame(() => detectionLoop())
    }
  }

  // ── Camera/loop teardown (without resetting counts) ──────────────────────────

  function stopCamera() {
    startGen++
    isRunning.value = false
    countdown.value = null

    if (restTimer !== null) { clearInterval(restTimer); restTimer = null }
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }

    stream?.getTracks().forEach((t) => t.stop())
    stream = null

    const video = videoRef.value
    if (video) video.srcObject = null

    const canvas = canvasRef.value
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  async function start() {
    error.value = ''
    isLoading.value = true

    try {
      await Promise.all([
        startCamera(),
        initDetector(),
      ])
    } catch (e: unknown) {
      stop()
      error.value = e instanceof Error
        ? e.message
        : 'Could not start camera or load AI model. Check permissions and try again.'
      isLoading.value = false
      return
    }

    isLoading.value = false
    repCount.value = 0
    currentLapReps.value = 0
    currentAngle.value = 0
    phaseState = 'UNKNOWN'
    phase.value = 'UNKNOWN'
    shoulderYBuffer = []
    gaugeProgress.value = 0
    gaugeReady.value = false
    lapCount.value = 1
    lapHistory.value = []
    isOnBreak.value = false
    isCompleted.value = false
    restTimeLeft.value = 0
    lapStartMs = Date.now()

    const gen = ++startGen
    isRunning.value = true
    detectionLoop()

    await audio.playCountdown(n => {
      if (startGen === gen) countdown.value = n
    })

    if (startGen !== gen || !isRunning.value) return
    countdown.value = null
    audio.startBeat()
  }

  function stop() {
    stopCamera()
    audio.stopBeat()
    isOnBreak.value = false
    restTimeLeft.value = 0
  }

  function reset() {
    const wasOnBreak = isOnBreak.value
    if (restTimer !== null) { clearInterval(restTimer); restTimer = null }
    repCount.value = 0
    currentLapReps.value = 0
    currentAngle.value = 0
    lapCount.value = 1
    lapHistory.value = []
    isOnBreak.value = false
    isCompleted.value = false
    restTimeLeft.value = 0
    lapStartMs = Date.now()
    phaseState = 'UNKNOWN'
    phase.value = 'UNKNOWN'
    shoulderYBuffer = []
    gaugeProgress.value = 0
    gaugeReady.value = false
    if (isRunning.value && wasOnBreak && countdown.value === null) {
      audio.startBeat()
    }
  }

  function endLap() {
    lapHistory.value.push({
      lap: lapCount.value,
      reps: currentLapReps.value,
      durationMs: Date.now() - lapStartMs,
    })

    const allDone = workoutMode.value === 'structured' && lapCount.value >= totalLaps.value
    if (allDone) {
      audio.stopBeat()
      stopCamera()
      audio.playComplete()
      isCompleted.value = true
      return
    }

    isOnBreak.value = true
    audio.stopBeat()

    if (workoutMode.value === 'structured') {
      restTimeLeft.value = restDuration.value
      if (restTimer !== null) clearInterval(restTimer)
      restTimer = setInterval(() => {
        restTimeLeft.value--
        if (restTimeLeft.value === 3) audio.playRestWarning()
        if (restTimeLeft.value <= 0) {
          clearInterval(restTimer!)
          restTimer = null
          if (isRunning.value) resumeLap()
        }
      }, 1000)
    }
  }

  function resumeLap() {
    if (restTimer !== null) { clearInterval(restTimer); restTimer = null }
    lapCount.value++
    currentLapReps.value = 0
    restTimeLeft.value = 0
    lapStartMs = Date.now()
    phaseState = 'UNKNOWN'
    phase.value = 'UNKNOWN'
    isOnBreak.value = false
    audio.startBeat()
  }

  onUnmounted(() => {
    stopCamera()
    audio.stopBeat()
    audio.destroy()
  })

  return {
    videoAspect,
    // Config
    workoutMode,
    targetReps,
    totalLaps,
    restDuration,
    // State
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
    // Actions
    start,
    stop,
    reset,
    endLap,
    resumeLap,
  }
}
