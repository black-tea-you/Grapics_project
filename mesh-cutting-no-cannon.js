// ==========================================
// Three.js 기반 메쉬 커팅 시스템 (커스텀 물리 엔진)
// Cannon.js 없이 직접 구현한 물리 시뮬레이션
// ==========================================

// DOM 요소
const canvas = document.getElementById('canvas');
const infoDiv = document.getElementById('info');
const loadingDiv = document.getElementById('loading');

// Three.js 변수
let scene, camera, renderer, controls;
let raycaster, mouse;

// 커스텀 물리 엔진 설정
const GRAVITY = -30; // 중력 가속도
const GROUND_Y = -100; // 바닥 Y 좌표
const RESTITUTION = 0.4; // 반발 계수
const DAMPING = 0.98; // 감쇠 계수
const ANGULAR_DAMPING = 0.95; // 각속도 감쇠

// 상태 변수
let meshes = []; // { threeMesh, physicsData, userData }
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

// ==========================================
// 커스텀 물리 엔진 클래스
// ==========================================

class PhysicsBody {
    constructor(mesh) {
        this.mesh = mesh;
        
        // 위치 및 회전
        this.position = mesh.position.clone();
        this.rotation = mesh.rotation.clone();
        
        // 선형 운동
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.acceleration = new THREE.Vector3(0, GRAVITY, 0);
        
        // 각운동
        this.angularVelocity = new THREE.Vector3(0, 0, 0);
        this.angularAcceleration = new THREE.Vector3(0, 0, 0);
        
        // 물리 속성
        this.mass = 1;
        this.restitution = RESTITUTION;
        this.damping = DAMPING;
        this.angularDamping = ANGULAR_DAMPING;
        
        // 바운딩 박스
        this.updateBoundingBox();
    }
    
    updateBoundingBox() {
        if (!this.mesh.geometry.boundingBox) {
            this.mesh.geometry.computeBoundingBox();
        }
        this.boundingBox = this.mesh.geometry.boundingBox.clone();
    }
    
    applyForce(force, point) {
        // F = ma => a = F/m
        const acceleration = force.clone().divideScalar(this.mass);
        this.acceleration.add(acceleration);
        
        // 토크 계산 (회전력)
        if (point) {
            const torque = point.clone().cross(force);
            const angularAccel = torque.divideScalar(this.mass * 10); // 관성 모멘트 간소화
            this.angularAcceleration.add(angularAccel);
        }
    }
    
    applyImpulse(impulse, point) {
        // 충격량: 즉각적인 속도 변화
        const deltaV = impulse.clone().divideScalar(this.mass);
        this.velocity.add(deltaV);
        
        // 각운동량 변화
        if (point) {
            const angularImpulse = point.clone().cross(impulse);
            const deltaAngularV = angularImpulse.divideScalar(this.mass * 10);
            this.angularVelocity.add(deltaAngularV);
        }
    }
    
    update(deltaTime) {
        // 속도 업데이트 (v = v0 + a*dt)
        this.velocity.add(
            this.acceleration.clone().multiplyScalar(deltaTime)
        );
        
        // 위치 업데이트 (p = p0 + v*dt)
        this.position.add(
            this.velocity.clone().multiplyScalar(deltaTime)
        );
        
        // 각속도 업데이트
        this.angularVelocity.add(
            this.angularAcceleration.clone().multiplyScalar(deltaTime)
        );
        
        // 회전 업데이트 (오일러 각도)
        this.rotation.x += this.angularVelocity.x * deltaTime;
        this.rotation.y += this.angularVelocity.y * deltaTime;
        this.rotation.z += this.angularVelocity.z * deltaTime;
        
        // 감쇠 적용
        this.velocity.multiplyScalar(this.damping);
        this.angularVelocity.multiplyScalar(this.angularDamping);
        
        // 가속도 초기화 (매 프레임 새로 계산)
        this.acceleration.set(0, GRAVITY, 0);
        this.angularAcceleration.set(0, 0, 0);
        
        // 메쉬 위치 동기화
        this.mesh.position.copy(this.position);
        this.mesh.rotation.copy(this.rotation);
        
        // 충돌 감지 및 처리
        this.checkCollisions();
    }
    
