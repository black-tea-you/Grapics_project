// 캔버스 설정
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const infoDiv = document.getElementById('info');

// 상태 변수
let meshes = [];
let isDrawing = false;
let startPoint = null;
let currentPoint = null;
let cutLine = null;

// 물리 엔진을 위한 변수
let animationId = null;

// 와이어프레임 모드
let wireframeMode = false;

// 메쉬 클래스
class Mesh {
    constructor(vertices, color = null) {
        this.vertices = vertices; // [{x, y}, ...]
        this.color = color || this.generateRandomColor();
        this.velocity = { x: 0, y: 0 };
        this.angularVelocity = 0;
        this.angle = 0;
        this.center = this.calculateCenter();
    }

    calculateCenter() {
        let sumX = 0, sumY = 0;
        for (let v of this.vertices) {
            sumX += v.x;
            sumY += v.y;
        }
        return {
            x: sumX / this.vertices.length,
            y: sumY / this.vertices.length
        };
    }

    generateRandomColor() {
        const hue = Math.random() * 360;
        return `hsl(${hue}, 70%, 60%)`;
    }

    draw(ctx) {
        if (this.vertices.length < 3) return;

        ctx.save();
        ctx.translate(this.center.x, this.center.y);
        ctx.rotate(this.angle);
        ctx.translate(-this.center.x, -this.center.y);

        if (wireframeMode) {
            this.drawWireframe(ctx);
        } else {
            ctx.beginPath();
            ctx.moveTo(this.vertices[0].x, this.vertices[0].y);
            for (let i = 1; i < this.vertices.length; i++) {
                ctx.lineTo(this.vertices[i].x, this.vertices[i].y);
            }
            ctx.closePath();

            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        ctx.restore();
    }

    drawWireframe(ctx) {
        // 삼각형 분해
        const triangles = this.triangulate();

        // 반투명 배경
        ctx.beginPath();
        ctx.moveTo(this.vertices[0].x, this.vertices[0].y);
        for (let i = 1; i < this.vertices.length; i++) {
            ctx.lineTo(this.vertices[i].x, this.vertices[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = this.color + '40'; // 투명도 추가
        ctx.fill();

        // 삼각형 그리기
        for (let i = 0; i < triangles.length; i++) {
            const tri = triangles[i];
            
            // 삼각형 외곽선
            ctx.beginPath();
            ctx.moveTo(tri[0].x, tri[0].y);
            ctx.lineTo(tri[1].x, tri[1].y);
            ctx.lineTo(tri[2].x, tri[2].y);
            ctx.closePath();
            
            ctx.strokeStyle = '#FF6B6B';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // 삼각형 번호
            const centerX = (tri[0].x + tri[1].x + tri[2].x) / 3;
            const centerY = (tri[0].y + tri[1].y + tri[2].y) / 3;
            ctx.fillStyle = '#FF6B6B';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`T${i}`, centerX, centerY);
        }

        // 정점 그리기
        for (let i = 0; i < this.vertices.length; i++) {
            const v = this.vertices[i];
            
            // 정점 점
            ctx.beginPath();
            ctx.arc(v.x, v.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#4ECDC4';
            ctx.fill();
            ctx.strokeStyle = '#2C3E50';
            ctx.lineWidth = 2;
            ctx.stroke();

            // 정점 번호
            ctx.fillStyle = '#2C3E50';
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`V${i}`, v.x, v.y - 8);
        }

        // 외곽선 강조
        ctx.beginPath();
        ctx.moveTo(this.vertices[0].x, this.vertices[0].y);
        for (let i = 1; i < this.vertices.length; i++) {
            ctx.lineTo(this.vertices[i].x, this.vertices[i].y);
        }
        ctx.closePath();
        ctx.strokeStyle = '#2C3E50';
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    // Fan Triangulation (폴리곤을 삼각형으로 분해)
    triangulate() {
        const triangles = [];
        if (this.vertices.length < 3) return triangles;

        // 첫 번째 정점을 중심으로 부채꼴 분할
        const v0 = this.vertices[0];
        for (let i = 1; i < this.vertices.length - 1; i++) {
            const v1 = this.vertices[i];
            const v2 = this.vertices[i + 1];
            triangles.push([
                { x: v0.x, y: v0.y },
                { x: v1.x, y: v1.y },
                { x: v2.x, y: v2.y }
            ]);
        }

        return triangles;
    }

    update() {
        const groundLevel = canvas.height - 150; // 바닥 레벨을 위로 올림
        const stopThreshold = 0.5; // 속도가 이보다 작으면 정지
        
        // 바닥에 닿지 않았으면 중력 적용
        if (this.center.y < groundLevel) {
            this.velocity.y += 0.3;
        }

        // 위치 업데이트
        this.center.x += this.velocity.x;
        this.center.y += this.velocity.y;

        // 각도 업데이트
        this.angle += this.angularVelocity;

        // 정점 위치 업데이트
        for (let v of this.vertices) {
            v.x += this.velocity.x;
            v.y += this.velocity.y;
        }

        // 바닥 충돌 및 정착
        if (this.center.y >= groundLevel && this.velocity.y > 0) {
            // 바닥에 닿음
            this.center.y = groundLevel;
            
            // 정점들도 조정
            for (let v of this.vertices) {
                v.y -= (this.center.y - groundLevel);
            }
            
            // 반발력 적용
            if (Math.abs(this.velocity.y) > stopThreshold) {
                this.velocity.y *= -0.4;
                this.velocity.x *= 0.8;
                this.angularVelocity *= 0.8;
            } else {
                // 거의 정지 - 완전히 멈춤
                this.velocity.y = 0;
                this.velocity.x *= 0.95;
                this.angularVelocity *= 0.95;
                
                // 완전 정지
                if (Math.abs(this.velocity.x) < 0.1) {
                    this.velocity.x = 0;
                }
                if (Math.abs(this.angularVelocity) < 0.01) {
                    this.angularVelocity = 0;
                }
            }
        }
        
        // 좌우 경계 체크
        if (this.center.x < 0 || this.center.x > canvas.width) {
            this.velocity.x *= -0.5;
        }

        return true; // 항상 유지
    }

    applyImpulse(impulse) {
        this.velocity.x += impulse.x;
        this.velocity.y += impulse.y;
        this.angularVelocity += (Math.random() - 0.5) * 0.1;
    }
}

// SVG Path 파서
class SVGPathParser {
    static parse(pathData) {
        const allPaths = []; // 여러 개의 분리된 경로를 저장
        let vertices = [];
        const commands = pathData.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g);
        
        let currentX = 0, currentY = 0;
        let startX = 0, startY = 0;
        let isFirstMove = true;

        if (!commands) return vertices;

        for (let cmd of commands) {
            const type = cmd[0];
            const coords = cmd.slice(1).trim().split(/[\s,]+/).filter(c => c).map(Number);

            switch (type) {
                case 'M': // moveto absolute
                    // 첫 번째 M이 아니면, 이전 경로를 저장하고 새 경로 시작
                    if (!isFirstMove && vertices.length > 0) {
                        allPaths.push([...vertices]);
                        vertices = [];
                    }
                    isFirstMove = false;
                    
                    currentX = coords[0];
                    currentY = coords[1];
                    startX = currentX;
                    startY = currentY;
                    vertices.push({ x: currentX, y: currentY });
                    break;

                case 'm': // moveto relative
                    // 첫 번째 m이 아니면, 이전 경로를 저장하고 새 경로 시작
                    if (!isFirstMove && vertices.length > 0) {
                        allPaths.push([...vertices]);
                        vertices = [];
                    }
                    isFirstMove = false;
                    
                    currentX += coords[0];
                    currentY += coords[1];
                    startX = currentX;
                    startY = currentY;
                    vertices.push({ x: currentX, y: currentY });
                    break;

                case 'L': // lineto absolute
                    for (let i = 0; i < coords.length; i += 2) {
                        currentX = coords[i];
                        currentY = coords[i + 1];
                        vertices.push({ x: currentX, y: currentY });
                    }
                    break;

                case 'l': // lineto relative
                    for (let i = 0; i < coords.length; i += 2) {
                        currentX += coords[i];
                        currentY += coords[i + 1];
                        vertices.push({ x: currentX, y: currentY });
                    }
                    break;

                case 'H': // horizontal lineto absolute
                    for (let i = 0; i < coords.length; i++) {
                        currentX = coords[i];
                        vertices.push({ x: currentX, y: currentY });
                    }
                    break;

                case 'h': // horizontal lineto relative
                    for (let i = 0; i < coords.length; i++) {
                        currentX += coords[i];
                        vertices.push({ x: currentX, y: currentY });
                    }
                    break;

                case 'V': // vertical lineto absolute
                    for (let i = 0; i < coords.length; i++) {
                        currentY = coords[i];
                        vertices.push({ x: currentX, y: currentY });
                    }
                    break;

                case 'v': // vertical lineto relative
                    for (let i = 0; i < coords.length; i++) {
                        currentY += coords[i];
                        vertices.push({ x: currentX, y: currentY });
                    }
                    break;

                case 'Q': // quadratic Bezier curve - 여러 점으로 샘플링
                    for (let i = 0; i < coords.length; i += 4) {
                        const cpX = coords[i];     // 제어점 X
                        const cpY = coords[i + 1]; // 제어점 Y
                        const endX = coords[i + 2]; // 끝점 X
                        const endY = coords[i + 3]; // 끝점 Y
                        
                        // 곡선을 10개의 선분으로 근사
                        const segments = 10;
                        for (let t = 1; t <= segments; t++) {
                            const ratio = t / segments;
                            const invRatio = 1 - ratio;
                            
                            // Quadratic Bezier 공식: B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
                            const x = invRatio * invRatio * currentX + 
                                     2 * invRatio * ratio * cpX + 
                                     ratio * ratio * endX;
                            const y = invRatio * invRatio * currentY + 
                                     2 * invRatio * ratio * cpY + 
                                     ratio * ratio * endY;
                            
                            vertices.push({ x, y });
                        }
                        
                        currentX = endX;
                        currentY = endY;
                    }
                    break;
                
                case 'q': // quadratic Bezier curve relative - 여러 점으로 샘플링
                    for (let i = 0; i < coords.length; i += 4) {
                        const cpX = currentX + coords[i];     // 제어점 X
                        const cpY = currentY + coords[i + 1]; // 제어점 Y
                        const endX = currentX + coords[i + 2]; // 끝점 X
                        const endY = currentY + coords[i + 3]; // 끝점 Y
                        
                        // 곡선을 10개의 선분으로 근사
                        const segments = 10;
                        for (let t = 1; t <= segments; t++) {
                            const ratio = t / segments;
                            const invRatio = 1 - ratio;
                            
                            // Quadratic Bezier 공식
                            const x = invRatio * invRatio * currentX + 
                                     2 * invRatio * ratio * cpX + 
                                     ratio * ratio * endX;
                            const y = invRatio * invRatio * currentY + 
                                     2 * invRatio * ratio * cpY + 
                                     ratio * ratio * endY;
                            
                            vertices.push({ x, y });
                        }
                        
                        currentX = endX;
                        currentY = endY;
                    }
                    break;

                case 'Z':
                case 'z': // closepath
                    if (currentX !== startX || currentY !== startY) {
                        vertices.push({ x: startX, y: startY });
                        currentX = startX;
                        currentY = startY;
                    }
                    break;
            }
        }

        // 마지막 경로 추가
        if (vertices.length > 0) {
            allPaths.push(vertices);
        }

        // 경로가 여러 개인 경우, 가장 큰 (외곽선) 경로만 반환
        if (allPaths.length === 0) {
            return [];
        } else if (allPaths.length === 1) {
            return allPaths[0];
        } else {
            // 가장 많은 정점을 가진 경로를 반환 (보통 외곽선이 가장 복잡함)
            let largestPath = allPaths[0];
            for (let path of allPaths) {
                if (path.length > largestPath.length) {
                    largestPath = path;
                }
            }
            console.log(`SVG에서 ${allPaths.length}개의 경로 발견. 가장 큰 경로(${largestPath.length}개 정점) 사용.`);
            return largestPath;
        }
    }
}

// 기하학 유틸리티
class GeometryUtils {
    // 선분 교차 검사
    static lineSegmentIntersection(p1, p2, p3, p4) {
        const x1 = p1.x, y1 = p1.y;
        const x2 = p2.x, y2 = p2.y;
        const x3 = p3.x, y3 = p3.y;
        const x4 = p4.x, y4 = p4.y;

        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        
        if (Math.abs(denom) < 1e-10) return null; // 평행

        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return {
                x: x1 + t * (x2 - x1),
                y: y1 + t * (y2 - y1),
                t: t
            };
        }

        return null;
    }

    // 점이 선분의 어느 쪽에 있는지 확인
    static whichSide(lineStart, lineEnd, point) {
        return (lineEnd.x - lineStart.x) * (point.y - lineStart.y) - 
               (lineEnd.y - lineStart.y) * (point.x - lineStart.x);
    }

    // 폴리곤을 직선으로 절단
    static cutPolygon(vertices, cutStart, cutEnd) {
        if (vertices.length < 3) {
            console.log('❌ 정점이 3개 미만입니다.');
            return [vertices];
        }

        const intersections = [];
        const sides = [];

        // 각 정점이 선분의 어느 쪽에 있는지 확인
        for (let i = 0; i < vertices.length; i++) {
            const side = this.whichSide(cutStart, cutEnd, vertices[i]);
            sides.push(side);
        }

        // 교차점 찾기
        for (let i = 0; i < vertices.length; i++) {
            const j = (i + 1) % vertices.length;
            const v1 = vertices[i];
            const v2 = vertices[j];

            const intersection = this.lineSegmentIntersection(
                cutStart, cutEnd, v1, v2
            );

            if (intersection) {
                intersections.push({
                    point: intersection,
                    edgeIndex: i,
                    t: intersection.t
                });
            }
        }

        // 교차점이 2개가 아니면 절단 불가
        if (intersections.length !== 2) {
            console.log(`❌ 교차점 ${intersections.length}개 발견 (2개 필요). 절단 불가.`);
            return [vertices];
        }
        
        console.log(`✅ 교차점 2개 발견! 메쉬 절단 시작...`);

        // 교차점 정렬
        intersections.sort((a, b) => a.t - b.t);

        const [int1, int2] = intersections;

        // 두 개의 새로운 폴리곤 생성
        const poly1 = [];
        const poly2 = [];

        let currentPoly = poly1;

        for (let i = 0; i <= vertices.length; i++) {
            const idx = i % vertices.length;
            const vertex = vertices[idx];

            // 첫 번째 교차점
            if (i === int1.edgeIndex + 1) {
                currentPoly.push({ x: int1.point.x, y: int1.point.y });
                currentPoly = (currentPoly === poly1) ? poly2 : poly1;
                currentPoly.push({ x: int1.point.x, y: int1.point.y });
            }

            // 두 번째 교차점
            if (i === int2.edgeIndex + 1) {
                currentPoly.push({ x: int2.point.x, y: int2.point.y });
                currentPoly = (currentPoly === poly1) ? poly2 : poly1;
                currentPoly.push({ x: int2.point.x, y: int2.point.y });
            }

            if (i < vertices.length) {
                currentPoly.push({ ...vertex });
            }
        }

        // 빈 폴리곤 제거
        const result = [];
        if (poly1.length >= 3) result.push(poly1);
        if (poly2.length >= 3) result.push(poly2);

        return result.length > 0 ? result : [vertices];
    }
}

// 도형 생성 함수들
function createTreeLeafShape() {
    // SVG Layer0_0_FILL의 실제 나뭇잎 path 데이터
    const pathData = `
        M 596.2 211.7
        Q 596.2 211.1 596.25 210.55 596.2 210.5 596.15 210.5 596.15 210.6 596.15 210.7 596.15 211.2 596.2 211.7
        M 660.35 61.65
        Q 660.05 61.35 659.8 61.1 654 56.15 646.55 56.65 643.65 56.85 641.25 57.8 639.6 55.9 637.35 54.4 631.05 50.2 623.7 51.7 623.35 51.8 622.95 51.85 615.6 53.35 611.4 59.65 609.8 62 609.05 64.55 606.95 64.65 604.8 65.25 597.55 67.3 593.85 73.9 593.25 74.95 592.8 76 591.4 79.2 591.2 82.45 591.2 82.8 591.3 83.2 591.5 85.6 592.45 88 593 89.35 593.7 90.6 593.4 90.9 593.2 91.2 593.1 91.3 593.05 91.35 590.3 94.6 589.4 98.65 589 100.45 588.95 102.4
        L 588.95 102.7
        Q 588.95 102.8 588.95 102.85
        L 588.95 103.6
        Q 588.95 103.9 588.95 104.25 589.1 109.05 591.5 112.9 592 113.7 592.6 114.5 592.2 115 591.9 115.5 589.6 118.9 589.1 123.1 588.95 124.25 588.95 125.45
        L 588.95 126.15
        Q 588.95 126.5 588.95 126.8 589.05 130.3 590.35 133.3 591.2 135.3 592.6 137.1 592.2 137.6 591.9 138.1 590.2 140.55 589.5 143.45 588.95 145.65 588.95 148.05
        L 588.95 148.75
        Q 588.95 149.1 588.95 149.4 589 151.6 589.55 153.65 590.45 156.95 592.6 159.7 592.2 160.2 591.9 160.7 590.9 162.15 590.25 163.8 588.95 166.95 588.95 170.65
        L 588.95 171.35
        Q 588.95 171.7 588.95 172 589 173 589.1 174 589.75 178.6 592.6 182.3 592.2 182.8 591.9 183.3 591.6 183.7 591.35 184.15 590.75 185.1 590.35 186.2 592.7 191.6 598.35 197.6 598.5 197.75 598.65 198 599.8 199.55 601.5 200.95 601.55 200.95 601.6 201 601.8 201.15 602 201.35 607.35 205.7 614.9 205.7 617.75 205.7 620.3 205.1 621.6 206.55 623.4 207.75 629.25 211.7 636.75 211.1 637.1 211.1 637.5 211.05 644.95 210.4 649.7 205.65 651.7 203.65 652.75 201.45 655.5 201.5 658.35 200.85 662.8 199.8 665.95 197.35 666.05 197.25 666.2 197.15 666.9 196.55 667.5 196.2 671.4 193.45 674 189.9 674.85 187.4 674.95 184.6 674.95 184.25 674.95 183.95
        L 674.95 183.2
        Q 674.95 178.75 673.15 175.1 672.65 174.15 672.1 173.25 671.75 172.75 671.35 172.25 673.85 168.95 674.65 164.95 674.9 163.5 674.95 162 674.95 161.65 674.95 161.35
        L 674.95 160.6
        Q 674.95 157.5 674.05 154.8 673.35 152.6 672.05 150.7 671.7 150.2 671.35 149.7 673.15 147.35 674.05 144.6 674.85 142.15 674.95 139.4 674.95 139.05 674.95 138.75
        L 674.95 138
        Q 674.95 136.15 674.65 134.4 674 131 672.1 128.1 671.75 127.6 671.35 127.1 672.4 125.75 673.15 124.3 674.8 120.85 674.95 116.8 674.95 116.45 674.95 116.15
        L 674.95 115.4
        Q 674.95 114.7 674.9 114.05 674.6 109.3 672.1 105.5 671.75 105 671.35 104.5 671.55 104.2 671.8 103.95 673.5 101.45 674.3 98.65 674.9 96.5 674.95 94.2
        L 674.95 93.9
        Q 674.95 93.7 674.95 93.55
        L 674.95 92.85
        Q 674.95 85.3 669.65 79.95 668.15 78.45 666.55 77.4 666.5 77.35 666.45 77.35 666.35 77.3 666.2 77.2 666.3 76.6 666.4 76 666.5 75.2 666.55 74.45 666.5 74.3 666.5 74.15 666 66.6 660.35 61.65 Z
    `;
    
    let vertices = SVGPathParser.parse(pathData);
    
    // 크기 조정 및 중앙 배치
    const scale = 1.5;
    const offsetX = canvas.width / 2 - 620;
    const offsetY = 50;
    
    vertices = vertices.map(v => ({
        x: v.x * scale + offsetX,
        y: v.y * scale + offsetY
    }));
    
    return vertices;
}

function createTriangle() {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const size = 150;
    
    return [
        { x: centerX, y: centerY - size },
        { x: centerX - size * 0.866, y: centerY + size * 0.5 },
        { x: centerX + size * 0.866, y: centerY + size * 0.5 }
    ];
}

function createSquare() {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const size = 150;
    
    return [
        { x: centerX - size, y: centerY - size },
        { x: centerX + size, y: centerY - size },
        { x: centerX + size, y: centerY + size },
        { x: centerX - size, y: centerY + size }
    ];
}

function createPentagon() {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const size = 150;
    const vertices = [];
    
    for (let i = 0; i < 5; i++) {
        const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
        vertices.push({
            x: centerX + size * Math.cos(angle),
            y: centerY + size * Math.sin(angle)
        });
    }
    
    return vertices;
}

function createCircle() {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const size = 150;
    const vertices = [];
    const segments = 32;
    
    for (let i = 0; i < segments; i++) {
        const angle = (i * 2 * Math.PI / segments);
        vertices.push({
            x: centerX + size * Math.cos(angle),
            y: centerY + size * Math.sin(angle)
        });
    }
    
    return vertices;
}

// 이벤트 핸들러
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    startPoint = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
    currentPoint = { ...startPoint };
    isDrawing = true;
    infoDiv.className = 'info drawing';
    infoDiv.textContent = '드래그 중... 마우스를 놓으면 절단됩니다';
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    
    const rect = canvas.getBoundingClientRect();
    currentPoint = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
});

