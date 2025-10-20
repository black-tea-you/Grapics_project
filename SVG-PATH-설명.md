# SVG Path 명령어와 Vertex 변환 가이드

## 📚 SVG Path 명령어 설명

### 기본 명령어

| 명령어 | 의미 | 설명 | 예시 |
|--------|------|------|------|
| **M** | MoveTo (절대) | 펜을 들어 새 위치로 이동 | `M 100 200` |
| **m** | MoveTo (상대) | 현재 위치에서 상대적으로 이동 | `m 10 20` |
| **L** | LineTo (절대) | 직선 그리기 | `L 150 250` |
| **l** | LineTo (상대) | 상대적 직선 그리기 | `l 50 50` |
| **H** | Horizontal Line (절대) | 수평선 그리기 | `H 200` |
| **h** | Horizontal Line (상대) | 상대적 수평선 | `h 100` |
| **V** | Vertical Line (절대) | 수직선 그리기 | `V 300` |
| **v** | Vertical Line (상대) | 상대적 수직선 | `v 50` |
| **Z** / **z** | Close Path | 경로 닫기 (시작점으로) | `Z` |

### 곡선 명령어

| 명령어 | 의미 | 설명 | 파라미터 |
|--------|------|------|----------|
| **Q** | Quadratic Bezier (절대) | 2차 베지어 곡선 | `Q cpx cpy x y` |
| **q** | Quadratic Bezier (상대) | 상대적 2차 베지어 | `q cpx cpy x y` |
| **C** | Cubic Bezier (절대) | 3차 베지어 곡선 | `C cp1x cp1y cp2x cp2y x y` |
| **c** | Cubic Bezier (상대) | 상대적 3차 베지어 | `c cp1x cp1y cp2x cp2y x y` |
| **S** | Smooth Cubic Bezier | 부드러운 3차 베지어 | `S cp2x cp2y x y` |
| **T** | Smooth Quadratic Bezier | 부드러운 2차 베지어 | `T x y` |
| **A** | Arc | 원호 그리기 | `A rx ry rotation large-arc sweep x y` |

## 🔄 곡선을 Vertex로 변환하는 방법

### 1. Quadratic Bezier (Q) → Vertices

**수학 공식:**
```
B(t) = (1-t)² × P₀ + 2(1-t)t × P₁ + t² × P₂

여기서:
- P₀: 시작점
- P₁: 제어점
- P₂: 끝점
- t: 0부터 1까지의 파라미터
```

**JavaScript 구현:**
```javascript
function quadraticBezierToVertices(startX, startY, cpX, cpY, endX, endY, segments = 10) {
    const vertices = [];
    
    for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const invT = 1 - t;
        
        const x = invT * invT * startX + 
                 2 * invT * t * cpX + 
                 t * t * endX;
                 
        const y = invT * invT * startY + 
                 2 * invT * t * cpY + 
                 t * t * endY;
        
        vertices.push({ x, y });
    }
    
    return vertices;
}
```

### 2. Cubic Bezier (C) → Vertices

**수학 공식:**
```
B(t) = (1-t)³ × P₀ + 3(1-t)²t × P₁ + 3(1-t)t² × P₂ + t³ × P₃
```

**JavaScript 구현:**
```javascript
function cubicBezierToVertices(startX, startY, cp1X, cp1Y, cp2X, cp2Y, endX, endY, segments = 10) {
    const vertices = [];
    
    for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const invT = 1 - t;
        
        const x = invT * invT * invT * startX + 
                 3 * invT * invT * t * cp1X + 
                 3 * invT * t * t * cp2X + 
                 t * t * t * endX;
                 
        const y = invT * invT * invT * startY + 
                 3 * invT * invT * t * cp1Y + 
                 3 * invT * t * t * cp2Y + 
                 t * t * t * endY;
        
        vertices.push({ x, y });
    }
    
    return vertices;
}
```

## 🛠️ SVG Path를 Vertex로 변환하는 라이브러리

### 1. **paper.js** (추천 ⭐⭐⭐⭐⭐)
```javascript
// 설치
npm install paper

// 사용
import paper from 'paper';

const path = new paper.Path('M 100 100 Q 150 50 200 100');
const points = path.getPointAt(length);
```