    checkCollisions() {
        // 바닥과의 충돌
        const minY = this.position.y + this.boundingBox.min.y;
        
        if (minY < GROUND_Y) {
            // 위치 보정
            this.position.y = GROUND_Y - this.boundingBox.min.y;
            this.mesh.position.y = this.position.y;
            
            // 속도 반전 (반발)
            if (this.velocity.y < 0) {
                this.velocity.y = -this.velocity.y * this.restitution;
                
                // 매우 작은 속도는 0으로 (바닥에 정지)
                if (Math.abs(this.velocity.y) < 0.5) {
                    this.velocity.y = 0;
                    this.velocity.x *= 0.9; // 마찰
                    this.velocity.z *= 0.9;
                }
            }
            
            // 각속도 감쇠 (바닥 충돌 시)
            this.angularVelocity.multiplyScalar(0.8);
        }
    }
}

// ==========================================
// 초기화
// ==========================================

function init() {
    console.log('🚀 Three.js 초기화 시작... (커스텀 물리 엔진)');
    const initStartTime = performance.now();
    
    // Scene 생성
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 100, 500);
    
    // Camera 생성
    const aspect = canvas.clientWidth / canvas.clientHeight;
    camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    camera.position.set(0, 0, 300);
    camera.lookAt(0, 0, 0);
    
    // Renderer 생성
    renderer = new THREE.WebGLRenderer({ 
        canvas: canvas,
        antialias: true,
        alpha: false
    });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // OrbitControls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 50;
    controls.maxDistance = 500;
    controls.enablePan = false; // Pan 기능 비활성화 (앞뒤 이동 제거)
    controls.mouseButtons = {
        LEFT: null, // 왼쪽 클릭은 절단용으로 사용
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE
    };
    
    // Raycaster (마우스 피킹용)
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    
    // 조명 설정
    setupLights();
    
    // 바닥 생성
    createGround();
    
    // 이벤트 리스너
    setupEventListeners();
    
    // 초기 도형 로드
    loadSelectedShape();
    
    // 애니메이션 시작
    animate();
    
    // 로딩 완료
    const initTime = ((performance.now() - initStartTime) / 1000).toFixed(2);
    console.log(`✅ Three.js 초기화 완료: ${initTime}초 (커스텀 물리 엔진)`);
    
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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    // Directional Light (태양광)
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 500;
    dirLight.shadow.camera.left = -200;
    dirLight.shadow.camera.right = 200;
    dirLight.shadow.camera.top = 200;
    dirLight.shadow.camera.bottom = -200;
    scene.add(dirLight);
    
    // Hemisphere Light
    const hemiLight = new THREE.HemisphereLight(0x667eea, 0x764ba2, 0.4);
    scene.add(hemiLight);
}

// ==========================================
// 바닥 생성
// ==========================================

function createGround() {
    // Three.js 바닥
    const groundGeometry = new THREE.PlaneGeometry(400, 400);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x2c3e50,
        roughness: 0.8,
        metalness: 0.2
    });
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = GROUND_Y;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);
    
    // 그리드 헬퍼
    const gridHelper = new THREE.GridHelper(400, 40, 0x667eea, 0x444444);
    gridHelper.position.y = GROUND_Y + 0.1;
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
    
    // Shape 생성
    const shape = createShapeFromSVGPath(svgPath);
    
    // 스케일 및 중심 조정
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

function createTriangleShape() {
    const shape = new THREE.Shape();
    const size = 50;
    shape.moveTo(0, -size);
    shape.lineTo(-size * 0.866, size * 0.5);
    shape.lineTo(size * 0.866, size * 0.5);
    shape.lineTo(0, -size);
    return { shape, color: 0x4ECDC4 };
}

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