canvas.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    
    const rect = canvas.getBoundingClientRect();
    const endPoint = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
    
    isDrawing = false;
    cutLine = { start: startPoint, end: endPoint };
    
    // 메쉬 절단 수행
    performCut(startPoint, endPoint);
    
    cutLine = null;
    startPoint = null;
    currentPoint = null;
    
    infoDiv.className = 'info';
    infoDiv.textContent = `메쉬 절단 완료! 현재 조각: ${meshes.length}개`;
});

// 메쉬 절단 함수
function performCut(cutStart, cutEnd) {
    const newMeshes = [];
    let cutPerformed = false;
    
    for (let mesh of meshes) {
        const cutResult = GeometryUtils.cutPolygon(
            mesh.vertices,
            cutStart,
            cutEnd
        );
        
        if (cutResult.length > 1) {
            // 절단 성공
            cutPerformed = true;
            for (let newVertices of cutResult) {
                const newMesh = new Mesh(newVertices);
                // 분리 효과
                const impulse = {
                    x: (Math.random() - 0.5) * 5,
                    y: -Math.random() * 3
                };
                newMesh.applyImpulse(impulse);
                newMeshes.push(newMesh);
            }
        } else {
            // 절단되지 않음
            newMeshes.push(mesh);
        }
    }
    
    meshes = newMeshes;
    
    if (cutPerformed) {
        console.log(`메쉬가 절단되었습니다. 총 ${meshes.length}개의 조각`);
    }
}

