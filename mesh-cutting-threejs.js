// ==========================================
// Three.js + Cannon.js 기반 메쉬 커팅 시스템
// ==========================================

// DOM 요소
const canvas = document.getElementById('canvas');
const infoDiv = document.getElementById('info');
const loadingDiv = document.getElementById('loading');

// Three.js 변수
let scene, camera, renderer, controls;
let raycaster, mouse;

// Cannon.js 변수
let world;
let groundBody;

// 상태 변수
let meshes = []; // { threeMesh, cannonBody, userData }
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
// 초기화
// ==========================================

function init() {
    console.log('🚀 Three.js 초기화 시작...');
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
    
    // Cannon.js World 설정
    setupPhysics();
    
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
    console.log(`✅ Three.js 초기화 완료: ${initTime}초`);
    
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
// 물리 엔진 설정
// ==========================================

function setupPhysics() {
    world = new CANNON.World();
    world.gravity.set(0, -30, 0); // 중력
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 10;
    world.defaultContactMaterial.restitution = 0.3; // 반발 계수
}

// ==========================================
// 바닥 생성
// ==========================================

function createGround() {
    const groundY = -100;
    
    // Three.js 바닥
    const groundGeometry = new THREE.PlaneGeometry(400, 400);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x2c3e50,
        roughness: 0.8,
        metalness: 0.2
    });
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = groundY;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);
    
    // Cannon.js 바닥
    const groundShape = new CANNON.Plane();
    groundBody = new CANNON.Body({ 
        mass: 0, // 정적 객체
        shape: groundShape
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    groundBody.position.y = groundY;
    world.addBody(groundBody);
    
    // 그리드 헬퍼
    const gridHelper = new THREE.GridHelper(400, 40, 0x667eea, 0x444444);
    gridHelper.position.y = groundY + 0.1;
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
// 메쉬 생성
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
        metalness: 0.1
    });
    
    // Mesh 생성
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position.x, position.y, position.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    
    // 물리 바디 생성
    const vertices = [];
    const positionAttribute = geometry.attributes.position;
    for (let i = 0; i < positionAttribute.count; i++) {
        vertices.push(new CANNON.Vec3(
            positionAttribute.getX(i),
            positionAttribute.getY(i),
            0
        ));
    }
    
    // ConvexPolyhedron으로 근사
    const faces = [];
    for (let i = 0; i < positionAttribute.count; i += 3) {
        faces.push([i, i + 1, i + 2]);
    }
    
    let cannonShape;
    try {
        cannonShape = new CANNON.ConvexPolyhedron({ vertices, faces });
    } catch (e) {
        // 복잡한 형태는 Box로 근사
        const box = geometry.boundingBox;
        const sizeX = (box.max.x - box.min.x) / 2;
        const sizeY = (box.max.y - box.min.y) / 2;
        cannonShape = new CANNON.Box(new CANNON.Vec3(sizeX, sizeY, 1));
    }
    
    const body = new CANNON.Body({
        mass: 1,
        shape: cannonShape,
        position: new CANNON.Vec3(position.x, position.y, position.z),
        linearDamping: 0.3,
        angularDamping: 0.3
    });
    world.addBody(body);
    
    // 메쉬 정보 저장
    const meshData = {
        threeMesh: mesh,
        cannonBody: body,
        originalColor: color,
        userData: {
            vertices: vertices.length,
            triangles: positionAttribute.count / 3
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
    // 마우스 다운
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    
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
    
    // Raycasting
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    
    if (intersects.length > 0) {
        const point = intersects[0].point;
        startPoint = point.clone();
        isDrawing = true;
        
        infoDiv.className = 'info drawing';
        infoDiv.textContent = '드래그 중... 마우스를 놓으면 절단됩니다';
        
        // 절단선 헬퍼 생성
        if (cutLineHelper) scene.remove(cutLineHelper);
    }
}

function onMouseMove(event) {
    if (!isDrawing) return;
    
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    
    if (intersects.length > 0 && startPoint) {
        endPoint = intersects[0].point.clone();
        
        // 절단선 시각화
        if (cutLineHelper) scene.remove(cutLineHelper);
        
        const points = [startPoint, endPoint];
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const lineMaterial = new THREE.LineBasicMaterial({ 
            color: 0xff0000, 
            linewidth: 3 
        });
        cutLineHelper = new THREE.Line(lineGeometry, lineMaterial);
        scene.add(cutLineHelper);
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
        const { threeMesh, cannonBody } = meshData;
        
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
            world.removeBody(cannonBody);
            const index = meshes.indexOf(meshData);
            if (index > -1) meshes.splice(index, 1);
            
            // 간단한 분할 (2개로)
            // 실제로는 더 복잡한 CSG 알고리즘 필요
            splitMeshSimple(meshData, cutPlane, start, end);
        }
    });
    
    updateStats();
}

