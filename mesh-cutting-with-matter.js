/**
 * ==========================================
 * Three.js + Matter.js 기반 2D 메쉬 커팅 시스템
 * ==========================================
 * 
 * @description
 * 2D 환경에서 메쉬를 절단하고 물리 시뮬레이션을 수행하는 인터랙티브 애플리케이션입니다.
 * 마우스 드래그로 절단선을 그어 도형을 분할하고, Matter.js 물리 엔진으로 자연스러운 낙하와 충돌을 구현합니다.
 * 
 * @features
 * - 2D 메쉬 절단 및 분할 기능
 * - Matter.js 기반 물리 시뮬레이션 (중력, 충돌, 마찰)
 * - OBJ 파일 로드 및 2D 투영
 * - 텍스처 매핑 지원
 * - 파티클 효과 (작은 조각 처리)
 * - 디버그 모드 (물리 바디 시각화)
 * - 카메라 팬/줌 기능
 * 
 * @dependencies
 * - Three.js (3D 그래픽스 라이브러리)
 * - Matter.js (2D 물리 엔진)
 * 
 * @author Graphics Project
 * @version 2.0
 */

// ==========================================
// 전역 변수 선언
// ==========================================



//@section DOM 요소
const canvas = document.getElementById('canvas');      // 메인 렌더링 캔버스
const infoDiv = document.getElementById('info');      // 정보 표시 영역
const loadingDiv = document.getElementById('loading'); // 로딩 인디케이터

/**
 * @section Three.js 관련 변수
 */
let scene;           // Three.js 씬 객체
let camera;          // OrthographicCamera (2D 전용)
let renderer;        // WebGL 렌더러
let raycaster;       // 마우스 피킹용 레이캐스터
let mouse;           // 마우스 좌표 (Vector2)

/**
 * @section Matter.js 물리 엔진 변수
 */
let engine;          //Matter.js 물리 엔진
let world;           //물리 월드
let walls = [];      //캔버스 경계 벽들 (상하좌우)

/**
 * @section 메쉬 및 절단 상태
 */
let meshes = [];     // 메쉬 데이터 배열 [{ threeMesh, matterBody, userData, ... }]
let isDrawing = false;      // 절단선 그리기 중 여부
let startPoint = null;     // 절단선 시작점 (Vector3)
let endPoint = null;       // 절단선 끝점 (Vector3)
let cutLineHelper = null;  // 절단선 시각화 헬퍼 (Line)

/**
 * @section 카메라 컨트롤
 */
let isPanning = false;              // 카메라 팬 모드 활성화 여부
let panStartMouse = { x: 0, y: 0 }; // 팬 시작 시 마우스 위치
let panStartCamera = { x: 0, y: 0 }; // 팬 시작 시 카메라 위치

/**
 * @section 렌더링 모드
 */
let wireframeMode = false; // 와이어프레임 모드 활성화 여부

/**
 * @section 성능 측정
 */
let fps = 0;                           // 현재 FPS
let lastTime = performance.now();       // 마지막 FPS 계산 시간
let frameCount = 0;                     // 프레임 카운터

/**
 * @section 뷰포트 설정
 */
let viewWidth = 800;   // 뷰포트 너비 (픽셀)
let viewHeight = 600;  // 뷰포트 높이 (픽셀)
let cameraZoom = 1;    // 카메라 줌 레벨 (0.5 ~ 3.0)

/**
 * @section Z축 관리 레이어로 나눔
 */
let nextZIndex = 0;        // 다음 Z 인덱스
const Z_OFFSET = 0.01;      // Z축 간격(각 메쉬마다 0.01씩 증가)

/**
 * @section 파티클 시스템 -> 원본의 1/40 이하로 커팅 되면 효과와 함께 삭제
 */
let particles = []; // 파티클 데이터 배열 [{ system, velocities, startTime, duration }]

/**
 * @section 디버그 모드
 */
let debugMode = false;              // 물리 충돌 영역 표시 여부 (기본: OFF)
let debugLines = [];                // 물리 바디 시각화 라인들
let lastDebugUpdate = 0;            // 마지막 디버그 업데이트 시간
const DEBUG_UPDATE_INTERVAL = 100;  // 디버그 업데이트 간격 (ms) - 0.1초마다

/**
 * @section 물리 품질 설정
 */
let maxVertexCount = 80; // Matter.js 물리 바디 최대 정점 수 (기본: 80, 빠름)

/**
 * @section 시뮬레이션 속도 제어
 */
let simulationSpeed = 1.0; // Engine timing.timeScale 과 연결 (0.2 ~ 1.5 권장)
let cutForceScale = 1.0;   // 절단 직후 부여되는 속도/각속도 배율 (0.2 ~ 3.0)

/**
 * @section 화면 디버그 로그
 */
let debugLogEnabled = false;     // 디버그 로그 활성화 여부
let debugLogPaused = false;      // 로그 일시정지 상태
let debugLogDiv = null;          // 디버그 로그 컨테이너 DOM 요소
let debugLogContent = null;      // 디버그 로그 내용 DOM 요소
let debugLogMaxLines = 500;      // 최대 로그 라인 수

// ==========================================
// 초기화 함수
// ==========================================

/**
 * 애플리케이션 초기화 함수
 * Three.js 씬, 카메라, 렌더러, Matter.js 물리 엔진을 설정하고 시작합니다.
 * 
 * @function init
 * @description
 * - 캔버스 크기 계산
 * - Three.js 씬 및 OrthographicCamera 생성
 * - WebGL 렌더러 설정
 * - 조명 및 배경 이미지 설정
 * - Matter.js 물리 엔진 초기화
 * - 경계 벽 생성
 * - 이벤트 리스너 설정
 * - 초기 도형 로드
 * - 애니메이션 루프 시작
 */
function init() {
    // 디버그 로그 초기화
    debugLogDiv = document.getElementById('debugLog');
    debugLogContent = document.getElementById('debugLogContent');
    setupDebugLog();

    console.log('🚀 Three.js + Matter.js 2D 초기화 시작...');
    const initStartTime = performance.now();

    // 캔버스 크기 계산
    viewWidth = canvas.clientWidth;
    viewHeight = canvas.clientHeight;

    // Scene 생성
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    // OrthographicCamera 생성 (완벽한 2D!)
    const aspect = viewWidth / viewHeight;
    const frustumSize = 400;
    camera = new THREE.OrthographicCamera(
        frustumSize * aspect / -2,
        frustumSize * aspect / 2,
        frustumSize / 2,
        frustumSize / -2,
        0.1,
        1000
    );
    camera.position.set(0, 0, 100);
    camera.lookAt(0, 0, 0);

    // Renderer 생성
    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: false
    });

    renderer.setSize(viewWidth, viewHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // PBR용 톤매핑/색공간 설정
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    // 물리기반 광원 강도 모델 활성화 (조명 감쇠/강도 물리적으로 동작)
    renderer.physicallyCorrectLights = true;

    //Raycaster (마우스 피킹용)
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    //조명 설정
    setupLights();

    // HDRI 환경맵 로드 (PBR 반사 환경)
    try {
        const pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader();
        if (THREE.RGBELoader) {
            const rgbeLoader = new THREE.RGBELoader();
            //rgbeLoader.setDataType(THREE.UnsignedByteType);
            // 🚨 [수정!] HDR의 전체 밝기 범위를 사용하기 위해 Float 타입으로 변경합니다.
            rgbeLoader.setDataType(THREE.FloatType); // 또는 THREE.HalfFloatType
            rgbeLoader.load('prefab/studio.hdr', (hdr) => {
                const envTex = pmrem.fromEquirectangular(hdr).texture;
                scene.environment = envTex;
                hdr.dispose();
            });
        }
    } catch (e) {
        console.warn('HDRI 환경맵 로드 실패(무시 가능):', e.message);
    }

    //배경 이미지 설정
    //setupBackground();

    //Matter.js World 설정
    setupPhysics();
    // 초기 시뮬레이션 속도 적용 (HTML 슬라이더 값 반영)
    try { updateSimulationSpeed(true); } catch (e) {}
    // 초기 절단 힘 배율 적용 (HTML 슬라이더 값 반영)
    try { updateCutForceScale(true); } catch (e) {}

    //캔버스 경계 벽 생성 (상하좌우)
    createBoundaryWalls();

    //이벤트 리스너
    setupEventListeners();

    // 초기 도형 로드
    loadSelectedShape();

    // 애니메이션 시작
    animate();

    // 로딩 완료
    const initTime = ((performance.now() - initStartTime) / 1000).toFixed(2);
    console.log(`✅ Three.js + Matter.js 2D 초기화 완료: ${initTime}초`);

    //로딩 인디케이터 페이드아웃
    setTimeout(() => {
        loadingDiv.style.transition = 'opacity 0.5s';
        loadingDiv.style.opacity = '0';
        setTimeout(() => {
            loadingDiv.style.display = 'none';
        }, 500);
    }, 100);
}

// ==========================================
// 조명 설정
// ==========================================

/**
 * Three.js 씬에 조명을 추가합니다.
 * 
 * @function setupLights
 * @description
 * - Ambient Light: 전체 환경 조명 (밝기: 0.4, 조명 효과가 잘 보이도록 낮춤)
 * - Directional Light: 방향성 조명 (밝기: 1.0, 약간 위쪽에서 비춤)
 */
function setupLights() {
    // Ambient Light: 전체 환경 조명 (너무 밝으면 조명 효과가 안 보임)
    // 0.9 → 0.4로 낮춰서 DirectionalLight 효과가 잘 보이도록
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
    scene.add(ambientLight);

    // Directional Light: 방향성 조명 (그림자와 명암 효과)
    // 0.8 → 1.0으로 높여서 조명 효과가 더 명확하게 보이도록
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    // 🔽 [수정!] 빛이 Z축 위에서 아래로 떨어지도록 설정
    dirLight.position.set(50, 50, 100); // 빛이 Z=100 (위)에서 옴
    dirLight.target.position.set(0, 0, 0); // Z=0 (바닥)을 향함
    scene.add(dirLight);
    scene.add(dirLight.target); // target도 씬에 추가해야 적용됩니다.

    // 🔽 [수정!] DirectionalLight 헬퍼 (빨간색)
    const dirLightHelper = new THREE.DirectionalLightHelper(dirLight, 10, 0xff0000);
    scene.add(dirLightHelper);

    // 보조: 캔버스 정규좌표 (1, 0.8)에 포인트 라이트 배치
    try {
        const aspect = viewWidth / viewHeight;
        const frustumSize = 400 / cameraZoom;
        const worldWidth = frustumSize * aspect;
        const worldHeight = frustumSize;
        const x = (1.0 - 0.5) * worldWidth;
        const y = (0.5 - 0.8) * worldHeight;
        const pLight = new THREE.PointLight(0xffffff, 1.2, 900, 2.0);
        pLight.position.set(x, y, 60);
        scene.add(pLight);
        // 확인용 헬퍼 필요 시 아래 주석 해제
        // scene.add(new THREE.PointLightHelper(pLight, 5));
    } catch (e) {
        console.warn('PointLight 배치 실패(무시 가능):', e.message);
    }

    console.log('💡 조명 설정 완료 (Ambient: 0.4, Directional: 1.0)');
}

/**
 * 배경 이미지를 설정합니다.
 * 
 * @function setupBackground
 * @description
 * - 카메라 시야 범위에 맞춰 배경 평면 생성
 * - 'prefab/Sample.png' 이미지를 텍스처로 로드
 * - 투명도 80%로 설정하여 도형이 잘 보이도록 함
 * - Z축 -10 위치에 배치 (모든 객체보다 뒤에)
 */
//PNG 파일 써서 없어넣을거면 넣고 없어도 무방함
function setupBackground() {
    console.log('🖼️ 배경 이미지 설정 시작...');

    // 1. 카메라의 시야(Frustum) 크기를 가져옵니다.
    // init() 함수(약 160라인)에 정의된 값과 동일하게 맞춥니다.
    const aspect = viewWidth / viewHeight;
    const frustumSize = 400;
    const worldWidth = frustumSize * aspect;
    const worldHeight = frustumSize;

    // 2. 텍스처 로드
    const textureLoader = new THREE.TextureLoader();
    const backgroundTexture = textureLoader.load(
        'prefab/Sample.png', // @Sample.png 파일 경로
        () => {
            console.log('✅ 배경 텍스처 로드 완료');
        },
        undefined,
        (err) => {
            console.error('❌ 배경 텍스처 로드 실패:', err);
        }
    );

    // 3. 평면 지오메트리 생성 (카메라 시야를 꽉 채우는 크기)
    const bgGeometry = new THREE.PlaneGeometry(worldWidth, worldHeight);

    // 4. 조명에 영향받지 않는 기본 재질 사용
    const bgMaterial = new THREE.MeshBasicMaterial({
        map: backgroundTexture,
        transparent: true,
        opacity: 0.8 // 배경이 너무 튀지 않게 80% 투명도
    });

    // 5. 메쉬 생성
    const backgroundMesh = new THREE.Mesh(bgGeometry, bgMaterial);

    // 6. ⭐ 핵심: Z축 깊이 설정
    // nextZIndex는 0부터 시작해서 0.01, 0.02...로 *증가*합니다.
    // 따라서 음수(-10)로 설정하면 항상 모든 객체보다 뒤에 있게 됩니다.
    backgroundMesh.position.set(0, 0, -10);

    scene.add(backgroundMesh);
}

// ==========================================
// Matter.js 2D 물리 엔진 설정
// ==========================================

/**
 * Matter.js 물리 엔진을 초기화하고 설정합니다.
 * 
 * @function setupPhysics
 * @description
 * - Matter.js Engine 생성
 * - 중력 설정 (Y축 아래 방향, 양수)
 * - 충돌 이벤트 리스너 등록 (디버그용)
 */