// 렌더링 루프
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 배경 그리드
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 50) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
    }
    
    // 바닥선 표시
    const groundLevel = canvas.height - 150;
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, groundLevel);
    ctx.lineTo(canvas.width, groundLevel);
    ctx.stroke();
    
    // 바닥 영역 표시
    ctx.fillStyle = 'rgba(139, 69, 19, 0.1)';
    ctx.fillRect(0, groundLevel, canvas.width, canvas.height - groundLevel);
    
    // 메쉬 그리기 및 업데이트
    meshes = meshes.filter(mesh => {
        mesh.draw(ctx);
        return mesh.update();
    });
    
    // 절단선 그리기
    if (isDrawing && startPoint && currentPoint) {
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 5]);
        ctx.beginPath();
        ctx.moveTo(startPoint.x, startPoint.y);
        ctx.lineTo(currentPoint.x, currentPoint.y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // 시작점과 끝점 표시
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(startPoint.x, startPoint.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(currentPoint.x, currentPoint.y, 5, 0, Math.PI * 2);
        ctx.fill();
    }
    
    animationId = requestAnimationFrame(render);
}

// 씬 초기화
function resetScene() {
    meshes = [];
    loadSelectedShape();
    infoDiv.className = 'info';
    infoDiv.textContent = '드래그하여 메쉬를 절단하세요';
}