function splitMeshSimple(meshData, cutPlane, start, end) {
    const { threeMesh, originalColor } = meshData;
    const geometry = threeMesh.geometry;
    
    // 정점 분류
    const positionAttribute = geometry.attributes.position;
    const posVertices = [];
    const negVertices = [];
    
    for (let i = 0; i < positionAttribute.count; i++) {
        const vertex = new THREE.Vector3(
            positionAttribute.getX(i),
            positionAttribute.getY(i),
            positionAttribute.getZ(i)
        );
        
        const distance = cutPlane.distanceToPoint(vertex);
        
        if (distance >= 0) {
            posVertices.push(vertex);
        } else {
            negVertices.push(vertex);
        }
    }
    
    // 교차점 계산 및 추가
    const intersectionPoints = [];
    for (let i = 0; i < positionAttribute.count - 1; i++) {
        const v1 = new THREE.Vector3(
            positionAttribute.getX(i),
            positionAttribute.getY(i),
            positionAttribute.getZ(i)
        );
        const v2 = new THREE.Vector3(
            positionAttribute.getX(i + 1),
            positionAttribute.getY(i + 1),
            positionAttribute.getZ(i + 1)
        );
        
        const d1 = cutPlane.distanceToPoint(v1);
        const d2 = cutPlane.distanceToPoint(v2);
        
        // 선분이 평면과 교차
        if ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) {
            const t = Math.abs(d1) / (Math.abs(d1) + Math.abs(d2));
            const intersection = v1.clone().lerp(v2, t);
            intersectionPoints.push(intersection);
            posVertices.push(intersection);
            negVertices.push(intersection);
        }
    }
    
    console.log(`분할 결과: ${posVertices.length} + ${negVertices.length} 정점`);
    
    // 새 Shape 생성 (간소화)
    if (posVertices.length >= 3) {
        const shape1 = createShapeFromVertices(posVertices);
        const mesh1 = createMeshFromShape(
            { shape: shape1, color: getRandomColor() },
            threeMesh.position.clone()
        );
        // 임펄스 적용
        mesh1.cannonBody.applyImpulse(
            new CANNON.Vec3(-5 + Math.random() * 2, 5, 0),
            new CANNON.Vec3(0, 0, 0)
        );
    }
    
    if (negVertices.length >= 3) {
        const shape2 = createShapeFromVertices(negVertices);
        const mesh2 = createMeshFromShape(
            { shape: shape2, color: getRandomColor() },
            threeMesh.position.clone()
        );
        // 임펄스 적용
        mesh2.cannonBody.applyImpulse(
            new CANNON.Vec3(5 + Math.random() * 2, 5, 0),
            new CANNON.Vec3(0, 0, 0)
        );
    }
}

function createShapeFromVertices(vertices) {
    if (vertices.length === 0) return new THREE.Shape();
    
    // 2D 투영 (Z축 무시)
    const points2D = vertices.map(v => new THREE.Vector2(v.x, v.y));
    
    // Convex Hull (간단히 정렬로 대체)
    const center = new THREE.Vector2();
    points2D.forEach(p => center.add(p));
    center.divideScalar(points2D.length);
    
    points2D.sort((a, b) => {
        const angleA = Math.atan2(a.y - center.y, a.x - center.x);
        const angleB = Math.atan2(b.y - center.y, b.x - center.x);
        return angleA - angleB;
    });
    
    const shape = new THREE.Shape();
    shape.moveTo(points2D[0].x, points2D[0].y);
    for (let i = 1; i < points2D.length; i++) {
        shape.lineTo(points2D[i].x, points2D[i].y);
    }
    shape.closePath();
    
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
    
    createMeshFromShape(shapeData);
    
    infoDiv.textContent = `${shapeType} 도형이 로드되었습니다. 드래그하여 절단하세요.`;
}

function resetScene() {
    // 모든 메쉬 제거
    meshes.forEach(meshData => {
        scene.remove(meshData.threeMesh);
        world.removeBody(meshData.cannonBody);
    });
    meshes = [];
    
    // 초기 도형 로드
    loadSelectedShape();
    
    infoDiv.textContent = '씬이 초기화되었습니다.';
    updateStats();
}

function toggleWireframe() {
    wireframeMode = !wireframeMode;
    
    const btn = document.querySelector('.btn-wireframe');
    meshes.forEach(meshData => {
        meshData.threeMesh.material.wireframe = wireframeMode;
    });
    
    if (wireframeMode) {
        btn.classList.add('active');
        btn.textContent = '🔍 와이어프레임 ON';
        infoDiv.textContent = '와이어프레임 모드 활성화';
    } else {
        btn.classList.remove('active');
        btn.textContent = '🔍 와이어프레임';
        infoDiv.textContent = '일반 모드';
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
    
    document.getElementById('drawCalls').textContent = renderer.info.render.calls;
}

// ==========================================
// 애니메이션 루프
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
    
    // 물리 업데이트
    world.step(1 / 60);
    
    // Three.js 메쉬를 Cannon.js 위치와 동기화
    meshes.forEach(meshData => {
        meshData.threeMesh.position.copy(meshData.cannonBody.position);
        meshData.threeMesh.quaternion.copy(meshData.cannonBody.quaternion);
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