function setupPhysics() {
    console.log('⚙️ Matter.js 2D 물리 엔진 초기화...');

    // Engine 생성
    engine = Matter.Engine.create();
    world = engine.world;

    // 중력 설정 (Matter.js: Y축 아래가 양수!)
    world.gravity.x = 0;
    world.gravity.y = 1; // 적절한 2D 중력 (아래 방향)

    // 충돌 이벤트 리스너 (디버그용)
    Matter.Events.on(engine, 'collisionStart', function (event) {
        event.pairs.forEach(pair => {
            const labelA = pair.bodyA.label;
            const labelB = pair.bodyB.label;

            // 벽과의 충돌 감지
            if (labelA.includes('wall') || labelB.includes('wall')) {
                console.log(`🧱 충돌 감지: ${labelA} ↔ ${labelB}`);
            }
        });
    });

    console.log('✅ Matter.js 2D 물리 엔진 초기화 완료 (중력: Y=+1)');
}

// ==========================================
// 시뮬레이션 속도 제어 (HTML 슬라이더 연동)
// ==========================================

function updateSimulationSpeed(isLive = false) {
    try {
        const slider = document.getElementById('speedSlider');
        if (!slider) return;
        const valueSpan = document.getElementById('speedValue');
        const val = parseFloat(slider.value);
        simulationSpeed = (isFinite(val) && val > 0) ? val : 1.0;
        if (engine && engine.timing) {
            engine.timing.timeScale = simulationSpeed;
        }
        if (valueSpan) {
            valueSpan.textContent = simulationSpeed.toFixed(2) + 'x';
        }
        if (!isLive) {
            console.log(`⏱️ 시뮬레이션 속도: x${simulationSpeed.toFixed(2)}`);
        }
    } catch (e) {
        console.warn('속도 슬라이더 업데이트 실패:', e.message);
    }
}

// 절단 분리 속도(힘) 배율 업데이트 (HTML 슬라이더 연동)
function updateCutForceScale(isLive = false) {
    try {
        const slider = document.getElementById('cutForceSlider');
        if (!slider) return;
        const valueSpan = document.getElementById('cutForceValue');
        const val = parseFloat(slider.value);
        cutForceScale = (isFinite(val) && val > 0) ? val : 1.0;
        if (valueSpan) {
            valueSpan.textContent = cutForceScale.toFixed(1) + 'x';
        }
        if (!isLive) {
            console.log(`💨 절단 분리 속도 배율: x${cutForceScale.toFixed(1)}`);
        }
    } catch (e) {
        console.warn('절단 속도 슬라이더 업데이트 실패:', e.message);
    }
}

// ==========================================
// 캔버스 경계 벽 생성 (상하좌우)
// ==========================================

/**
 * 캔버스 경계에 물리 벽을 생성합니다.
 * 
 * @function createBoundaryWalls
 * @description
 * - 상, 하, 좌, 우 4면에 정적(Static) 물리 바디 생성
 * - Matter.js 좌표계 사용 (Y축 아래가 양수)
 * - 바닥 벽은 시각적으로 약간 위로 올림 (시각 개선)
 * - 그리드 헬퍼 추가 (바닥 참고용)
 */
function createBoundaryWalls() {
    console.log('🧱 캔버스 경계 벽 생성 시작...');

    // OrthographicCamera 범위 계산
    const aspect = viewWidth / viewHeight;
    const frustumSize = 400;
    const halfWidth = (frustumSize * aspect) / 2;  // 좌우 범위
    const halfHeight = frustumSize / 2;             // 상하 범위

    const wallThickness = 50; // 벽 두께
    const wallColor = 0x2c3e50; // 벽 색상

    // 🎯 바닥 숨김 오프셋 (시각적으로는 보이지만 물리적으로는 아래에)
    const bottomVisualOffset = 5; // 바닥을 위로 5px만 올림 (40px → 5px로 감소)

    // 벽 설정 (Matter.js 좌표: Y축 아래가 양수)
    const wallConfigs = [
        {
            name: 'bottom',
            x: 0,
            y: halfHeight + wallThickness / 2,                    // 물리 위치 (실제 충돌)
            visualY: halfHeight + wallThickness / 2 - bottomVisualOffset, // 시각 위치 (화면에 보임)
            width: halfWidth * 2 + wallThickness * 2,
            height: wallThickness
        },
        {
            name: 'top',
            x: 0,
            y: -halfHeight - wallThickness / 2,
            visualY: -halfHeight - wallThickness / 2, // 위쪽은 동일
            width: halfWidth * 2 + wallThickness * 2,
            height: wallThickness
        },
        {
            name: 'left',
            x: -halfWidth - wallThickness / 2,
            y: 0,
            visualY: 0, // 좌우는 동일
            width: wallThickness,
            height: halfHeight * 2 + wallThickness * 2
        },
        {
            name: 'right',
            x: halfWidth + wallThickness / 2,
            y: 0,
            visualY: 0, // 좌우는 동일
            width: wallThickness,
            height: halfHeight * 2 + wallThickness * 2
        }
    ];

    wallConfigs.forEach(config => {
        // Three.js 벽 (시각적) - 제거됨 (물리만 유지)
        // 도형이 가려지지 않도록 시각적 메쉬는 생성하지 않음

        // Matter.js 벽 (물리적) - 원래 y 위치 사용
        const wallBody = Matter.Bodies.rectangle(
            config.x,
            config.y,
            config.width,
            config.height,
            {
                isStatic: true,
                friction: 0.5,
                restitution: 0.3,
                label: `wall_${config.name}`
            }
        );
        Matter.World.add(world, wallBody);
        walls.push({ mesh: null, body: wallBody, name: config.name }); // mesh는 null

        const offsetInfo = config.name === 'bottom'
            ? ` (시각 오프셋: ${bottomVisualOffset}px)`
            : '';
        console.log(`  ✅ ${config.name} 벽 생성 (${config.width}x${config.height})${offsetInfo}`);
    });

    console.log(`캔버스 경계 벽 생성 완료 (4면)`);
    console.log(`캔버스 범위: ${halfWidth * 2}x${halfHeight * 2}`);
    console.log(`바닥 숨김: 시각적으로 ${bottomVisualOffset}px 위로 이동`);

    //그리드 헬퍼 (바닥 참고용)
    const gridHelper = new THREE.GridHelper(halfWidth * 2, 40, 0x4facfe, 0x444444);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.y = -halfHeight + 5;
    scene.add(gridHelper);
}

// ==========================================
// 도형 생성 함수들
// ==========================================
// 
// 이 섹션은 다양한 도형을 생성하는 함수들을 포함합니다:
// - 기본 도형: 삼각형, 사각형, 오각형, 원
// - SVG 기반: 나뭇잎 (SVG Path)
// - OBJ 파일: 햄 (prefab/wholer-ham.obj)
// - OBJ 파일은 3D에서 2D로 투영되어 Shape로 변환됩니다.

function createLeafShape() {
    // SVG Path 데이터 (나뭇잎)
    const svgPath = `
        M 660.35 61.65
        Q 660.05 61.35 659.8 61.1 654 56.15 646.55 56.65 643.65 56.85 641.25 57.8 
        639.6 55.9 637.35 54.4 631.05 50.2 623.7 51.7 623.35 51.8 622.95 51.85 
        615.6 53.35 611.4 59.65 609.8 62 609.05 64.55 606.95 64.65 604.8 65.25 
        597.55 67.3 593.85 73.9 593.25 74.95 592.8 76 591.4 79.2 591.2 82.45 
        591.2 82.8 591.3 83.2 591.5 85.6 592.45 88 593 89.35 593.7 90.6 
        592.8 76 591.2 82.45 588.95 102.4 588.95 126.15 588.95 148.75 
        588.95 171.35 592.6 182.3 598.35 197.6 601.5 200.95 614.9 205.7 
        620.3 205.1 623.4 207.75 636.75 211.1 649.7 205.65 658.35 200.85 
        665.95 197.35 667.5 196.2 674 189.9 674.95 183.95 674.95 160.6 
        674.95 138 672.1 128.1 672.1 105.5 674.95 92.85 669.65 79.95 
        666.55 77.4 666.4 76 666.55 74.45 666 66.6 660.35 61.65 Z
    `;

    const shape = createShapeFromSVGPath(svgPath);

    const scale = 0.5;
    const offsetX = -630;
    const offsetY = -140;

    shape.curves.forEach(curve => {
        if (curve.v1) {
            curve.v1.x = (curve.v1.x + offsetX) * scale;
            curve.v1.y = (curve.v1.y + offsetY) * scale;
        }
        if (curve.v2) {
            curve.v2.x = (curve.v2.x + offsetX) * scale;
            curve.v2.y = (curve.v2.y + offsetY) * scale;
        }
        if (curve.v0) {
            curve.v0.x = (curve.v0.x + offsetX) * scale;
            curve.v0.y = (curve.v0.y + offsetY) * scale;
        }
    });

    return { shape, color: 0x80BE1F };
}

//SVG Path를 THREE.Shape로 변환
function createShapeFromSVGPath(pathData) {
    const shape = new THREE.Shape();
    const commands = pathData.trim().split(/(?=[MmLlQqZz])/);

    let currentX = 0, currentY = 0;
    let startX = 0, startY = 0;

    commands.forEach(cmd => {
        if (!cmd.trim()) return;

        const type = cmd[0];
        const coords = cmd.slice(1).trim().split(/[\s,]+/).filter(c => c).map(Number);

        switch (type) {
            case 'M':
                currentX = coords[0];
                currentY = coords[1];
                startX = currentX;
                startY = currentY;
                shape.moveTo(currentX, currentY);
                break;

            case 'L':
                for (let i = 0; i < coords.length; i += 2) {
                    currentX = coords[i];
                    currentY = coords[i + 1];
                    shape.lineTo(currentX, currentY);
                }
                break;

            case 'Q':
                for (let i = 0; i < coords.length; i += 4) {
                    const cpX = coords[i];
                    const cpY = coords[i + 1];
                    const endX = coords[i + 2];
                    const endY = coords[i + 3];
                    shape.quadraticCurveTo(cpX, cpY, endX, endY);
                    currentX = endX;
                    currentY = endY;
                }
                break;

            case 'Z':
            case 'z':
                shape.lineTo(startX, startY);
                currentX = startX;
                currentY = startY;
                break;
        }
    });

    return shape;
}

//삼각형 도형 생성
function createTriangleShape() {
    const shape = new THREE.Shape();
    const size = 50;
    shape.moveTo(0, -size);
    shape.lineTo(-size * 0.866, size * 0.5);
    shape.lineTo(size * 0.866, size * 0.5);
    shape.lineTo(0, -size);
    return { shape, color: 0x4ECDC4 };
}

//사각형 도형 생성
function createSquareShape() {
    const shape = new THREE.Shape();
    const size = 50;
    shape.moveTo(-size, -size);
    shape.lineTo(size, -size);
    shape.lineTo(size, size);
    shape.lineTo(-size, size);
    shape.lineTo(-size, -size);
    return { shape, color: 0xFF6B6B };
}

//오각형 도형 생성성
function createPentagonShape() {
    const shape = new THREE.Shape();
    const size = 50;
    for (let i = 0; i < 5; i++) {
        const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
        const x = size * Math.cos(angle);
        const y = size * Math.sin(angle);
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
    }
    shape.closePath();
    return { shape, color: 0x95E1D3 };
}

//원 도형 생성
function createCircleShape() {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 50, 0, Math.PI * 2, false);
    return { shape, color: 0xF38181 };
}

//햄 도형 생성 (OBJ 파일에서 로드)
function createHamShape() {
    // 동기 방식 대신 Promise 반환
    return new Promise((resolve, reject) => {
        const objLoader = new THREE.OBJLoader();
        
        console.log('📦 OBJ 파일 로딩 시작: prefab/wholer-ham.obj');
        
        objLoader.load(
            'prefab/wholer-ham.obj',
            (object) => {
                console.log('✅ OBJ 파일 로드 성공!');
                processObjToShape(object, 200, null, resolve, reject, 'Textures/colormap.png');
            },
            (progress) => {
                console.log(`📥 로딩 중: ${(progress.loaded / progress.total * 100).toFixed(0)}%`);
            },
            (error) => {
                console.error('❌ OBJ 파일 로드 실패:', error);
                reject(error);
            }
        );
    });
}

