const DEFAULT_DESTINATION = '추천 여행지';
const DEFAULT_DURATION_DAYS = 2;
const MAX_DURATION_DAYS = 7;

const DESTINATION_ALIASES = [
  { destination: '부산', aliases: ['부산', '해운대', '광안리', '서면'] },
  { destination: '도쿄', aliases: ['도쿄', '동경', '아키하바라', '이케부쿠로', '시부야', '신주쿠'] },
  { destination: '제주', aliases: ['제주', '제주도', '애월', '서귀포', '한림'] },
  { destination: '오사카', aliases: ['오사카', '난바', '도톤보리', '우메다', '신사이바시'] },
  { destination: '후쿠오카', aliases: ['후쿠오카', '하카타', '텐진', '다자이후'] },
  { destination: '교토', aliases: ['교토', '기온', '아라시야마', '청수사'] },
  { destination: '대마도', aliases: ['대마도', '쓰시마', '이즈하라', '히타카츠'] },
  { destination: '거제', aliases: ['거제', '거제도', '장승포', '외도', '매미성'] },
];

const THEME_RULES = [
  { theme: '미식', keywords: ['맛집', '음식', '미식', '먹방', '식당', '로컬푸드'] },
  { theme: '가족', keywords: ['가족', '아이', '부모님', '어르신', '가족여행'] },
  { theme: '커플', keywords: ['커플', '연인', '데이트', '신혼'] },
  { theme: '역사·문화', keywords: ['역사', '전통', '박물관', '문화', '사찰', '유적'] },
  { theme: '콘텐츠·성지순례', keywords: ['애니메이션', '애니', '영화', '드라마', '성지순례', '촬영지'] },
  { theme: '자연·힐링', keywords: ['자연', '힐링', '바다', '산', '휴식', '여유'] },
  { theme: '쇼핑', keywords: ['쇼핑', '아울렛', '백화점', '시장', '기념품'] },
];

const DESTINATION_TEMPLATES = {
  부산: {
    regions: ['해운대', '광안리', '서면', '남포동'],
    places: ['해운대 해변', '광안리 카페 거리', '전포 카페 거리', 'BIFF 광장'],
  },
  도쿄: {
    regions: ['아키하바라', '이케부쿠로', '시부야', '신주쿠'],
    places: ['아키하바라 라디오회관', '애니메이트 이케부쿠로', '시부야 스크램블', '신주쿠 전망대'],
  },
  제주: {
    regions: ['제주시', '애월', '서귀포', '한림'],
    places: ['애월 해안도로', '협재해변', '서귀포 해안 산책로', '동문시장'],
  },
  오사카: {
    regions: ['난바', '도톤보리', '신사이바시', '우메다'],
    places: ['도톤보리', '신사이바시 상점가', '구로몬시장', '우메다 스카이빌딩'],
  },
  후쿠오카: {
    regions: ['하카타', '텐진', '나카스', '다자이후'],
    places: ['하카타역', '텐진 지하상가', '나카스 강변', '다자이후 텐만구'],
  },
  교토: {
    regions: ['기온', '히가시야마', '아라시야마', '가와라마치'],
    places: ['기온 거리', '니넨자카 산넨자카', '아라시야마 대나무숲', '가와라마치 카페'],
  },
  대마도: {
    regions: ['이즈하라', '아소만', '히타카츠', '미우다'],
    places: ['이즈하라 거리', '아소만 전망 포인트', '히타카츠 쇼핑 거리', '미우다 해변'],
  },
  거제: {
    regions: ['장승포', '구조라', '매미성', '옥포'],
    places: ['장승포항', '구조라 해변', '매미성', '옥포 카페 거리'],
  },
};

const GENERIC_TEMPLATE = {
  regions: ['중심가', '로컬 거리', '전망 명소', '휴식 구역'],
  places: ['중심가 산책', '로컬 맛집 거리', '전망 좋은 명소', '여유로운 카페'],
};

