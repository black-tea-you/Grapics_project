# Matter.js와 레이캐스팅 상세 설명

## 📋 목차
1. [Matter.js 사용 방식](#matterjs-사용-방식)
2. [레이캐스팅 방식](#레이캐스팅-방식)
3. [좌표계 변환](#좌표계-변환)
4. [동기화 메커니즘](#동기화-메커니즘)

---

## Matter.js 사용 방식

### 1. 물리 엔진 초기화

```javascript
function setupPhysics() {
    // Engine 생성
    engine = Matter.Engine.create();
    world = engine.world;
    
    // 중력 설정 (Matter.js: Y축 아래가 양수!)
    world.gravity.x = 0;
    world.gravity.y = 1; // 아래 방향
}
```

**특징:**
- Matter.js는 **순수 2D 물리 엔진**으로 3D 오버헤드가 없음
- Y축 좌표계가 Three.js와 반대 (아래가 양수)
- 중력은 1로 설정하여 자연스러운 낙하 구현

### 2. 물리 바디 생성

#### 2.1 정점 추출 및 변환

```javascript
// Three.js Geometry에서 정점 추출 (2D만)
const vertices = [];
for (let i = 0; i < positionAttribute.count; i++) {
    vertices.push({
        x: positionAttribute.getX(i),
        y: positionAttribute.getY(i)
    });
}
```

**프로세스:**
1. Three.js Geometry의 모든 정점을 추출
2. X, Y 좌표만 사용 (Z축 제거 → 순수 2D)

#### 2.2 동적 패딩 적용

```javascript
// 메쉬 크기에 따라 동적 패딩
let PHYSICS_PADDING;
if (meshSize < 20) {
    PHYSICS_PADDING = 1.03; // 3% 확대 (매우 작은 조각)
} else if (meshSize < 50) {
    PHYSICS_PADDING = 1.02; // 2% 확대 (작은 조각)
} else {
    PHYSICS_PADDING = 1.01; // 1% 확대 (일반)
}

const paddedVertices = vertices.map(v => ({
    x: v.x * PHYSICS_PADDING,
    y: v.y * PHYSICS_PADDING
}));
```

**이유:**
- **RigidBody Capsule 효과**: 물리 바디를 시각보다 약간 크게 만들어 바닥 통과 방지
- 작은 조각일수록 더 큰 패딩 필요 (물리 엔진 정밀도 문제)
- 시각 메쉬와 물리 바디의 미세한 차이로 인한 버그 방지

#### 2.3 정점 간소화

```javascript
// 적응형 간소화 (복잡한 도형만)
const simplifiedVertices = simplifyVertices(paddedVertices, maxVertexCount);
```

**목적:**
- 성능 최적화: 복잡한 폴리곤은 정점 수가 많아 물리 계산이 느림
- 사용자 선택: 80/150/200개 정점 모드 제공
- 기본 도형은 간소화하지 않음 (8개 이하)

#### 2.4 Matter.js Body 생성

```javascript
body = Matter.Bodies.fromVertices(
    position.x,
    matterY,  // Y축 반전 적용
    [simplifiedVertices],
    {
        friction: 0.5,        // 마찰 계수
        restitution: 0.3,     // 반발 계수 (탄성)
        density: 0.001,       // 밀도
        frictionAir: 0.01     // 공기 저항
    },
    true  // flagInternal: 내부 간선 제거
);
```

**매개변수 설명:**
- `friction`: 마찰력 (0~1, 높을수록 미끄럽지 않음)
- `restitution`: 반발력 (0~1, 높을수록 튀어오름)
- `density`: 밀도 (질량 계산에 사용)
- `frictionAir`: 공기 저항 (속도 감소율)
- `flagInternal`: 내부 간선 제거로 충돌 계산 최적화

### 3. 경계 벽 생성

```javascript
const wallBody = Matter.Bodies.rectangle(
    config.x,
    config.y,
    config.width,
    config.height,
    {
        isStatic: true,  // 정적 바디 (움직이지 않음)
        friction: 0.5,
        restitution: 0.3,
        label: `wall_${config.name}`
    }
);
```

**특징:**
- `isStatic: true`로 설정하여 움직이지 않는 벽 생성
- 상, 하, 좌, 우 4면에 생성
- Matter.js 좌표계 사용 (Y축 아래가 양수)

### 4. 물리 업데이트

```javascript
function animate() {
    // Matter.js 물리 업데이트 (60fps)
    Matter.Engine.update(engine, 1000 / 60);
    
    // Three.js 메쉬 동기화
    meshes.forEach(meshData => {
        meshData.threeMesh.position.x = meshData.matterBody.position.x;
        meshData.threeMesh.position.y = -meshData.matterBody.position.y; // Y축 반전
        meshData.threeMesh.rotation.z = meshData.matterBody.angle; // 2D 회전만
    });
}
```

**동작:**
- 매 프레임마다 물리 엔진 업데이트 (60fps)
- Matter.js Body의 위치/회전을 Three.js Mesh에 동기화
- Y축 좌표 변환 필수 (Matter.js ↔ Three.js)

### 5. 절단 힘 적용

```javascript
function applyCutForce(body, direction = 'left') {
    // 방향에 따른 속도
    const xVelocity = direction === 'left' ? -2 - Math.random() * 2 : 2 + Math.random() * 2;
    const yVelocity = -3 - Math.random() * 2; // 위로 튀어오름 (Y축 음수)
    
    // 속도 직접 설정
    Matter.Body.setVelocity(body, {
        x: xVelocity,
        y: yVelocity
    });
    
    // 회전 추가
    const angularVelocity = (Math.random() - 0.5) * 0.1;
    Matter.Body.setAngularVelocity(body, angularVelocity);
}
```

**효과:**
- 절단된 조각에 즉시 속도와 회전 적용
- 자연스러운 분리 효과
- 랜덤 요소로 다양한 움직임 생성

---

## 레이캐스팅 방식

### 1. 레이캐스터 초기화

```javascript
// Raycaster 생성
raycaster = new THREE.Raycaster();
mouse = new THREE.Vector2();
```

**Three.js Raycaster:**
- 마우스 위치를 3D 공간의 레이로 변환
- 객체와의 교차점 계산 가능

### 2. 마우스 좌표 변환 (NDC)

```javascript
function onMouseDown(event) {
    const rect = canvas.getBoundingClientRect();
    
    // NDC (Normalized Device Coordinates) 변환
    // 범위: -1 ~ 1
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Raycasting 설정
    raycaster.setFromCamera(mouse, camera);
}
```

**좌표 변환 과정:**

1. **화면 좌표 (Screen Coordinates)**
   ```
   event.clientX, event.clientY
   → 캔버스 내 픽셀 위치 (0 ~ width, 0 ~ height)
   ```

2. **NDC 좌표 (Normalized Device Coordinates)**
   ```
   mouse.x = ((clientX - left) / width) * 2 - 1
   mouse.y = -((clientY - top) / height) * 2 + 1
   → 범위: -1 ~ 1
   → Y축 반전 (화면 좌표와 WebGL 좌표계 차이)
   ```

3. **월드 좌표 (World Coordinates)**
   ```
   raycaster.ray.intersectPlane(plane, intersectionPoint)
   → 3D 공간의 실제 위치
   ```

### 3. 평면 교차 계산

#### 3.1 동적 평면 생성

```javascript
// 카메라 방향 벡터
const cameraDirection = new THREE.Vector3();
camera.getWorldDirection(cameraDirection);

// 메쉬들의 평균 Z 위치 계산
const averageZ = meshes.length > 0
    ? meshes.reduce((sum, m) => sum + m.threeMesh.position.z, 0) / meshes.length
    : 0;

// 평면 생성 (카메라 방향과 수직)
const plane = new THREE.Plane(cameraDirection, -averageZ);
```

**평면 정의:**
- **법선 벡터 (Normal)**: 카메라 방향 (카메라가 보는 방향)
- **상수 (Constant)**: 평면의 Z 위치
- **평면 방정식**: `normal · (point - origin) = 0`

#### 3.2 레이-평면 교차

```javascript
const intersectionPoint = new THREE.Vector3();
const hasIntersection = raycaster.ray.intersectPlane(plane, intersectionPoint);
```

**교차 계산:**
1. 레이 방정식: `ray.origin + t * ray.direction`
2. 평면 방정식: `normal · (point - origin) = constant`
3. 두 방정식을 연립하여 `t` 값 계산
4. `t`를 레이 방정식에 대입하여 교차점 구함

**수식:**
```
t = (plane.constant - normal · ray.origin) / (normal · ray.direction)
intersection = ray.origin + t * ray.direction
```

### 4. 드래그 중 절단선 업데이트

```javascript
function onMouseMove(event) {
    if (!isDrawing) return;
    
    // 마우스 좌표를 NDC로 변환
    const rect = canvas.getBoundingClientRect();
    let mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    let mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    mouse.x = mouseX;
    mouse.y = mouseY;
    
    // 레이캐스터 설정
    raycaster.setFromCamera(mouse, camera);
    
    // 시작점과 동일한 평면 사용
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    const plane = new THREE.Plane(cameraDirection, -startPoint.z);
    
    // 교차점 계산
    const intersectionPoint = new THREE.Vector3();
    const hasIntersection = raycaster.ray.intersectPlane(plane, intersectionPoint);
    
    if (hasIntersection) {
        endPoint = intersectionPoint.clone();
        // 절단선 시각화 업데이트
    }
}
```

**특징:**
- 시작점과 동일한 Z 평면 사용 (일관성 유지)
- 실시간으로 절단선 시각화 업데이트
- 카메라 이동/줌과 무관하게 정확한 2D 좌표 획득

### 5. OrthographicCamera와의 관계

```javascript
// OrthographicCamera 설정
const frustumSize = 400;
camera = new THREE.OrthographicCamera(
    frustumSize * aspect / -2,  // left
    frustumSize * aspect / 2,   // right
    frustumSize / 2,            // top
    frustumSize / -2,           // bottom
    0.1,                        // near
    1000                        // far
);
```

**OrthographicCamera의 장점:**
- **완벽한 2D 뷰**: 원근 왜곡 없음
- **일정한 스케일**: 거리와 무관하게 동일한 크기
- **정확한 좌표**: 레이캐스팅이 2D 평면에서 정확히 동작

---

## 좌표계 변환

### Matter.js vs Three.js 좌표계

```
Three.js 좌표계:          Matter.js 좌표계:
     Y ↑                      Y ↓
     |                        |
     |                        |
-----+----- X              -----+----- X
     |                        |
     |                        |
```

**변환 규칙:**

1. **Y축 반전**
   ```javascript
   // Three.js → Matter.js
   matterY = -threeY;
   
   // Matter.js → Three.js
   threeY = -matterY;
   ```

2. **X축은 동일**
   ```javascript
   matterX = threeX;
   ```

3. **회전**
   ```javascript
   // Matter.js 각도 → Three.js Z축 회전
   mesh.rotation.z = body.angle;
   ```

### 실제 적용 예시

```javascript
// 물리 바디 생성 시
const matterY = -position.y;  // Y축 반전
body = Matter.Bodies.fromVertices(position.x, matterY, ...);

// 동기화 시
meshData.threeMesh.position.x = meshData.matterBody.position.x;
meshData.threeMesh.position.y = -meshData.matterBody.position.y; // Y축 반전
meshData.threeMesh.rotation.z = meshData.matterBody.angle;
```

---

## 동기화 메커니즘

### 1. 양방향 연결

```javascript
const meshData = {
    threeMesh: mesh,      // Three.js 메쉬
    matterBody: body,     // Matter.js 바디
    originalColor: color,
    // ... 기타 메타데이터
};
meshes.push(meshData);
```

**데이터 구조:**
- Three.js Mesh와 Matter.js Body를 하나의 객체로 묶음
- 절단 시 두 바디 모두 제거하고 새로 생성

### 2. 절단 시 동기화

```javascript
function performCut(start, end) {
    meshesToCut.forEach(meshData => {
        // 기존 메쉬 제거
        scene.remove(meshData.threeMesh);
        Matter.World.remove(world, meshData.matterBody);
        
        // 분할
        splitMeshSimple2D(meshData, normal, start, end);
        // → 새로운 메쉬와 바디 생성
    });
}
```

**프로세스:**
1. 기존 Three.js Mesh 제거
2. 기존 Matter.js Body 제거
3. 절단된 조각으로 새 Mesh 생성
4. 각 조각에 새 Matter.js Body 생성
5. 양쪽 모두 새 데이터 구조로 연결

### 3. 애니메이션 루프 동기화

```javascript
function animate() {
    // 물리 업데이트
    Matter.Engine.update(engine, 1000 / 60);
    
    // 모든 메쉬 동기화
    meshes.forEach(meshData => {
        // 위치 동기화 (Y축 반전)
        meshData.threeMesh.position.x = meshData.matterBody.position.x;
        meshData.threeMesh.position.y = -meshData.matterBody.position.y;
        
        // 회전 동기화 (2D만)
        meshData.threeMesh.rotation.z = meshData.matterBody.angle;
        
        // Z축은 유지 (레이어링)
    });
    
    // 렌더링
    renderer.render(scene, camera);
}
```

**특징:**
- Matter.js가 물리 시뮬레이션 주도
- Three.js는 시각 표현만 담당
- 매 프레임 동기화 (60fps)

---

## 성능 최적화

### 1. 정점 간소화

- **목적**: 복잡한 폴리곤의 정점 수 감소
- **방법**: 균등 간격 샘플링 + 중복 제거
- **효과**: 물리 계산 속도 향상

### 2. 물리 바디 패딩

- **목적**: 작은 조각의 바닥 통과 방지
- **방법**: 메쉬 크기에 따라 동적 패딩 (1~3%)
- **효과**: 버그 방지 및 물리 안정성 향상

### 3. 디버그 모드 최적화

- **기본값**: OFF (성능 향상)
- **업데이트 간격**: 0.1초마다만 (100ms)
- **효과**: 디버그 시각화 오버헤드 최소화

---

## 요약

### Matter.js 사용 방식
1. **2D 전용**: 3D 오버헤드 없이 순수 2D 물리 시뮬레이션
2. **동적 패딩**: 작은 조각의 바닥 통과 방지
3. **정점 간소화**: 성능 최적화를 위한 적응형 간소화
4. **좌표계 변환**: Y축 반전으로 Three.js와 동기화

### 레이캐스팅 방식
1. **NDC 변환**: 화면 좌표를 -1~1 범위로 정규화
2. **동적 평면**: 카메라 방향과 메쉬 평균 Z로 평면 생성
3. **레이-평면 교차**: 정확한 2D 절단선 좌표 획득
4. **OrthographicCamera**: 완벽한 2D 뷰로 왜곡 없음

### 핵심 포인트
- **Matter.js**: 물리 시뮬레이션 주도
- **Three.js**: 시각 표현만 담당
- **동기화**: 매 프레임 Matter.js → Three.js
- **좌표 변환**: Y축 반전 필수

