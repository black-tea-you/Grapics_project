// ==========================================
// Three.js + Matter.js 기반 2D 메쉬 커팅 시스템
// 완벽한 2D 물리 시뮬레이션 버전
// ==========================================

// DOM 요소
const canvas = document.getElementById('canvas');
const infoDiv = document.getElementById('info');
const loadingDiv = document.getElementById('loading');

// Three.js 변수
let scene, camera, renderer;
let raycaster, mouse;

// Matter.js 변수
let engine, world;
let groundBody;
let walls = []; // 캔버스 경계 벽들

// 상태 변수
let meshes = []; // { threeMesh, matterBody, userData }
let isDrawing = false;
let startPoint = null;
let endPoint = null;
let cutLineHelper = null;

// 와이어프레임 모드
let wireframeMode = false;

// 성능 측정
let fps = 0;
let lastTime = performance.now();
let frameCount = 0;

// 2D 설정
let viewWidth = 800;
let viewHeight = 600;
let cameraZoom = 1;

// Z축 관리 (겹침 방지)
let nextZIndex = 0;
const Z_OFFSET = 0.01;

// 파티클 시스템
let particles = [];

// 디버그 시각화
let debugMode = true; // 물리 충돌 영역 표시
let debugLines = []; // 물리 바디 시각화 라인들

// 물리 정점 품질 설정
let maxVertexCount = 80; // 기본값: 80개 (빠름)

// 화면 디버그 로그
let debugLogEnabled = false;
let debugLogPaused = false; // 로그 일시정지 상태
let debugLogDiv = null;
let debugLogContent = null;
let debugLogMaxLines = 500; // 최대 로그 라인 수

// ==========================================
// 초기화
// ==========================================

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

    // Raycaster (마우스 피킹용)
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // 조명 설정
    setupLights();

    // Matter.js World 설정
    setupPhysics();

    // 캔버스 경계 벽 생성 (상하좌우)
    createBoundaryWalls();

    // 이벤트 리스너
    setupEventListeners();

    // 초기 도형 로드
    loadSelectedShape();

    // 애니메이션 시작
    animate();

    // 로딩 완료
    const initTime = ((performance.now() - initStartTime) / 1000).toFixed(2);
    console.log(`✅ Three.js + Matter.js 2D 초기화 완료: ${initTime}초`);

    // 로딩 인디케이터 페이드아웃
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

function setupLights() {
    // Ambient Light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    // Directional Light (2D에서는 그림자 불필요)
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(50, 50, 100);
    scene.add(dirLight);

    // Hemisphere Light
    const hemiLight = new THREE.HemisphereLight(0x4facfe, 0x00f2fe, 0.3);
    scene.add(hemiLight);
}

// ==========================================
// Matter.js 2D 물리 엔진 설정
// ==========================================