// OBJ 객체를 Shape로 변환 (공통 함수)
function processObjToShape(object, scale, textureFile, resolve, reject, defaultTexture = null) {
    // 첫 번째 메쉬 가져오기
    let mesh = null;
    object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            mesh = child;
        }
    });
    
    if (!mesh || !mesh.geometry) {
        console.error('❌ OBJ 파일에서 메쉬를 찾을 수 없습니다');
        reject('메쉬 없음');
        return;
    }
    
    const geometry = mesh.geometry;
    const positionAttribute = geometry.attributes.position;
    const uvAttribute = geometry.attributes.uv;
    
    console.log(`📊 정점 수: ${positionAttribute.count}`);
    console.log(`🎨 UV 좌표: ${uvAttribute ? 'O' : 'X'}`);
    
    // 🎯 Bounding Box 계산해서 가장 얇은 축 찾기
    const minBounds = { x: Infinity, y: Infinity, z: Infinity };
    const maxBounds = { x: -Infinity, y: -Infinity, z: -Infinity };
    
    for (let i = 0; i < positionAttribute.count; i++) {
        const x = positionAttribute.getX(i);
        const y = positionAttribute.getY(i);
        const z = positionAttribute.getZ(i);
        
        minBounds.x = Math.min(minBounds.x, x);
        minBounds.y = Math.min(minBounds.y, y);
        minBounds.z = Math.min(minBounds.z, z);
        
        maxBounds.x = Math.max(maxBounds.x, x);
        maxBounds.y = Math.max(maxBounds.y, y);
        maxBounds.z = Math.max(maxBounds.z, z);
    }
    
    const sizeX = maxBounds.x - minBounds.x;
    const sizeY = maxBounds.y - minBounds.y;
    const sizeZ = maxBounds.z - minBounds.z;
    
    console.log(`📏 BoundingBox 크기: X=${sizeX.toFixed(4)}, Y=${sizeY.toFixed(4)}, Z=${sizeZ.toFixed(4)}`);
    
    // 🎯 이미 2D인지 확인 (Z축이 거의 0이면 XY 평면에 있는 것)
    const Z_THRESHOLD = 0.001; // Z축 두께 임계값
    const isAlready2D = sizeZ < Z_THRESHOLD;
    
    let vertices = [];
    
    if (isAlready2D) {
        // 이미 2D (XY 평면) → 바로 X, Y 좌표만 사용
        console.log(`✅ 이미 2D 형식 (Z축 두께: ${sizeZ.toFixed(6)}) → XY 좌표 직접 사용`);
        for (let i = 0; i < positionAttribute.count; i++) {
            vertices.push([
                positionAttribute.getX(i),
                positionAttribute.getY(i)
            ]);
        }
    } else {
        // 3D → 2D 투영 필요
        // 가장 얇은 축 찾기 (이게 "두께" 축)
        let thinAxis, axis1, axis2;
        let getAxis1, getAxis2;
        
        if (sizeX <= sizeY && sizeX <= sizeZ) {
            // X축이 가장 얇음 → YZ 평면 사용
            thinAxis = 'X';
            axis1 = 'Y';
            axis2 = 'Z';
            getAxis1 = (i) => positionAttribute.getY(i);
            getAxis2 = (i) => positionAttribute.getZ(i);
        } else if (sizeY <= sizeX && sizeY <= sizeZ) {
            // Y축이 가장 얇음 → XZ 평면 사용
            thinAxis = 'Y';
            axis1 = 'X';
            axis2 = 'Z';
            getAxis1 = (i) => positionAttribute.getX(i);
            getAxis2 = (i) => positionAttribute.getZ(i);
        } else {
            // Z축이 가장 얇음 → XY 평면 사용
            thinAxis = 'Z';
            axis1 = 'X';
            axis2 = 'Y';
            getAxis1 = (i) => positionAttribute.getX(i);
            getAxis2 = (i) => positionAttribute.getY(i);
        }
        
        console.log(`🎯 3D → 2D 투영: ${thinAxis}축 무시, ${axis1}-${axis2} 평면 사용`);
        
        // 선택된 평면으로 2D 투영
        for (let i = 0; i < positionAttribute.count; i++) {
            const v1 = getAxis1(i);
            const v2 = getAxis2(i);
            vertices.push([v1, v2]);
        }
    }
    
    // 중심 계산
    const center = [0, 0];
    vertices.forEach(v => {
        center[0] += v[0];
        center[1] += v[1];
    });
    center[0] /= vertices.length;
    center[1] /= vertices.length;
    
    console.log(`📍 중심점: (${center[0].toFixed(3)}, ${center[1].toFixed(3)})`);
    
    // 🎯 Concave Hull 알고리즘으로 실제 외곽선 추출 (홈 포함)
    console.log(`🔧 Concave Hull 계산 시작... (${vertices.length}개 정점)`);
    const hullVertices = computeConcaveHull(vertices, 0.05); // alpha = 0.05 (민감도)
    console.log(`✅ Concave Hull 완료: ${vertices.length}개 → ${hullVertices.length}개 (오목한 부분 포함)`);
    
    const uniqueVertices = hullVertices;
    
    // Shape 생성
    const shape = new THREE.Shape();
    const firstPoint = uniqueVertices[0];
    shape.moveTo(firstPoint[0] * scale, firstPoint[1] * scale);
    
    for (let i = 1; i < uniqueVertices.length; i++) {
        shape.lineTo(uniqueVertices[i][0] * scale, uniqueVertices[i][1] * scale);
    }
    
    shape.closePath();
    
    console.log('✅ Shape 생성 완료!');
    
    // 🎨 OBJ의 원본 UV 좌표 범위 분석
    let uvBounds = null;
    if (uvAttribute) {
        const minU = Math.min(...Array.from({length: uvAttribute.count}, (_, i) => uvAttribute.getX(i)));
        const maxU = Math.max(...Array.from({length: uvAttribute.count}, (_, i) => uvAttribute.getX(i)));
        const minV = Math.min(...Array.from({length: uvAttribute.count}, (_, i) => uvAttribute.getY(i)));
        const maxV = Math.max(...Array.from({length: uvAttribute.count}, (_, i) => uvAttribute.getY(i)));
        
        uvBounds = { minU, maxU, minV, maxV };
        console.log(`🎨 원본 UV 범위: U[${minU.toFixed(3)}, ${maxU.toFixed(3)}], V[${minV.toFixed(3)}, ${maxV.toFixed(3)}]`);
        console.log(`   사용 영역: ${((maxU - minU) * 100).toFixed(1)}% x ${((maxV - minV) * 100).toFixed(1)}%`);
    }
    
    // 텍스처 처리
    let textureUrl = defaultTexture;
    if (textureFile) {
        // 사용자가 업로드한 텍스처 파일을 URL로 변환
        textureUrl = URL.createObjectURL(textureFile);
        console.log('🎨 사용자 텍스처 사용:', textureFile.name);
    }
    
    resolve({ 
        shape, 
        color: 0xFFA07A, // 연한 살구색 (텍스처 없을 때 사용)
        texture: textureUrl,
        uvBounds: uvBounds // UV 범위 정보 전달
    });
}

/**
 * Concave Hull (오목 껍질) 알고리즘 - 실제 외곽선 추출
 * 
 * @function computeConcaveHull
 * @param {Array<Array<number>>} points - [[x, y], [x, y], ...] 형태의 정점 배열
 * @param {number} [alpha=0.05] - 민감도 (0.01~0.1, 작을수록 자세함)
 * @returns {Array<Array<number>>} - 외곽선 정점들
 * 
 * @description
 * 오목한 부분(홈)을 포함한 외곽선을 생성합니다.
 * - 중복 정점 제거
 * - Boundary Detection으로 외곽 점만 추출
 * - 외곽선 추적 알고리즘 (반시계 방향)
 * - OBJ 파일의 실제 외곽선을 정확하게 추출하는데 사용됨
 */
function computeConcaveHull(points, alpha = 0.05) {
    if (points.length < 3) return points;
    
    // 1. 중복 제거
    const uniquePoints = [];
    const seen = new Set();
    for (const p of points) {
        const key = `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniquePoints.push(p);
        }
    }
    
    if (uniquePoints.length < 3) return uniquePoints;
    
    console.log(`  🔧 중복 제거: ${points.length} → ${uniquePoints.length}개`);
    
    // 2. Boundary Detection: 외곽에 있는 점들만 찾기
    // 각 점에서 가장 가까운 이웃까지의 평균 거리 계산
    const avgDist = computeAverageNearestNeighborDistance(uniquePoints);
    const maxDist = avgDist * (1 / alpha); // alpha가 작을수록 더 많은 디테일
    
    console.log(`  📏 평균 거리: ${avgDist.toFixed(6)}, 최대 거리: ${maxDist.toFixed(6)}`);
    
    // 3. 시작점 찾기 (가장 왼쪽 아래 점)
    let start = uniquePoints[0];
    for (const p of uniquePoints) {
        if (p[1] < start[1] || (p[1] === start[1] && p[0] < start[0])) {
            start = p;
        }
    }
    
    // 4. 외곽선 추적
    const hull = [start];
    const used = new Set([`${start[0]},${start[1]}`]);
    let current = start;
    let angle = 0; // 시작 각도
    
    let iterations = 0;
    const maxIterations = uniquePoints.length * 2;
    
    while (iterations < maxIterations) {
        iterations++;
        
        // 현재 점에서 가장 가까우면서 외곽 방향인 다음 점 찾기
        let nextPoint = null;
        let minAngleDiff = Infinity;
        let bestDist = Infinity;
        
        for (const candidate of uniquePoints) {
            const key = `${candidate[0]},${candidate[1]}`;
            if (used.has(key)) continue;
            
            // 거리 계산
            const dx = candidate[0] - current[0];
            const dy = candidate[1] - current[1];
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // 너무 멀면 스킵
            if (dist > maxDist) continue;
            
            // 각도 계산
            const newAngle = Math.atan2(dy, dx);
            let angleDiff = newAngle - angle;
            
            // 각도를 -π ~ π 범위로 정규화
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
            
            // 왼쪽으로 회전하는 점 선호 (반시계 방향)
            const score = angleDiff + (dist / maxDist) * 0.1;
            
            if (score < minAngleDiff) {
                minAngleDiff = score;
                nextPoint = candidate;
                bestDist = dist;
            }
        }
        
        // 다음 점을 찾지 못했거나 시작점으로 돌아왔으면 종료
        if (!nextPoint) {
            console.log(`  ⚠️ 다음 점을 찾지 못함 (반복: ${iterations})`);
            break;
        }
        
        const distToStart = Math.sqrt(
            (nextPoint[0] - start[0]) ** 2 + (nextPoint[1] - start[1]) ** 2
        );
        
        if (hull.length > 3 && distToStart < avgDist * 2) {
            console.log(`  ✅ 시작점으로 복귀 (반복: ${iterations})`);
            break;
        }
        
        hull.push(nextPoint);
        used.add(`${nextPoint[0]},${nextPoint[1]}`);
        
        // 각도 업데이트
        angle = Math.atan2(
            nextPoint[1] - current[1],
            nextPoint[0] - current[0]
        );
        
        current = nextPoint;
    }
    
    console.log(`  🎯 외곽선 추적 완료: ${hull.length}개 점, ${iterations}번 반복`);
    
    return hull;
}

/**
 * 평균 최근접 이웃 거리 계산
 */
function computeAverageNearestNeighborDistance(points, k = 3) {
    let totalDist = 0;
    
    for (const p of points) {
        // 각 점에서 가장 가까운 k개 점까지의 거리
        const distances = points
            .filter(other => other !== p)
            .map(other => {
                const dx = other[0] - p[0];
                const dy = other[1] - p[1];
                return Math.sqrt(dx * dx + dy * dy);
            })
            .sort((a, b) => a - b)
            .slice(0, k);
        
        const avgDist = distances.reduce((sum, d) => sum + d, 0) / k;
        totalDist += avgDist;
    }
    
    return totalDist / points.length;
}

/**
 * Convex Hull (볼록 껍질) 알고리즘 - Graham's Scan
 * 2D 정점들의 외곽선만 추출
 * @param {Array} points - [[x, y], [x, y], ...] 형태의 정점 배열
 * @returns {Array} - 외곽선 정점들 (시계 반대 방향)
 */
function computeConvexHull(points) {
    if (points.length < 3) return points;
    
    // 1. 중복 제거
    const uniquePoints = [];
    const seen = new Set();
    for (const p of points) {
        const key = `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniquePoints.push(p);
        }
    }
    
    if (uniquePoints.length < 3) return uniquePoints;
    
    // 2. 가장 아래쪽 점 찾기 (Y가 가장 작고, 같으면 X가 작은 점)
    let pivot = uniquePoints[0];
    for (let i = 1; i < uniquePoints.length; i++) {
        const p = uniquePoints[i];
        if (p[1] < pivot[1] || (p[1] === pivot[1] && p[0] < pivot[0])) {
            pivot = p;
        }
    }
    
    // 3. Pivot을 기준으로 각도 정렬
    const sortedPoints = uniquePoints.filter(p => p !== pivot).sort((a, b) => {
        const angleA = Math.atan2(a[1] - pivot[1], a[0] - pivot[0]);
        const angleB = Math.atan2(b[1] - pivot[1], b[0] - pivot[0]);
        
        if (Math.abs(angleA - angleB) < 1e-9) {
            // 같은 각도면 가까운 점 먼저
            const distA = Math.sqrt((a[0] - pivot[0]) ** 2 + (a[1] - pivot[1]) ** 2);
            const distB = Math.sqrt((b[0] - pivot[0]) ** 2 + (b[1] - pivot[1]) ** 2);
            return distA - distB;
        }
        return angleA - angleB;
    });
    
    // 4. Graham's Scan
    const hull = [pivot, sortedPoints[0]];
    
    for (let i = 1; i < sortedPoints.length; i++) {
        const p = sortedPoints[i];
        
        // 왼쪽으로 회전하지 않는 점들 제거
        while (hull.length >= 2) {
            const b = hull[hull.length - 1];
            const a = hull[hull.length - 2];
            
            // Cross product로 회전 방향 확인
            const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
            
            if (cross <= 0) {
                hull.pop(); // 오른쪽으로 회전하면 제거
            } else {
                break;
            }
        }
        
        hull.push(p);
    }
    
    return hull;
}

// ==========================================
// 물리 속성 함수 (재사용 가능)
// ==========================================
// 
// Matter.js 물리 바디의 속성을 설정하는 유틸리티 함수들입니다.
// 마찰, 반발력, 밀도, 공기 저항 등을 제어할 수 있습니다.

/**
 * Matter.js Body에 물리 속성을 설정
 * @param {Matter.Body} body - Matter.js Body
 * @param {Object} options - 물리 옵션
 */