function createCircleShape() {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 50, 0, Math.PI * 2, false);
    return { shape, color: 0xF38181 };
}

// ==========================================
// 메쉬 생성 (커스텀 물리 적용)
// ==========================================

function createMeshFromShape(shapeData, position = { x: 0, y: 0, z: 0 }) {
    const { shape, color } = shapeData;
    
    // Geometry 생성
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.computeBoundingBox();
    
    // Material 생성
    const material = new THREE.MeshStandardMaterial({
        color: color,
        side: THREE.DoubleSide,
        roughness: 0.7,
        metalness: 0.1,
        wireframe: wireframeMode // 현재 와이어프레임 모드 적용
    });
    
    // Mesh 생성
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position.x, position.y, position.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    
    // 커스텀 물리 바디 생성
    const physicsBody = new PhysicsBody(mesh);
    
    // 메쉬 정보 저장
    const meshData = {
        threeMesh: mesh,
        physicsBody: physicsBody,
        originalColor: color,
        userData: {
            vertices: geometry.attributes.position.count,
            triangles: geometry.attributes.position.count / 3
        }
    };
    
    meshes.push(meshData);
    updateStats();
    
    return meshData;
}

// ==========================================
// 이벤트 리스너
// ==========================================

function setupEventListeners() {
    // 마우스 다운 (캔버스에서만)
    canvas.addEventListener('mousedown', onMouseDown);
    
    // 마우스 이동 및 업 (document 레벨 - 무한 드래그)
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    
    // 윈도우 리사이즈
    window.addEventListener('resize', onWindowResize);
    
    // 도형 선택
    document.getElementById('shapeSelect').addEventListener('change', loadSelectedShape);
}

function onMouseDown(event) {
    if (event.button !== 0) return; // 왼쪽 클릭만
    
    // 마우스 좌표를 NDC로 변환
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Raycasting - Z=0 평면과의 교차점 사용 (외부에서도 시작 가능!)
    raycaster.setFromCamera(mouse, camera);
    
    // Z=0 평면 생성
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersectionPoint = new THREE.Vector3();
    
    // Ray와 평면의 교차점 계산
    const hasIntersection = raycaster.ray.intersectPlane(plane, intersectionPoint);
    
    if (hasIntersection) {
        startPoint = intersectionPoint.clone();
        isDrawing = true;
        
        console.log('🎯 절단 시작점 (외부 가능):', startPoint);
        
        infoDiv.className = 'info drawing';
        infoDiv.textContent = '✏️ 드래그하여 절단선을 그으세요... (어디서든 시작 가능!)';
        
        // 절단선 헬퍼 생성
        if (cutLineHelper) scene.remove(cutLineHelper);
    }
}

function onMouseMove(event) {
    if (!isDrawing) return;
    
    const rect = canvas.getBoundingClientRect();
    
    // 캔버스 영역을 벗어나도 추적 (무한 드래그)
    let mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    let mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // 범위 제한 없음 (캔버스 밖으로도 가능)
    mouse.x = mouseX;
    mouse.y = mouseY;
    
    raycaster.setFromCamera(mouse, camera);
    
    // 절단 평면 (Z=0)에 ray 투사
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersectionPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersectionPoint);
    
    if (intersectionPoint && startPoint) {
        endPoint = intersectionPoint.clone();
        
        console.log('🎯 절단 끝점:', endPoint);
        
        // 절단선 시각화 - 기존 것 제거
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
        
        // 시작점과 끝점 시각화 (원)
        const startSphere = new THREE.Mesh(
            new THREE.SphereGeometry(2, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0x00ff00 })
        );
        startSphere.position.copy(startPoint);
        
        const endSphere = new THREE.Mesh(
            new THREE.SphereGeometry(2, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xff0000 })
        );
        endSphere.position.copy(endPoint);
        
        // 그룹으로 관리
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
        // 시작/끝점 구체도 제거
        if (cutLineHelper.userData.spheres) {
            cutLineHelper.userData.spheres.forEach(sphere => scene.remove(sphere));
        }
        cutLineHelper = null;
    }
    
    startPoint = null;
    endPoint = null;
    
    infoDiv.className = 'info';
    infoDiv.textContent = `메쉬 절단 완료! 현재 조각: ${meshes.length}개`;
}

