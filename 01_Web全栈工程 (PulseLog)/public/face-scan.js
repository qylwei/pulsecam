import { FaceDetector, FilesetResolver } from '/vision/vision_bundle.mjs';

let detectorPromise;

export function loadFaceDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks('/vision/wasm');
      return FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: '/vision/face_detector.tflite', delegate: 'CPU' },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.65,
      });
    })().catch(error => {
      detectorPromise = null;
      throw error;
    });
  }
  return detectorPromise;
}