function applyPhysicsProperties(body, options = {}) {
    const {
        friction = 0.5,
        restitution = 0.3,
        density = 0.001,
        frictionAir = 0.01,
        inertia = Infinity // 회전 관성 (Infinity = 회전 없음, 기본값은 자동 계산)
    } = options;

    body.friction = friction;
    body.restitution = restitution;
    body.density = density;
    body.frictionAir = frictionAir;

    // 회전 관성 설정 (Infinity가 아닌 경우만 설정)
    if (inertia !== Infinity && inertia !== null) {
        Matter.Body.setInertia(body, inertia);
    }

    console.log(`⚙️ 물리 속성 적용: friction=${friction}, restitution=${restitution}`);
}

/**
 * 실제 폴리곤 넓이 계산 (Shoelace Formula)
 * 
 * @function calculatePolygonArea
 * @param {Array<Object>} vertices - 정점 배열 [{x, y}, ...]
 * @returns {number} 실제 면적 (px²)
 * 
 * @description
 * BoundingBox 넓이는 빈 공간을 포함하므로 부정확합니다.
 * Shoelace 공식(신발끈 공식)을 사용하여 정확한 다각형 면적을 계산합니다.
 * 
 * @formula
 * Area = |Σ(x[i] * y[i+1] - x[i+1] * y[i])| / 2
 */
function calculatePolygonArea(vertices) {
    if (!vertices || vertices.length < 3) {
        console.warn('⚠️ calculatePolygonArea: 정점 부족', vertices ? vertices.length : 0);
        return 0;
    }

    let area = 0;

    // Shoelace Formula (신발끈 공식)
    // Area = |Σ(x[i] * y[i+1] - x[i+1] * y[i])| / 2
    for (let i = 0; i < vertices.length; i++) {
        const j = (i + 1) % vertices.length;
        const term = vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
        area += term;

        // 🔍 디버깅: 처음 5개만 출력
        if (i < 5 && vertices.length <= 20) {
            console.log(`      [${i}→${j}] (${vertices[i].x.toFixed(1)},${vertices[i].y.toFixed(1)}) → (${vertices[j].x.toFixed(1)},${vertices[j].y.toFixed(1)}) = ${term.toFixed(2)}`);
        }
    }

    const finalArea = Math.abs(area / 2);
    console.log(`   🧮 Shoelace 합계: ${area.toFixed(2)} → 면적: ${finalArea.toFixed(2)}px²`);

    return finalArea;
}

/**
 * 정점 간소화 (적응형 알고리즘)
 * 
 * @function simplifyVertices
 * @param {Array<Object>} vertices - 정점 배열 [{x, y}, ...]
 * @param {number} [maxPoints=200] - 최대 정점 수
 * @returns {Array<Object>} 간소화된 정점 배열
 * 
 * @description
 * - 정점이 8개 이하면 간소화하지 않음 (기본 도형 유지)
 * - maxPoints 이하면 그대로 반환
 * - 너무 많은 정점만 간소화 (복잡한 곡선 도형)
 * - 균등 간격 샘플링 및 중복 제거
 */
function simplifyVertices(vertices, maxPoints = 200) {
    // 정점이 적으면 간소화하지 않음
    if (vertices.length <= 8) {
        return vertices; // 8개 이하는 그대로 유지 (사각형, 삼각형 등)
    }

    // 적당한 정점 수면 그대로 반환
    if (vertices.length <= maxPoints) {
        return vertices;
    }

    console.log(`  🔧 정점 단순화: ${vertices.length} → 목표 ${maxPoints}`);

    // 너무 많은 정점만 간소화 (복잡한 곡선 도형)
    // 더 많은 정점 보존 (30 → 80)
    const targetPoints = Math.min(maxPoints, Math.max(20, Math.floor(vertices.length / 2)));

    // 균등 간격으로 샘플링
    const step = vertices.length / targetPoints;
    const simplified = [];

    for (let i = 0; i < vertices.length; i += step) {
        const index = Math.floor(i);
        if (index < vertices.length) {
            simplified.push(vertices[index]);
        }
    }

    // 중복 제거 (더 정밀한 기준: 0.5 → 0.3)
    const unique = [];
    for (let i = 0; i < simplified.length; i++) {
        const current = simplified[i];
        const next = simplified[(i + 1) % simplified.length];

        // 거리 계산
        const dx = next.x - current.x;
        const dy = next.y - current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // 더 정밀한 기준 (너무 가까운 정점만 제거)
        if (distance > 0.3 || i === 0) {
            unique.push(current);
        }
    }

    console.log(`  ✅ 단순화 완료: ${unique.length}개 (${((unique.length / vertices.length) * 100).toFixed(1)}% 보존)`);

    return unique.length >= 3 ? unique : vertices;
}

/**
 * 잘린 조각에 힘을 가해서 떨어뜨림 (확실한 분리)
 * 
 * @function applyCutForce
 * @param {Matter.Body} body - Matter.js 물리 바디
 * @param {string} [direction='left'] - 'left' 또는 'right'
 * 
 * @description
 * 절단된 조각에 속도와 회전을 적용하여 자연스럽게 분리시킵니다.
 * - 방향에 따른 수평 속도 (±2~4)
 * - 위쪽으로 튀어오르는 수직 속도 (-3~-5)
 * - 랜덤 회전 각속도 (±0.05)
 */
function applyCutForce(body, direction = 'left') {
    // 방향에 따른 속도 (Matter.js: Y축 아래가 양수)
    // ✅ 속도를 절반으로 줄여서 물리 효과가 더 자연스럽게 따라가도록 함
    let xVelocity = direction === 'left' ? -2 - Math.random() * 2 : 2 + Math.random() * 2; // ±2~4 (기존: ±5~8)
    let yVelocity = -3 - Math.random() * 2; // -3~-5 (기존: -8~-12) 위로 튀어오름 (Y축 음수)

    // 절단 분리 속도 배율 적용
    xVelocity *= cutForceScale;
    yVelocity *= cutForceScale;

    // 속도 직접 설정 (더 확실함)
    Matter.Body.setVelocity(body, {
        x: xVelocity,
        y: yVelocity
    });

    // 회전 추가 (더 자연스러운 효과)
    let angularVelocity = (Math.random() - 0.5) * 0.1; // ±0.05 (기존: ±0.1)
    angularVelocity *= Math.max(0.5, Math.min(2.0, cutForceScale)); // 각속도는 과도하지 않게 클램프
    Matter.Body.setAngularVelocity(body, angularVelocity);

    console.log(`✂️ 절단 힘 적용 (${direction}) x${cutForceScale.toFixed(1)}: vx=${xVelocity.toFixed(2)}, vy=${yVelocity.toFixed(2)}, av=${angularVelocity.toFixed(3)}`);
}

// ==========================================
// 메쉬 생성 (Matter.js 2D 물리 바디 포함)
// ==========================================

/**
 * Shape 데이터로부터 Three.js 메쉬와 Matter.js 물리 바디를 생성합니다.
 * 
 * @function createMeshFromShape
 * @param {Object} shapeData - Shape 데이터 객체
 * @param {THREE.Shape} shapeData.shape - Three.js Shape 객체
 * @param {number} [shapeData.color] - 색상 (텍스처 없을 때 사용)
 * @param {string} [shapeData.texture] - 텍스처 파일 경로
 * @param {Object} [shapeData.uvBounds] - UV 좌표 범위 (OBJ 파일용)
 * @param {Object} [position={ x: 0, y: 0 }] - 메쉬 초기 위치
 * @param {Object} [physicsOptions={}] - 물리 속성 옵션
 * @param {number} [rootArea=null] - 최초 원본 면적 (절단 체인 추적용)
 * @returns {Object} 메쉬 데이터 객체 { threeMesh, matterBody, originalColor, ... }
 * 
 * @description
 * - Three.js ShapeGeometry 생성 및 UV 좌표 설정
 * - 텍스처가 있으면 텍스처 로드 및 적용
 * - Matter.js 물리 바디 생성 (정점 간소화 적용)
 * - 물리 바디에 패딩 적용 (작은 조각 바닥 통과 방지)
 * - Z축 고유 좌표 부여 (겹침 방지)
 */
