# Texture-fix (PBR/메탈릭 효과 적용 정리)

아래 변경으로 Three.js 씬에 메탈릭 PBR 효과를 적용했습니다. 적용 포인트, 코드 위치, 필요 리소스를 한곳에 정리합니다.

## 1) HTML: RGBELoader 추가
파일: `mesh-cutting-with-matter.html`

```411:416:c:\Users\YSH\OneDrive - gc.gachon.ac.kr\바탕 화면\Grapics_project\mesh-cutting-with-matter.html
<!-- OBJLoader (CDN) -->
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/OBJLoader.js" onerror="console.error('OBJLoader 로드 실패:', this.src)"></script>
<!-- RGBELoader (HDRI 로더) -->
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/RGBELoader.js" onerror="console.error('RGBELoader 로드 실패:', this.src)"></script>
```

## 2) 렌더러 톤매핑/색공간
파일: `mesh-cutting-with-matter.js` (`init()` 내부, renderer 생성 직후)

```174:182:C:\Users\YSH\OneDrive - gc.gachon.ac.kr\바탕 화면\Grapics_project\mesh-cutting-with-matter.js
renderer.setSize(viewWidth, viewHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// PBR용 톤매핑/색공간 설정
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
```

## 3) HDRI 환경맵 로드 (PMREM)
파일: `mesh-cutting-with-matter.js` (`init()`에서 조명 설정 직후)

```187:206:C:\Users\YSH\OneDrive - gc.gachon.ac.kr\바탕 화면\Grapics_project\mesh-cutting-with-matter.js
// HDRI 환경맵 로드 (PBR 반사 환경)
try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    if (THREE.RGBELoader) {
        const rgbeLoader = new THREE.RGBELoader();
        rgbeLoader.setDataType(THREE.UnsignedByteType);
        rgbeLoader.load('prefab/studio.hdr', (hdr) => {
            const envTex = pmrem.fromEquirectangular(hdr).texture;
            scene.environment = envTex;
            hdr.dispose();
        });
    }
} catch (e) {
    console.warn('HDRI 환경맵 로드 실패(무시 가능):', e.message);
}
```

## 4) 포인트 라이트 (Canvas 기준 1, 0.8)
파일: `mesh-cutting-with-matter.js` (`setupLights()` 내부)

```240:258:C:\Users\YSH\OneDrive - gc.gachon.ac.kr\바탕 화면\Grapics_project\mesh-cutting-with-matter.js
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
} catch (e) {
    console.warn('PointLight 배치 실패(무시 가능):', e.message);
}
```

## 5) Mesh 재질: MeshPhysicalMaterial + PBR 맵
파일: `mesh-cutting-with-matter.js` (`createMeshFromShape()` 재질 생성부)

```1259:1310:C:\Users\YSH\OneDrive - gc.gachon.ac.kr\바탕 화면\Grapics_project\mesh-cutting-with-matter.js
material = new THREE.MeshPhysicalMaterial({
    map: colorMap,
    metalness: 1.0,
    roughness: 0.4,
    metalnessMap,
    roughnessMap,
    normalMap,
    envMapIntensity: 1.2,
    clearcoat: 0.4,
    clearcoatRoughness: 0.2,
    side: THREE.DoubleSide,
    wireframe: wireframeMode
});
```

컬러 텍스처는 sRGB 인코딩을 적용했고, `Textures/metal.png`, `Textures/rough.png`, `Textures/normal.png`가 존재하면 자동 연결됩니다.

## 6) AO 대응 (uv2 복사)
파일: `mesh-cutting-with-matter.js` (`createMeshFromShape()`에서 UV 설정 후)

```1255:1263:C:\Users\YSH\OneDrive - gc.gachon.ac.kr\바탕 화면\Grapics_project\mesh-cutting-with-matter.js
geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
}
// AO 맵 대응: uv2가 없으면 uv를 복사
if (geometry.attributes.uv && !geometry.attributes.uv2) {
    geometry.setAttribute('uv2', geometry.attributes.uv);
}
```

---

## 필요한 리소스(에셋)
- HDRI: `prefab/studio.hdr`
- 텍스처 맵들: `Textures/metal.png`, `Textures/rough.png`, `Textures/normal.png` (선택: `Textures/ao.png`)

이 파일들은 프로젝트에 기본 포함되어 있지 않으므로, 직접 준비해야 합니다.

### 추천 소스
- HDRI(무료): [Poly Haven](https://polyhaven.com) → 예: "Studio" 계열 HDR (`.hdr`)
  - 사용 예: `prefab/studio.hdr`로 저장

  https://polyhaven.com/a/german_town_street
  에서 hdr 가져옴
  
- 텍스처(무료): [ambientCG](https://ambientcg.com), [Poly Haven Textures](https://polyhaven.com/textures)
  - 금속/러프니스/노멀 그레이스케일 맵 세트 선택 후 `Textures/` 폴더에 배치

https://polyhaven.com/a/rusty_metal_sheet
에서 텍스쳐 가져옴

참고: Three.js CDN은 교본용 HDR/텍스처 파일을 자동 제공하지 않습니다. 예제 저장소에는 샘플이 있으나, CDN 경로/라이선스/CORS 이슈로 직접 프로젝트에 넣어 사용하는 것이 안전합니다.

## 체크리스트
- `prefab/studio.hdr` 존재 확인
- `Textures/metal.png`, `Textures/rough.png`, `Textures/normal.png` 존재 확인
- 필요 시 `Textures/ao.png` 준비 후 `material.aoMap`으로 연결

## 문제 발생 시
- 경로가 맞는지, 대소문자/확장자(`.hdr`, `.png`)를 확인하세요.
- HDRI가 없으면 반사/하이라이트가 약해 보일 수 있습니다(환경맵 의존).
- 텍스처 로드 실패는 브라우저 콘솔에 에러로 표시됩니다.


