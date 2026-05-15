/**
 * Returns the angle (degrees) at vertex B formed by rays B→A and B→C.
 * Uses the dot-product formula so it works in any 2-D coordinate system.
 */
export function calculateAngle(
  A: { x: number; y: number },
  B: { x: number; y: number },
  C: { x: number; y: number },
): number {
  const BAx = A.x - B.x
  const BAy = A.y - B.y
  const BCx = C.x - B.x
  const BCy = C.y - B.y

  const dot = BAx * BCx + BAy * BCy
  const mag = Math.sqrt(BAx ** 2 + BAy ** 2) * Math.sqrt(BCx ** 2 + BCy ** 2)

  if (mag === 0) return 0

  // Clamp to [-1, 1] to guard against floating-point drift before acos
  return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI
}