const THEME_BLOCKS = {
  미식: [
    { time: '10:00', category: 'food', title: '대표 맛집 탐방', memo: '현지 음식을 중심으로 여행 분위기를 잡는 블록', priceLevel: 'medium', estimatedCost: '35,000원' },
    { time: '14:00', category: 'cafe', title: '디저트 카페 휴식', memo: '이동 중 쉬어가기 좋은 카페 일정', priceLevel: 'medium', estimatedCost: '15,000원' },
    { time: '18:00', category: 'food', title: '저녁 미식 코스', memo: '하루 마무리에 어울리는 식사 블록', priceLevel: 'high', estimatedCost: '55,000원' },
  ],
  가족: [
    { time: '10:00', category: 'sightseeing', title: '무리 없는 대표 명소', memo: '가족 동행에 맞춰 이동 부담을 줄인 일정', priceLevel: 'low', estimatedCost: '0원' },
    { time: '13:00', category: 'food', title: '편안한 점심 식사', memo: '아이와 부모님 모두 접근하기 쉬운 식사 블록', priceLevel: 'medium', estimatedCost: '30,000원' },
    { time: '16:00', category: 'cafe', title: '휴식 카페', memo: '긴 이동 없이 쉬어가는 가족 여행 블록', priceLevel: 'medium', estimatedCost: '18,000원' },
  ],
  커플: [
    { time: '10:30', category: 'sightseeing', title: '감성 산책 코스', memo: '사진을 남기기 좋은 커플 일정', priceLevel: 'low', estimatedCost: '0원' },
    { time: '15:00', category: 'cafe', title: '분위기 좋은 카페', memo: '대화와 휴식에 맞춘 데이트 블록', priceLevel: 'medium', estimatedCost: '20,000원' },
    { time: '18:30', category: 'food', title: '저녁 데이트 식사', memo: '하루를 정리하는 커플 식사 일정', priceLevel: 'high', estimatedCost: '60,000원' },
  ],
  '역사·문화': [
    { time: '10:00', category: 'sightseeing', title: '역사 명소 관람', memo: '지역의 배경을 이해하는 문화 일정', priceLevel: 'low', estimatedCost: '5,000원' },
    { time: '14:00', category: 'activity', title: '전통 거리 산책', memo: '전통 건축과 골목을 보는 블록', priceLevel: 'low', estimatedCost: '0원' },
    { time: '16:30', category: 'cafe', title: '로컬 찻집 휴식', memo: '문화 산책 후 쉬어가는 일정', priceLevel: 'medium', estimatedCost: '15,000원' },
  ],
  '콘텐츠·성지순례': [
    { time: '10:00', category: 'activity', title: '성지순례 핵심 스팟', memo: '작품이나 콘텐츠와 연결된 장소를 확인하는 블록', priceLevel: 'medium', estimatedCost: '20,000원' },
    { time: '14:00', category: 'activity', title: '굿즈·테마 숍', memo: '콘텐츠 취향을 반영한 쇼핑형 일정', priceLevel: 'high', estimatedCost: '60,000원' },
    { time: '17:00', category: 'cafe', title: '테마 카페 휴식', memo: '성지순례 동선을 쉬어가는 블록', priceLevel: 'medium', estimatedCost: '25,000원' },
  ],
  '자연·힐링': [
    { time: '09:30', category: 'sightseeing', title: '자연 산책', memo: '여유롭게 걷는 힐링 중심 일정', priceLevel: 'low', estimatedCost: '0원' },
    { time: '13:00', category: 'food', title: '로컬 점심', memo: '과한 이동 없이 쉬어가는 식사 블록', priceLevel: 'medium', estimatedCost: '28,000원' },
    { time: '16:00', category: 'cafe', title: '전망 카페', memo: '풍경을 보며 휴식하는 블록', priceLevel: 'medium', estimatedCost: '18,000원' },
  ],
  쇼핑: [
    { time: '10:30', category: 'activity', title: '대표 쇼핑 거리', memo: '기념품과 로컬 상품을 둘러보는 일정', priceLevel: 'high', estimatedCost: '80,000원' },
    { time: '14:00', category: 'food', title: '쇼핑 동선 점심', memo: '쇼핑 지역 안에서 이동을 줄이는 식사 블록', priceLevel: 'medium', estimatedCost: '30,000원' },
    { time: '16:30', category: 'activity', title: '기념품 정리 쇼핑', memo: '마지막 구매와 동선 정리를 위한 블록', priceLevel: 'high', estimatedCost: '70,000원' },
  ],
  '종합 여행': [
    { time: '10:00', category: 'sightseeing', title: '대표 명소 방문', memo: '처음 방문해도 이해하기 쉬운 핵심 일정', priceLevel: 'low', estimatedCost: '0원' },
    { time: '13:00', category: 'food', title: '로컬 식사', memo: '지역 분위기를 느끼는 식사 블록', priceLevel: 'medium', estimatedCost: '30,000원' },
    { time: '16:00', category: 'cafe', title: '카페 휴식', memo: '다음 이동 전 쉬어가는 일정', priceLevel: 'medium', estimatedCost: '15,000원' },
  ],
};

