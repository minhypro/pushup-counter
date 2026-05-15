import { ref, onUnmounted, type Ref } from 'vue'
import * as tf from '@tensorflow/tfjs'
import * as poseDetection from '@tensorflow-models/pose-detection'
import { calculateAngle } from '../utils/angle'

// ─── Constants ────────────────────────────────────────────────────────────────

const UP_THRESHOLD = 160   // degrees – arm fully extended
const DOWN_THRESHOLD = 90  // degrees – at bottom of push-up
const MIN_SCORE = 0.3      // minimum keypoint confidence

// MoveNet keypoint indices
const KP = {
  LEFT_SHOULDER: 5,
  RIGHT_SHOULDER: 6,
  LEFT_ELBOW: 7,
  RIGHT_ELBOW: 8,
  LEFT_WRIST: 9,
  RIGHT_WRIST: 10,
} as const

// Connected pairs for skeleton overlay (index pairs into the keypoints array)
const SKELETON: [number, number][] = [
  [0, 1], [0, 2], [1, 3], [2, 4],                   // face
  [KP.LEFT_SHOULDER, KP.LEFT_ELBOW],
  [KP.LEFT_ELBOW, KP.LEFT_WRIST],                    // left arm
  [KP.RIGHT_SHOULDER, KP.RIGHT_ELBOW],
  [KP.RIGHT_ELBOW, KP.RIGHT_WRIST],                  // right arm
  [KP.LEFT_SHOULDER, KP.RIGHT_SHOULDER],             // shoulders
  [KP.LEFT_SHOULDER, 11],
  [KP.RIGHT_SHOULDER, 12],                           // torso sides
  [11, 12],                                          // hips
  [11, 13], [13, 15],                                // left leg
  [12, 14], [14, 16],                                // right leg
]

// ─── Composable ───────────────────────────────────────────────────────────────

export type Phase = 'UP' | 'DOWN' | 'UNKNOWN'

export function usePoseDetection(
  videoRef: Ref<HTMLVideoElement | null>,
  canvasRef: Ref<HTMLCanvasElement | null>,
) {
  const isLoading = ref(false)
  const isRunning = ref(false)
  const repCount = ref(0)
  const currentAngle = ref(0)
  const phase = ref<Phase>('UNKNOWN')
  const isFlashing = ref(false)
  const error = ref('')

  let detector: poseDetection.PoseDetector | null = null
  let stream: MediaStream | null = null
  let rafId: number | null = null
  let phaseState: Phase = 'UNKNOWN'
  let flashTimer: ReturnType<typeof setTimeout> | null = null

  // ── Model init ──────────────────────────────────────────────────────────────

  async function initDetector() {
    // Force WebGL — @tensorflow/tfjs registers WebGPU as highest-priority
    // but it may not be supported or may hang; WebGL is the reliable choice.
    await tf.setBackend('webgl')
    await tf.ready()
    detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING },
    )
  }

  // ── Camera ──────────────────────────────────────────────────────────────────

  async function startCamera() {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    })

    const video = videoRef.value!
    video.srcObject = stream

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => video.play().then(resolve).catch(reject)
    })
  }

  // ── Drawing ─────────────────────────────────────────────────────────────────

  function drawFrame(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    keypoints?: poseDetection.Keypoint[],
  ) {
    const { videoWidth: w, videoHeight: h } = video

    // Sync canvas buffer dimensions to the live video
    const canvas = ctx.canvas
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w || 640
      canvas.height = h || 480
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    if (!keypoints) return

    // Skeleton lines
    ctx.strokeStyle = '#22d3ee'   // cyan-400
    ctx.lineWidth = 2.5
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

    // Keypoint dots
    for (const kp of keypoints) {
      if ((kp.score ?? 0) < MIN_SCORE) continue
      ctx.beginPath()
      ctx.arc(kp.x, kp.y, 5, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.strokeStyle = '#22d3ee'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }

  // ── Push-up state machine ───────────────────────────────────────────────────

  function processPushup(keypoints: poseDetection.Keypoint[]) {
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

    // Pick the side where all three joints have higher minimum confidence
    const scoreOf = (s: typeof left) =>
      Math.min(s.shoulder.score ?? 0, s.elbow.score ?? 0, s.wrist.score ?? 0)

    const leftScore = scoreOf(left)
    const rightScore = scoreOf(right)
    if (Math.max(leftScore, rightScore) < MIN_SCORE) return

    const side = leftScore >= rightScore ? left : right

    const angle = calculateAngle(side.shoulder, side.elbow, side.wrist)
    currentAngle.value = Math.round(angle)

    if (angle > UP_THRESHOLD) {
      // Transitioning UP after being DOWN = completed rep
      if (phaseState === 'DOWN') {
        repCount.value++
        triggerFlash()
      }
      phaseState = 'UP'
      phase.value = 'UP'
    } else if (angle < DOWN_THRESHOLD) {
      phaseState = 'DOWN'
      phase.value = 'DOWN'
    }
    // Angles between thresholds don't change phase (hysteresis)
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

        if (!isRunning.value) return // stop called while awaiting

        if (poses.length > 0) {
          drawFrame(ctx, video, poses[0].keypoints)
          processPushup(poses[0].keypoints)
        } else {
          drawFrame(ctx, video)
        }
      } catch {
        // Silently skip frames that fail (e.g. tab backgrounded)
        if (video && canvas && ctx) drawFrame(ctx, video)
      }
    }

    if (isRunning.value) {
      rafId = requestAnimationFrame(() => detectionLoop())
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  async function start() {
    error.value = ''
    isLoading.value = true
    try {
      // Camera permission + model init run concurrently so the browser
      // shows the camera dialog immediately while the model downloads.
      await Promise.all([
        startCamera(),
        detector ? Promise.resolve() : initDetector(),
      ])

      repCount.value = 0
      currentAngle.value = 0
      phaseState = 'UNKNOWN'
      phase.value = 'UNKNOWN'
      isRunning.value = true
      detectionLoop()
    } catch (e: unknown) {
      // If camera was granted but model failed (or vice-versa), clean up
      stop()
      error.value =
        e instanceof Error
          ? e.message
          : 'Could not start camera or load AI model. Check permissions and try again.'
    } finally {
      isLoading.value = false
    }
  }

  function stop() {
    isRunning.value = false

    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }

    stream?.getTracks().forEach((t) => t.stop())
    stream = null

    const video = videoRef.value
    if (video) video.srcObject = null

    const canvas = canvasRef.value
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
  }

  function reset() {
    repCount.value = 0
    currentAngle.value = 0
    phaseState = 'UNKNOWN'
    phase.value = 'UNKNOWN'
  }

  onUnmounted(stop)

  return {
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
  }
}
