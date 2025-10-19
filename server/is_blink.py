# pip install mediapipe opencv-python
import cv2, math, mediapipe as mp

# MediaPipe FaceMeshの目ランドマーク6点
L = [33,160,158,133,153,144]
R = [362,385,387,263,373,380]

def is_blink(frame_bgr, ear_threshold: float = 0.17) -> bool:
    """画像(BGR: cv2.imread/VideoCaptureの返り値)を受け取り、
    目が閉じている(=瞬き状態)ならTrue、そうでなければFalse を返す。
    顔未検出時も False を返す。
    """
    def d2(p, q): return math.dist((p.x, p.y), (q.x, q.y))

    def ear(lm, idx):
        p=[lm[i] for i in idx]
        v=d2(p[1],p[5])+d2(p[2],p[4]); h=d2(p[0],p[3])*2.0
        return 0.0 if h==0 else v/h

    mesh = mp.solutions.face_mesh.FaceMesh(
        static_image_mode=True, max_num_faces=1, refine_landmarks=True,
        min_detection_confidence=0.5
    )
    
    try:
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        res = mesh.process(rgb)
        if not res.multi_face_landmarks: return False
        lm = res.multi_face_landmarks[0].landmark
        ear_val = (ear(lm,L) + ear(lm,R)) / 2.0
        return ear_val < ear_threshold
    finally:
        mesh.close()