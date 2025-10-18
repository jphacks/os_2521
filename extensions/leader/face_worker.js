importScripts("face_mesh/face_mesh.js");

const SIZE = 224;
const EAR_THRESHOLD = 0.17;

// FaceMesh初期化
const faceMesh = new FaceMesh({
    locateFile: (file) => self.origin + "/face_mesh/" + file,
});

faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
});

function euclideanDistance(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

function calcEAR(eyeLandmarks) {
    const [p1, p2, p3, p4, p5, p6] = eyeLandmarks;
    return (
        (euclideanDistance(p2, p6) + euclideanDistance(p3, p5)) /
        (2.0 * euclideanDistance(p1, p4))
    );
}

faceMesh.onResults((results) => {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;

    const landmarks = results.multiFaceLandmarks[0];
    const leftEyeIdx = [33, 160, 158, 133, 153, 144];
    const rightEyeIdx = [362, 385, 387, 263, 373, 380];

    const leftEAR = calcEAR(leftEyeIdx.map((i) => landmarks[i]));
    const rightEAR = calcEAR(rightEyeIdx.map((i) => landmarks[i]));
    const ear = (leftEAR + rightEAR) / 2.0;

    const blinkDetected = ear < EAR_THRESHOLD;
    postMessage({ type: "BLINK_CHECK", ear, blinkDetected });
});

onmessage = async (e) => {
    const { type, image } = e.data;
    if (type === "FRAME") {
        await faceMesh.send({ image });
        image.close();
    }
};
