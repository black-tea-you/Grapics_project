@echo off
echo ========================================
echo Cannon.js 라이브러리 다운로드
echo ========================================
echo.

REM js 폴더로 이동 (Three.js와 함께 저장)
cd Grapics\js

echo Cannon.js 다운로드 중...
curl -L -o cannon-es.min.js https://unpkg.com/cannon-es@0.20.0/dist/cannon-es.min.js

if %errorlevel% == 0 (
    echo.
    echo ========================================
    echo ✓ Cannon.js 다운로드 완료!
    echo ========================================
    echo.
    echo 저장 위치: Grapics\js\cannon-es.min.js
    echo 파일 크기: ~300KB
    echo.
) else (
    echo.
    echo ✗ 다운로드 실패
    echo.
)

cd ..\..

pause