function normalizeInput(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function clampDayCount(value) {
  if (!Number.isFinite(value)) return DEFAULT_DURATION_DAYS;
  return Math.max(1, Math.min(MAX_DURATION_DAYS, Math.trunc(value)));
}

export function extractDestination(input) {
  const normalized = normalizeInput(input).toLowerCase();

  for (const item of DESTINATION_ALIASES) {
    if (item.aliases.some((alias) => normalized.includes(alias.toLowerCase()))) {
      return item.destination;
    }
  }

  const fallbackMatch = normalizeInput(input).match(/([가-힣A-Za-z]{2,20})\s*(?:여행|일정|투어|나들이)/);
  if (fallbackMatch?.[1] && !['맛집', '가족', '커플', '쇼핑', '힐링', '자연', '일정'].includes(fallbackMatch[1])) {
    return fallbackMatch[1];
  }

  return DEFAULT_DESTINATION;
}

export function extractTripDuration(input) {
  const normalized = normalizeInput(input);

  if (/당일치기|하루/.test(normalized)) {
    return 1;
  }

  if (/일주일/.test(normalized)) {
    return 7;
  }

  const nightsDaysMatch = normalized.match(/(\d+)\s*박\s*(\d+)\s*일/);
  if (nightsDaysMatch) {
    return clampDayCount(Number(nightsDaysMatch[2]));
  }

  const daysMatch = normalized.match(/(\d+)\s*일(?:\s*여행|\s*일정|\s*코스)?/);
  if (daysMatch) {
    return clampDayCount(Number(daysMatch[1]));
  }

  return DEFAULT_DURATION_DAYS;
}

export function extractTravelTheme(input) {
  const normalized = normalizeInput(input).toLowerCase();

  for (const item of THEME_RULES) {
    if (item.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
      return item.theme;
    }
  }

  return '종합 여행';
}

export function parseTravelRequest(content) {
  const normalized = normalizeInput(content);
  return {
    rawInput: normalized,
    destination: extractDestination(normalized),
    durationDays: extractTripDuration(normalized),
    theme: extractTravelTheme(normalized),
  };
}

export function getDestinationTemplates(destination) {
  return DESTINATION_TEMPLATES[destination] ?? {
    regions: GENERIC_TEMPLATE.regions.map((region) => `${destination} ${region}`),
    places: GENERIC_TEMPLATE.places.map((place) => `${destination} ${place}`),
  };
}

function createSlug(value) {
  return normalizeInput(value)
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'travel';
}

function blockTitle(destination, theme, templateTitle, place) {
  if (templateTitle.includes(destination)) {
    return `${templateTitle} · ${place}`;
  }
  return `${destination} ${theme} ${templateTitle} · ${place}`;
}

export function generateDeterministicItinerary(parsedRequest) {
  const destination = parsedRequest.destination || DEFAULT_DESTINATION;
  const durationDays = clampDayCount(parsedRequest.durationDays || DEFAULT_DURATION_DAYS);
  const theme = parsedRequest.theme || '종합 여행';
  const destinationTemplate = getDestinationTemplates(destination);
  const themeBlocks = THEME_BLOCKS[theme] ?? THEME_BLOCKS['종합 여행'];
  const slug = createSlug(`${destination}-${theme}`);

  const days = Array.from({ length: durationDays }, (_, dayIndex) => {
    const dayNumber = dayIndex + 1;
    const region = destinationTemplate.regions[dayIndex % destinationTemplate.regions.length];
    const blocks = themeBlocks.slice(0, Math.max(2, Math.min(themeBlocks.length, 3))).map((template, blockIndex) => {
      const place = destinationTemplate.places[(dayIndex + blockIndex) % destinationTemplate.places.length];
      return {
        id: `mcp-${slug}-day-${dayNumber}-block-${blockIndex + 1}`,
        title: blockTitle(destination, theme, template.title, place),
        category: template.category,
        priceLevel: template.priceLevel,
        time: template.time,
        location: place,
        memo: `${theme} 테마에 맞춰 ${region} 중심으로 배치한 입력 기반 fallback 블록입니다. ${template.memo}`,
        estimatedCost: template.estimatedCost,
      };
    });

    return {
      id: `mcp-${slug}-day-${dayNumber}`,
      dayNumber,
      title: `${destination} ${theme} Day ${dayNumber} · ${region}`,
      city: destination,
      region,
      blocks,
    };
  });

  return validateGeneratedItinerary(days, destination, durationDays, theme);
}

export function validateGeneratedItinerary(days, destination, durationDays, theme) {
  const safeDays = Array.isArray(days) ? days : [];
  if (safeDays.length !== durationDays) {
    throw new Error('Generated day count mismatch');
  }

  for (const day of safeDays) {
    if (day.city !== destination || !Array.isArray(day.blocks) || day.blocks.length < 2) {
      throw new Error('Generated itinerary is invalid');
    }
    const times = day.blocks.map((block) => block.time).filter(Boolean);
    const sorted = [...times].sort();
    if (times.join('|') !== sorted.join('|')) {
      throw new Error(`Generated itinerary time order is invalid for ${theme}`);
    }
  }

  return safeDays;
}

export function createFallbackTravelResult(content, sourceType = 'text', mode = 'fallback') {
  const parsed = parseTravelRequest(content);
  return {
    mode,
    sourceType,
    analysis: {
      destination: parsed.destination,
      durationDays: parsed.durationDays,
      theme: parsed.theme,
    },
    note: 'MCP 도구는 외부 API 키 없이 입력의 도시, 일수, 테마를 분석해 deterministic fallback 일정을 반환합니다.',
    days: generateDeterministicItinerary(parsed),
  };
}