// 선택된 도형 불러오기
function loadSelectedShape() {
    const select = document.getElementById('shapeSelect');
    const shapeType = select.value;
    
    let vertices;
    let defaultColor = '#80BE1F'; // 기본 녹색
    
    switch (shapeType) {
        case 'leaf':
            vertices = createTreeLeafShape();
            defaultColor = '#80BE1F'; // 나뭇잎 녹색
            break;
        case 'triangle':
            vertices = createTriangle();
            defaultColor = '#4ECDC4'; // 청록색
            break;
        case 'square':
            vertices = createSquare();
            defaultColor = '#FF6B6B'; // 빨강
            break;
        case 'pentagon':
            vertices = createPentagon();
            defaultColor = '#95E1D3'; // 민트
            break;
        case 'circle':
            vertices = createCircle();
            defaultColor = '#F38181'; // 핑크
            break;
        default:
            vertices = createSquare();
    }
    
    meshes = [new Mesh(vertices, defaultColor)];
    
    const shapeNames = {
        'leaf': '나뭇잎',
        'triangle': '삼각형',
        'square': '사각형',
        'pentagon': '오각형',
        'circle': '원'
    };
    
    infoDiv.textContent = `${shapeNames[shapeType] || shapeType} 도형이 로드되었습니다. 드래그하여 절단하세요.`;
}

