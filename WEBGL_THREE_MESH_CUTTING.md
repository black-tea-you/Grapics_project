# WebGL 관점에서 본 mesh-cutting-with-matter 로직 해설

## 📋 목차
1. [시스템 개요](#시스템-개요)
2. [전체 파이프라인](#전체-파이프라인)
3. [핵심 컴포넌트](#핵심-컴포넌트)
4. [메쉬 절단 알고리즘](#메쉬-절단-알고리즘)
5. [예외 처리](#예외-처리)
6. [좌표계 변환](#좌표계-변환)
7. [문제점과 해결책](#문제점과-해결책)
8. [WebGL → 라이브러리 대체 명세](#webgl--라이브러리-대체-명세)
9. [성능 최적화](#성능-최적화)
10. [디버깅 가이드](#디버깅-가이드)
11. [마무리](#마무리)

---

## 시스템 개요

### 목적
- `mesh-cutting-with-matter.js`는 2D 환경에서 메쉬 절단을 수행하고, Matter.js로 물리 시뮬레이션을 적용하여 자연스러운 상호작용을 제공하는 인터랙티브 애플리케이션입니다.

### 기술 스택
- 렌더링: Three.js (OrthographicCamera, WebGLRenderer, Raycaster)
- 물리: Matter.js (Engine, World, Bodies.fromVertices)
- 지오메트리: THREE.Shape/ShapeGeometry (내장 Earcut 기반 삼각분할)
- 환경: PMREM + HDRI(`prefab/studio.hdr`)

---

## 전체 파이프라인

```
┌────────────────────────────────────────────────────┐
│ 1. 초기화(init)                                     │
│   - 씬/카메라/렌더러/조명/HDRI                     │
│   - Matter 엔진/월드, 경계 벽 생성                 │
└────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────┐
│ 2. 입력(마우스)                                     │
│   - onMouseDown/Move/Up: 절단선 수집·시각화        │
└────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────┐
│ 3. 절단 수행(performCut)                           │
│   - 교차 가능성 검사 → splitMeshSimple2D           │
└────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────┐
│ 4. 분할(splitMeshSimple2D)                         │
│   - 정점 분류/교차점 삽입 → 2개 Shape 재구성       │
│   - createMeshFromShape로 시각+물리 동시 생성       │
└────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────┐
│ 5. 물리 효과                                        │
│   - applyCutForce로 분리 힘                         │
│   - 작은 조각은 파티클로 대체                      │
└────────────────────────────────────────────────────┘
```

참고 코드 위치:
- `init()`(142행), `setupPhysics()`(357행), `createBoundaryWalls()`(398행)
- `performCut()`(1815/1745행 근처), `splitMeshSimple2D()`(1890행)
- `createMeshFromShape()`(1243행), `simplifyVertices()`(1136행)

---

## 핵심 컴포넌트

### 초기화/환경
- OrthographicCamera로 완전한 2D 투영을 사용하여 Z 회전/투영 왜곡 이슈 제거
- WebGLRenderer에 sRGB, ACES 톤매핑, 물리기반 광원 모델을 활성화하여 시각적 일관성 확보
- PMREM + HDRI(`studio.hdr`)로 반사 환경 구성

### 물리 시스템
- Matter.Engine/World 생성 후 중력 `world.gravity.y = 1` 설정
- `createBoundaryWalls()`로 상하좌우 정적 바디를 생성하여 화면 이탈 방지

### 메쉬 생성
- `createMeshFromShape(shapeData, position, physicsOptions)`에서
  - THREE.ShapeGeometry로 렌더링용 지오메트리 생성
  - 정점 추출 후 `simplifyVertices()`로 물리 안정화/성능 최적화
  - `Matter.Bodies.fromVertices(...)`로 물리 바디 생성 (예외 시 사각형 폴백)
  - 시각/물리 객체를 `meshes[]`에 동기 저장

### 입력/상호작용
- `onMouseDown/Move/Up`에서 절단선의 시작/끝을 수집하고 라인 헬퍼로 시각화
- `performCut(start, end)` 호출로 절단 시도

---

## 메쉬 절단 알고리즘

### performCut(start, end)
- 절단선 방향 벡터와 법선을 계산하고, 각 메쉬의 월드 정점에 대해 부호를 테스트하여 절단 가능 여부를 결정
- 절단 가능 시 `splitMeshSimple2D(meshData, normal, start, end)`로 위임

### splitMeshSimple2D(meshData, normal, start, end)
1) 정점 분류: 절단선에 대한 signed distance로 양수/음수 그룹 분리
2) 교차점 계산: 각 에지에 대해 부호가 바뀌면 t = |d1|/(|d1|+|d2|)로 보간 교차점 삽입(마지막→첫 정점 포함 순환 처리)
3) 유효성 검사: 각 그룹이 최소 3 정점 보유 확인(미만 시 원본 복구)
4) Shape 재구성: 각도 정렬·중복 제거로 `createShapeFromVertices2D()` 호출
5) 새 메쉬 생성: `createMeshFromShape()` 두 번 호출로 좌/우 조각 생성 후 원본 제거
6) 물리 효과: `applyCutForce()`로 분리 힘, 너무 작은 조각은 파티클 처리

---

## 예외 처리
- `Matter.Bodies.fromVertices` 실패 시 바운딩 박스 사각형으로 폴백 생성
- 분할 후 정점 < 3 이면 실패로 간주하고 원본 메쉬를 복구
- Shape 생성 실패(정점 불량/중복) 시 조용히 중단하고 상태를 일관되게 유지

---

## 좌표계 변환
- Three.js: +Y가 위 / Matter.js: +Y가 아래 → 동기화 시 Y 부호 반전 필요
- 메쉬-바디 동기화 및 벽 배치 시 `threeY = -matterY` 규칙을 일관 적용

---

## 문제점과 해결책
- 복잡한 도형에서 물리 바디 생성 실패
  - 해결: `simplifyVertices()`로 목표 정점 수(예: 80/150/200)로 적응형 축소
- 마지막 에지 교차 누락으로 절단 실패
  - 해결: 에지 인덱스 순환(`(i+1)%n`)으로 모든 에지 검사
- 작은 파편이 물리적으로 불안정
  - 해결: 임계 면적 이하 파편은 파티클로 대체하여 시각만 유지

---

## WebGL → 라이브러리 대체 명세

WebGL 순정 구현 시 어려운 부분을 Three.js/Matter.js로 대체했습니다. 핵심 대체 항목은 아래와 같습니다.

| WebGL 순정 난점 | 대체 라이브러리/기능 | 본 프로젝트 사용처 |
| --- | --- | --- |
| 정점/인덱스 버퍼 관리, 삼각분할(Polygon → Triangle) | THREE.Shape/ShapeGeometry(Earcut 내장) | 절단 후 조각의 지오메트리 자동 생성 |
| 카메라 투영 행렬/뷰 행렬 구성 | THREE.OrthographicCamera | 2D 투영 구성, 뎁스 이슈 제거 |
| 셰이더 작성/머티리얼/톤매핑/색공간 | THREE.MeshStandard/BasicMaterial + sRGB/ACES | 일관된 색·광원 품질 확보 |
| 텍스처/환경맵 로딩과 PMREM | THREE.RGBELoader + PMREMGenerator | HDRI 반사 환경 적용 |
| 마우스 피킹/좌표 변환 | THREE.Raycaster, Vector 변환 | 절단선 입력·오브젝트 히트테스트 |
| 물리 시뮬레이션(충돌/마찰/질량/관성) | Matter.js Engine/World/Bodies.fromVertices | 절단 후 조각의 물리 거동 |
| 볼록/오목 외곽 처리, 안정적 폴리곤 처리 | simplify + fromVertices(내부 분리/합치기) | 복잡 도형 안정화 |
| 라인-폴리곤 교차/분할 후 정점 정렬 | 사용자 로직 + Three.js 수학 유틸 | `splitMeshSimple2D` 정점 흐름 |

요약: WebGL의 저수준 버퍼·행렬·셰이더·삼각분할·충돌해석을 Three.js/Matter.js가 흡수하여, 절단 알고리즘 자체(정점 분류/교차/재구성)에만 집중할 수 있도록 설계했습니다.

---

## 성능 최적화
- 정점 간소화: `simplifyVertices()`로 물리 안정성과 fromVertices 성능 확보
- 디버그 주기 제한: 물리 디버그 렌더링을 0.1초 간격으로 제한
- 픽셀 비율 상한: `setPixelRatio(Math.min(devicePixelRatio, 2))`로 비용 제어

---

## 디버깅 가이드
- 정상 절단: 교차점 다수 발견, 두 조각 모두 생성 로그 확인
- 실패 복구: 분할 정점 부족 경고 후 원본 복구 로그 확인
- 물리 바디 실패: `fromVertices` 경고 발생 시 폴백 생성 여부 확인

---

## 마무리
- `mesh-cutting-with-matter.js`는 Three.js로 WebGL의 복잡도를 추상화하고, Matter.js로 물리 엔진을 위임하여, 핵심 절단 로직(정점 분류/교차/재구성)에 집중하는 구조입니다.
- 이후 요청되는 확장/변경 사항은 본 문서 한 곳에서 지속적으로 갱신·관리하겠습니다.

---

## 질문별 해설(전문가 Q&A)

### 1) 2D 절단에서 정점 좌표 산출·새 Mesh 생성 시 WebGL의 어려움과 Three.js의 간소화 포인트
- 어려움(WebGL 순정)
  - 삼각분할(Tessellation): 임의 다각형(자르기 후 조각)에 대한 안정적 삼각분할, 구멍·오목·정점 중복 처리, 정점 정렬/와인딩 유지가 필요합니다.
  - 버퍼 관리: 동적 분할 후 매 프레임 새 `positions/indices/uvs` 버퍼 생성·업데이트, 배치와 메모리 생애주기 관리가 번거롭습니다.
  - 정밀 이슈: 수치 오차로 인해 얇은 조각에서 자잘한 틈/교차가 발생해 비정상 면이 생기기 쉽습니다.
  - UV/노멀 재계산: 절단으로 위상이 변하면 탄탄한 재계산이 필요합니다.
- Three.js 간소화
  - `THREE.Shape`/`ShapeGeometry`가 내부 Earcut으로 다각형 → 삼각형을 자동 생성(정점 정렬만 해주면 됨). [참조: `createMeshFromShape()` 근방 1243행]
  - 머티리얼/버퍼를 자동 관리하고, 필요 시 `geometry.dispose()`로 정리만 수행
  - 좌표 변환/행렬은 카메라/오브젝트 트랜스폼으로 추상화됨
  - 결과적으로 우리는 절단 로직(정점 분류/교차/정렬)에만 집중

### 2) Mesh Cutting에서 Raycaster 사용 방식과 동작 원리
- 사용 의도
  - 화면 좌표(마우스) → 씬 좌표 변환, 절단선의 시작/끝을 월드 XY 평면(z≈0)으로 투영
  - 필요 시 대상 메쉬 피킹(선택된 메쉬만 절단)
- 동작
  - 마우스 NDC 계산 → `THREE.Raycaster.setFromCamera()` → 평면/메쉬와 `intersect*`로 교차점 획득 → `startPoint/endPoint` 저장 후 시각화 라인 갱신
  - 본 프로젝트는 2D(정면 직교) 구성이라 z=0 평면 투영이 간단하며, 선택이 필요하면 `raycaster.intersectObjects(meshes.map(m=>m.threeMesh))`를 사용합니다. [초기화: raycaster 생성 189~191행]

추가: 3D 환경에 바로 일반화가 어려운 이유
- 선분은 3D에서 무두께여서 절단 “면”이 되지 않음 → 실제로는 절단 평면(또는 슬래브 두께)이 필요
- 메시 불리언(CSG) 필요: 절단면 생성, 위상 정리, 매니폴드 유지, 경계 리트라이앵글링, 노멀/UV 재배치가 필수
- 성능/안정성: 대형 메시, 복잡 위상에서 실시간 CSG는 고비용·에지 케이스 다수
- 결론: 본 프로젝트는 2D 평면에서 절단을 정의하고, Three.js는 2D 표현·피킹을, Matter.js는 2D 물리를 담당

### 3) Matter.js 물리 효과 적용과 중심축(정렬) 일치
- 적용 방식
  - `Matter.Bodies.fromVertices(...)`로 절단 후 조각의 물리 바디 생성, 실패 시 사각 폴백
  - 공통 물리 속성(`friction`, `restitution`, `density`, `frictionAir`)을 `applyPhysicsProperties()`로 일괄 적용 [약 1019행]
  - 잘린 직후 `applyCutForce()`로 양 조각에 반발/분리 힘 부여(10ms 지연으로 안정화 후 적용) [약 1159행]
- 중심축 일치(시각-물리 동기화)
  - 좌표계 차이 보정: Matter +Y 아래/Three +Y 위 → 동기화 시 `threeY = -matterY`
  - 생성 시: Three 위치에서 Y 반전하여 Matter 바디 배치
  - 루프 동기화: `mesh.position.y = -body.position.y`로 프레임마다 일치 [애니메이션 루프 2713행]
- 작은 조각 처리
  - 면적이 임계치(예: 원본의 1/40) 이하면 파티클로 대체하여 물리 부하/불안정 제거

### 4) 카메라 시점 선택(Orthographic)과 이유
- 선택: `THREE.OrthographicCamera`
- 이유
  - 정확한 2D 인터랙션: 원근 왜곡 없는 좌표계로 절단선·정점 계산이 단순
  - 물리 표현과 일치: Matter.js 2D와 개념적으로 호환
  - UI/가독성: 픽셀-세계 좌표 매핑이 직관적, 라인/그리드 표현 명료

### 5) Z축 레이어링으로 잘리는 객체 구분한 이유(속성 부여 vs Z 레이어)
- Z 레이어 목적
  - Z-fighting 방지와 시각적 분리: 절단 후 조각을 미세한 `Z_OFFSET`으로 분리하여 겹침/깜빡임 방지
  - 피킹/렌더 결정성 향상: 동일 평면 겹침 시 예측 불가한 정렬 이슈를 회피
- 대안(속성 부여) 가능 여부
  - 가능: `userData`, 그룹, 태그로 논리적 구분은 가능
  - 그러나 시각적·렌더 순서 문제는 여전히 남음 → Z 레이어링이 가장 단순·안정적 해결책
  - 필요 시 `renderOrder`, `depthTest=false`도 조합할 수 있으나, 본 프로젝트는 간단하고 안전한 Z 분리 우선


