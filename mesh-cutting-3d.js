// ==========================================
// Three.js + Cannon.js 기반 3D 메쉬 커팅 시스템
// ExtrudeGeometry를 사용한 진짜 3D 메시!
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

// 3D 설정
const EXTRUDE_DEPTH = 10; // 3D 깊이

// ==========================================
// 초기화
// ==========================================

function init() {
    console.log('🎁 Three.js + Cannon.js 3D 버전 초기화 시작...');
    const initStartTime = performance.now();
    
    // Scene 생성
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 100, 500);
    
    // Camera 생성
    const aspect = canvas.clientWidth / canvas.clientHeight;
    camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    camera.position.set(100, 100, 300); // 3D 뷰를 위해 위치 조정
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
    controls.enablePan = false;
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
    console.log(`✅ Three.js + Cannon.js 3D 초기화 완료: ${initTime}초`);
    
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
    const hemiLight = new THREE.HemisphereLight(0xf093fb, 0xf5576c, 0.4);
    scene.add(hemiLight);
    
    // Point Light (추가 조명 - 3D 효과 강조)
    const pointLight = new THREE.PointLight(0xffffff, 0.5);
    pointLight.position.set(-50, 50, 50);
    scene.add(pointLight);
}

// ==========================================
// Cannon.js 물리 엔진 설정 (3D용)
// ==========================================

function setupPhysics() {
    console.log('⚙️ Cannon.js 3D 물리 엔진 초기화...');
    
    // World 생성
    world = new CANNON.World();
    
    // 중력 설정 (Y축 -30)
    world.gravity.set(0, -30, 0);
    
    // Broadphase 알고리즘
    world.broadphase = new CANNON.NaiveBroadphase();
    
    // Solver 설정
    world.solver.iterations = 10;
    
    // 기본 재질 설정
    world.defaultContactMaterial.restitution = 0.4;
    world.defaultContactMaterial.friction = 0.3;
    
    console.log('✅ Cannon.js 3D 물리 엔진 초기화 완료');
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
        mass: 0,
        shape: groundShape,
        material: new CANNON.Material({ friction: 0.3, restitution: 0.3 })
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    groundBody.position.y = groundY;
    world.addBody(groundBody);
    
    console.log('🏗️ 바닥 생성 완료 (3D Cannon.js)');
    
    // 그리드 헬퍼
    const gridHelper = new THREE.GridHelper(400, 40, 0xf093fb, 0x444444);
    gridHelper.position.y = groundY + 0.1;
    scene.add(gridHelper);
}

// ==========================================
// 도형 생성 함수들
// ==========================================

function createLeafShape() {
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
// 3D 메쉬 생성 (ExtrudeGeometry 사용!)
// ==========================================

function createMeshFromShape(shapeData, position = { x: 0, y: 0, z: 0 }) {
    const { shape, color } = shapeData;
    
    // ExtrudeGeometry 생성 (3D!)
    const extrudeSettings = {
        depth: EXTRUDE_DEPTH,
        bevelEnabled: true,
        bevelThickness: 1,
        bevelSize: 0.5,
        bevelSegments: 3
    };
    
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.computeBoundingBox();
    
    // 중심 맞추기 (Z축 중심)
    geometry.translate(0, 0, -EXTRUDE_DEPTH / 2);
    
    // Material 생성
    const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.7,
        metalness: 0.1,
        wireframe: wireframeMode
    });
    
    // Mesh 생성
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position.x, position.y, position.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    
    // Cannon.js 물리 바디 생성 (Box로 근사)
    const box = geometry.boundingBox;
    const sizeX = (box.max.x - box.min.x) / 2;
    const sizeY = (box.max.y - box.min.y) / 2;
    const sizeZ = (box.max.z - box.min.z) / 2;
    
    const cannonShape = new CANNON.Box(new CANNON.Vec3(sizeX, sizeY, sizeZ));
    
    // Cannon.js Body 생성 (3D 회전 허용!)
    const body = new CANNON.Body({
        mass: 1,
        shape: cannonShape,
        position: new CANNON.Vec3(position.x, position.y, position.z),
        linearDamping: 0.3,
        angularDamping: 0.5 // 3D 회전용
    });
    
    world.addBody(body);
    
    // 메쉬 데이터 저장
    const meshData = {
        threeMesh: mesh,
        cannonBody: body,
        originalColor: color,
        userData: {
            vertices: geometry.attributes.position.count,
            triangles: geometry.attributes.position.count / 3
        }
    };
    
    meshes.push(meshData);
    updateStats();
    
    console.log(`✅ 3D 메쉬 생성: ${geometry.attributes.position.count}개 정점, 깊이=${EXTRUDE_DEPTH}`);
    
    return meshData;
}

// ==========================================
// 이벤트 리스너
// ==========================================

function setupEventListeners() {
    canvas.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    window.addEventListener('resize', onWindowResize);
    document.getElementById('shapeSelect').addEventListener('change', loadSelectedShape);
}

