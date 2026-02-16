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

    // Key landmark indices for eyes
    const LEFT_EYE = [33, 160, 158, 133, 153, 144];
    const RIGHT_EYE = [362, 385, 387, 263, 373, 380];
    
    // Key landmarks for head pose estimation
    const NOSE_TIP = 1;
    const NOSE_BRIDGE = 168;
    const LEFT_EYE_OUTER = 33;
    const RIGHT_EYE_OUTER = 263;
    const LEFT_MOUTH = 61;
    const RIGHT_MOUTH = 291;
    const CHIN = 152;
    const FOREHEAD = 10;

    // Calculate Eye Aspect Ratio (EAR) for drowsiness
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

    // IMPROVED HEAD POSE CALCULATION using facial geometry
    function calculateHeadPose() {
        const noseTip = landmarks[NOSE_TIP];
        const noseBridge = landmarks[NOSE_BRIDGE];
        const leftEye = landmarks[LEFT_EYE_OUTER];
        const rightEye = landmarks[RIGHT_EYE_OUTER];
        const leftMouth = landmarks[LEFT_MOUTH];
        const rightMouth = landmarks[RIGHT_MOUTH];
        const chin = landmarks[CHIN];
        const forehead = landmarks[FOREHEAD];

        // Calculate face width (distance between eyes)
        const faceWidth = Math.hypot(
            rightEye.x - leftEye.x,
            rightEye.y - leftEye.y,
            (rightEye.z || 0) - (leftEye.z || 0)
        );

        // Calculate face center
        const centerX = (leftEye.x + rightEye.x) / 2;
        const centerY = (leftEye.y + rightEye.y) / 2;

        // YAW (left-right rotation) - using nose position relative to face center
        // When looking straight: nose should be centered
        // When turned left: nose shifts left, when turned right: nose shifts right
        const noseOffsetX = noseTip.x - centerX;
        const yaw = Math.round((noseOffsetX / faceWidth) * 180);  // Convert to degrees

        // PITCH (up-down rotation) - using nose-to-forehead distance
        const faceHeight = Math.hypot(
            forehead.x - chin.x,
            forehead.y - chin.y,
            (forehead.z || 0) - (chin.z || 0)
        );
        
        const noseOffsetY = noseTip.y - centerY;
        const pitch = Math.round((noseOffsetY / faceHeight) * 120);  // Convert to degrees

        // ALTERNATIVE YAW using eye asymmetry (more robust for profile views)
        // When face is turned, one eye appears smaller/farther
        const leftEyeWidth = Math.hypot(
            landmarks[33].x - landmarks[133].x,
            landmarks[33].y - landmarks[133].y
        );
        const rightEyeWidth = Math.hypot(
            landmarks[362].x - landmarks[263].x,
            landmarks[362].y - landmarks[263].y
        );
        
        const eyeRatio = rightEyeWidth / (leftEyeWidth + 0.001);  // Avoid division by zero
        const yawFromEyes = Math.round((eyeRatio - 1) * 100);

        // Use the stronger signal
        const finalYaw = Math.abs(yawFromEyes) > Math.abs(yaw) ? yawFromEyes : yaw;

        return {
            pitch: pitch,
            yaw: finalYaw,
            roll: 0  // Not critical for this application
        };
    }

    const head_pose = calculateHeadPose();

    // Calculate gaze direction (for future use)
    const leftIris = landmarks[468] || landmarks[LEFT_EYE_OUTER];
    const rightIris = landmarks[473] || landmarks[RIGHT_EYE_OUTER];
    const noseTip = landmarks[NOSE_TIP];

    const gazeX = ((leftIris.x + rightIris.x) / 2) - noseTip.x;
    const gazeY = ((leftIris.y + rightIris.y) / 2) - noseTip.y;

    console.log('🎯 Head Pose:', {
        yaw: head_pose.yaw + '°',
        pitch: head_pose.pitch + '°',
        EAR: ear.toFixed(3)
    });

    return {
        eye_aspect_ratio: ear,
        gaze_direction: { x: gazeX, y: gazeY },
        head_pose: head_pose,
        timestamp: Date.now()
    };
}