function setupPhysics() {
    console.log('⚙️ Matter.js 2D 물리 엔진 초기화...');

    // Engine 생성
    engine = Matter.Engine.create();
    world = engine.world;

    // 중력 설정 (Matter.js: Y축 아래가 양수!)
    world.gravity.x = 0;
    world.gravity.y = 1; // 적절한 2D 중력 (아래 방향)

    // 충돌 이벤트 리스너 (디버그용)
    Matter.Events.on(engine, 'collisionStart', function(event) {
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
// 캔버스 경계 벽 생성 (상하좌우)
// ==========================================

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
    const bottomVisualOffset = 40; // 바닥을 위로 40px 올림 (15px → 40px 증가)
    
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
    
    console.log(`🧱 캔버스 경계 벽 생성 완료 (4면)`);
    console.log(`📐 캔버스 범위: ${halfWidth * 2}x${halfHeight * 2}`);
    console.log(`🎯 바닥 숨김: 시각적으로 ${bottomVisualOffset}px 위로 이동`);
    
    // 그리드 헬퍼 (바닥 참고용)
    const gridHelper = new THREE.GridHelper(halfWidth * 2, 40, 0x4facfe, 0x444444);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.y = -halfHeight + 5;
    scene.add(gridHelper);
}

// ==========================================
// 도형 생성 함수들
// ==========================================

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

//햄 도형 생성
function createHamShape() {
    // wholer-ham.obj 파일에서 추출한 정점 데이터 (X, Y만 사용, Z는 무시)
    const vertices = [
        [0.150075, 0.053076], [0.159746, 0.161643], [0.170540, 0.282820],
        [-0.159746, 0.161642], [-0.150075, 0.053076], [-0.170540, 0.282820],
        [-0.043442, -0.109783], [-0.088253, -0.109783], [-0.023418, -0.109783],
        [0.088253, -0.109783], [0.043442, -0.109783], [0.023418, -0.109783],
        [-0.151386, 0.334710], [-0.136432, 0.375220], [0.151386, 0.334710],
        [0.136432, 0.375220], [-0.002096, 0.436820], [0.068216, 0.436820],
        [-0.068216, 0.436820], [-0.090272, 0.416903], [0.090272, 0.416903],
        [-0.111386, -0.048844], [0.111386, -0.048844], [-0.095480, -0.127979],
        [-0.104139, -0.149783], [0.104139, -0.149783], [0.095480, -0.127979],
        [0.081779, -0.370580], [0.064632, -0.346575], [0.030736, -0.299120],
        [-0.026537, -0.190481], [-0.030736, -0.299120], [0.033930, -0.368577],
        [0.051043, -0.392534], [0.000000, -0.321074], [0.026537, -0.190481],
        [-0.064632, -0.346575], [-0.081778, -0.370580], [-0.051043, -0.392534],
        [-0.033930, -0.368577], [-0.066340, -0.381607], [0.066340, -0.381607]
    ];

    // 중심 계산?
    const center = [0, 0];
    vertices.forEach(v => {
        center[0] += v[0];
        center[1] += v[1];
    });
    center[0] /= vertices.length;
    center[1] /= vertices.length;

    // 각도 기준으로 정렬 (외곽선 생성)
    const sortedVertices = vertices.slice().sort((a, b) => {
        const angleA = Math.atan2(a[1] - center[1], a[0] - center[0]);
        const angleB = Math.atan2(b[1] - center[1], b[0] - center[0]);
        return angleA - angleB;
    });

    // 스케일 조정 (크기를 다른 도형과 비슷하게)
    const scale = 200;
    
    const shape = new THREE.Shape();
    const firstPoint = sortedVertices[0];
    shape.moveTo(firstPoint[0] * scale, firstPoint[1] * scale);
    
    for (let i = 1; i < sortedVertices.length; i++) {
        shape.lineTo(sortedVertices[i][0] * scale, sortedVertices[i][1] * scale);
    }
    
    shape.closePath();
    
    return { shape, color: 0xFFA07A }; // 연한 살구색 (햄 색상)
}

// ==========================================
// 물리 속성 함수 (재사용 가능)
// ==========================================

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
 * 메쉬에 초기 속도를 부여
 * @param {Matter.Body} body - Matter.js Body
 * @param {Object} velocity - 속도 벡터 {x, y}
 * @param {Object} angularVelocity - 회전 속도 (선택)
 */
function applyVelocity(body, velocity = { x: 0, y: 0 }, angularVelocity = null) {
    Matter.Body.setVelocity(body, velocity);
    
    if (angularVelocity !== null) {
        Matter.Body.setAngularVelocity(body, angularVelocity);
    }
    
    console.log(`🚀 속도 부여: vx=${velocity.x.toFixed(2)}, vy=${velocity.y.toFixed(2)}`);
}

/**
 * 실제 폴리곤 넓이 계산 (Shoelace Formula)
 * BoundingBox 넓이는 빈 공간을 포함하므로 부정확
 * Shoelace 공식으로 정확한 다각형 면적 계산
 * @param {Array} vertices - 정점 배열 [{x, y}, ...]
 * @returns {number} 실제 면적 (px²)
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
 * @param {Array} vertices - 정점 배열
 * @param {number} maxPoints - 최대 정점 수
 * @returns {Array} 간소화된 정점 배열
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
    
    console.log(`  ✅ 단순화 완료: ${unique.length}개 (${((unique.length/vertices.length)*100).toFixed(1)}% 보존)`);
    
    return unique.length >= 3 ? unique : vertices;
}

/**
 * 잘린 조각에 힘을 가해서 떨어뜨림 (확실한 분리)
 * @param {Matter.Body} body - Matter.js Body
 * @param {string} direction - 'left' 또는 'right'
 */
function applyCutForce(body, direction = 'left') {
    // 방향에 따른 속도 (Matter.js: Y축 아래가 양수)
    const xVelocity = direction === 'left' ? -5 - Math.random() * 3 : 5 + Math.random() * 3;
    const yVelocity = -8 - Math.random() * 4; // 위로 튀어오름 (Y축 음수)
    
    // 속도 직접 설정 (더 확실함)
    Matter.Body.setVelocity(body, {
        x: xVelocity,
        y: yVelocity
    });
    
    // 회전 추가 (더 자연스러운 효과)
    const angularVelocity = (Math.random() - 0.5) * 0.2;
    Matter.Body.setAngularVelocity(body, angularVelocity);
    
    console.log(`✂️ 절단 힘 적용 (${direction}): vx=${xVelocity.toFixed(2)}, vy=${yVelocity.toFixed(2)}`);
}

// ==========================================
// 메쉬 생성 (Matter.js 2D 물리 바디 포함)
// ==========================================

function createMeshFromShape(shapeData, position = { x: 0, y: 0 }, physicsOptions = {}, rootArea = null) {
    const { shape, color } = shapeData;

    // Three.js Geometry 생성 (2D)
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.computeBoundingBox();

    // Three.js Material 생성
    const material = new THREE.MeshStandardMaterial({
        color: color,
        side: THREE.DoubleSide,
        roughness: 0.7,
        metalness: 0.1,
        wireframe: wireframeMode
    });

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
    if (!geometry.boundingBox) {
        geometry.computeBoundingBox();
    }
    const boundingBox = geometry.boundingBox;
    const meshWidth = Math.abs(boundingBox.max.x - boundingBox.min.x);
    const meshHeight = Math.abs(boundingBox.max.y - boundingBox.min.y);
    const meshSize = Math.min(meshWidth, meshHeight);
    
    console.log(`📦 메쉬 크기: ${meshWidth.toFixed(1)}x${meshHeight.toFixed(1)}px`);
    
    // 작은 메쉬일수록 더 큰 패딩 (바닥 통과 방지)
    let PHYSICS_PADDING;
    if (meshSize < 20) {
        PHYSICS_PADDING = 1.25; // 25% 확대 (매우 작은 조각) - 15% → 25%
    } else if (meshSize < 50) {
        PHYSICS_PADDING = 1.15; // 15% 확대 (작은 조각) - 10% → 15%
    } else {
        PHYSICS_PADDING = 1.08; // 8% 확대 (일반) - 5% → 8%
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

function setupEventListeners() {
    // 마우스 다운 (캔버스에서만)
    canvas.addEventListener('mousedown', onMouseDown);

    // 마우스 이동 및 업 (document 레벨)
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // 윈도우 리사이즈
    window.addEventListener('resize', onWindowResize);

    // 도형 선택
    document.getElementById('shapeSelect').addEventListener('change', loadSelectedShape);

    // 줌 (휠)
    canvas.addEventListener('wheel', onWheel, { passive: false });
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
    if (event.button !== 0) return; // 왼쪽 클릭만

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

    if (hasIntersection) {
        startPoint = intersectionPoint.clone();
        isDrawing = true;

        console.log('🎯 절단 시작:', {
            point: `(${startPoint.x.toFixed(1)}, ${startPoint.y.toFixed(1)}, ${startPoint.z.toFixed(3)})`,
            plane: `z=${averageZ.toFixed(3)}`
        });

        infoDiv.className = 'info drawing';
        infoDiv.textContent = '✏️ 드래그하여 절단선을 그으세요... (Matter.js 2D 물리!)';

        // 절단선 헬퍼 생성
        if (cutLineHelper) scene.remove(cutLineHelper);
    }
}

function onMouseMove(event) {
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
    raycaster.ray.intersectPlane(plane, intersectionPoint);

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

function performCut(start, end) {
    console.log('🔪 2D 절단 시작 (Matter.js):', { start, end });

    // 절단 평면 생성 (2D)
    const direction = new THREE.Vector2(end.x - start.x, end.y - start.y).normalize();
    const normal = new THREE.Vector2(-direction.y, direction.x);

    const meshesToCut = [...meshes];

    meshesToCut.forEach(meshData => {
        const { threeMesh, matterBody } = meshData;

        // 메쉬가 절단선과 교차하는지 확인
        const geometry = threeMesh.geometry;
        const positionAttribute = geometry.attributes.position;

        let hasPositive = false;
        let hasNegative = false;

        for (let i = 0; i < positionAttribute.count; i++) {
            const vertex = new THREE.Vector2(
                positionAttribute.getX(i),
                positionAttribute.getY(i)
            );
            
            // 월드 좌표로 변환 (Three.js 좌표계)
            vertex.x += threeMesh.position.x;
            vertex.y += threeMesh.position.y;

            // 점과 선의 거리 계산 (2D)
            const toPoint = new THREE.Vector2(vertex.x - start.x, vertex.y - start.y);
            const distance = toPoint.dot(normal);
            
            if (distance > 0.1) hasPositive = true;
            if (distance < -0.1) hasNegative = true;
        }

        // 양쪽에 정점이 있으면 절단 가능
        if (hasPositive && hasNegative) {
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
        
        // 월드 좌표로 변환
        const v1World = new THREE.Vector2(
            v1Local.x + threeMesh.position.x,
            v1Local.y + threeMesh.position.y
        );
        const v2World = new THREE.Vector2(
            v2Local.x + threeMesh.position.x,
            v2Local.y + threeMesh.position.y
        );
        
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
            
            // 로컬 좌표로 변환
            const intersectionLocal = new THREE.Vector2(
                intersectionWorld.x - threeMesh.position.x,
                intersectionWorld.y - threeMesh.position.y
            );
            
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
    console.log(`   📦 현재 크기: ${currentArea.toFixed(1)}px² (${((currentArea/rootArea)*100).toFixed(1)}% 남음)`);
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
                { shape: shape1, color: getRandomColor() },
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
                { shape: shape2, color: getRandomColor() },
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
    // splitMeshSimple2D에서 이미 올바른 순서로 정점이 들어옴
    const uniqueVertices = [];
    for (let i = 0; i < vertices.length; i++) {
        const current = vertices[i];
        const isUnique = uniqueVertices.every(v => {
            const dx = v.x - current.x;
            const dy = v.y - current.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            return dist > 0.01; // 0.01픽셀 이상 떨어진 정점만
        });
        
        if (isUnique) {
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
 * @param {Array} vertices - 정점 배열
 * @param {number} minAreaThreshold - 최소 면적 (원본의 1/40)
 * @returns {boolean}
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
 * @param {Array} vertices - 정점 배열
 * @param {number} color - 색상
 * @param {THREE.Vector3} basePosition - 기준 위치
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
    
    console.log = function(...args) {
        originalLog.apply(console, args);
        if (debugLogEnabled) {
            addDebugLogLine(args.join(' '), '#0f0');
        }
    };
    
    console.warn = function(...args) {
        originalWarn.apply(console, args);
        if (debugLogEnabled) {
            addDebugLogLine(args.join(' '), '#ff0');
        }
    };
    
    console.error = function(...args) {
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

function loadSelectedShape() {
    const select = document.getElementById('shapeSelect');
    const shapeType = select.value;

    let shapeData;
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
        case 'ham':
            shapeData = createHamShape();
            break;
        default:
            shapeData = createSquareShape();
    }

    // 안전한 위치에서 시작 (위쪽에서 떨어지도록)
    // Y=-100: 화면 위쪽에서 시작 (중력으로 자연스럽게 떨어짐)
    const safeY = -100; // 위쪽 높이 (0 → -100으로 변경)
    
    // 최초 생성이므로 rootArea는 자동으로 현재 area가 됨 (매개변수 생략)
    createMeshFromShape(shapeData, { x: 0, y: safeY });

    infoDiv.textContent = `${shapeType} 도형이 로드되었습니다. 드래그하여 절단하세요. (Matter.js 2D 물리)`;
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
    const aspect = viewWidth / viewHeight;
    const frustumSize = 400;
    camera.left = frustumSize * aspect / -2;
    camera.right = frustumSize * aspect / 2;
    camera.top = frustumSize / 2;
    camera.bottom = frustumSize / -2;
    camera.updateProjectionMatrix();
    
    // 카메라 리셋 시 벽도 재생성
    updateBoundaryWalls();
    
    infoDiv.textContent = '카메라가 리셋되었습니다. (2D)';
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

    // 디버그 물리 시각화 (매 프레임)
    if (debugMode) {
        renderDebugPhysics();
    }

    // 렌더링
    renderer.render(scene, camera);
}

// ==========================================
// 초기화 실행
// ==========================================

window.addEventListener('DOMContentLoaded', init);