function onWindowResize() {
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
}

// ==========================================
// 메쉬 절단 로직
// ==========================================

function performCut(start, end) {
    console.log('🔪 절단 시작:', { start, end });
    
    // 절단 평면 생성 (2D이므로 Z축 방향)
    const direction = new THREE.Vector3()
        .subVectors(end, start)
        .normalize();
    
    const normal = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
    const cutPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, start);
    
    const meshesToCut = [...meshes];
    
    meshesToCut.forEach(meshData => {
        const { threeMesh, physicsBody } = meshData;
        
        // 메쉬가 절단선과 교차하는지 확인
        const geometry = threeMesh.geometry;
        const positionAttribute = geometry.attributes.position;
        
        let hasPositive = false;
        let hasNegative = false;
        
        for (let i = 0; i < positionAttribute.count; i++) {
            const vertex = new THREE.Vector3(
                positionAttribute.getX(i),
                positionAttribute.getY(i),
                positionAttribute.getZ(i)
            );
            vertex.applyMatrix4(threeMesh.matrixWorld);
            
            const distance = cutPlane.distanceToPoint(vertex);
            if (distance > 0.1) hasPositive = true;
            if (distance < -0.1) hasNegative = true;
        }
        
        // 양쪽에 정점이 있으면 절단 가능
        if (hasPositive && hasNegative) {
            console.log('✅ 메쉬 절단 가능');
            
            // 기존 메쉬 제거
            scene.remove(threeMesh);
            const index = meshes.indexOf(meshData);
            if (index > -1) meshes.splice(index, 1);
            
            // 간단한 분할 (2개로)
            splitMeshSimple(meshData, cutPlane, start, end);
        }
    });
    
    updateStats();
}