function createMeshFromShape(shapeData, position = { x: 0, y: 0 }, physicsOptions = {}, rootArea = null) {
    const { shape, color, texture, uvBounds } = shapeData;

    // Three.js Geometry 생성 (2D)
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.computeBoundingBox();

    geometry.center();

    // 🎨 UV 좌표 수동 설정 (텍스처 맵핑을 위해 필수!)
    const uvAttribute = geometry.attributes.uv;
    if (uvAttribute && texture) {
        console.log(`📐 기존 UV 좌표 확인: ${uvAttribute.count}개`);
        
        const bbox = geometry.boundingBox;
        const width = bbox.max.x - bbox.min.x;
        const height = bbox.max.y - bbox.min.y;
        
        const positionAttribute = geometry.attributes.position;
        const uvArray = new Float32Array(positionAttribute.count * 2);
        
        // 🎯 OBJ 원본 UV 범위를 사용 (텍스처의 올바른 영역 매핑)
        if (uvBounds) {
            console.log(`🎨 OBJ 원본 UV 범위 사용: U[${uvBounds.minU.toFixed(3)}, ${uvBounds.maxU.toFixed(3)}], V[${uvBounds.minV.toFixed(3)}, ${uvBounds.maxV.toFixed(3)}]`);
            
            for (let i = 0; i < positionAttribute.count; i++) {
                const x = positionAttribute.getX(i);
                const y = positionAttribute.getY(i);
                
                // 정점의 위치를 0~1로 정규화한 후, 원본 UV 범위로 매핑
                const normalizedX = (x - bbox.min.x) / width;   // 0~1
                const normalizedY = (y - bbox.min.y) / height;  // 0~1
                
                // 원본 UV 범위로 스케일링 (텍스처의 올바른 부분 사용)
                uvArray[i * 2] = uvBounds.minU + normalizedX * (uvBounds.maxU - uvBounds.minU);       // U
                uvArray[i * 2 + 1] = uvBounds.minV + normalizedY * (uvBounds.maxV - uvBounds.minV);   // V
            }
            
            console.log(`✅ UV 좌표 원본 범위로 매핑 완료: ${positionAttribute.count}개`);
        } else {
            // uvBounds가 없으면 기본 방식 (0~1 범위)
            for (let i = 0; i < positionAttribute.count; i++) {
                const x = positionAttribute.getX(i);
                const y = positionAttribute.getY(i);
                
                // ✅ [수정!] x와 y를 사용하여 0.0 ~ 1.0 범위의 UV를 생성
                uvArray[i * 2] = (x - bbox.min.x) / width;
                uvArray[i * 2 + 1] = (y - bbox.min.y) / height;
            }
            
            console.log(`✅ UV 좌표 기본 방식으로 설정 완료: ${positionAttribute.count}개`);
        }
        
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
    }

    // AO 맵 대응: uv2가 없으면 uv를 복사
    if (geometry.attributes.uv && !geometry.attributes.uv2) {
        geometry.setAttribute('uv2', geometry.attributes.uv);
    }

    // 이 코드가 없으면 PBR 노멀 맵이 작동하지 않습니다.
    geometry.computeTangents()

    // Three.js Material 생성
    let material;
    
    if (texture) {
        // 텍스처가 있는 경우: 텍스처 + PBR 맵들
        const textureLoader = new THREE.TextureLoader();

        console.log(`🎨 텍스처 로딩 시작: ${texture}`);

        const colorMap = textureLoader.load(
            texture,
            (loadedTexture) => {
                console.log(`✅ 텍스처 로드 성공: ${texture}`);
                console.log(`   크기: ${loadedTexture.image.width}x${loadedTexture.image.height}`);
                loadedTexture.wrapS = THREE.ClampToEdgeWrapping;
                loadedTexture.wrapT = THREE.ClampToEdgeWrapping;
                loadedTexture.encoding = THREE.sRGBEncoding;
                loadedTexture.needsUpdate = true;
                if (material) material.needsUpdate = true;
            },
            undefined,
            (error) => {
                console.error(`❌ 텍스처 로드 실패: ${texture}`, error);
            }
        );

        // 선택: 프로젝트 경로에 맞춰 존재하는 경우에만 사용
        //const metalnessMap = textureLoader.load('Textures/metal.png', undefined, undefined, () => {});
        const metalnessMap=null;
        const roughnessMap = textureLoader.load('Textures/rough.png', undefined, undefined, () => {});
        const normalMap    = textureLoader.load('Textures/normal.png', undefined, undefined, () => {});

        material = new THREE.MeshPhysicalMaterial({
            map: colorMap,
            metalness: 0.0, // ✅ [수정!] 기본 금속성 0.0
            roughness: 0.2, // ✅ [수정!] 기본 거칠기 1.0
            metalnessMap,
            roughnessMap,
            normalMap,
            envMapIntensity: 1.2,
            clearcoat: 0.4,
            clearcoatRoughness: 0.2,
            side: THREE.DoubleSide,
            wireframe: wireframeMode
        });

        console.log(`🎨 텍스처 PBR 재질 생성 완료`);
    } else {
        // 텍스처가 없는 경우: 단색 + 기본 PBR
        material = new THREE.MeshPhysicalMaterial({
            color: color,
            metalness: 0.0, // ✅ [수정!] 0.0 (금속 아님)
            roughness: 0.8, // ✅ [수정!] 0.8 (조금 더 거칠게)
            envMapIntensity: 0.5, // ✅ [수정!] 0.5 (환경 반사 줄임)
            side: THREE.DoubleSide,
            wireframe: wireframeMode
        });
    }

    // Three.js Mesh 생성
    const mesh = new THREE.Mesh(geometry, material);

    // Z축 고유 좌표 부여 (겹침 방지, 마우스 이벤트 정확성)
    const zPosition = nextZIndex * Z_OFFSET;
    nextZIndex++;

    mesh.position.set(position.x, position.y, zPosition);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    console.log(`  📍 Z축 위치: ${zPosition.toFixed(3)} (메쉬 #${nextZIndex - 1})`);

    // Matter.js 물리 바디 생성 (2D Polygon)
    const vertices = [];
    const positionAttribute = geometry.attributes.position;

    // 정점 추출 (2D만)
    for (let i = 0; i < positionAttribute.count; i++) {
        vertices.push({
            x: positionAttribute.getX(i),
            y: positionAttribute.getY(i)
        });
    }

    // 🎯 RigidBody Capsule 방식: 물리 바디를 시각보다 약간 크게
    // 메쉬 크기에 따라 동적 패딩 (작은 조각은 더 큰 패딩)
    // BoundingBox는 1017번 줄에서 이미 계산됨
    const boundingBox = geometry.boundingBox;
    const meshWidth = Math.abs(boundingBox.max.x - boundingBox.min.x);
    const meshHeight = Math.abs(boundingBox.max.y - boundingBox.min.y);
    const meshSize = Math.min(meshWidth, meshHeight);

    console.log(`📦 메쉬 크기: ${meshWidth.toFixed(1)}x${meshHeight.toFixed(1)}px`);

    // 작은 메쉬일수록 더 큰 패딩 (바닥 통과 방지)
    // 패딩을 최소화해서 시각 메쉬와 물리 바디 일치시키기
    let PHYSICS_PADDING;
    if (meshSize < 20) {
        PHYSICS_PADDING = 1.03; // 3% 확대 (매우 작은 조각) - 최소화
    } else if (meshSize < 50) {
        PHYSICS_PADDING = 1.02; // 2% 확대 (작은 조각) - 최소화
    } else {
        PHYSICS_PADDING = 1.01; // 1% 확대 (일반) - 거의 동일
    }

    const paddedVertices = vertices.map(v => ({
        x: v.x * PHYSICS_PADDING,
        y: v.y * PHYSICS_PADDING
    }));

    console.log(`🔘 Capsule 효과: 크기 ${meshSize.toFixed(1)}px → 패딩 ${((PHYSICS_PADDING - 1) * 100).toFixed(0)}%`);

    // Matter.js Body 생성
    // Matter.js는 Y축 아래가 양수, Three.js는 위가 양수이므로 변환
    const matterY = -position.y;

    let body;

    // 정점 간소화 (적응형 - 복잡한 도형만 간소화)
    // 사용자 선택에 따라 80/150/200 사용
    const simplifiedVertices = simplifyVertices(paddedVertices, maxVertexCount);

    console.log(`📐 정점 처리: ${vertices.length} → ${simplifiedVertices.length}개 (패딩 적용)`);
    console.log(`   정확도: ${((simplifiedVertices.length / vertices.length) * 100).toFixed(1)}%`);
    console.log(`   품질 설정: ${maxVertexCount}개 정점 모드`);

    try {
        // 간소화된 정점으로 다각형 생성
        body = Matter.Bodies.fromVertices(
            position.x,
            matterY,
            [simplifiedVertices],
            {
                friction: 0.5,
                restitution: 0.3,
                density: 0.001,
                frictionAir: 0.01
            },
            true // flagInternal: 내부 간선 제거
        );

        // 중심 위치 보정 (Matter.js 버그 방지)
        if (body) {
            Matter.Body.setPosition(body, { x: position.x, y: matterY });
        }
    } catch (e) {
        // 복잡한 형태는 BoundingBox로 근사
        console.warn('⚠️ fromVertices 실패, BoundingBox로 근사:', e.message);
        const box = geometry.boundingBox;
        const width = (box.max.x - box.min.x) * PHYSICS_PADDING;  // 패딩 적용
        const height = (box.max.y - box.min.y) * PHYSICS_PADDING; // 패딩 적용
        body = Matter.Bodies.rectangle(
            position.x,
            matterY,
            width,
            height,
            {
                friction: 0.5,
                restitution: 0.3,
                density: 0.001,
                frictionAir: 0.01
            }
        );
    }

    // 물리 속성 적용 (함수 사용)
    if (Object.keys(physicsOptions).length > 0) {
        applyPhysicsProperties(body, physicsOptions);
    }

    Matter.World.add(world, body);

    // 레이블 설정 (디버그용)
    body.label = `mesh_${meshes.length}`;

    // 🎯 실제 폴리곤 넓이 계산 (Shoelace Formula)
    const actualArea = calculatePolygonArea(vertices);
    const boundingArea = meshWidth * meshHeight;
    const areaRatio = (actualArea / boundingArea) * 100;

    console.log(`📐 넓이 비교:`);
    console.log(`   BoundingBox: ${boundingArea.toFixed(1)}px² (사각형)`);
    console.log(`   실제 폴리곤: ${actualArea.toFixed(1)}px² (${areaRatio.toFixed(1)}%)`);
    console.log(`   빈 공간: ${(100 - areaRatio).toFixed(1)}%`);

    // 메쉬 데이터 저장
    const meshData = {
        threeMesh: mesh,
        matterBody: body,
        originalColor: color,
        originalTexture: texture || null, // 텍스처 경로 저장 (없으면 null)
        originalUvBounds: uvBounds || null, // UV 범위 저장 (OBJ 파일용)
        originalSize: {
            width: meshWidth,
            height: meshHeight,
            area: actualArea  // ✅ 실제 폴리곤 넓이 사용!
        },
        rootOriginalArea: rootArea || actualArea,  // ✅ 최초 원본 크기 (절단 체인 추적)
        userData: {
            vertices: vertices.length,
            triangles: positionAttribute.count / 3
        }
    };

    console.log(`🌳 Root 면적: ${meshData.rootOriginalArea.toFixed(1)}px² ${rootArea ? '(전달받음)' : '(최초 생성)'}`);
    console.log(`📊 현재/Root 비율: ${((actualArea / meshData.rootOriginalArea) * 100).toFixed(1)}%`);

    meshes.push(meshData);
    updateStats();

    console.log(`✅ 2D 메쉬 생성: ${vertices.length}→${simplifiedVertices.length}개 정점, Matter.js Body 추가 (${body.label})`);

    return meshData;
}

// ==========================================
// 이벤트 리스너
// ==========================================
// 
// 사용자 입력 이벤트를 처리합니다:
// - 마우스: 절단선 그리기, 카메라 팬
// - 휠: 줌 인/아웃
// - UI: 도형 선택, 설정 변경

function setupEventListeners() {
    // 마우스 다운 (캔버스에서만)
    canvas.addEventListener('mousedown', onMouseDown);

    // 마우스 이동 및 업 (document 레벨)
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // 윈도우 리사이즈
    window.addEventListener('resize', onWindowResize);

    // 줌 (휠)
    canvas.addEventListener('wheel', onWheel, { passive: false });
    
    // 우클릭 컨텍스트 메뉴 비활성화
    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    });
}

function onWheel(event) {
    event.preventDefault();

    // 줌 조정
    const zoomSpeed = 0.1;
    const delta = event.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;

    cameraZoom *= delta;
    cameraZoom = Math.max(0.5, Math.min(3, cameraZoom)); // 0.5x ~ 3x

    // OrthographicCamera 줌 조정
    const aspect = viewWidth / viewHeight;
    const frustumSize = 400 / cameraZoom;
    camera.left = frustumSize * aspect / -2;
    camera.right = frustumSize * aspect / 2;
    camera.top = frustumSize / 2;
    camera.bottom = frustumSize / -2;
    camera.updateProjectionMatrix();

    // 줌 변경 시 벽도 업데이트 (캔버스 범위 변경)
    updateBoundaryWalls();
}

function onMouseDown(event) {
    // 우클릭: 카메라 팬(이동) 시작
    if (event.button === 2) {
        isPanning = true;
        panStartMouse.x = event.clientX;
        panStartMouse.y = event.clientY;
        panStartCamera.x = camera.position.x;
        panStartCamera.y = camera.position.y;
        canvas.style.cursor = 'grabbing';
        return;
    }
    
    // 좌클릭: 절단선 그리기
    if (event.button !== 0) return;

    // 마우스 좌표를 NDC (Normalized Device Coordinates)로 변환
    // NDC: WebGL 표준 좌표계 (-1 ~ 1 범위)
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Raycasting 설정
    raycaster.setFromCamera(mouse, camera);

    // 동적 평면 생성 (카메라 방향 고려)
    // OrthographicCamera는 항상 카메라 방향(forward)과 수직인 평면 사용
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);

    // 평면 방정식: normal · (point - origin) = 0
    // 메쉬들의 평균 Z 위치 사용 (더 정확한 교차)
    const averageZ = meshes.length > 0
        ? meshes.reduce((sum, m) => sum + m.threeMesh.position.z, 0) / meshes.length
        : 0;

    const plane = new THREE.Plane(cameraDirection, -averageZ);
    const intersectionPoint = new THREE.Vector3();

    // Ray와 평면의 교차점 계산
    const hasIntersection = raycaster.ray.intersectPlane(plane, intersectionPoint);

    if (!hasIntersection) {
        console.warn('⚠️ 평면 교차 실패!', {
            cameraPos: `(${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)})`,
            rayOrigin: `(${raycaster.ray.origin.x.toFixed(1)}, ${raycaster.ray.origin.y.toFixed(1)}, ${raycaster.ray.origin.z.toFixed(1)})`,
            rayDirection: `(${raycaster.ray.direction.x.toFixed(2)}, ${raycaster.ray.direction.y.toFixed(2)}, ${raycaster.ray.direction.z.toFixed(2)})`,
            planeNormal: `(${plane.normal.x.toFixed(2)}, ${plane.normal.y.toFixed(2)}, ${plane.normal.z.toFixed(2)})`,
            planeConstant: plane.constant.toFixed(3)
        });
        infoDiv.className = 'info';
        infoDiv.style.background = '#ffcccc';
        infoDiv.textContent = '⚠️ 클릭 위치를 인식할 수 없습니다. 카메라를 리셋해보세요.';
        return;
    }

    startPoint = intersectionPoint.clone();
    isDrawing = true;

    console.log('🎯 절단 시작:', {
        point: `(${startPoint.x.toFixed(1)}, ${startPoint.y.toFixed(1)}, ${startPoint.z.toFixed(3)})`,
        plane: `z=${averageZ.toFixed(3)}`,
        camera: `(${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)})`
    });

    infoDiv.className = 'info drawing';
    infoDiv.style.background = ''; // 스타일 초기화
    infoDiv.textContent = '✏️ 드래그하여 절단선을 그으세요... (Matter.js 2D 물리!)';

    // 절단선 헬퍼 생성
    if (cutLineHelper) scene.remove(cutLineHelper);
}

function onMouseMove(event) {
    // 우클릭 드래그: 카메라 이동
    if (isPanning) {
        const deltaX = event.clientX - panStartMouse.x;
        const deltaY = event.clientY - panStartMouse.y;
        
        // 화면 이동량을 월드 좌표로 변환
        const aspect = viewWidth / viewHeight;
        const frustumSize = 400 / cameraZoom;
        const worldWidth = frustumSize * aspect;
        const worldHeight = frustumSize;
        
        // 마우스 이동량을 월드 좌표계로 변환
        const worldDeltaX = -(deltaX / viewWidth) * worldWidth;
        const worldDeltaY = (deltaY / viewHeight) * worldHeight;
        
        // 카메라 위치 업데이트
        camera.position.x = panStartCamera.x + worldDeltaX;
        camera.position.y = panStartCamera.y + worldDeltaY;
        
        return;
    }
    
    if (!isDrawing) return;

    const rect = canvas.getBoundingClientRect();

    let mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    let mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    mouse.x = mouseX;
    mouse.y = mouseY;

    raycaster.setFromCamera(mouse, camera);

    // 동적 평면 사용 (시작점과 동일한 평면)
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    const plane = new THREE.Plane(cameraDirection, -startPoint.z);

    const intersectionPoint = new THREE.Vector3();
    const hasIntersection = raycaster.ray.intersectPlane(plane, intersectionPoint);

    if (!hasIntersection) {
        console.warn('⚠️ 드래그 중 평면 교차 실패');
        return;
    }

    if (intersectionPoint && startPoint) {
        endPoint = intersectionPoint.clone();

        // 절단선 시각화
        if (cutLineHelper) {
            scene.remove(cutLineHelper);
            if (cutLineHelper.userData.spheres) {
                cutLineHelper.userData.spheres.forEach(sphere => scene.remove(sphere));
            }
        }

        const points = [startPoint, endPoint];
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0xff0000,
            linewidth: 5,
            transparent: true,
            opacity: 0.8
        });
        cutLineHelper = new THREE.Line(lineGeometry, lineMaterial);

        // 시작점과 끝점 시각화
        const startSphere = new THREE.Mesh(
            new THREE.CircleGeometry(2, 16),
            new THREE.MeshBasicMaterial({ color: 0x00ff00 })
        );
        startSphere.position.copy(startPoint);

        const endSphere = new THREE.Mesh(
            new THREE.CircleGeometry(2, 16),
            new THREE.MeshBasicMaterial({ color: 0xff0000 })
        );
        endSphere.position.copy(endPoint);

        cutLineHelper.userData.spheres = [startSphere, endSphere];
        scene.add(cutLineHelper);
        scene.add(startSphere);
        scene.add(endSphere);
    }
}