function onMouseDown(event) {
    if (event.button !== 0) return;
    
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersectionPoint = new THREE.Vector3();
    
    const hasIntersection = raycaster.ray.intersectPlane(plane, intersectionPoint);
    
    if (hasIntersection) {
        startPoint = intersectionPoint.clone();
        isDrawing = true;
        
        console.log('🎯 3D 절단 시작점:', startPoint);
        
        infoDiv.className = 'info drawing';
        infoDiv.textContent = '✏️ 드래그하여 3D 메쉬를 절단하세요...';
        
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
    
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersectionPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersectionPoint);
    
    if (intersectionPoint && startPoint) {
        endPoint = intersectionPoint.clone();
        
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
    infoDiv.textContent = `3D 메쉬 절단 완료! 현재 조각: ${meshes.length}개`;
}

function onWindowResize() {
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
}

// ==========================================
// 메쉬 절단 로직 (3D에서도 2D 평면 기준 절단)
// ==========================================

function performCut(start, end) {
    console.log('🔪 3D 절단 시작:', { start, end });
    
    const direction = new THREE.Vector3()
        .subVectors(end, start)
        .normalize();
    
    const normal = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
    const cutPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, start);
    
    const meshesToCut = [...meshes];
    
    meshesToCut.forEach(meshData => {
        const { threeMesh, cannonBody } = meshData;
        
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
        
        if (hasPositive && hasNegative) {
            console.log('✅ 3D 메쉬 절단 가능');
            
            scene.remove(threeMesh);
            world.removeBody(cannonBody);
            const index = meshes.indexOf(meshData);
            if (index > -1) meshes.splice(index, 1);
            
            splitMeshSimple3D(meshData, cutPlane, start, end);
        }
    });
    
    updateStats();
}

function splitMeshSimple3D(meshData, cutPlane, start, end) {
    const { threeMesh, originalColor } = meshData;
    
    // 간단한 방법: 원래 shape를 재사용해서 2개 조각 생성
    // 실제로는 더 복잡한 CSG 알고리즘 필요
    console.log('✂️ 3D 메쉬 분할 (간소화 버전)');
    
    // 왼쪽 조각
    const shape1Data = { shape: createSquareShape().shape, color: getRandomColor() };
    const mesh1 = createMeshFromShape(shape1Data, threeMesh.position.clone());
    mesh1.cannonBody.applyImpulse(
        new CANNON.Vec3(-10 + Math.random() * 3, 8, (Math.random() - 0.5) * 5),
        new CANNON.Vec3(0, 0, 0)
    );
    // 랜덤 3D 회전 적용
    mesh1.cannonBody.angularVelocity.set(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
    );
    console.log('✅ 왼쪽 3D 조각 생성');
    
    // 오른쪽 조각
    const shape2Data = { shape: createSquareShape().shape, color: getRandomColor() };
    const mesh2 = createMeshFromShape(shape2Data, threeMesh.position.clone());
    mesh2.cannonBody.applyImpulse(
        new CANNON.Vec3(10 + Math.random() * 3, 8, (Math.random() - 0.5) * 5),
        new CANNON.Vec3(0, 0, 0)
    );
    // 랜덤 3D 회전 적용
    mesh2.cannonBody.angularVelocity.set(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
    );
    console.log('✅ 오른쪽 3D 조각 생성');
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
    
    createMeshFromShape(shapeData, { x: 0, y: 50, z: 0 });
    
    infoDiv.textContent = `${shapeType} 3D 도형이 로드되었습니다. 드래그하여 절단하세요.`;
}

function resetScene() {
    meshes.forEach(meshData => {
        scene.remove(meshData.threeMesh);
        world.removeBody(meshData.cannonBody);
        if (meshData.threeMesh.geometry) meshData.threeMesh.geometry.dispose();
        if (meshData.threeMesh.material) meshData.threeMesh.material.dispose();
    });
    meshes = [];
    
    loadSelectedShape();
    
    infoDiv.textContent = '씬이 초기화되었습니다. (3D)';
    updateStats();
}

function clearAllMeshes() {
    meshes.forEach(meshData => {
        scene.remove(meshData.threeMesh);
        world.removeBody(meshData.cannonBody);
        if (meshData.threeMesh.geometry) meshData.threeMesh.geometry.dispose();
        if (meshData.threeMesh.material) meshData.threeMesh.material.dispose();
    });
    meshes = [];
    
    infoDiv.textContent = '모든 도형이 제거되었습니다. 새 도형을 불러오세요.';
    updateStats();
    
    console.log('🗑️ 모든 3D 메쉬 제거 완료');
}

function toggleWireframe() {
    wireframeMode = !wireframeMode;
    
    const btn = document.querySelector('.btn-wireframe');
    
    meshes.forEach(meshData => {
        if (meshData.threeMesh && meshData.threeMesh.material) {
            meshData.threeMesh.material.wireframe = wireframeMode;
        }
    });
    
    if (wireframeMode) {
        btn.classList.add('active');
        btn.textContent = '🔍 와이어프레임 ON';
        infoDiv.textContent = '와이어프레임 모드 활성화 - 3D 메쉬 구조 확인';
        console.log('🔍 와이어프레임 모드 ON (3D)');
    } else {
        btn.classList.remove('active');
        btn.textContent = '🔍 와이어프레임';
        infoDiv.textContent = '일반 모드';
        console.log('🔍 와이어프레임 모드 OFF');
    }
}

function resetCamera() {
    camera.position.set(100, 100, 300);
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
// 애니메이션 루프 (3D Cannon.js)
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
    
    // Cannon.js 물리 업데이트
    world.step(1 / 60);
    
    // Three.js 메쉬를 Cannon.js 위치와 동기화 (3D - 모든 축 회전 허용)
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