function splitMeshSimple(meshData, cutPlane, start, end) {
    const { threeMesh, originalColor } = meshData;
    const geometry = threeMesh.geometry;
    
    // 정점 분류 (World Space로 변환)
    const positionAttribute = geometry.attributes.position;
    const posVertices = [];
    const negVertices = [];
    
    // 1단계: 모든 정점 분류
    const vertexList = [];
    for (let i = 0; i < positionAttribute.count; i++) {
        const vertex = new THREE.Vector3(
            positionAttribute.getX(i),
            positionAttribute.getY(i),
            positionAttribute.getZ(i)
        );
        
        // World space로 변환
        const worldVertex = vertex.clone().applyMatrix4(threeMesh.matrixWorld);
        const distance = cutPlane.distanceToPoint(worldVertex);
        
        vertexList.push({ local: vertex, world: worldVertex, distance: distance });
        
        if (distance >= 0) {
            posVertices.push(vertex);
        } else {
            negVertices.push(vertex);
        }
    }
    
    // 2단계: 삼각형 단위로 교차점 계산 (더 정확함)
    const intersectionPoints = [];
    for (let i = 0; i < positionAttribute.count; i += 3) {
        if (i + 2 >= positionAttribute.count) break;
        
        // 삼각형의 3개 정점
        const indices = [i, i + 1, i + 2];
        
        // 삼각형의 각 엣지 체크
        for (let j = 0; j < 3; j++) {
            const idx1 = indices[j];
            const idx2 = indices[(j + 1) % 3]; // 마지막 엣지도 체크 (2 -> 0)
            
            const v1Data = vertexList[idx1];
            const v2Data = vertexList[idx2];
            
            const d1 = v1Data.distance;
            const d2 = v2Data.distance;
            
            // 선분이 평면과 교차 (부호가 다름)
            if ((d1 > 0.01 && d2 < -0.01) || (d1 < -0.01 && d2 > 0.01)) {
                const t = Math.abs(d1) / (Math.abs(d1) + Math.abs(d2));
                const intersection = v1Data.local.clone().lerp(v2Data.local, t);
                
                // 중복 체크 (같은 위치의 교차점 방지)
                let isDuplicate = false;
                for (const existing of intersectionPoints) {
                    if (existing.distanceTo(intersection) < 0.01) {
                        isDuplicate = true;
                        break;
                    }
                }
                
                if (!isDuplicate) {
                    intersectionPoints.push(intersection);
                    posVertices.push(intersection);
                    negVertices.push(intersection);
                }
            }
        }
    }
    
    console.log(`✂️ 분할 결과: Pos=${posVertices.length}, Neg=${negVertices.length}, 교차점=${intersectionPoints.length}`);
    
    // 3단계: 정점이 충분하면 새 Shape 생성
    if (posVertices.length >= 3) {
        const shape1 = createShapeFromVertices(posVertices);
        
        // Shape이 유효한지 체크 (면적이 0이 아닌지)
        if (isValidShape(shape1)) {
            const mesh1 = createMeshFromShape(
                { shape: shape1, color: getRandomColor() },
                threeMesh.position.clone()
            );
            // 임펄스 적용 (커스텀 물리) - 왼쪽으로
            const impulse = new THREE.Vector3(-8 + Math.random() * 3, 8, 0);
            mesh1.physicsBody.applyImpulse(impulse, new THREE.Vector3(0, 0, 0));
            console.log('✅ 왼쪽 조각 생성 (Pos)');
        } else {
            console.warn('⚠️ 왼쪽 조각이 유효하지 않음 (면적 0)');
        }
    } else {
        console.warn(`⚠️ 왼쪽 조각 생성 실패: 정점 ${posVertices.length}개 (최소 3개 필요)`);
    }
    
    if (negVertices.length >= 3) {
        const shape2 = createShapeFromVertices(negVertices);
        
        // Shape이 유효한지 체크
        if (isValidShape(shape2)) {
            const mesh2 = createMeshFromShape(
                { shape: shape2, color: getRandomColor() },
                threeMesh.position.clone()
            );
            // 임펄스 적용 (커스텀 물리) - 오른쪽으로
            const impulse = new THREE.Vector3(8 + Math.random() * 3, 8, 0);
            mesh2.physicsBody.applyImpulse(impulse, new THREE.Vector3(0, 0, 0));
            console.log('✅ 오른쪽 조각 생성 (Neg)');
        } else {
            console.warn('⚠️ 오른쪽 조각이 유효하지 않음 (면적 0)');
        }
    } else {
        console.warn(`⚠️ 오른쪽 조각 생성 실패: 정점 ${negVertices.length}개 (최소 3개 필요)`);
    }
}

// Shape이 유효한지 체크하는 헬퍼 함수
function isValidShape(shape) {
    if (!shape || !shape.curves || shape.curves.length === 0) {
        return false;
    }
    
    // 면적 계산 (Shoelace formula)
    const points = shape.getPoints(20);
    if (points.length < 3) return false;
    
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    area = Math.abs(area) / 2;
    
    // 면적이 매우 작으면 유효하지 않음
    return area > 0.1;
}