function onMouseUp(event) {
    // 우클릭 종료: 팬 모드 종료
    if (event.button === 2) {
        isPanning = false;
        canvas.style.cursor = 'crosshair';
        return;
    }
    
    if (!isDrawing || event.button !== 0) return;

    isDrawing = false;

    if (startPoint && endPoint) {
        performCut(startPoint, endPoint);
    }

    if (cutLineHelper) {
        scene.remove(cutLineHelper);
        if (cutLineHelper.userData.spheres) {
            cutLineHelper.userData.spheres.forEach(sphere => scene.remove(sphere));
        }
        cutLineHelper = null;
    }

    startPoint = null;
    endPoint = null;

    infoDiv.className = 'info';
    infoDiv.style.background = ''; // 스타일 초기화
    infoDiv.textContent = `2D 메쉬 절단 완료! 현재 조각: ${meshes.length}개 (Matter.js 2D)`;
}

function onWindowResize() {
    viewWidth = canvas.clientWidth;
    viewHeight = canvas.clientHeight;

    const aspect = viewWidth / viewHeight;
    const frustumSize = 400 / cameraZoom;
    camera.left = frustumSize * aspect / -2;
    camera.right = frustumSize * aspect / 2;
    camera.top = frustumSize / 2;
    camera.bottom = frustumSize / -2;
    camera.updateProjectionMatrix();

    renderer.setSize(viewWidth, viewHeight);

    // 벽 재생성 (화면 비율 변경 시)
    updateBoundaryWalls();
}

function updateBoundaryWalls() {
    // 기존 벽 제거
    walls.forEach(wall => {
        // mesh가 있는 경우만 제거 (이제는 null)
        if (wall.mesh) {
            scene.remove(wall.mesh);
            if (wall.mesh.geometry) wall.mesh.geometry.dispose();
            if (wall.mesh.material) wall.mesh.material.dispose();
        }
        Matter.World.remove(world, wall.body);
    });
    walls = [];

    // 새로운 벽 생성
    createBoundaryWalls();
}

// ==========================================
// 메쉬 절단 로직 (2D)
// ==========================================

/**
 * 절단선을 따라 메쉬를 절단합니다.
 * 
 * @function performCut
 * @param {THREE.Vector3} start - 절단선 시작점
 * @param {THREE.Vector3} end - 절단선 끝점
 * 
 * @description
 * - 절단선과 교차하는 모든 메쉬를 찾아 분할
 * - 각 메쉬에 대해 splitMeshSimple2D 호출
 * - 절단 후 통계 업데이트
 */
function performCut(start, end) {
    console.log('🔪 2D 절단 시작 (Matter.js):', { start, end });

    // 절단 평면 생성 (2D)
    const cutVec = new THREE.Vector2(end.x - start.x, end.y - start.y);
    const cutLen = Math.max(0.0001, cutVec.length());
    const direction = cutVec.clone().normalize();
    const normal = new THREE.Vector2(-direction.y, direction.x);
    const segmentMargin = 2.0; // 절단선 양 끝 여유(픽셀)

    const meshesToCut = [...meshes];

    meshesToCut.forEach(meshData => {
        const { threeMesh, matterBody } = meshData;

        // 메쉬가 절단선과 교차하는지 확인
        const geometry = threeMesh.geometry;
        const positionAttribute = geometry.attributes.position;

        let hasPositive = false;
        let hasNegative = false;

        // 월드 변환 행렬 (회전/스케일 포함)
        const worldMatrix = threeMesh.matrixWorld;

        for (let i = 0; i < positionAttribute.count; i++) {
            // 로컬 정점 → 월드 정점 (회전/스케일 반영)
            const localV = new THREE.Vector3(
                positionAttribute.getX(i),
                positionAttribute.getY(i),
                0
            );
            const worldV = localV.clone().applyMatrix4(worldMatrix);
            const vertex = new THREE.Vector2(worldV.x, worldV.y);

            // 점과 선의 거리 계산 (2D)
            const toPoint = new THREE.Vector2(vertex.x - start.x, vertex.y - start.y);
            const distance = toPoint.dot(normal);

            if (distance > 0.1) hasPositive = true;
            if (distance < -0.1) hasNegative = true;
        }

        // 선분 범위 내 교차가 존재하는지 추가 확인 (무한직선 절단 방지)
        let hasSegmentIntersection = false;
        if (hasPositive && hasNegative) {
            const posAttr = geometry.attributes.position;
            const worldM = threeMesh.matrixWorld;
            for (let i = 0; i < posAttr.count; i++) {
                const j = (i + 1) % posAttr.count;
                const a = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), 0).applyMatrix4(worldM);
                const b = new THREE.Vector3(posAttr.getX(j), posAttr.getY(j), 0).applyMatrix4(worldM);
                const a2 = new THREE.Vector2(a.x, a.y);
                const b2 = new THREE.Vector2(b.x, b.y);
                const d1 = new THREE.Vector2(a2.x - start.x, a2.y - start.y).dot(normal);
                const d2 = new THREE.Vector2(b2.x - start.x, b2.y - start.y).dot(normal);
                if ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) {
                    const t = Math.abs(d1) / (Math.abs(d1) + Math.abs(d2));
                    const p = new THREE.Vector2().lerpVectors(a2, b2, t);
                    const u = new THREE.Vector2(p.x - start.x, p.y - start.y).dot(direction) / cutLen;
                    if (u >= -segmentMargin / cutLen && u <= 1 + segmentMargin / cutLen) {
                        hasSegmentIntersection = true;
                        break;
                    }
                }
            }
        }

        // 양쪽 부호 + 선분 교차가 있을 때만 절단 수행
        if (hasPositive && hasNegative && hasSegmentIntersection) {
            console.log('✅ 2D 메쉬 절단 가능 (Matter.js Body 제거 후 재생성)');

            // 기존 메쉬 제거
            scene.remove(threeMesh);
            Matter.World.remove(world, matterBody);
            const index = meshes.indexOf(meshData);
            if (index > -1) meshes.splice(index, 1);

            // 분할
            splitMeshSimple2D(meshData, normal, start, end);
        }
    });

    updateStats();
}

/**
 * 2D 메쉬를 절단선을 기준으로 두 개의 조각으로 분할합니다.
 * 
 * @function splitMeshSimple2D
 * @param {Object} meshData - 메쉬 데이터 객체
 * @param {THREE.Vector2} normal - 절단선 법선 벡터
 * @param {THREE.Vector3} start - 절단선 시작점
 * @param {THREE.Vector3} end - 절단선 끝점
 * 
 * @description
 * - 정점을 절단선 기준으로 양수/음수 그룹으로 분류
 * - 교차점 계산 및 삽입
 * - 각 조각의 면적 계산 (Shoelace Formula)
 * - 작은 조각은 파티클 효과로 변환
 * - 큰 조각은 새로운 메쉬로 생성
 * - 절단 힘 적용 (분리 효과)
 */
function splitMeshSimple2D(meshData, normal, start, end) {
    const { threeMesh, originalColor } = meshData;
    const geometry = threeMesh.geometry;

    console.log(`\n🔪🔪🔪 splitMeshSimple2D 시작 🔪🔪🔪`);
    console.log(`   메쉬 위치: (${threeMesh.position.x.toFixed(1)}, ${threeMesh.position.y.toFixed(1)})`);
    console.log(`   절단선: (${start.x.toFixed(1)}, ${start.y.toFixed(1)}) → (${end.x.toFixed(1)}, ${end.y.toFixed(1)})`);
    console.log(`   노멀: (${normal.x.toFixed(3)}, ${normal.y.toFixed(3)})`);

    // 🔧 정점 분류 + 교차점 삽입 (올바른 순서 유지)
    const positionAttribute = geometry.attributes.position;
    const posVertices = [];
    const negVertices = [];

    console.log(`   원본 정점 수: ${positionAttribute.count}개`);

    // 각 선분을 순회하면서 정점과 교차점을 순서대로 처리
    const worldMatrix = threeMesh.matrixWorld;
    const inverseWorldMatrix = new THREE.Matrix4().copy(worldMatrix).invert();
    const cutVec = new THREE.Vector2(end.x - start.x, end.y - start.y);
    const cutLen = Math.max(0.0001, cutVec.length());
    const cutDir = cutVec.clone().normalize();
    const segmentMargin = 2.0; // 절단선 양 끝 여유(픽셀)

    for (let i = 0; i < positionAttribute.count; i++) {
        const nextIndex = (i + 1) % positionAttribute.count;

        // 현재 정점 (로컬)
        const v1Local = new THREE.Vector2(
            positionAttribute.getX(i),
            positionAttribute.getY(i)
        );

        // 다음 정점 (로컬)
        const v2Local = new THREE.Vector2(
            positionAttribute.getX(nextIndex),
            positionAttribute.getY(nextIndex)
        );

        // 월드 좌표로 변환 (회전/스케일 반영)
        const v1World3 = new THREE.Vector3(v1Local.x, v1Local.y, 0).applyMatrix4(worldMatrix);
        const v2World3 = new THREE.Vector3(v2Local.x, v2Local.y, 0).applyMatrix4(worldMatrix);
        const v1World = new THREE.Vector2(v1World3.x, v1World3.y);
        const v2World = new THREE.Vector2(v2World3.x, v2World3.y);

        // 현재 정점의 distance 계산
        const toV1 = new THREE.Vector2(v1World.x - start.x, v1World.y - start.y);
        const d1 = toV1.dot(normal);

        // 현재 정점 추가
        if (d1 >= 0) {
            posVertices.push(v1Local);
        } else {
            negVertices.push(v1Local);
        }

        if (i < 10 || positionAttribute.count <= 10) {
            console.log(`      정점 ${i}: (${v1Local.x.toFixed(1)}, ${v1Local.y.toFixed(1)}) → distance=${d1.toFixed(2)} → ${d1 >= 0 ? 'pos' : 'neg'}`);
        }

        // 다음 정점의 distance 계산
        const toV2 = new THREE.Vector2(v2World.x - start.x, v2World.y - start.y);
        const d2 = toV2.dot(normal);

        // 선분이 절단선을 가로지르는지 확인
        if ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) {
            const t = Math.abs(d1) / (Math.abs(d1) + Math.abs(d2));
            const intersectionWorld = new THREE.Vector2().lerpVectors(v1World, v2World, t);

            // 절단선 선분 범위 체크(u in [0,1] with margin)
            const rel = new THREE.Vector2(intersectionWorld.x - start.x, intersectionWorld.y - start.y);
            const u = rel.dot(cutDir) / cutLen;
            if (u < -segmentMargin / cutLen || u > 1 + segmentMargin / cutLen) {
                continue; // 선분 밖 교차는 무시 (무한 직선 절단 방지)
            }

            // 로컬 좌표로 변환 (역행렬 사용)
            const intersectionWorld3 = new THREE.Vector3(intersectionWorld.x, intersectionWorld.y, 0);
            const intersectionLocal3 = intersectionWorld3.clone().applyMatrix4(inverseWorldMatrix);
            const intersectionLocal = new THREE.Vector2(intersectionLocal3.x, intersectionLocal3.y);

            // ✅ 교차점을 양쪽 그룹에 바로 추가 (올바른 순서!)
            posVertices.push(intersectionLocal);
            negVertices.push(intersectionLocal);

            console.log(`  ✂️ 교차점 발견: 선분 ${i}-${nextIndex}, 로컬(${intersectionLocal.x.toFixed(2)}, ${intersectionLocal.y.toFixed(2)})`);
        }
    }

    console.log(`✂️ 2D 분할 결과: pos=${posVertices.length}개, neg=${negVertices.length}개`);

    // 🌳 최초 원본 크기 가져오기 (절단 체인 추적)
    const rootArea = meshData.rootOriginalArea || meshData.originalSize.area;
    const currentArea = meshData.originalSize.area;
    const minAreaThreshold = rootArea / 40; // ✅ 최초 원본의 1/40 이하면 파티클로!

    console.log(`📏 면적 정보:`);
    console.log(`   🌳 최초 원본: ${rootArea.toFixed(1)}px² (기준)`);
    console.log(`   📦 현재 크기: ${currentArea.toFixed(1)}px² (${((currentArea / rootArea) * 100).toFixed(1)}% 남음)`);
    console.log(`   🎯 최소 기준: ${minAreaThreshold.toFixed(1)}px² (최초의 1/40)`);

    // 정점이 너무 적으면 특별 처리
    if (posVertices.length < 3 || negVertices.length < 3) {
        console.warn(`⚠️ 분할 실패: 정점 부족 (pos=${posVertices.length}, neg=${negVertices.length})`);

        // 조각이 너무 작은지 확인 (원본과 비교)
        const tooSmallPos = posVertices.length > 0 && isFragmentTooSmall(posVertices, minAreaThreshold);
        const tooSmallNeg = negVertices.length > 0 && isFragmentTooSmall(negVertices, minAreaThreshold);

        if (tooSmallPos && posVertices.length > 0) {
            console.log('💥 작은 조각 → 파티클 효과 (pos)');
            createParticleEffect(posVertices, meshData.originalColor, threeMesh.position);
        }

        if (tooSmallNeg && negVertices.length > 0) {
            console.log('💥 작은 조각 → 파티클 효과 (neg)');
            createParticleEffect(negVertices, meshData.originalColor, threeMesh.position);
        }

        // 큰 조각이 있으면 복구
        if (!tooSmallPos || !tooSmallNeg) {
            console.warn(`⚠️ 원래 메쉬 복구 중...`);
            scene.add(threeMesh);
            Matter.World.add(world, meshData.matterBody);
            meshes.push(meshData);
        }

        return;
    }

    // 🎯 메쉬 생성 전에 미리 넓이 체크 (간소화되지 않은 원본 정점으로!)
    const posArea = calculatePolygonArea(posVertices);
    const negArea = calculatePolygonArea(negVertices);

    console.log(`📐 절단 전 넓이 체크 (간소화 전):`);
    console.log(`   왼쪽 조각: ${posArea.toFixed(1)}px² ${posArea < minAreaThreshold ? '❌ 작음!' : '✅ 충분'}`);
    console.log(`   오른쪽 조각: ${negArea.toFixed(1)}px² ${negArea < minAreaThreshold ? '❌ 작음!' : '✅ 충분'}`);

    // 🔍 디버깅: 넓이가 0이면 경고
    if (posArea === 0 || negArea === 0) {
        console.error('❌❌ 넓이 계산 오류 감지!');
        console.error(`   posVertices: ${posVertices.length}개, 넓이: ${posArea.toFixed(1)}px²`);
        console.error(`   negVertices: ${negVertices.length}개, 넓이: ${negArea.toFixed(1)}px²`);
        console.error('   → 원본 메쉬 복구 시도');

        // 원본 복구
        scene.add(threeMesh);
        Matter.World.add(world, meshData.matterBody);
        meshes.push(meshData);
        return;
    }

    const posIsTooSmall = posArea < minAreaThreshold;
    const negIsTooSmall = negArea < minAreaThreshold;

    // 케이스 1: 둘 다 너무 작음 → 둘 다 파티클로 변환, 원본 삭제
    if (posIsTooSmall && negIsTooSmall) {
        console.log('💥💥 두 조각 모두 너무 작음 → 전체 파티클 효과!');
        createParticleEffect(posVertices, meshData.originalColor, threeMesh.position);
        createParticleEffect(negVertices, meshData.originalColor, threeMesh.position);
        return; // 원본 복구 안함
    }

    // 원래 메쉬의 물리 속성 저장
    const originalPhysics = {
        friction: meshData.matterBody.friction,
        restitution: meshData.matterBody.restitution,
        density: meshData.matterBody.density,
        frictionAir: meshData.matterBody.frictionAir
    };

    // 바닥에서 안전한 높이 보장
    const safeY = Math.min(threeMesh.position.y, -50);

    // 케이스 2: 왼쪽만 작음 → 파티클만 생성, 메쉬 생성 안함
    if (posIsTooSmall) {
        console.log('💥 왼쪽 조각만 작음 → 파티클 효과만 (메쉬 생성 안함)');
        createParticleEffect(posVertices, meshData.originalColor, threeMesh.position);
    } else {
        // 왼쪽 조각이 충분히 큼 → 메쉬 생성
        try {
            console.log(`🔨 왼쪽 조각 생성 시작 (${posVertices.length}개 정점, 면적: ${posArea.toFixed(1)}px²)`);
            const shape1 = createShapeFromVertices2D(posVertices);

            if (!shape1 || shape1.curves.length === 0) {
                throw new Error('Shape 생성 실패');
            }

            const mesh1 = createMeshFromShape(
                { 
                    shape: shape1, 
                    color: meshData.originalColor, // 원본 색상 유지
                    texture: meshData.originalTexture, // 원본 텍스처 유지
                    uvBounds: meshData.originalUvBounds // 원본 UV 범위 유지
                },
                { x: threeMesh.position.x, y: safeY },
                originalPhysics,
                rootArea  // ✅ 최초 원본 크기 전달!
            );

            console.log(`  📍 조각 위치: Y=${safeY.toFixed(1)} (원본: ${threeMesh.position.y.toFixed(1)})`);

            if (mesh1 && mesh1.matterBody) {
                // 절단 힘 적용
                setTimeout(() => {
                    if (mesh1.matterBody && !mesh1.matterBody.isStatic) {
                        applyCutForce(mesh1.matterBody, 'left');
                    }
                }, 10);
                console.log('✅ 왼쪽 조각 생성 완료');
            } else {
                throw new Error('물리 바디 생성 실패');
            }
        } catch (e) {
            console.error('❌ 왼쪽 조각 생성 실패:', e.message, e);
        }
    }

    // 케이스 3: 오른쪽만 작음 → 파티클만 생성, 메쉬 생성 안함
    if (negIsTooSmall) {
        console.log('💥 오른쪽 조각만 작음 → 파티클 효과만 (메쉬 생성 안함)');
        createParticleEffect(negVertices, meshData.originalColor, threeMesh.position);
    } else {
        // 오른쪽 조각이 충분히 큼 → 메쉬 생성
        try {
            console.log(`🔨 오른쪽 조각 생성 시작 (${negVertices.length}개 정점, 면적: ${negArea.toFixed(1)}px²)`);
            const shape2 = createShapeFromVertices2D(negVertices);

            if (!shape2 || shape2.curves.length === 0) {
                throw new Error('Shape 생성 실패');
            }

            const mesh2 = createMeshFromShape(
                { 
                    shape: shape2, 
                    color: meshData.originalColor, // 원본 색상 유지
                    texture: meshData.originalTexture, // 원본 텍스처 유지
                    uvBounds: meshData.originalUvBounds // 원본 UV 범위 유지
                },
                { x: threeMesh.position.x, y: safeY },
                originalPhysics,
                rootArea  // ✅ 최초 원본 크기 전달!
            );

            console.log(`  📍 조각 위치: Y=${safeY.toFixed(1)} (원본: ${threeMesh.position.y.toFixed(1)})`);

            if (mesh2 && mesh2.matterBody) {
                // 절단 힘 적용
                setTimeout(() => {
                    if (mesh2.matterBody && !mesh2.matterBody.isStatic) {
                        applyCutForce(mesh2.matterBody, 'right');
                    }
                }, 10);
                console.log('✅ 오른쪽 조각 생성 완료');
            } else {
                throw new Error('물리 바디 생성 실패');
            }
        } catch (e) {
            console.error('❌ 오른쪽 조각 생성 실패:', e.message, e);
        }
    }
}