**장점:**
- 완벽한 SVG path 지원
- 곡선을 정확하게 샘플링
- 강력한 벡터 그래픽 기능

### 2. **svg-path-properties**
```javascript
// 설치
npm install svg-path-properties

// 사용
import { svgPathProperties } from 'svg-path-properties';

const properties = svgPathProperties('M 0 0 Q 50 100 100 0');
const length = properties.getTotalLength();

// 균등하게 점 샘플링
for (let i = 0; i <= 100; i++) {
    const point = properties.getPointAtLength(length * i / 100);
    console.log(point.x, point.y);
}
```

**장점:**
- 가벼움
- 특정 길이의 점을 정확하게 가져올 수 있음

### 3. **@svgdotjs/svg.js**
```javascript
// 설치
npm install @svgdotjs/svg.js

// 사용
import { SVG } from '@svgdotjs/svg.js';

const draw = SVG().addTo('body');
const path = draw.path('M 0 0 Q 50 100 100 0');
const length = path.length();

// 점 샘플링
for (let i = 0; i <= 100; i++) {
    const point = path.pointAt(i / 100 * length);
    console.log(point.x, point.y);
}
```

### 4. **flatten-svg-path** (가장 간단 ⭐⭐⭐)
```javascript
// 설치
npm install flatten-svg-path

// 사용
import flatten from 'flatten-svg-path';

const path = 'M 0 0 Q 50 100 100 0';
const vertices = flatten(path); 
// 결과: [[0, 0], [5, 9.5], [10, 18], ...]
```

**장점:**
- 매우 간단한 API
- 바로 vertex 배열로 변환
- 가벼움

### 5. **adaptive-bezier-curve**
```javascript
// 설치
npm install adaptive-bezier-curve

// 사용
import bezier from 'adaptive-bezier-curve';

// Quadratic Bezier
const points = bezier([0, 0], [50, 100], [100, 0]);
// 결과: [[0, 0], [12.5, 23.4], [25, 43.75], ...]
```

**장점:**
- 적응형 샘플링 (곡선이 급한 곳은 더 많은 점 생성)
- 최적화된 vertex 수

## 🎯 온라인 변환 도구

### 1. **SVG Path Visualizer**
- URL: https://svg-path-visualizer.netlify.app/
- 실시간으로 path를 시각화하고 vertex 확인

### 2. **SVG Path Editor**
- URL: https://yqnn.github.io/svg-path-editor/
- SVG path를 편집하고 좌표 확인

### 3. **Snap.svg Animator**
- URL: http://svg.dabbles.info/
- SVG를 로드하고 path 정보 추출

## 💡 현재 프로젝트에서 사용한 방법

현재 `mesh-cutting.js`에서는 **자체 구현 SVG Path Parser**를 사용했습니다:

```javascript
class SVGPathParser {
    static parse(pathData) {
        // M, L, H, V, Q, q, Z 명령어 지원
        // Q와 q는 10개의 선분으로 샘플링하여 곡선 근사
    }
}
```

**장점:**
- 외부 라이브러리 없이 작동
- 필요한 명령어만 구현
- 커스터마이징 가능

**단점:**
- 모든 SVG 명령어를 지원하지 않음 (C, S, T, A 등)
- 복잡한 경로에서는 정확도가 떨어질 수 있음

## 🚀 추천 워크플로우

복잡한 SVG를 사용할 경우:

1. **개발 중**: `flatten-svg-path` 사용하여 빠르게 테스트
2. **정확도 필요**: `svg-path-properties` 사용하여 정밀 샘플링
3. **프로덕션**: 변환된 vertex 데이터를 JSON으로 저장하여 런타임 변환 불필요

```javascript
// 1. SVG path를 vertex로 변환
import flatten from 'flatten-svg-path';
const vertices = flatten(svgPathData);

// 2. JSON으로 저장
import fs from 'fs';
fs.writeFileSync('leaf-vertices.json', JSON.stringify(vertices));

// 3. 런타임에 로드
import leafVertices from './leaf-vertices.json';
const mesh = new Mesh(leafVertices);
```

## 📝 참고 자료

- [MDN SVG Path 문서](https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths)
- [Bezier Curve 시각화](https://cubic-bezier.com/)
- [SVG Specification](https://www.w3.org/TR/SVG/paths.html)

