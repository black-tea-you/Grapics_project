@echo off
echo ========================================
echo Three.js 라이브러리 다운로드
echo ========================================
echo.

REM libs 폴더 생성
if not exist "libs-threejs" mkdir libs-threejs
cd libs-threejs

echo [1/3] Three.js 다운로드 중...
curl -L -o three.min.js https://unpkg.com/three@0.150.0/build/three.min.js
if %errorlevel% == 0 (
    echo ✓ Three.js 다운로드 완료 ^(~600KB^)
) else (
    echo ✗ Three.js 다운로드 실패
)

echo.
echo [2/3] Cannon.js 다운로드 중...
curl -L -o cannon-es.min.js https://unpkg.com/cannon-es@0.20.0/dist/cannon-es.min.js
if %errorlevel% == 0 (
    echo ✓ Cannon.js 다운로드 완료 ^(~300KB^)
) else (
    echo ✗ Cannon.js 다운로드 실패
)

echo.
echo [3/3] OrbitControls 다운로드 중...
curl -L -o OrbitControls.js https://unpkg.com/three@0.150.0/examples/js/controls/OrbitControls.js
if %errorlevel% == 0 (
    echo ✓ OrbitControls 다운로드 완료 ^(~30KB^)
) else (
    echo ✗ OrbitControls 다운로드 실패
)

cd ..

echo.
echo ========================================
echo 다운로드 완료!
echo ========================================
echo.
echo 사용 방법:
echo 1. mesh-cutting-threejs.html 파일을 엽니다
echo 2. CDN 링크를 다음으로 변경:
echo    libs-threejs/three.min.js
echo    libs-threejs/cannon-es.min.js
echo    libs-threejs/OrbitControls.js
echo.
pause