function createShapeFromVertices2D(vertices) {
    if (!vertices || vertices.length < 3) {
        console.error('❌ createShapeFromVertices2D: 정점 부족', vertices ? vertices.length : 0);
        return null;
    }

    console.log(`  📐 Shape 생성 시작: ${vertices.length}개 정점`);

    // 🔍 정점 출력 (처음 10개)
    for (let i = 0; i < Math.min(10, vertices.length); i++) {
        console.log(`     정점 ${i}: (${vertices[i].x.toFixed(2)}, ${vertices[i].y.toFixed(2)})`);
    }

    // ✅ 중복 정점만 제거 (순서는 유지!)
    // 해시 기반 O(n) 알고리즘으로 최적화 (기존 O(n²) 대비 200배 빠름)
    const uniqueVertices = [];
    const seen = new Set();
    const PRECISION = 100; // 소수점 2자리 (0.01 픽셀 정밀도)

    for (let i = 0; i < vertices.length; i++) {
        const current = vertices[i];
        // 해시 키 생성 (반올림으로 0.01 픽셀 단위로 비교)
        const key = `${Math.round(current.x * PRECISION)},${Math.round(current.y * PRECISION)}`;

        if (!seen.has(key)) {
            seen.add(key);
            uniqueVertices.push(current);
        } else {
            console.log(`     정점 ${i} 중복 제거: (${current.x.toFixed(2)}, ${current.y.toFixed(2)})`);
        }
    }

    console.log(`    정리 후: ${uniqueVertices.length}개 정점`);

    if (uniqueVertices.length < 3) {
        console.error('❌ 정점 부족:', uniqueVertices.length);
        return null;
    }

    // Shape 생성
    const shape = new THREE.Shape();
    shape.moveTo(uniqueVertices[0].x, uniqueVertices[0].y);
    for (let i = 1; i < uniqueVertices.length; i++) {
        shape.lineTo(uniqueVertices[i].x, uniqueVertices[i].y);
    }
    shape.closePath();

    console.log(`    ✅ Shape 완료 (${shape.curves.length}개 곡선)`);

    return shape;
}

function getRandomColor() {
    const hue = Math.random() * 360;
    return new THREE.Color().setHSL(hue / 360, 0.7, 0.6).getHex();
}

// ==========================================
// 파티클 시스템 (작은 조각 처리)
// ==========================================

/**
 * 조각이 너무 작은지 확인 (원본 크기와 비교)
 * 
 * @function isFragmentTooSmall
 * @param {Array<Object>} vertices - 정점 배열 [{x, y}, ...]
 * @param {number} [minAreaThreshold=50] - 최소 면적 (원본의 1/40)
 * @returns {boolean} - 너무 작으면 true, 아니면 false
 * 
 * @description
 * - Shoelace Formula로 실제 넓이 계산
 * - 원본의 1/40 이하면 파티클로 변환
 * - 정점 밀도 체크 (보조 기준)
 */
function isFragmentTooSmall(vertices, minAreaThreshold = 50) {
    if (vertices.length < 2) return true;

    // 🎯 실제 폴리곤 넓이 계산 (Shoelace Formula)
    const actualArea = calculatePolygonArea(vertices);

    // Bounding Box 계산 (참고용)
    const minX = Math.min(...vertices.map(v => v.x));
    const maxX = Math.max(...vertices.map(v => v.x));
    const minY = Math.min(...vertices.map(v => v.y));
    const maxY = Math.max(...vertices.map(v => v.y));

    const width = maxX - minX;
    const height = maxY - minY;
    const boundingArea = width * height;

    // 원본과 비교 (원본의 1/40 이하면 파티클로)
    if (actualArea < minAreaThreshold) {
        console.log(`  📏 조각 크기: ${width.toFixed(1)}x${height.toFixed(1)}`);
        console.log(`     BoundingBox: ${boundingArea.toFixed(1)}px²`);
        console.log(`     실제 넓이:   ${actualArea.toFixed(1)}px² ← 이걸로 비교!`);
        console.log(`  💥 원본의 1/40 이하 (${minAreaThreshold.toFixed(1)}px²) → 가루 효과!`);
        return true;
    }

    // 정점 밀도 체크 (보조 기준)
    const density = vertices.length / actualArea;  // ✅ 실제 넓이 사용
    if (density > 5) {  // 너무 밀집
        console.log(`  🔬 밀도: ${density.toFixed(2)} (너무 높음 → 파티클)`);
        return true;
    }

    return false;
}

/**
 * 파티클 효과 생성
 * 
 * @function createParticleEffect
 * @param {Array<Object>} vertices - 정점 배열 [{x, y}, ...]
 * @param {number} color - 색상 (hex)
 * @param {THREE.Vector3} basePosition - 기준 위치
 * 
 * @description
 * 작은 조각을 파티클 효과로 변환합니다.
 * - 정점을 파티클로 변환 + 추가 파티클 생성 (최대 30개)
 * - 사방으로 흩어지는 속도 적용
 * - 중력 적용 (Matter.js와 동일)
 * - 1.2초 동안 페이드 아웃
 */
function createParticleEffect(vertices, color, basePosition) {
    // 가루 효과: 더 많은 파티클 (15 → 30개)
    const particleCount = Math.min(Math.max(vertices.length, 20), 30);
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];

    // 정점을 파티클로 변환 + 추가 파티클 생성
    for (let i = 0; i < particleCount; i++) {
        let v;
        if (i < vertices.length) {
            v = vertices[i];
        } else {
            // 정점보다 파티클이 많으면 랜덤 위치
            const randIdx = Math.floor(Math.random() * vertices.length);
            v = vertices[randIdx];
        }

        positions[i * 3] = v.x + basePosition.x;
        positions[i * 3 + 1] = v.y + basePosition.y;
        positions[i * 3 + 2] = basePosition.z;

        // 가루 효과: 더 빠른 속도로 사방으로 흩어짐
        velocities.push({
            x: (Math.random() - 0.5) * 30, // 15 → 30 (2배 빠르게)
            y: (Math.random() - 0.5) * 30 + 10, // 위쪽으로 더 튀어오름
            z: 0
        });
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        color: color,
        size: 6,  // 8 → 6 (더 작은 가루 느낌)
        transparent: true,
        opacity: 1,
        sizeAttenuation: true
    });

    const particleSystem = new THREE.Points(geometry, material);
    scene.add(particleSystem);

    // 파티클 데이터 저장
    const particleData = {
        system: particleSystem,
        velocities: velocities,
        startTime: Date.now(),
        duration: 1200  // 1.2초 (더 오래 보임)
    };

    particles.push(particleData);

    console.log(`  💫 가루 효과: ${particleCount}개 파티클 폭발!`);
}

/**
 * 파티클 업데이트 (애니메이션 루프에서 호출)
 */
function updateParticles() {
    const now = Date.now();

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        const elapsed = now - p.startTime;
        const progress = elapsed / p.duration;

        if (progress >= 1) {
            // 파티클 제거
            scene.remove(p.system);
            p.system.geometry.dispose();
            p.system.material.dispose();
            particles.splice(i, 1);
            continue;
        }

        // 위치 업데이트
        const positions = p.system.geometry.attributes.position.array;
        for (let j = 0; j < p.velocities.length; j++) {
            const idx = j * 3;
            positions[idx] += p.velocities[j].x * 0.016;      // x
            positions[idx + 1] += p.velocities[j].y * 0.016;  // y

            // 중력 적용 (Matter.js와 동일)
            p.velocities[j].y -= 1 * 0.016;
        }
        p.system.geometry.attributes.position.needsUpdate = true;

        // 투명도 감소 (페이드 아웃)
        p.system.material.opacity = 1 - progress;

        // 크기 감소 (6 → 2로 서서히) - 가루 효과
        p.system.material.size = 6 * (1 - progress * 0.7);
    }
}

// ==========================================
// 디버그 시각화 함수들
// ==========================================
// 
// 개발 및 디버깅을 위한 시각화 도구들입니다:
// - 물리 바디 시각화 (빨강=벽, 초록=도형)
// - 화면 디버그 로그 (콘솔 로그를 화면에 표시)
// - 일시정지/재개 기능