// 와이어프레임 토글
function toggleWireframe() {
    wireframeMode = !wireframeMode;
    
    const btn = document.querySelector('.btn-wireframe');
    if (wireframeMode) {
        btn.classList.add('active');
        btn.textContent = '🔍 와이어프레임 ON';
        infoDiv.textContent = '와이어프레임 모드: 정점(V), 삼각형(T) 표시 중';
        infoDiv.style.background = '#d0ebff';
        infoDiv.style.color = '#1971c2';
    } else {
        btn.classList.remove('active');
        btn.textContent = '🔍 와이어프레임';
        infoDiv.textContent = '드래그하여 메쉬를 절단하세요';
        infoDiv.style.background = '#e9ecef';
        infoDiv.style.color = '#495057';
    }
    
    // 통계 출력
    if (wireframeMode && meshes.length > 0) {
        let totalVertices = 0;
        let totalTriangles = 0;
        
        meshes.forEach(mesh => {
            totalVertices += mesh.vertices.length;
            totalTriangles += mesh.triangulate().length;
        });
        
        console.log('=== 메쉬 통계 ===');
        console.log(`메쉬 개수: ${meshes.length}`);
        console.log(`총 정점 수: ${totalVertices}`);
        console.log(`총 삼각형 수: ${totalTriangles}`);
        
        meshes.forEach((mesh, idx) => {
            const tris = mesh.triangulate();
            console.log(`\n메쉬 #${idx}:`);
            console.log(`  - 정점: ${mesh.vertices.length}개`);
            console.log(`  - 삼각형: ${tris.length}개`);
            console.log(`  - 색상: ${mesh.color}`);
        });
    }
}

// 초기화
document.getElementById('shapeSelect').addEventListener('change', loadSelectedShape);
loadSelectedShape();
render();

