// Stub for @tensorflow/tfjs-backend-webgpu.
// pose-detection.esm.js imports WebGPUBackend and webgpu_util even when using
// MoveNet on WebGL. Every WebGPU code path is guarded by
// `backend instanceof WebGPUBackend`, which is always false with a WebGL
// backend, so these stubs are never called at runtime.

export class WebGPUBackend {}

export const webgpu_util = {
  flatDispatchLayout: (_shape: number[]) => ({ x: [] as number[] }),
  computeDispatch: (
    _layout: { x: number[] },
    _outputShape: number[],
    _workgroupSize: [number, number, number],
  ) => [1, 1, 1] as [number, number, number],
}
