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
    const LEFT_EYE_OUTER = 33;
    const RIGHT_EYE_OUTER = 263;
    const LEFT_EYE_INNER = 133;
    const RIGHT_EYE_INNER = 362;
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

    // ROBUST HEAD POSE CALCULATION - Multiple methods combined
    function calculateHeadPose() {
        const noseTip = landmarks[NOSE_TIP];
        const leftEyeOuter = landmarks[LEFT_EYE_OUTER];
        const rightEyeOuter = landmarks[RIGHT_EYE_OUTER];
        const leftEyeInner = landmarks[LEFT_EYE_INNER];
        const rightEyeInner = landmarks[RIGHT_EYE_INNER];
        const chin = landmarks[CHIN];
        const forehead = landmarks[FOREHEAD];

        // METHOD 1: Eye asymmetry (most reliable for profile detection)
        const leftEyeWidth = Math.abs(leftEyeOuter.x - leftEyeInner.x);
        const rightEyeWidth = Math.abs(rightEyeOuter.x - rightEyeInner.x);
        
        // When head turns left: left eye gets smaller
        // When head turns right: right eye gets smaller
        const eyeAsymmetry = (rightEyeWidth - leftEyeWidth) / (rightEyeWidth + leftEyeWidth + 0.001);
        const yawFromEyes = Math.round(eyeAsymmetry * 200); // Amplify the signal

        // METHOD 2: Nose position relative to eye center
        const eyeCenterX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
        const faceWidth = Math.abs(rightEyeOuter.x - leftEyeOuter.x);
        const noseOffset = (noseTip.x - eyeCenterX) / (faceWidth + 0.001);
        const yawFromNose = Math.round(noseOffset * 150);

        // METHOD 3: Face width asymmetry
        const leftSideWidth = Math.abs(noseTip.x - leftEyeOuter.x);
        const rightSideWidth = Math.abs(rightEyeOuter.x - noseTip.x);
        const sideAsymmetry = (rightSideWidth - leftSideWidth) / (rightSideWidth + leftSideWidth + 0.001);
        const yawFromSides = Math.round(sideAsymmetry * 180);

        // Combine all methods - use the strongest signal
        const yawValues = [yawFromEyes, yawFromNose, yawFromSides];
        const maxAbsYaw = yawValues.reduce((max, val) => 
            Math.abs(val) > Math.abs(max) ? val : max, 0);
        
        const finalYaw = maxAbsYaw;

        // PITCH calculation (up-down)
        const faceHeight = Math.abs(forehead.y - chin.y);
        const eyeCenterY = (leftEyeOuter.y + rightEyeOuter.y) / 2;
        const noseOffsetY = (noseTip.y - eyeCenterY) / (faceHeight + 0.001);
        const pitch = Math.round(noseOffsetY * 100);

        console.log('🔍 Yaw calculations:', {
            eyes: yawFromEyes + '°',
            nose: yawFromNose + '°', 
            sides: yawFromSides + '°',
            final: finalYaw + '°'
        });

        return {
            pitch: pitch,
            yaw: finalYaw,
            roll: 0
        };
    }

    const head_pose = calculateHeadPose();

    // Calculate gaze direction (for future use)
    const leftIris = landmarks[468] || landmarks[LEFT_EYE_OUTER];
    const rightIris = landmarks[473] || landmarks[RIGHT_EYE_OUTER];
    const noseTip = landmarks[NOSE_TIP];

    const gazeX = ((leftIris.x + rightIris.x) / 2) - noseTip.x;
    const gazeY = ((leftIris.y + rightIris.y) / 2) - noseTip.y;

    console.log('🎯 Head Pose FINAL:', {
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