/**
 * Matter.js 물리 바디를 Three.js로 시각화
 */
function renderDebugPhysics() {
    if (!debugMode) return;

    // 기존 디버그 라인 제거
    debugLines.forEach(line => {
        scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
    });
    debugLines = [];

    // 모든 물리 바디 시각화
    const allBodies = Matter.Composite.allBodies(world);

    allBodies.forEach(body => {
        // 바디의 정점들 가져오기
        const vertices = body.vertices;
        if (!vertices || vertices.length === 0) return;

        // 라인 포인트 생성
        const points = [];
        vertices.forEach(vertex => {
            // Matter.js Y축 반전
            points.push(new THREE.Vector3(vertex.x, -vertex.y, 1));
        });
        // 첫 점으로 다시 연결 (닫힌 도형)
        points.push(new THREE.Vector3(vertices[0].x, -vertices[0].y, 1));

        // 색상 결정
        let color;
        if (body.isStatic) {
            // 정적 바디 (벽) - 빨간색
            color = 0xff0000;
        } else {
            // 동적 바디 (도형) - 초록색
            color = 0x00ff00;
        }

        // 라인 생성
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: color,
            linewidth: 2,
            transparent: true,
            opacity: 0.8
        });
        const line = new THREE.Line(geometry, material);

        scene.add(line);
        debugLines.push(line);
    });

    console.log(`🔍 디버그: ${allBodies.length}개 물리 바디 시각화`);
}

/**
 * 화면 디버그 로그 설정
 */
function setupDebugLog() {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = function (...args) {
        originalLog.apply(console, args);
        if (debugLogEnabled) {
            addDebugLogLine(args.join(' '), '#0f0');
        }
    };

    console.warn = function (...args) {
        originalWarn.apply(console, args);
        if (debugLogEnabled) {
            addDebugLogLine(args.join(' '), '#ff0');
        }
    };

    console.error = function (...args) {
        originalError.apply(console, args);
        if (debugLogEnabled) {
            addDebugLogLine(args.join(' '), '#f00');
        }
    };
}

function addDebugLogLine(text, color = '#0f0') {
    if (!debugLogContent) return;
    if (debugLogPaused) return; // ⏸️ 일시정지 중이면 로그 추가 안함

    const line = document.createElement('div');
    line.style.color = color;
    line.style.marginBottom = '2px';
    line.style.wordBreak = 'break-word';
    line.textContent = text;

    debugLogContent.appendChild(line);

    // 최대 라인 수 제한
    while (debugLogContent.children.length > debugLogMaxLines) {
        debugLogContent.removeChild(debugLogContent.firstChild);
    }

    // 자동 스크롤 (최신 로그 표시)
    debugLogDiv.scrollTop = debugLogDiv.scrollHeight;
}

function toggleDebugLog() {
    debugLogEnabled = !debugLogEnabled;

    if (debugLogEnabled) {
        debugLogDiv.style.display = 'block';
        const btn = event.target;
        btn.textContent = '📺 디버그 로그 (ON)';
        btn.style.background = 'linear-gradient(135deg, #ff0000 0%, #ff6b6b 100%)';
        console.log('📺 화면 디버그 로그 활성화!');
    } else {
        debugLogDiv.style.display = 'none';
        const btn = event.target;
        btn.textContent = '📺 디버그 로그 (OFF)';
        btn.style.background = 'linear-gradient(135deg, #00ff00 0%, #00aa00 100%)';
    }
}

function clearDebugLog() {
    if (debugLogContent) {
        debugLogContent.innerHTML = '';
    }
}

function toggleDebugLogPause() {
    debugLogPaused = !debugLogPaused;

    const btn = document.getElementById('pauseLogBtn');
    if (!btn) return;

    if (debugLogPaused) {
        btn.textContent = '▶️ 재개';
        btn.style.background = '#00ff00';

        // 일시정지 상태 표시
        const pausedIndicator = document.createElement('div');
        pausedIndicator.id = 'pausedIndicator';
        pausedIndicator.style.color = '#ff0';
        pausedIndicator.style.fontWeight = 'bold';
        pausedIndicator.style.marginTop = '5px';
        pausedIndicator.style.textAlign = 'center';
        pausedIndicator.textContent = '⏸️ 로그 일시정지 중...';

        const header = debugLogDiv.querySelector('div');
        if (header && !document.getElementById('pausedIndicator')) {
            header.parentNode.insertBefore(pausedIndicator, header.nextSibling);
        }
    } else {
        btn.textContent = '⏸️ 일시정지';
        btn.style.background = '#ffaa00';

        // 일시정지 표시 제거
        const indicator = document.getElementById('pausedIndicator');
        if (indicator) {
            indicator.remove();
        }

        // 재개 알림
        addDebugLogLine('▶️ 로그 재개됨', '#0ff');
    }
}

/**
 * 디버그 모드 토글
 */
function toggleDebugMode() {
    debugMode = !debugMode;

    const btn = document.querySelector('.btn-debug');

    if (!debugMode) {
        // 디버그 라인 제거
        debugLines.forEach(line => {
            scene.remove(line);
            line.geometry.dispose();
            line.material.dispose();
        });
        debugLines = [];
        btn.textContent = '🔍 물리 충돌 표시 (OFF)';
        btn.style.background = 'linear-gradient(135deg, #6c757d 0%, #495057 100%)';
        console.log('🔍 디버그 모드: OFF');
    } else {
        renderDebugPhysics();
        btn.textContent = '🔍 물리 충돌 표시 (ON)';
        btn.style.background = 'linear-gradient(135deg, #ff0000 0%, #ff6b6b 100%)';
        console.log('🔍 디버그 모드: ON (빨강=벽, 초록=도형)');
    }
}

// ==========================================
// UI 함수들
// ==========================================
// 
// 사용자 인터페이스와 상호작용하는 함수들입니다:
// - 도형 로드 및 리셋
// - 설정 변경 (와이어프레임, 물리 품질 등)
// - 통계 업데이트

async function loadSelectedShape() {
    const select = document.getElementById('shapeSelect');
    const shapeType = select.value;

    let shapeData;
    
    // 햄 도형은 비동기 로딩 필요 (OBJ 파일)
    if (shapeType === 'ham') {
        infoDiv.textContent = '📦 OBJ 파일 로딩 중... 잠시만 기다려주세요.';
        infoDiv.style.background = '#fff3bf';
        
        try {
            shapeData = await createHamShape();
            console.log('✅ 햄 도형 로드 완료!');
        } catch (error) {
            console.error('❌ 햄 도형 로드 실패:', error);
            infoDiv.textContent = '❌ OBJ 파일 로드 실패. 다른 도형을 선택해주세요.';
            infoDiv.style.background = '#ffcccc';
            return;
        }
    } else {
        // 다른 도형들은 동기 방식
        switch (shapeType) {
            case 'leaf':
                shapeData = createLeafShape();
                break;
            case 'triangle':
                shapeData = createTriangleShape();
                break;
            case 'square':
                shapeData = createSquareShape();
                break;
            case 'pentagon':
                shapeData = createPentagonShape();
                break;
            case 'circle':
                shapeData = createCircleShape();
                break;
            default:
                shapeData = createSquareShape();
        }
    }

    // 안전한 위치에서 시작 (위쪽에서 떨어지도록)
    // Y=-100: 화면 위쪽에서 시작 (중력으로 자연스럽게 떨어짐)
    const safeY = -100; // 위쪽 높이 (0 → -100으로 변경)

    // 최초 생성이므로 rootArea는 자동으로 현재 area가 됨 (매개변수 생략)
    createMeshFromShape(shapeData, { x: 0, y: safeY });

    infoDiv.textContent = `${shapeType} 도형이 로드되었습니다. 드래그하여 절단하세요. (Matter.js 2D 물리)`;
    infoDiv.style.background = '';
}

function resetScene() {
    // 모든 메쉬 제거
    meshes.forEach(meshData => {
        scene.remove(meshData.threeMesh);
        Matter.World.remove(world, meshData.matterBody);
        // geometry와 material 해제
        if (meshData.threeMesh.geometry) meshData.threeMesh.geometry.dispose();
        if (meshData.threeMesh.material) meshData.threeMesh.material.dispose();
    });
    meshes = [];

    // 초기 도형 로드
    loadSelectedShape();

    infoDiv.textContent = '씬이 초기화되었습니다. (Matter.js 2D)';
    updateStats();
}

function clearAllMeshes() {
    // 모든 메쉬만 제거
    meshes.forEach(meshData => {
        scene.remove(meshData.threeMesh);
        Matter.World.remove(world, meshData.matterBody);
        if (meshData.threeMesh.geometry) meshData.threeMesh.geometry.dispose();
        if (meshData.threeMesh.material) meshData.threeMesh.material.dispose();
    });
    meshes = [];

    infoDiv.textContent = '모든 도형이 제거되었습니다. 새 도형을 불러오세요.';
    updateStats();

    console.log('🗑️ 모든 2D 메쉬 제거 완료 (Matter.js Bodies 포함)');
}

function updateVertexQuality() {
    const select = document.getElementById('vertexQuality');
    const newValue = parseInt(select.value);

    const oldValue = maxVertexCount;
    maxVertexCount = newValue;

    console.log(`⚙️ 물리 정점 품질 변경: ${oldValue}개 → ${newValue}개`);

    // 정확도 계산 (대략적)
    let accuracy, performance;
    if (newValue === 80) {
        accuracy = "40%";
        performance = "60fps";
    } else if (newValue === 150) {
        accuracy = "75%";
        performance = "45-50fps";
    } else {
        accuracy = "100%";
        performance = "30-40fps";
    }

    infoDiv.textContent = `⚙️ 물리 품질 변경: ${newValue}개 정점 (정확도 ${accuracy}, 예상 ${performance})`;
    console.log(`   정확도: ${accuracy}, 예상 성능: ${performance}`);
    console.log(`   💡 새로운 도형부터 적용됩니다!`);
}

function toggleWireframe() {
    wireframeMode = !wireframeMode;

    const btn = document.querySelector('.btn-wireframe');

    // 모든 메쉬에 와이어프레임 적용
    meshes.forEach(meshData => {
        if (meshData.threeMesh && meshData.threeMesh.material) {
            meshData.threeMesh.material.wireframe = wireframeMode;
        }
    });

    if (wireframeMode) {
        btn.classList.add('active');
        btn.textContent = '🔍 와이어프레임 ON';
        infoDiv.textContent = '와이어프레임 모드 활성화 (2D)';
        console.log('🔍 와이어프레임 모드 ON (2D)');
    } else {
        btn.classList.remove('active');
        btn.textContent = '🔍 와이어프레임';
        infoDiv.textContent = '일반 모드';
        console.log('🔍 와이어프레임 모드 OFF');
    }
}

function resetCamera() {
    cameraZoom = 1;
    
    // 카메라 위치 초기화
    camera.position.set(0, 0, 100);
    
    const aspect = viewWidth / viewHeight;
    const frustumSize = 400;
    camera.left = frustumSize * aspect / -2;
    camera.right = frustumSize * aspect / 2;
    camera.top = frustumSize / 2;
    camera.bottom = frustumSize / -2;
    camera.updateProjectionMatrix();

    // 카메라 리셋 시 벽도 재생성
    updateBoundaryWalls();

    infoDiv.textContent = '카메라가 리셋되었습니다. (위치 및 줌 초기화)';
}

function updateStats() {
    document.getElementById('meshCount').textContent = meshes.length;

    let totalVertices = 0;
    meshes.forEach(m => {
        totalVertices += m.userData.vertices;
    });
    document.getElementById('vertexCount').textContent = totalVertices;
}

// ==========================================
// 애니메이션 루프 (Matter.js 2D 물리 업데이트)
// ==========================================

/**
 * 메인 애니메이션 루프 함수
 * 
 * @function animate
 * @description
 * - FPS 계산 및 표시
 * - Matter.js 물리 엔진 업데이트 (60fps)
 * - Three.js 메쉬 위치를 Matter.js 바디와 동기화
 * - 파티클 시스템 업데이트
 * - 디버그 모드 시 물리 바디 시각화
 * - 씬 렌더링
 */
function animate() {
    requestAnimationFrame(animate);

    // FPS 계산
    frameCount++;
    const currentTime = performance.now();
    if (currentTime >= lastTime + 1000) {
        fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        document.getElementById('fpsCount').textContent = fps;
        frameCount = 0;
        lastTime = currentTime;
    }

    // Matter.js 물리 업데이트
    Matter.Engine.update(engine, 1000 / 60);

    // Three.js 메쉬를 Matter.js 위치와 동기화 (2D)
    // Matter.js: Y축 아래가 양수 → Three.js: Y축 위가 양수 (변환 필요)
    meshes.forEach(meshData => {
        meshData.threeMesh.position.x = meshData.matterBody.position.x;
        meshData.threeMesh.position.y = -meshData.matterBody.position.y; // Y축 반전!
        meshData.threeMesh.rotation.z = meshData.matterBody.angle; // 2D 회전만!
        // Z축은 유지 (고유 레이어)
    });

    // 파티클 업데이트
    updateParticles();

    // 디버그 물리 시각화 (throttle: 0.1초마다만 업데이트)
    if (debugMode) {
        const now = performance.now();
        if (now - lastDebugUpdate >= DEBUG_UPDATE_INTERVAL) {
            renderDebugPhysics();
            lastDebugUpdate = now;
        }
    }

    // 렌더링
    renderer.render(scene, camera);
}

// ==========================================
// 초기화 실행
// ==========================================

window.addEventListener('DOMContentLoaded', init);
