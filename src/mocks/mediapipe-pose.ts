// Stub for @mediapipe/pose.
// pose-detection.esm.js imports { Pose } from here even when using MoveNet.
// MoveNet never constructs this class, so a no-op stub is sufficient.
export class Pose {
  constructor(_options?: Record<string, unknown>) {}
  onResults(_cb: unknown): void {}
  setOptions(_options: Record<string, unknown>): void {}
  send(_inputs: Record<string, unknown>): Promise<void> { return Promise.resolve() }
  close(): Promise<void> { return Promise.resolve() }
  initialize(): Promise<void> { return Promise.resolve() }
  reset(): void {}
}

export const POSE_CONNECTIONS: [number, number][] = []
export const POSE_LANDMARKS: Record<string, number> = {}
export const POSE_LANDMARKS_LEFT: Record<string, number> = {}
export const POSE_LANDMARKS_RIGHT: Record<string, number> = {}
export const POSE_LANDMARKS_NEUTRAL: Record<string, number> = {}
export const VERSION = '0.5'
