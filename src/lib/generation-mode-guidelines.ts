export type GenerationMode = "general-sale" | "gift-set";

export const generationModeGuidelines = {
  "general-sale": {
    label: "일반판매용",
    description: "밝고 깨끗한 쇼핑몰 대표 썸네일 분위기",
    promptLines: [
      "쇼핑몰 목록과 상세페이지 대표 이미지에 적합해야 한다.",
      "밝고 깨끗한 스튜디오 상품 사진 느낌이어야 한다.",
      "상품이 중앙에 크고 선명하게 보여야 한다.",
      "배경은 사용자가 입력한 설명을 따르되, 과한 장식은 피한다.",
      "고기 자체가 주인공이어야 한다.",
      "실제 상품의 양, 형태, 색감, 마블링, 부위를 과장하지 않는다.",
      "고기를 실제보다 많아 보이게 만들지 않는다.",
      "텍스트, 로고, 가격, 라벨, 배지는 넣지 않는다.",
    ],
  },
  "gift-set": {
    label: "선물세트용",
    description: "정갈하고 고급스러운 선물세트 분위기",
    promptLines: [
      "명절 선물세트나 프리미엄 정육 선물 이미지에 적합해야 한다.",
      "정갈하고 고급스러운 패키지 분위기를 만든다.",
      "다크 우드, 고급 종이 질감, 차분한 베이지, 프리미엄 스튜디오 조명 같은 배경 방향을 허용한다.",
      "상품 배열은 정돈되고 고급스러워야 한다.",
      "단, 실제 상품과 다른 구성품을 임의로 추가하지 않는다.",
      "리본, 라벨, 가격표, 브랜드 로고, 텍스트는 넣지 않는다.",
      "과도한 장식보다 신뢰감 있는 상품 이미지가 우선이다.",
      "실제 상품의 양, 형태, 색감, 마블링, 부위를 과장하지 않는다.",
    ],
  },
} satisfies Record<GenerationMode, {
  label: string;
  description: string;
  promptLines: string[];
}>;

export const commonImageGenerationBans = [
  "텍스트 삽입 금지",
  "로고 삽입 금지",
  "가격표 삽입 금지",
  "라벨 삽입 금지",
  "배지 삽입 금지",
  "실제보다 많은 고기 양 표현 금지",
  "다른 부위처럼 보이는 변경 금지",
  "과도한 붉은색 보정 금지",
  "비현실적인 마블링 추가 금지",
  "실제 사진과 다른 구성품 추가 금지",
];

export function normalizeGenerationMode(value: string): GenerationMode {
  if (value === "gift-set" || value === "gift") return "gift-set";
  return "general-sale";
}

export function getGenerationModeLabel(mode: GenerationMode) {
  return generationModeGuidelines[mode].label;
}

export function buildThumbnailPrompt(mode: GenerationMode, background: string) {
  const guidelines = generationModeGuidelines[mode];
  const backgroundPrompt = background
    ? `사용자 배경 설명: ${background}`
    : "배경은 선택한 생성 모드에 맞게 과하지 않은 스튜디오 톤으로 정리한다.";

  return [
    "업로드된 실제 정육 상품 사진을 기반으로 정사각형 쇼핑몰 썸네일 이미지를 생성한다.",
    `생성 모드: ${guidelines.label}`,
    backgroundPrompt,
    ...guidelines.promptLines,
    "공통 금지 규칙:",
    ...commonImageGenerationBans.map((rule) => `- ${rule}`),
    "고기 색은 자연스럽고 신선하게 유지하되 부자연스럽게 붉게 만들지 않는다.",
  ].join("\n");
}