function createShapeFromVertices(vertices) {
    if (vertices.length === 0) return new THREE.Shape();
    
    // 2D 투영 (Z축 무시) 및 중복 제거
    const points2D = [];
    const threshold = 0.01; // 중복 판단 거리
    
    for (const v of vertices) {
        const point = new THREE.Vector2(v.x, v.y);
        
        // 중복 체크
        let isDuplicate = false;
        for (const existing of points2D) {
            if (existing.distanceTo(point) < threshold) {
                isDuplicate = true;
                break;
            }
        }
        
        if (!isDuplicate) {
            points2D.push(point);
        }
    }
    
    console.log(`📊 정점 중복 제거: ${vertices.length} -> ${points2D.length}`);
    
    if (points2D.length < 3) {
        console.warn('⚠️ 유효한 정점이 3개 미만:', points2D.length);
        return new THREE.Shape();
    }
    
    // 중심점 계산
    const center = new THREE.Vector2();
    points2D.forEach(p => center.add(p));
    center.divideScalar(points2D.length);
    
    // 중심점으로부터의 각도로 정렬 (반시계방향)
    points2D.sort((a, b) => {
        const angleA = Math.atan2(a.y - center.y, a.x - center.x);
        const angleB = Math.atan2(b.y - center.y, b.x - center.x);
        return angleA - angleB;
    });
    
    // Shape 생성
    const shape = new THREE.Shape();
    shape.moveTo(points2D[0].x, points2D[0].y);
    
    for (let i = 1; i < points2D.length; i++) {
        shape.lineTo(points2D[i].x, points2D[i].y);
    }
    
    shape.closePath();
    
    console.log(`✅ Shape 생성 완료: ${points2D.length}개 정점`);
    
    return shape;
}

function getRandomColor() {
    const hue = Math.random() * 360;
    return new THREE.Color().setHSL(hue / 360, 0.7, 0.6).getHex();
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
        default:
            shapeData = createSquareShape();
    }
    
    // 위에서 시작해서 아래로 떨어지도록 초기 위치 설정
    createMeshFromShape(shapeData, { x: 0, y: 50, z: 0 });
    
    infoDiv.textContent = `${shapeType} 도형이 로드되었습니다. 드래그하여 절단하세요.`;
}

function resetScene() {
    // 모든 메쉬 제거
    meshes.forEach(meshData => {
        scene.remove(meshData.threeMesh);
        // geometry와 material 해제
        if (meshData.threeMesh.geometry) meshData.threeMesh.geometry.dispose();
        if (meshData.threeMesh.material) meshData.threeMesh.material.dispose();
    });
    meshes = [];
    
    // 초기 도형 로드
    loadSelectedShape();
    
    infoDiv.textContent = '씬이 초기화되었습니다.';
    updateStats();
}

function clearAllMeshes() {
    // 모든 메쉬만 제거 (새 도형 로드 안 함)
    meshes.forEach(meshData => {
        scene.remove(meshData.threeMesh);
        // geometry와 material 해제
        if (meshData.threeMesh.geometry) meshData.threeMesh.geometry.dispose();
        if (meshData.threeMesh.material) meshData.threeMesh.material.dispose();
    });
    meshes = [];
    
    infoDiv.textContent = '모든 도형이 제거되었습니다. 새 도형을 불러오세요.';
    updateStats();
    
    console.log('🗑️ 모든 메쉬 제거 완료');
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
        infoDiv.textContent = '와이어프레임 모드 활성화 - 메쉬의 내부 구조를 볼 수 있습니다';
        console.log('🔍 와이어프레임 모드 ON');
    } else {
        btn.classList.remove('active');
        btn.textContent = '🔍 와이어프레임';
        infoDiv.textContent = '일반 모드';
        console.log('🔍 와이어프레임 모드 OFF');
    }
}

function resetCamera() {
    camera.position.set(0, 0, 300);
    camera.lookAt(0, 0, 0);
    controls.reset();
    infoDiv.textContent = '카메라가 리셋되었습니다.';
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
// 애니메이션 루프 (커스텀 물리 업데이트)
// ==========================================

let lastUpdateTime = performance.now();

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
    
    // 델타 타임 계산
    const deltaTime = Math.min((currentTime - lastUpdateTime) / 1000, 0.1); // 최대 0.1초
    lastUpdateTime = currentTime;
    
    // 커스텀 물리 업데이트
    meshes.forEach(meshData => {
        meshData.physicsBody.update(deltaTime);
    });
    
    // Controls 업데이트
    controls.update();
    
    // 렌더링
    renderer.render(scene, camera);
}

// ==========================================
// 초기화 실행
// ==========================================

window.addEventListener('DOMContentLoaded', init);

