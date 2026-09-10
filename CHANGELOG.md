# Changelog

## 0.1.0 — 2026-09-10

첫 공개. 텍스트·파일을 아이소메트릭 도시로 그리는 렌더러.

- `createCityRenderer` — three.js 정사영 씬, 조작(팬·회전·줌·선택), 라벨, 낮/밤, 건물 상승 연출
- `ingestText` · `ingestTexts` · `ingestFiles` — Markdown·평문·CSV·TSV·JSON 을 구역 > 건물 > 항목으로 읽는다
- `layoutCity` — 구역 격자 배치, 항목 수 → 층수·형태·별관, 빈 필지, 구역 간 통행로
- 건물 양식 5종(lab·lobby·control·server·campus), 팔레트 교체, 활성도 기준 창 조명
