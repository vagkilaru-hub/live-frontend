// MediaPipe Face Mesh utility with mobile fallback
let FaceMesh = null;
let Camera = null;

// Try to load MediaPipe from CDN with retries
async function loadMediaPipe() {
    if (FaceMesh && Camera) return { FaceMesh, Camera };

    console.log('🔄 Loading MediaPipe...');

    try {
        // Method 1: Try from official CDN
        const script1 = document.createElement('script');
        script1.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh';
        document.head.appendChild(script1);

        await new Promise((resolve, reject) => {
            script1.onload = resolve;
            script1.onerror = reject;
            setTimeout(reject, 10000); // 10 second timeout
        });

        if (window.FaceMesh) {
            FaceMesh = window.FaceMesh;
        }
    } catch (e) {
        console.warn('⚠️ Primary CDN failed, trying backup...');
    }

    try {
        // Method 2: Try camera utils
        const script2 = document.createElement('script');
        script2.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils';
        document.head.appendChild(script2);

        await new Promise((resolve, reject) => {
            script2.onload = resolve;
            script2.onerror = reject;
            setTimeout(reject, 10000);
        });

        if (window.Camera) {
            Camera = window.Camera;
        }
    } catch (e) {
        console.warn('⚠️ Camera utils failed');
    }

    if (!FaceMesh || !Camera) {
        throw new Error('MediaPipe libraries failed to load');
    }

    console.log('✅ MediaPipe loaded successfully');
    return { FaceMesh, Camera };
}

export async function initializeMediaPipe(videoElement, onResults) {
    try {
        console.log('🎬 Initializing MediaPipe for video element...');

        // Load MediaPipe libraries
        const { FaceMesh: FM, Camera: Cam } = await loadMediaPipe();

        // Initialize Face Mesh
        const faceMesh = new FM({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
            }
        });

        // Configure Face Mesh
        faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        faceMesh.onResults(onResults);

        // Initialize Camera
        const camera = new Cam(videoElement, {
            onFrame: async () => {
                await faceMesh.send({ image: videoElement });
            },
            width: 640,
            height: 480
        });

        camera.start();

        console.log('✅ MediaPipe initialized successfully');
        return { faceMesh, camera };

    } catch (error) {
        console.error('❌ MediaPipe initialization failed:', error);
        throw error;
    }
}

export function extractAttentionFeatures(results) {
    if (!results || !results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        return null;
    }

    const landmarks = results.multiFaceLandmarks[0];

    // Key landmark indices
    const LEFT_EYE = [33, 160, 158, 133, 153, 144];
    const RIGHT_EYE = [362, 385, 387, 263, 373, 380];
    const NOSE_TIP = 1;
    const CHIN = 152;
    const LEFT_EYE_IRIS = 468;
    const RIGHT_EYE_IRIS = 473;

    // Calculate Eye Aspect Ratio (EAR)
    function calculateEAR(eyePoints) {
        const vertical1 = Math.hypot(
            landmarks[eyePoints[1]].x - landmarks[eyePoints[5]].x,
            landmarks[eyePoints[1]].y - landmarks[eyePoints[5]].y
        );
        const vertical2 = Math.hypot(
            landmarks[eyePoints[2]].x - landmarks[eyePoints[4]].x,
            landmarks[eyePoints[2]].y - landmarks[eyePoints[4]].y
        );
        const horizontal = Math.hypot(
            landmarks[eyePoints[0]].x - landmarks[eyePoints[3]].x,
            landmarks[eyePoints[0]].y - landmarks[eyePoints[3]].y
        );
        return (vertical1 + vertical2) / (2.0 * horizontal);
    }

    const leftEAR = calculateEAR(LEFT_EYE);
    const rightEAR = calculateEAR(RIGHT_EYE);
    const ear = (leftEAR + rightEAR) / 2;

    // Calculate Gaze Direction (simplified)
    const leftIris = landmarks[LEFT_EYE_IRIS];
    const rightIris = landmarks[RIGHT_EYE_IRIS];
    const noseTip = landmarks[NOSE_TIP];

    const gazeX = ((leftIris.x + rightIris.x) / 2) - noseTip.x;
    const gazeY = ((leftIris.y + rightIris.y) / 2) - noseTip.y;

    // Calculate Head Pose (simplified)
    const chin = landmarks[CHIN];
    const pitch = Math.round((chin.y - noseTip.y) * 100);
    const yaw = Math.round((chin.x - noseTip.x) * 100);
    const roll = 0; // Simplified

    return {
        eye_aspect_ratio: ear,
        gaze_direction: { x: gazeX, y: gazeY },
        head_pose: { pitch, yaw, roll },
        timestamp: Date.now()
    };
}