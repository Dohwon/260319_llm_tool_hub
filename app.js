const DEFAULT_TAILOR_INPUT = `목표:
auth 흐름에서 취약 가능성이 큰 지점을 찾고, 바로 손댈 수 있는 수정 방향까지 정리하고 싶다.

해야할 일:
- 어디를 먼저 봐야 하는지 우선순위를 잡아주기
- 의심되는 취약 지점과 이유 설명하기
- 수정 방향과 테스트 항목까지 제안하기

결과:
- 한국어
- 짧은 결론
- 우선순위별 액션
- 검증/리스크 포함`;

const DEFAULT_FORGE_INPUT = `[Role]
You are a senior backend reviewer.

[Task]
Diagnose the auth flow in a large codebase, identify likely weak points, and propose a concrete fix strategy.

[Output]
1. Short conclusion
2. Files or scope to inspect
3. Fix strategy
4. Validation and risks`;

const DEFAULT_FORGE_REPAIR = `이전 프롬프트는 출력 형식이 계속 바뀌었고, 실제 수정 범위와 검증 기준이 모호했다. 답이 길기만 하고 바로 실행할 수 있는 순서가 없었다.`;
const PROMPT_HISTORY_LIMIT = 24;

const PROMPT_STYLE_LIBRARY = {
  openai: {
    family: "OpenAI",
    tone: "primary",
    summary: "목표, 제약, 산출 형식, 성공 기준을 짧고 명시적으로 주면 안정적으로 따른다.",
    worksBest: [
      "Goal / constraints / output format를 분리해서 적기",
      "필수 질문, 금지 사항, 검증 기준을 짧게 고정하기",
      "운영용 프롬프트는 모델 스냅샷과 함께 pin하기"
    ],
    avoid: [
      "모호한 배경만 길게 적고 실제 목표를 뒤로 미루기",
      "응답 형식 없이 알아서 정리하라고 맡기기",
      "성공 기준 없이 추상적인 품질 요구만 남기기"
    ],
    testFocus: ["명시적 목표", "형식 고정", "검증 기준", "질문/가정 분리"],
    sources: [
      { label: "OpenAI Text guide", url: "https://platform.openai.com/docs/guides/chat-completions" },
      { label: "OpenAI Cookbook", url: "https://cookbook.openai.com/" }
    ]
  },
  anthropic: {
    family: "Anthropic",
    tone: "secondary",
    summary: "긴 문서와 설계 리뷰에 강하고, XML 태그로 맥락과 지시를 분리하면 정확도가 잘 오른다.",
    worksBest: [
      "<context>, <instructions>, <output_format>처럼 태그로 블록을 분리하기",
      "좋은 답의 기준과 실패 시 질문 조건을 함께 적기",
      "긴 자료를 요약 없이 넣기보다 태그별 책임을 나눠 주기"
    ],
    avoid: [
      "맥락과 예시와 지시를 한 덩어리로 섞어 쓰기",
      "출력 형식 없이 장문 서술만 기대하기",
      "재작업 조건 없이 막연히 더 잘해달라고 쓰기"
    ],
    testFocus: ["XML 구조", "context/instruction 분리", "재작업 조건", "handover 친화성"],
    sources: [
      { label: "Claude prompt generator", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prompt-generator" },
      { label: "Claude XML guide", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags" }
    ]
  },
  google: {
    family: "Google",
    tone: "accent",
    summary: "명확한 지시, 충분한 컨텍스트, few-shot 예시, 응답 형식을 함께 주면 큰 문맥에서도 안정적이다.",
    worksBest: [
      "Task / context / constraints / output format 순서를 또렷하게 두기",
      "few-shot 예시나 mini example을 붙여 패턴을 보여주기",
      "큰 자료를 넣을 때도 최종 산출 형식을 먼저 고정하기"
    ],
    avoid: [
      "컨텍스트 없이 추상 목표만 던지기",
      "예시 없이 형식을 계속 바꿔가며 기대하기",
      "질문과 배경을 한 문장에 다 섞어 쓰기"
    ],
    testFocus: ["명확한 지시", "few-shot 힌트", "응답 형식", "컨텍스트 순서"],
    sources: [
      { label: "Gemini prompt strategies", url: "https://ai.google.dev/gemini-api/docs/prompting-intro" }
    ]
  },
  deepseek: {
    family: "DeepSeek",
    tone: "warning",
    summary: "thinking / non-thinking 모드를 구분해 주고, 단계와 최종 출력 스키마를 분리하면 비용 대비 효율이 좋다.",
    worksBest: [
      "문제 분해 단계와 final answer schema를 분리하기",
      "thinking이 필요한지, 빠른 chat이 필요한지 먼저 정하기",
      "JSON 또는 고정 bullet 형식을 분명하게 지정하기"
    ],
    avoid: [
      "reasoning이 필요한데 일반 chat처럼 던지고 기대하기",
      "최종 출력 형식 없이 장문 reasoning만 유도하기",
      "검증 조건 없이 속도/비용만 보고 프롬프트를 너무 짧게 줄이기"
    ],
    testFocus: ["reasoning 단계", "final schema", "비용 절약", "thinking mode 구분"],
    sources: [
      { label: "DeepSeek reasoning model", url: "https://api-docs.deepseek.com/guides/reasoning_model" },
      { label: "DeepSeek API docs", url: "https://api-docs.deepseek.com/" }
    ]
  }
};

function createPromptModelProfile({
  id,
  label,
  providerKey,
  promptStyle,
  versionHint,
  liveModel
}) {
  const style = PROMPT_STYLE_LIBRARY[promptStyle];
  return {
    id,
    label,
    providerKey,
    promptStyle,
    versionHint,
    liveModel,
    family: style.family,
    tone: style.tone,
    summary: style.summary,
    worksBest: style.worksBest,
    avoid: style.avoid,
    testFocus: style.testFocus,
    sources: style.sources
  };
}

const PROMPT_MODEL_PROFILES = [
  createPromptModelProfile({ id: "openai-gpt54", label: "GPT-5.4", providerKey: "openai", promptStyle: "openai", versionHint: "gpt-5.4", liveModel: "gpt-5.4" }),
  createPromptModelProfile({ id: "openai-gpt5pro", label: "GPT-5 pro", providerKey: "openai", promptStyle: "openai", versionHint: "gpt-5-pro", liveModel: "gpt-5-pro" }),
  createPromptModelProfile({ id: "openai-codex", label: "GPT-5.3-Codex", providerKey: "openai", promptStyle: "openai", versionHint: "gpt-5.3-codex", liveModel: "gpt-5.3-codex" }),
  createPromptModelProfile({ id: "openai-o3", label: "o3", providerKey: "openai", promptStyle: "openai", versionHint: "o3", liveModel: "o3" }),
  createPromptModelProfile({ id: "anthropic-opus41", label: "Claude Opus 4.1", providerKey: "anthropic", promptStyle: "anthropic", versionHint: "Claude Opus 4.1", liveModel: "claude-opus-4-1-20250805" }),
  createPromptModelProfile({ id: "anthropic-sonnet4", label: "Claude Sonnet 4", providerKey: "anthropic", promptStyle: "anthropic", versionHint: "Claude Sonnet 4", liveModel: "claude-sonnet-4-20250514" }),
  createPromptModelProfile({ id: "anthropic-haiku35", label: "Claude Haiku 3.5", providerKey: "anthropic", promptStyle: "anthropic", versionHint: "Claude Haiku 3.5", liveModel: "claude-3-5-haiku-20241022" }),
  createPromptModelProfile({ id: "google-pro", label: "Gemini 2.5 Pro", providerKey: "google", promptStyle: "google", versionHint: "gemini-2.5-pro", liveModel: "gemini-2.5-pro" }),
  createPromptModelProfile({ id: "google-flash", label: "Gemini 2.5 Flash", providerKey: "google", promptStyle: "google", versionHint: "gemini-2.5-flash", liveModel: "gemini-2.5-flash" }),
  createPromptModelProfile({ id: "google-flashlite", label: "Gemini 2.5 Flash-Lite", providerKey: "google", promptStyle: "google", versionHint: "gemini-2.5-flash-lite", liveModel: "gemini-2.5-flash-lite" }),
  createPromptModelProfile({ id: "deepseek-chat", label: "DeepSeek Chat", providerKey: "deepseek", promptStyle: "deepseek", versionHint: "deepseek-chat", liveModel: "deepseek-chat" }),
  createPromptModelProfile({ id: "deepseek-reasoner", label: "DeepSeek Reasoner", providerKey: "deepseek", promptStyle: "deepseek", versionHint: "deepseek-reasoner", liveModel: "deepseek-reasoner" })
];

const LIVE_PROMPT_MODEL_MAP = Object.fromEntries(
  PROMPT_MODEL_PROFILES.map((profile) => [
    profile.id,
    {
      supported: true,
      provider: profile.providerKey,
      model: profile.liveModel,
      label: `${profile.family} ${profile.label}`
    }
  ])
);

const state = {
  registry: null,
  projects: null,
  recommendations: null,
  memory: null,
  skillRegistry: null,
  installMatrix: null,
  selectedPriorities: [],
  providerSync: {},
  personalization: {
    authenticated: false,
    configured: false,
    authMethod: "",
    user: "",
    email: "",
    picture: "",
    notes: "",
    savedAt: null,
    status: "상단 Login에서 Google 세션 또는 개발자 마스터키로 잠금을 해제할 수 있습니다."
  },
  activeSkillName: null,
  suppressedSkillName: null,
  memoryProtocolCode: "",
  docs: {
    sourceOfTruth: "",
    shortTerm: "",
    midTerm: "",
    longTerm: ""
  },
  environment: "wsl-linux",
  modelFilter: "all",
  activeSection: "home",
  promptTailor: {
    modelId: "openai-gpt54",
    input: DEFAULT_TAILOR_INPUT,
    output: "",
    fit: null,
    liveStatus: "로그인 후 무료 3회까지 바로 사용할 수 있고, 이후에는 Pro 월 $4.99 또는 연 $39로 계속 사용할 수 있습니다.",
    liveTone: "info",
    loading: false,
    usage: null
  },
  promptForge: {
    sourceModelId: "openai-gpt54",
    modelId: "anthropic-sonnet4",
    input: DEFAULT_FORGE_INPUT,
    repair: DEFAULT_FORGE_REPAIR,
    output: "",
    fit: null,
    apiKey: "",
    alertBubble: "",
    liveStatus: "원본 프롬프트와 실패 피드백을 넣고 모델/API Key를 고르면, 같은 모델은 더 정교하게 다듬고 다른 모델은 해당 문법으로 다시 포팅합니다.",
    liveTone: "info",
    loading: false,
    usage: null
  },
  promptHistory: [],
  promptAccess: {
    loaded: false,
    loading: false,
    authenticated: false,
    plan: "free",
    freeLimit: 3,
    freeUsed: 0,
    freeRemaining: 3,
    monthlyLimit: 300,
    monthlyUsed: 0,
    monthlyRemaining: 300,
    charLimit: 2000,
    proMonthlyUsd: 4.99,
    proYearlyUsd: 39,
    tokenBalance: 0,
    tokenSpent: 0,
    lastChargeTokens: 0,
    billingUnitTokens: 1000,
    pricePer1kTokensUsd: 3,
    canUse: false,
    checkoutUrl: "",
    managedLabel: "Service-managed model",
    message: "로그인 후 무료 3회까지 바로 사용할 수 있습니다. 이후에는 Pro가 필요합니다.",
    upgradeCode: ""
  },
  lastRecommendation: null,
  authStatus: {},
  authPopoverOpen: false,
  alarmOpen: false,
  alarmReadState: {},
  liveSync: {
    enabled: true,
    lastSyncedAt: null,
    status: "idle",
    signature: "",
    timer: null,
    mode: "remote"
  }
};

let recommendationInputTimer = null;

const PROVIDER_META = {
  openai: {
    label: "OpenAI",
    loginUrl: "https://chatgpt.com/codex",
    note: "ChatGPT / OpenAI API 계정 연결",
    sessionPurpose: "Codex, GPT 계열 실행과 세션 기억"
  },
  anthropic: {
    label: "Anthropic",
    loginUrl: "https://claude.ai/",
    note: "Claude / Console 계정 연결",
    sessionPurpose: "Claude Code 실행과 메모리 export 연결"
  },
  google: {
    label: "Google",
    loginUrl: "https://aistudio.google.com/",
    note: "Gemini / AI Studio 계정 연결",
    sessionPurpose: "Gemini API / CLI 실행과 긴 문서 워크로드"
  },
  xai: {
    label: "xAI",
    loginUrl: "https://grok.com/",
    note: "Grok 서비스 또는 API 계정",
    sessionPurpose: "실시간 리서치 계열 사용"
  },
  mistral: {
    label: "Mistral",
    loginUrl: "https://console.mistral.ai/",
    note: "Hosted Mistral 또는 self-host 선택",
    sessionPurpose: "오픈/상용 혼합 배포"
  },
  deepseek: {
    label: "DeepSeek",
    loginUrl: "https://platform.deepseek.com/",
    note: "저비용 API 계정 또는 호환 프록시",
    sessionPurpose: "대량 평가 / 자동화"
  },
  qwen: {
    label: "Qwen",
    loginUrl: "https://chat.qwen.ai/",
    note: "Qwen Chat / DashScope / self-host",
    sessionPurpose: "오픈모델 코딩 스택"
  },
  meta: {
    label: "Meta / Llama",
    loginUrl: "https://www.llama.com/",
    note: "라이선스 수락 후 self-host 또는 provider 사용",
    sessionPurpose: "초장문 오픈모델 스택"
  },
  cohere: {
    label: "Cohere",
    loginUrl: "https://dashboard.cohere.com/",
    note: "Enterprise agent / RAG 계정",
    sessionPurpose: "문서형 enterprise assistant"
  },
  cursor: {
    label: "Cursor",
    loginUrl: "https://www.cursor.com/",
    note: "Desktop IDE 로그인",
    sessionPurpose: "IDE preview / project rules / sync seed"
  },
  windsurf: {
    label: "Windsurf",
    loginUrl: "https://windsurf.com/",
    note: "Desktop IDE 로그인",
    sessionPurpose: "Cascade / Memories / IDE sync"
  },
  openrouter: {
    label: "OpenRouter",
    loginUrl: "https://openrouter.ai/",
    note: "멀티모델 API 허브 로그인",
    sessionPurpose: "여러 공급자를 한 API로 테스트"
  },
  local: {
    label: "Local / Self-host",
    loginUrl: "",
    note: "Ollama, LM Studio, self-host stack",
    sessionPurpose: "로그인 없이 로컬 실행"
  }
};

const OFFICIAL_LINK_FALLBACKS = {
  models: {
    openai: "https://developers.openai.com/api/docs/models",
    anthropic: "https://docs.anthropic.com/en/docs/about-claude/models/overview",
    google: "https://ai.google.dev/gemini-api/docs/models",
    xai: "https://docs.x.ai/docs",
    mistral: "https://docs.mistral.ai/getting-started/models",
    deepseek: "https://api-docs.deepseek.com/",
    qwen: "https://qwenlm.github.io/blog/qwen3/",
    cohere: "https://docs.cohere.com/v1/docs/command-a",
    meta: "https://www.llama.com/"
  },
  tools: {
    "codex-cli": "https://github.com/openai/codex",
    "claude-code": "https://docs.anthropic.com/en/docs/claude-code/quickstart",
    "gemini-cli": "https://ai.google.dev/gemini-api/docs/models/gemini",
    cursor: "https://docs.cursor.com/de/context/rules",
    windsurf: "https://docs.windsurf.com/fr/windsurf/cascade/memories",
    aider: "https://aider.chat/docs/usage/modes.html",
    "lm-studio": "https://lmstudio.ai/docs/cli",
    ollama: "https://www.ollama.com/library",
    openclaw: "https://openclawagent.io/",
    openrouter: "https://openrouter.ai/docs/quickstart",
    continue: "https://docs.continue.dev/",
    cline: "https://cline.bot/",
    openhands: "https://docs.all-hands.dev/"
  }
};

const PRIORITY_OPTIONS = [
  { id: "cost", label: "비용 우선", description: "저비용 / 대량 처리" },
  { id: "speed", label: "속도 우선", description: "짧은 응답 / 빠른 반복" },
  { id: "performance", label: "성능 우선", description: "품질 / 복잡한 작업" },
  { id: "privacy", label: "프라이버시", description: "로컬 / 사내망 / 보안" },
  { id: "memory", label: "메모리 공유", description: "handover / context transfer" },
  { id: "long_context", label: "긴 문서", description: "PDF / 로그 / 회의록" },
  { id: "ide", label: "IDE 편의", description: "Cursor / Windsurf / preview" },
  { id: "ondevice", label: "온디바이스", description: "local / offline / private" },
  { id: "personalization", label: "기억 깊이", description: "personal profile / prompt reuse" },
  { id: "multimodal", label: "비전/TTS", description: "image / voice / speech" }
];

const QUESTION_GUIDE_BY_PLAYBOOK = {
  "레포 규모가 큰 실제 코딩 프로젝트": {
    ask: "실제 레포를 수정해야 하는 내부 웹앱을 만들 건데, 테스트와 리팩터링까지 포함한 장기 세션용 모델/툴 조합을 추천해줘.",
    priorityIds: ["performance", "ide", "memory"],
    signals: ["실제 코드 수정", "긴 세션", "테스트/리팩터링", "대형 레포"]
  },
  "설계 품질이 중요한 코드베이스": {
    ask: "아키텍처 리뷰와 문서화 품질이 중요한 프로젝트야. 코드 설명력과 설계 검토가 좋은 모델/툴을 추천해줘.",
    priorityIds: ["performance", "memory"],
    signals: ["설계 리뷰", "문서화", "차분한 코드 검토", "근거 설명"]
  },
  "긴 문서와 로그를 많이 보는 프로젝트": {
    ask: "PDF, 회의록, 로그를 한 번에 많이 읽어야 해. 긴 문맥을 유지하면서 분석하기 좋은 모델/툴을 추천해줘.",
    priorityIds: ["long_context", "performance"],
    signals: ["PDF/로그", "수십만 토큰", "회의록", "대용량 분석"]
  },
  "저비용 대량 평가와 자동화": {
    ask: "하루에 대량 분류와 배치 평가를 돌려야 해서 비용이 중요해. 저비용 자동화용 모델/툴 조합을 추천해줘.",
    priorityIds: ["cost", "speed"],
    signals: ["대량 배치", "자동 분류", "실험 반복", "비용 민감"]
  },
  "오픈모델 기반 프라이빗 스택": {
    ask: "사내망이나 로컬에서만 돌릴 수 있어야 해. 로그인 없이 프라이빗하게 쓸 수 있는 오픈모델 스택을 추천해줘.",
    priorityIds: ["privacy", "cost"],
    signals: ["오프라인", "사내망", "온프레미스", "로그인 최소화"]
  },
  "실시간 검색/뉴스/트렌드 의존 작업": {
    ask: "최신 뉴스와 웹 검색 결과가 계속 바뀌는 작업이야. 실시간 리서치에 강한 모델/툴을 추천해줘.",
    priorityIds: ["speed", "long_context"],
    signals: ["최신성", "웹 탐색", "뉴스", "트렌드 조사"]
  },
  "IDE 안에서 빠르게 돌려보는 웹/앱 개발": {
    ask: "IDE에서 바로 화면 확인하고 수정하는 웹앱 작업이야. 프리뷰와 편집이 빠른 모델/툴 조합을 추천해줘.",
    priorityIds: ["ide", "speed"],
    signals: ["화면 프리뷰", "UI 반복", "IDE 중심", "빠른 수정"]
  },
  "멀티유저 운영 비서 / 메모리 우선 에이전트": {
    ask: "사용자 업무 스타일과 프로젝트 상태를 Codex에서 다른 모델로 넘겨야 해. 메모리 공유와 handover가 강한 구조를 추천해줘.",
    priorityIds: ["memory", "privacy"],
    signals: ["장기 기억", "handover", "업무 스타일", "컨텍스트 전환"]
  }
};

const PERSONALIZATION_REFERENCE_BRIEF = {
  sourcePath: "/home/dowon/securedir/git/codex/dowon_manager_agent_brief.md",
  oneLine: "LLM/음성(STT) 제품, 데이터 분석, 플랫폼/업무기획을 함께 다루는 실행형 PM reference dossier",
  workScope: [
    "음성/대화형 제품 운영과 실패 케이스 구조화",
    "LLM/NLU 데이터 분석과 인텐트 분류",
    "온디바이스 / 온프레미스 / 클라우드 보안 및 데이터 흐름 비교",
    "SQL, ADB, Excel, Notion, PPT, 번역까지 포함한 실무 효율 작업"
  ],
  workingStyle: [
    "조건 + 관측 + 가설 + 검증 구조를 선호",
    "명령어, 수치, 로그, 재현 가능한 근거를 우선",
    "핵심 → 근거 → 실행 순서의 직설적 실무형 커뮤니케이션",
    "확인되지 않은 버전 / 정책 / 요금 정보는 단정하지 않음"
  ],
  communication: [
    "한국어 기본, 필요한 용어만 영어를 섞는 실무형 표현",
    "장황한 배경보다 핵심 → 근거 → 실행 순서 선호",
    "모르면 단정하지 않고 확인 방법을 함께 제시",
    "과도한 예절보다 자연스럽고 정확한 톤을 선호"
  ],
  environment: [
    "Windows-first + WSL 적극 사용",
    "Android / Kotlin 관심",
    "무거운 프레임워크보다 현실적인 구성 선호",
    "보안 / 데이터 유출 / 기록 저장 리스크를 항상 고려"
  ],
  longTermExamples: [
    "재현 가능한 근거가 먼저 보여야 신뢰도가 올라감",
    "조건 / 관측 / 가설 / 검증 순서로 문제를 푸는 루틴",
    "Windows-first + WSL 병행, 운영 리스크를 먼저 보는 작업 습관"
  ],
  midTermExamples: [
    "LLM/음성 제품 문맥과 데이터 분석 관점을 같이 유지",
    "현재 프로젝트에서 handover와 continuity 품질을 계속 보정",
    "Prompt UX, 메모리 공개 범위, 로그 기반 검증 기준을 반복 조정"
  ],
  shortTermExamples: [
    "Personalization 화면에서 private/public 경계 재정리",
    "Memory Cloud를 실제 brief 기반 개인 기억 요약으로 교체",
    "알람, Prompt Studio, continuity 영역의 UI 디테일을 즉시 보정"
  ]
};

const PERSONALIZATION_TEMPLATE_PREVIEW = {
  sections: [
    {
      title: "업무 스코프 템플릿",
      summary: "로그인 후 반복 업무 도메인과 제품 문맥이 여기에 채워집니다.",
      items: ["주요 제품/도메인", "반복 분석 업무", "플랫폼/기획 맥락"]
    },
    {
      title: "문제 해결 루틴 템플릿",
      summary: "개인이 선호하는 판단 순서와 검증 방식이 들어갑니다.",
      items: ["문제 분해 순서", "증거 선호 형태", "검증 포인트"]
    },
    {
      title: "커뮤니케이션 템플릿",
      summary: "답변 톤과 문장 구조, 보고 방식이 여기에 정리됩니다.",
      items: ["선호 말투", "결론 위치", "길이/형식 기준"]
    },
    {
      title: "환경 / 리스크 템플릿",
      summary: "자주 쓰는 환경과 민감한 운영 리스크가 모입니다.",
      items: ["주 사용 환경", "자주 쓰는 스택", "운영상 주의점"]
    }
  ],
  rows: [
    ["장기", "작업 기준 / 톤 / 환경 선호", "여러 프로젝트에서 유지"],
    ["중기", "현재 제품 문맥 / 이번 달 집중 이슈", "프로젝트 단위 유지"],
    ["단기", "방금 받은 피드백 / 현재 태스크", "세션 단위 유지"]
  ]
};

const PERSONALIZATION_MEMORY_CLOUD = [
  {
    label: "재현 가능한 근거",
    size: "xl",
    tone: "primary",
    anecdote: "설명보다 로그, 명령어, 수치, 재현 절차가 먼저 있어야 안심하고 다음 판단을 내리는 패턴이 강합니다.",
    usage: "문제 해결 답변은 항상 핵심 -> 근거 -> 실행 순서로 재정렬됩니다.",
    storage: "long-term"
  },
  {
    label: "조건+가설+검증",
    size: "lg",
    tone: "primary",
    anecdote: "문제를 보면 바로 답을 던지기보다 조건과 관측을 먼저 세우고, 가장 싸고 빠른 검증 루트를 찾는 편입니다.",
    usage: "작업 분해와 handover 문서는 검증 포인트 중심으로 작성됩니다.",
    storage: "long-term"
  },
  {
    label: "직설형",
    size: "lg",
    tone: "secondary",
    anecdote: "불필요한 예절보다 정확한 실무 톤을 선호하고, 모르면 모른다고 말한 뒤 확인 경로를 붙이는 스타일입니다.",
    usage: "답변 톤, bullet 밀도, 결론 위치가 이 기준에 맞춰집니다.",
    storage: "long-term"
  },
  {
    label: "실행형 PM",
    size: "lg",
    tone: "secondary",
    anecdote: "기획과 설계만이 아니라 실제 운영, 개선, 데이터 해석까지 이어지는 산출물을 선호합니다.",
    usage: "추천 결과와 continuity packet은 항상 다음 액션까지 닿도록 정리됩니다.",
    storage: "long-term"
  },
  {
    label: "보안 리스크",
    size: "lg",
    tone: "tertiary",
    anecdote: "온디바이스, 온프레미스, 클라우드 구성을 볼 때도 기능보다 먼저 데이터 유출과 기록 저장 리스크를 따지는 경향이 있습니다.",
    usage: "공유 메모리 승격 기준과 private/public 경계 설정에 직접 반영됩니다.",
    storage: "long-term"
  },
  {
    label: "Windows-first",
    size: "md",
    tone: "neutral",
    anecdote: "기본 환경은 Windows이지만 WSL을 적극적으로 써서 현실적인 실행 경로를 조합하는 편입니다.",
    usage: "설치 가이드와 작업 명령은 Windows + WSL 기준을 함께 고려합니다.",
    storage: "long-term"
  },
  {
    label: "WSL",
    size: "md",
    tone: "neutral",
    anecdote: "로컬 작업 환경에서 WSL이 자주 끼기 때문에 경로, 서버 실행, 파일 접근 방식까지 함께 기록해 두는 편이 안전합니다.",
    usage: "연속 작업 시 경로와 실행 환경 메모를 continuity notes에 남깁니다.",
    storage: "mid-term"
  },
  {
    label: "LLM / STT",
    size: "md",
    tone: "primary",
    anecdote: "음성/대화형 제품과 LLM 기반 워크플로를 같이 다루는 이력이 길어서, 제품 흐름과 모델 구조를 한 번에 보는 편입니다.",
    usage: "프로젝트 추천과 메모리 handover에서 음성/모델 구조를 함께 설계합니다.",
    storage: "mid-term"
  },
  {
    label: "데이터 분석",
    size: "md",
    tone: "secondary",
    anecdote: "인텐트 분류, SQL, 피벗, 로그 분석처럼 정량 근거가 필요한 업무가 반복적으로 등장합니다.",
    usage: "관찰값과 근거 표기를 개인 기억의 기본 형식으로 사용합니다.",
    storage: "mid-term"
  },
  {
    label: "Android / Kotlin",
    size: "sm",
    tone: "neutral",
    anecdote: "모바일과 백그라운드 앱 동작, 음성 인식 앱 흐름 같은 관심사가 중기 기억으로 남아 있습니다.",
    usage: "관련 프로젝트가 들어오면 우선순위와 기술 가정이 더 빨리 맞춰집니다.",
    storage: "mid-term"
  },
  {
    label: "Portfolio Homepage",
    size: "sm",
    tone: "secondary",
    anecdote: "현재 운영 중인 페이지를 계속 손보면서 live deploy와 observer-friendly 설명 구조를 반복 점검하고 있습니다.",
    usage: "최근 continuity notes와 shared handover 예시가 이 프로젝트를 기준으로 쌓입니다.",
    storage: "short-term"
  },
  {
    label: "Todack",
    size: "sm",
    tone: "tertiary",
    anecdote: "감정 기록과 음성 코칭 제품 맥락이 남아 있어 개인화와 기억 설계가 곧바로 제품 기능 고민으로 이어집니다.",
    usage: "장기 기억과 개인화 설계를 실제 서비스 개념으로 연결할 때 참조됩니다.",
    storage: "short-term"
  }
];

const elements = {
  summaryStats: document.getElementById("summary-stats"),
  modelSummaryList: document.getElementById("model-summary-list"),
  connectionGate: document.getElementById("connection-gate"),
  recommendationResult: document.getElementById("recommendation-result"),
  homeMobileShell: document.getElementById("home-mobile-shell"),
  recipeTable: document.getElementById("recipe-table"),
  questionGuideTable: document.getElementById("question-guide-table"),
  projectInput: document.getElementById("project-input"),
  analyzeButton: document.getElementById("analyze-button"),
  envFilterRow: document.getElementById("env-filter-row"),
  priorityFilterRow: document.getElementById("priority-filter-row"),
  priorityHelper: document.getElementById("priority-helper"),
  installViewLabel: document.getElementById("install-view-label"),
  sharedMemoryDiagram: document.getElementById("shared-memory-diagram"),
  mermaidGuideLegend: document.getElementById("mermaid-guide-legend"),
  handoverBoard: document.getElementById("handover-board"),
  memoryGovernanceBoard: document.getElementById("memory-governance-board"),
  protocolMermaid: document.getElementById("protocol-mermaid"),
  memoryNodeTable: document.getElementById("memory-node-table"),
  personalizationShell: document.getElementById("personalization-shell"),
  personalizationLock: document.getElementById("personalization-lock"),
  personalizationMobileShell: document.getElementById("personalization-mobile-shell"),
  personalizationMatrix: document.getElementById("personalization-matrix"),
  personalizationSnapshot: document.getElementById("personalization-snapshot"),
  personalizationPlaybook: document.getElementById("personalization-playbook"),
  personalizationNotesInput: document.getElementById("personalization-notes-input"),
  personalizationNotesSave: document.getElementById("personalization-notes-save"),
  personalizationNotesStatus: document.getElementById("personalization-notes-status"),
  personalizationAuthStatus: document.getElementById("personalization-auth-status"),
  personalizationLogoutButton: document.getElementById("personalization-logout-button"),
  personalizationGoogleButton: document.getElementById("personalization-google-button"),
  registryMobileShell: document.getElementById("registry-mobile-shell"),
  modelTable: document.getElementById("model-table"),
  toolTable: document.getElementById("tool-table"),
  skillsMobileShell: document.getElementById("skills-mobile-shell"),
  skillRuntimeSummary: document.getElementById("skill-runtime-summary"),
  hierarchyLane: document.getElementById("hierarchy-lane"),
  skillDetailPanel: document.getElementById("skill-detail-panel"),
  promptTailorShell: document.getElementById("prompt-tailor-shell"),
  promptForgeShell: document.getElementById("prompt-forge-shell"),
  contentShell: document.querySelector(".content-shell"),
  appendixStatusGrid: document.getElementById("appendix-status-grid"),
  appendixSourceGrid: document.getElementById("appendix-source-grid"),
  appendixMetadataTable: document.getElementById("appendix-metadata-table"),
  appendixMetricGrid: document.getElementById("appendix-metric-grid"),
  alarmToggle: document.getElementById("alarm-toggle"),
  alarmPopover: document.getElementById("alarm-popover"),
  authToggle: document.getElementById("auth-toggle"),
  authPopover: document.getElementById("auth-popover"),
  themeToggle: document.getElementById("theme-toggle"),
  visitCounterFloating: document.getElementById("visit-counter-floating"),
  modal: document.getElementById("detail-modal"),
  modalKicker: document.getElementById("modal-kicker"),
  modalTitle: document.getElementById("modal-title"),
  modalSubtitle: document.getElementById("modal-subtitle"),
  modalBody: document.getElementById("modal-body")
};

document.addEventListener("DOMContentLoaded", () => {
  init().catch((error) => {
    console.error(error);
    document.body.innerHTML = `<main style="padding:24px;">로딩 실패: ${escapeHtml(error.message)}</main>`;
  });
});

async function init() {
  initTheme();
  bindGlobalEvents();
  state.authStatus = loadAuthStatus();
  state.selectedPriorities = loadSelectedPriorities();
  state.providerSync = loadProviderSyncState();
  state.promptHistory = loadPromptHistory();
  state.personalization = {
    ...state.personalization,
    ...loadPersonalizationNotes()
  };
  const authFlash = consumeAuthFlash();
  if (authFlash?.authToken) {
    const completion = await completeAuthSession(authFlash.authToken);
    if (!completion.ok && !authFlash.authError) {
      authFlash.authError = completion.authError || "google_failed";
    }
  }

  const [authSession, registry, projects, recommendations, memory, skillRegistry, installMatrix, sourceOfTruth, shortTerm, midTerm, longTerm] = await Promise.all([
    fetchAuthSession(),
    fetchJson("data/registry.json"),
    fetchJson("data/projects.json"),
    fetchJson("data/recommendation_rules.json"),
    fetchJson("global_memory/memory_profile.json"),
    fetchJson("data/skill_registry.json"),
    fetchJson("data/install_matrix.json"),
    fetchText("global_memory/exports/source_of_truth.md"),
    fetchText("manager_memory/short-term/active-tasks.md"),
    fetchText("manager_memory/mid-term/current-initiatives.md"),
    fetchText("manager_memory/long-term/strategy-roadmap.md")
  ]);

  state.registry = registry;
  state.projects = projects;
  state.recommendations = recommendations;
  state.memory = memory;
  state.skillRegistry = skillRegistry;
  state.installMatrix = installMatrix;
  state.docs = { sourceOfTruth, shortTerm, midTerm, longTerm };
  applyAuthSession(authSession, authFlash);
  await refreshPromptAccessStatus({ rerender: false });
  state.environment = detectDefaultEnvironment();
  state.liveSync.mode = isLocalRuntime() ? "local" : "remote";
  state.liveSync.signature = buildLiveSignature({
    registry,
    projects,
    memory,
    skillRegistry,
    shortTerm,
    midTerm,
    longTerm
  });
  state.liveSync.lastSyncedAt = new Date();
  initializePromptWorkbenches();
  void trackVisitAndRenderCounter();

  renderEnvironmentSelector();
  renderAll();
  activateSection(getInitialSection(), { pushHash: false });
  runRecommendation();
  startLiveSync();
}

function bindGlobalEvents() {
  elements.analyzeButton?.addEventListener("click", runRecommendation);
  elements.projectInput?.addEventListener("input", () => {
    window.clearTimeout(recommendationInputTimer);
    recommendationInputTimer = window.setTimeout(() => {
      runRecommendation();
    }, 180);
  });

  document.addEventListener("input", (event) => {
    const promptAccessField = event.target.closest("[data-prompt-access-field]");
    if (promptAccessField) {
      const field = promptAccessField.dataset.promptAccessField;
      if (field === "upgradeCode") {
        state.promptAccess.upgradeCode = promptAccessField.value;
      }
      return;
    }

    const promptField = event.target.closest("[data-prompt-field]");
    if (!promptField) return;

    const lab = promptField.dataset.promptLab;
    const field = promptField.dataset.promptField;
    if (!lab || !field) return;

    if (lab === "tailor") {
      state.promptTailor[field] = promptField.value;
      refreshPromptHelperPanels("tailor");
    }

    if (lab === "forge") {
      state.promptForge[field] = promptField.value;
      if (field === "apiKey") {
        state.promptForge.alertBubble = "";
        state.promptForge.usage = null;
        setPromptForgeIdleStatus();
        renderPromptForgeSection();
      } else {
        refreshPromptHelperPanels("forge");
      }
    }
  });

  document.addEventListener("change", (event) => {
    const promptModel = event.target.closest("[data-prompt-model]");
    if (!promptModel) return;

    const lab = promptModel.dataset.promptLab;
    const nextModelId = promptModel.value;
    const role = promptModel.dataset.promptModelRole || "target";

    if (lab === "tailor") {
      state.promptTailor.modelId = nextModelId;
      state.promptTailor.usage = null;
      setPromptTailorIdleStatus();
      renderPromptTailorSection();
    }

    if (lab === "forge") {
      if (role === "source") {
        state.promptForge.sourceModelId = nextModelId;
      } else {
        state.promptForge.modelId = nextModelId;
        state.promptForge.apiKey = "";
        state.promptForge.alertBubble = "";
      }
      state.promptForge.usage = null;
      setPromptForgeIdleStatus();
      renderPromptForgeSection();
    }
  });

  document.addEventListener("submit", (event) => {
    const targetForm = event.target.closest("#auth-master-login-form");
    if (!targetForm) return;
    event.preventDefault();
    handleMasterKeyLogin(targetForm);
  });

  document.addEventListener("click", (event) => {
    dismissPromptBubbles(event);

    const authToggle = event.target.closest("#auth-toggle");
    if (authToggle) {
      event.preventDefault();
      toggleAuthPopover();
      return;
    }

    const alarmToggle = event.target.closest("#alarm-toggle");
    if (alarmToggle) {
      event.preventDefault();
      toggleAlarmPopover();
      return;
    }

    const alarmItem = event.target.closest("[data-alarm-item]");
    if (alarmItem) {
      event.preventDefault();
      handleAlarmItemClick(alarmItem.dataset.alarmItem);
      return;
    }

    if (!event.target.closest("#alarm-popover")) {
      closeAlarmPopover();
    }

    if (!event.target.closest("#auth-popover")) {
      closeAuthPopover();
    }

    const closeTarget = event.target.closest("[data-close-modal]");
    if (closeTarget) {
      closeModal();
      return;
    }

    const sectionTarget = event.target.closest("[data-section-target]");
    if (sectionTarget) {
      event.preventDefault();
      activateSection(sectionTarget.dataset.sectionTarget, { pushHash: true });
      return;
    }

    const skillTarget = event.target.closest("[data-skill-select]");
    if (skillTarget) {
      const skillName = skillTarget.dataset.skillSelect;
      if (state.activeSkillName === skillName) {
        state.activeSkillName = null;
        state.suppressedSkillName = skillName;
      } else {
        state.activeSkillName = skillName;
        state.suppressedSkillName = null;
      }
      renderSkillsSection();
      return;
    }

    const promptAction = event.target.closest("[data-prompt-action]");
    if (promptAction) {
      const action = promptAction.dataset.promptAction;
      if (action === "translate") {
        void generatePromptTailorLive();
      }
      if (action === "generate") {
        void generatePromptForgeLive();
      }
      return;
    }

    const promptAccessAction = event.target.closest("[data-prompt-access-action]");
    if (promptAccessAction) {
      const action = promptAccessAction.dataset.promptAccessAction;
      if (action === "refresh") {
        void refreshPromptAccessStatus({ rerender: true, announce: "사용량 상태를 다시 불러왔습니다." });
      }
      if (action === "redeem") {
        void redeemPromptUpgradeCode();
      }
      if (action === "checkout") {
        const checkoutUrl = String(state.promptAccess.checkoutUrl || "").trim();
        if (checkoutUrl) {
          window.open(checkoutUrl, "_blank", "noopener,noreferrer");
        }
      }
      return;
    }

    const promptHistoryDelete = event.target.closest("[data-prompt-history-delete]");
    if (promptHistoryDelete) {
      deletePromptHistoryEntry(promptHistoryDelete.dataset.promptHistoryDelete);
      return;
    }

    const promptHistoryLoad = event.target.closest("[data-prompt-history-load]");
    if (promptHistoryLoad) {
      loadPromptHistoryEntry(promptHistoryLoad.dataset.promptHistoryLoad);
      return;
    }

    const promptHistoryClear = event.target.closest("[data-prompt-history-clear]");
    if (promptHistoryClear) {
      clearPromptHistory(promptHistoryClear.dataset.promptHistoryClear);
      return;
    }

    const filterChip = event.target.closest("[data-filter-type]");
    if (filterChip) {
      state.modelFilter = filterChip.dataset.filterType;
      document.querySelectorAll("[data-filter-type]").forEach((chip) => chip.classList.remove("active"));
      filterChip.classList.add("active");
      renderModelsTable();
      return;
    }

    const envChip = event.target.closest("[data-env-id]");
    if (envChip) {
      state.environment = envChip.dataset.envId;
      renderEnvironmentSelector();
      renderRecipeTable();
      renderQuestionGuide();
      renderToolsTable();
      if (state.lastRecommendation) {
        renderRecommendationResult(state.lastRecommendation);
      }
      return;
    }

    const priorityChip = event.target.closest("[data-priority-id]");
    if (priorityChip) {
      const priorityId = priorityChip.dataset.priorityId;
      if (!priorityId) return;
      if (state.selectedPriorities.includes(priorityId)) {
        state.selectedPriorities = state.selectedPriorities.filter((item) => item !== priorityId);
      } else {
        state.selectedPriorities = [...state.selectedPriorities, priorityId];
      }
      if (state.selectedPriorities.length === 0) {
        state.selectedPriorities = ["performance"];
      }
      persistSelectedPriorities();
      renderPrioritySelector();
      renderRecipeTable();
      renderQuestionGuide();
      runRecommendation();
      return;
    }

    const connectionToggle = event.target.closest("[data-connection-provider]");
    if (connectionToggle) {
      const provider = connectionToggle.dataset.connectionProvider;
      state.authStatus[provider] = !state.authStatus[provider];
      persistAuthStatus();
      renderHomeSummary();
      renderModelsTable();
      renderToolsTable();
      if (state.lastRecommendation) {
        renderRecommendationResult(state.lastRecommendation);
      }
      return;
    }

    const providerSyncAction = event.target.closest("[data-provider-sync]");
    if (providerSyncAction) {
      const provider = providerSyncAction.dataset.providerSync;
      const mode = providerSyncAction.dataset.syncMode;
      if (!provider || !mode) return;

      if (mode === "toggle") {
        const current = state.providerSync[provider] || { enabled: false, lastSyncedAt: null, flashing: false };
        state.providerSync[provider] = { ...current, enabled: !current.enabled };
        persistProviderSyncState();
        renderHomeSummary();
      }

      if (mode === "run") {
        syncProviderMemory(provider);
      }
      return;
    }

    const syncAction = event.target.closest("[data-sync-action]");
    if (syncAction) {
      const action = syncAction.dataset.syncAction;
      if (action === "toggle") {
        state.liveSync.enabled = !state.liveSync.enabled;
        startLiveSync();
        renderLiveSyncPanel();
      }
      if (action === "refresh") {
        refreshLiveData({ manual: true });
      }
      return;
    }

    const modalTarget = event.target.closest("[data-modal-type]");
    if (modalTarget) {
      openDetailModal(modalTarget.dataset.modalType, modalTarget.dataset.modalId);
      return;
    }

    const authAction = event.target.closest("[data-auth-action]");
    if (authAction) {
      const action = authAction.dataset.authAction;
      if (action === "open") {
        openAuthPopover();
      }
      if (action === "google-login") {
        startGoogleLogin();
      }
      if (action === "logout") {
        void logoutPersonalization();
      }
      return;
    }

    if (event.target.closest("#personalization-notes-save")) {
      persistPersonalizationNotesFromInput();
      return;
    }

    if (event.target.closest("#personalization-logout-button")) {
      void logoutPersonalization();
      return;
    }
  });

  document.addEventListener("pointerout", (event) => {
    const skillTarget = event.target.closest("[data-skill-select]");
    if (!skillTarget) return;
    const related = event.relatedTarget;
    if (related && skillTarget.closest(".skill-node-wrap")?.contains(related)) return;
    if (state.suppressedSkillName === skillTarget.dataset.skillSelect) {
      state.suppressedSkillName = null;
      renderSkillsSection();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAuthPopover();
      closeAlarmPopover();
      closeModal();
    }
  });

  window.addEventListener("hashchange", () => {
    activateSection(getInitialSection(), { pushHash: false });
  });

  window.addEventListener("beforeunload", () => {
    clearPromptSecrets();
  });

  window.addEventListener("pagehide", () => {
    clearPromptSecrets();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      clearPromptSecrets();
    }
  });
}

function initTheme() {
  const storedTheme = window.localStorage.getItem("llm-tool-hub-theme") || "light";
  document.body.dataset.theme = storedTheme;
  updateThemeButton(storedTheme);
  elements.themeToggle?.addEventListener("click", () => {
    const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
    document.body.dataset.theme = nextTheme;
    window.localStorage.setItem("llm-tool-hub-theme", nextTheme);
    updateThemeButton(nextTheme);
    renderAll();
    if (state.lastRecommendation) {
      renderRecommendationResult(state.lastRecommendation);
    }
    activateSection(state.activeSection, { pushHash: false });
  });
}

function updateThemeButton(theme) {
  const icon = theme === "dark" ? "light_mode" : "dark_mode";
  const label = theme === "dark" ? "Light" : "Dark";
  if (elements.themeToggle) {
    elements.themeToggle.innerHTML = `<span class="material-symbols-outlined">${icon}</span><span>${label}</span>`;
  }
}

function openAuthPopover() {
  state.authPopoverOpen = true;
  renderAuthPopover();
}

function closeAuthPopover() {
  if (!state.authPopoverOpen) return;
  state.authPopoverOpen = false;
  renderAuthPopover();
}

function toggleAuthPopover() {
  state.authPopoverOpen = !state.authPopoverOpen;
  renderAuthPopover();
}

function renderAuthPopover() {
  if (!elements.authPopover || !elements.authToggle) return;

  const authenticated = state.personalization.authenticated;
  const configured = state.personalization.configured;
  const userLabel = state.personalization.user || state.personalization.email || "Session";
  const authMethodLabel = state.personalization.authMethod === "google" ? "Google session" : "Developer master key";
  const googleButton = configured
    ? `
        <button class="primary-button auth-google-button" type="button" data-auth-action="google-login">
          <span class="auth-google-mark">G</span>
          <span>Google로 로그인</span>
        </button>
      `
    : `
        <button class="primary-button auth-google-button" type="button" disabled>
          <span class="auth-google-mark">G</span>
          <span>Google OAuth 미설정</span>
        </button>
      `;

  elements.authPopover.innerHTML = authenticated
    ? `
        <div class="auth-popover-head">
          <strong>로그인 세션</strong>
          <span>session only</span>
        </div>
        <div class="auth-session-card">
          <div class="auth-session-avatar">
            ${state.personalization.picture ? `<img src="${escapeAttr(state.personalization.picture)}" alt="${escapeAttr(userLabel)}" />` : `<span class="material-symbols-outlined">account_circle</span>`}
          </div>
          <div class="auth-session-copy">
            <strong>${escapeHtml(userLabel)}</strong>
            <p>${escapeHtml(state.personalization.email || authMethodLabel)}</p>
            <small>${escapeHtml(`${authMethodLabel} · 브라우저 세션 동안 유지`)}</small>
          </div>
        </div>
        <div class="auth-session-actions">
          <button class="secondary-button auth-popover-action" type="button" data-auth-action="logout">
            <span class="material-symbols-outlined">logout</span>
            <span>로그아웃</span>
          </button>
        </div>
      `
    : `
        <div class="auth-popover-head">
          <strong>Login Center</strong>
          <span>global access</span>
        </div>
        <div class="auth-provider-card">
          <p class="tiny-label">Google Auth</p>
          <strong>Personalization과 Prompt Studio를 한 번에 엽니다</strong>
          <p>${escapeHtml(configured ? "Google OAuth로 로그인하면 이 브라우저 세션 동안 Personalization, Prompt Tailor, Prompt Forge 잠금이 함께 해제됩니다." : "Google OAuth 환경 변수가 아직 설정되지 않았습니다. Railway 환경변수를 넣으면 바로 활성화됩니다.")}</p>
          ${googleButton}
        </div>
        <div class="auth-divider"><span>또는</span></div>
        <form id="auth-master-login-form" class="auth-master-form">
          <div class="auth-master-head">
            <p class="tiny-label">Developer Master Key</p>
            <strong>개발자 비밀번호 만능키</strong>
          </div>
          <label class="field-label" for="auth-master-username">ID</label>
          <input id="auth-master-username" class="prompt-input" name="username" type="text" autocomplete="username" />
          <label class="field-label" for="auth-master-password">Password</label>
          <input id="auth-master-password" class="prompt-input" name="password" type="password" autocomplete="current-password" />
          <button class="secondary-button auth-master-submit" type="submit">
            <span class="material-symbols-outlined">vpn_key</span>
            <span>마스터키 로그인</span>
          </button>
        </form>
        <p class="auth-popover-note">${escapeHtml(state.personalization.status)}</p>
      `;

  elements.authPopover.classList.toggle("hidden", !state.authPopoverOpen);
  elements.authPopover.setAttribute("aria-hidden", String(!state.authPopoverOpen));
  elements.authToggle.setAttribute("aria-expanded", String(state.authPopoverOpen));
  elements.authToggle.classList.toggle("authenticated", authenticated);
  elements.authToggle.innerHTML = authenticated
    ? `<span class="material-symbols-outlined">verified_user</span><span>${escapeHtml(trimText(userLabel, 20))}</span>`
    : `<span class="material-symbols-outlined">account_circle</span><span>Login</span>`;
}

function toggleAlarmPopover() {
  state.alarmOpen = !state.alarmOpen;
  renderAlarmPopover();
}

function closeAlarmPopover() {
  if (!state.alarmOpen) return;
  state.alarmOpen = false;
  renderAlarmPopover();
}

function renderAlarmPopover() {
  if (!elements.alarmPopover || !elements.alarmToggle) return;

  const items = buildAlarmItems();
  const unreadCount = getUnreadAlarmCount(items);

  elements.alarmPopover.innerHTML = `
    <div class="alarm-popover-head">
      <strong>알림</strong>
      <span>${escapeHtml(`${unreadCount} unread · ${items.length} total`)}</span>
    </div>
    <div class="alarm-popover-list">
      ${items.map((item) => buildAlarmItemMarkup(item)).join("")}
    </div>
  `;

  elements.alarmPopover.classList.toggle("hidden", !state.alarmOpen);
  elements.alarmPopover.setAttribute("aria-hidden", String(!state.alarmOpen));
  elements.alarmToggle.setAttribute("aria-expanded", String(state.alarmOpen));
  elements.alarmToggle.classList.toggle("is-read", !hasUnreadAlarms());
}

function buildAlarmItems() {
  const lastSynced = state.liveSync.lastSyncedAt ? formatTime(state.liveSync.lastSyncedAt) : "방금";
  const liveMessage = state.liveSync.enabled
    ? `현재 라이브 배포본 기준으로 동작 중입니다. 마지막 동기화 ${lastSynced}.`
    : "라이브 동기화가 꺼져 있어 마지막 확인 시점 기준 상태만 보여줍니다.";
  const memoryMessage = state.personalization.authenticated
    ? `${state.personalization.user || "개인화 메모리"}가 열려 있어 실제 기억 요약을 볼 수 있습니다.`
    : "개인화 메모리는 로그인 전이라 잠겨 있습니다. 로그인하면 실제 기억 요약이 열립니다.";
  const historyMessage = state.promptHistory.length
    ? `최근 변환 ${state.promptHistory.length}건이 브라우저 히스토리에 저장돼 있습니다. API Key는 저장하지 않습니다.`
    : "아직 저장된 변환 내역은 없습니다. 첫 실행 결과부터 로컬 히스토리에 쌓입니다.";

  return [
    {
      id: "live",
      tone: "live",
      icon: "radio_button_checked",
      title: "Railway Live",
      message: liveMessage,
      actionLabel: "상태 확인",
      targetSection: null,
      signature: JSON.stringify({
        enabled: state.liveSync.enabled,
        status: state.liveSync.status,
        lastSyncedAt: state.liveSync.lastSyncedAt ? new Date(state.liveSync.lastSyncedAt).toISOString() : ""
      })
    },
    {
      id: "memory",
      tone: "memory",
      icon: "lock_person",
      title: state.personalization.authenticated ? "Memory unlocked" : "Memory locked",
      message: memoryMessage,
      actionLabel: state.personalization.authenticated ? "개인화 보기" : "잠금 확인",
      targetSection: "personalization",
      signature: JSON.stringify({
        authenticated: state.personalization.authenticated,
        user: state.personalization.user || ""
      })
    },
    {
      id: "history",
      tone: "history",
      icon: "history",
      title: "Prompt history",
      message: historyMessage,
      actionLabel: "히스토리 보기",
      targetSection: "prompt-tailor",
      signature: JSON.stringify({
        count: state.promptHistory.length,
        latestId: state.promptHistory[0]?.id || ""
      })
    }
  ];
}

function buildAlarmItemMarkup(item) {
  const unread = isAlarmItemUnread(item);
  return `
    <button
      class="alarm-popover-item ${escapeAttr(item.tone)} ${unread ? "is-unread" : "is-read"}"
      type="button"
      data-alarm-item="${escapeAttr(item.id)}"
    >
      <span class="material-symbols-outlined">${escapeHtml(item.icon)}</span>
      <div class="alarm-popover-copy">
        <div class="alarm-popover-item-head">
          <strong>${escapeHtml(item.title)}</strong>
          <span class="alarm-popover-state ${unread ? "unread" : "read"}">${escapeHtml(unread ? "읽지 않음" : "확인됨")}</span>
        </div>
        <p>${escapeHtml(item.message)}</p>
        <span class="alarm-popover-action">${escapeHtml(item.actionLabel)}</span>
      </div>
    </button>
  `;
}

function isAlarmItemUnread(item) {
  return state.alarmReadState[item.id] !== item.signature;
}

function getUnreadAlarmCount(items = buildAlarmItems()) {
  return items.filter((item) => isAlarmItemUnread(item)).length;
}

function hasUnreadAlarms() {
  return getUnreadAlarmCount() > 0;
}

function markAlarmItemRead(itemId) {
  const item = buildAlarmItems().find((entry) => entry.id === itemId);
  if (!item) return;
  state.alarmReadState[item.id] = item.signature;
}

function handleAlarmItemClick(itemId) {
  const item = buildAlarmItems().find((entry) => entry.id === itemId);
  if (!item) return;

  markAlarmItemRead(itemId);

  if (item.targetSection) {
    closeAlarmPopover();
    activateSection(item.targetSection, { pushHash: true });
    return;
  }

  renderAlarmPopover();
}

function detectDefaultEnvironment() {
  const platform = String(window.navigator.platform || "").toLowerCase();
  if (platform.includes("mac")) return "macos";
  if (platform.includes("win")) return "windows";
  if (platform.includes("linux")) return "wsl-linux";
  return "web";
}

function renderAll() {
  renderAuthPopover();
  renderAlarmPopover();
  renderPrioritySelector();
  renderHomeSummary();
  renderRecipeTable();
  renderQuestionGuide();
  renderMemorySection();
  renderPersonalizationSection();
  renderModelsTable();
  renderToolsTable();
  renderSkillsSection();
  renderPromptTailorSection();
  renderPromptForgeSection();
}

function renderPrioritySelector() {
  if (!elements.priorityFilterRow) return;
  elements.priorityFilterRow.innerHTML = PRIORITY_OPTIONS
    .map(
      (priority) => `
        <button class="filter-chip ${state.selectedPriorities.includes(priority.id) ? "active" : ""}" data-priority-id="${escapeAttr(priority.id)}" type="button" title="${escapeAttr(priority.description)}">
          ${escapeHtml(priority.label)}
        </button>
      `
    )
    .join("");

  if (elements.priorityHelper) {
    const selectedLabels = getSelectedPriorityLabels();
    elements.priorityHelper.textContent = selectedLabels.length
      ? `선택 기준: ${selectedLabels.join(" / ")}. 이 기준이 추천 점수와 질문 가이드 순서에 반영됩니다.`
      : "비용, 속도, 성능, 프라이버시, 메모리 공유 같은 기준을 먼저 선택하면 추천 조합과 질문 가이드가 같이 바뀝니다.";
  }
}

function renderEnvironmentSelector() {
  const environments = arrayOrEmpty(state.installMatrix?.environments);
  elements.envFilterRow.innerHTML = environments
    .map(
      (environment) => `
        <button class="filter-chip ${environment.id === state.environment ? "active" : ""}" data-env-id="${escapeHtml(environment.id)}" type="button">
          ${escapeHtml(environment.label)}
        </button>
      `
    )
    .join("");

  const currentEnvironment = environments.find((environment) => environment.id === state.environment);
  if (elements.installViewLabel && currentEnvironment) {
    elements.installViewLabel.textContent = currentEnvironment.label;
  }
}

function renderHomeSummary() {
  const registryMarkup = buildProviderRegistryMarkup();
  if (elements.summaryStats) {
    elements.summaryStats.innerHTML = registryMarkup.metaMarkup;
  }
  if (elements.modelSummaryList) {
    elements.modelSummaryList.innerHTML = registryMarkup.entriesMarkup;
  }
  renderConnectionGate();
  renderHomeMobileShell(registryMarkup);
}

function renderHomeMobileShell(registryMarkup = buildProviderRegistryMarkup()) {
  if (!elements.homeMobileShell || !state.recommendations) return;

  const result = state.lastRecommendation || analyzeProjectBrief(elements.projectInput?.value || "");
  const primaryVersion = findVersion(result.primaryModel);
  const backupVersion = findVersion(result.backupModel);
  const primaryToolRecord = findToolRecordByName(result.primaryTool);
  const connectedProviders = registryMarkup.connectedProviders || 0;
  const qualityFit = computeSignalPercent(result.signals.performance + result.signals.coding + result.signals.docs);
  const speedBias = computeSignalPercent(result.signals.speed + result.signals.realtime + result.signals.ide);
  const memoryShare = computeSignalPercent(result.signals.memory + result.signals.personalization + result.signals.prompt);
  const infrastructureScore = Math.round((qualityFit + speedBias + memoryShare) / 3);
  const memoryStatus = state.liveSync.enabled ? "99.9%" : "paused";
  const lastSynced = state.liveSync.lastSyncedAt ? formatTime(state.liveSync.lastSyncedAt) : "아직 없음";
  const timelineMarkup = buildRecommendationTimelineMarkup(result);
  const arsenalCards = [
    {
      title: result.primaryModel,
      status: "Primary",
      note: primaryVersion?.name || "selected model",
      icon: "smart_toy",
      tone: "primary",
      chips: [primaryVersion?.context_window || "tiered", getKnowledgeCutoffShort(primaryVersion)]
    },
    {
      title: result.primaryTool,
      status: "Tool",
      note: result.installGuide.mode,
      icon: "terminal",
      tone: "secondary",
      chips: [environmentLabel(state.environment), primaryToolRecord?.memory_bridge || "shared hub"]
    },
    {
      title: result.backupModel,
      status: "Fallback",
      note: backupVersion?.name || "backup model",
      icon: "psychology",
      tone: "neutral",
      chips: [backupVersion?.context_window || "tiered", result.switchWhen[0] || "fallback lane"]
    }
  ]
    .map(
      (item) => `
        <article class="mobile-arsenal-card ${escapeAttr(item.tone)}">
          <div class="mobile-arsenal-icon">
            <span class="material-symbols-outlined">${escapeHtml(item.icon)}</span>
          </div>
          <div class="mobile-arsenal-copy">
            <div class="mobile-arsenal-head">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.status)}</span>
            </div>
            <p>${escapeHtml(item.note)}</p>
            <div class="mobile-mini-chip-row">
              ${item.chips.filter(Boolean).slice(0, 2).map((chip) => `<span class="mobile-mini-chip">${escapeHtml(chip)}</span>`).join("")}
            </div>
          </div>
        </article>
      `
    )
    .join("");

  elements.homeMobileShell.innerHTML = `
    <section class="mobile-app-card mobile-overview-card">
      <div class="mobile-block-head">
        <div>
          <p class="tiny-label">Infrastructure Overview</p>
          <h3>현재 추천 조합의 실행 요약</h3>
        </div>
        <span class="mobile-health-pill">System Optimal</span>
      </div>
      <div class="mobile-hero-metric">
        <div>
          <strong>${escapeHtml(`${infrastructureScore}%`)}</strong>
          <p>${escapeHtml(`${result.playbook.name} 기준 품질/속도/메모리 공유 적합도`)}</p>
        </div>
        <span class="material-symbols-outlined">query_stats</span>
      </div>
      <div class="mobile-progress-track">
        <span style="width:${escapeAttr(String(infrastructureScore))}%"></span>
      </div>
      <div class="mobile-overview-stats">
        <span>${escapeHtml(`${registryMarkup.modelCount || 0} model families`)}</span>
        <span>${escapeHtml(`${connectedProviders} connected`)}</span>
        <span>${escapeHtml(result.deploymentMode)}</span>
      </div>
    </section>

    <section class="mobile-app-card">
      <div class="mobile-block-head">
        <div>
          <p class="tiny-label">Current Arsenal</p>
          <h3>지금 조합된 주력 카드</h3>
        </div>
      </div>
      <div class="mobile-arsenal-scroll">
        ${arsenalCards}
      </div>
    </section>

    <div class="mobile-embedded-timeline">
      ${timelineMarkup}
    </div>

    <section class="mobile-app-card mobile-memory-status-card">
      <div class="mobile-memory-status-copy">
        <p class="tiny-label">Shared Memory Status</p>
        <strong>${escapeHtml(memoryStatus)}</strong>
        <p>${escapeHtml(result.memoryStack)}</p>
        <div class="mobile-memory-foot">
          <span class="material-symbols-outlined">schedule</span>
          <span>${escapeHtml(`Last Sync ${lastSynced}`)}</span>
        </div>
      </div>
      <div class="mobile-memory-status-icon">
        <span class="material-symbols-outlined">database</span>
      </div>
    </section>
  `;
}

function buildProviderRegistryMarkup({ includeModelButtons = false } = {}) {
  const models = arrayOrEmpty(state.registry.models);
  const tools = arrayOrEmpty(state.registry.tools);
  const installedSkills = arrayOrEmpty(state.skillRegistry.skills).filter((skill) => skill.status === "installed");
  const localReady = tools.filter((tool) => String(tool.login_required).toLowerCase().includes("no")).length;
  const connectedProviders = Object.entries(state.authStatus).filter(([, connected]) => connected).length;
  const providers = buildProviderCards();

  const metaMarkup = `
    <div class="arsenal-meta-strip">
      <span class="arsenal-meta-pill">${escapeHtml(`${providers.length} providers`)}</span>
      <span class="arsenal-meta-pill">${escapeHtml(`${connectedProviders} connected`)}</span>
      <span class="arsenal-meta-pill">${escapeHtml(`${localReady} local-ready`)}</span>
      <span class="arsenal-meta-pill">${escapeHtml(`${models.length} model families`)}</span>
      <span class="arsenal-meta-pill">${escapeHtml(`${installedSkills.length} installed skills`)}</span>
    </div>
  `;

  const entriesMarkup = providers
    .map((provider) => {
      const syncState = getProviderSyncState(provider.key);
      const stateBadge = getArsenalStateBadge(provider, syncState);
      const scopeBadge = getArsenalScopeBadge(provider, syncState);
      const rowClass = [provider.connected ? "connected" : "", provider.loginRequired && !provider.connected ? "locked" : "", syncState.flashing ? "syncing" : ""].filter(Boolean).join(" ");
      const loginControl = provider.loginUrl
        ? `<a class="arsenal-link" href="${escapeAttr(provider.loginUrl)}" target="_blank" rel="noreferrer noopener">로그인</a>`
        : `<span class="arsenal-link muted">local</span>`;
      const syncControlDisabled = provider.loginRequired && !provider.connected ? "disabled" : "";
      const syncLabel = provider.loginRequired && !provider.connected ? "연결 후 사용" : syncState.enabled ? "Auto Sync ON" : "Auto Sync OFF";
      const providerModels = models.filter((model) => getModelProviderKey(model.provider) === provider.key);
      const modelButtons = includeModelButtons && providerModels.length
        ? providerModels
            .map(
              (model) => `
                <button class="appendix-model-pill" type="button" data-modal-type="model" data-modal-id="${escapeAttr(model.id)}">
                  ${escapeHtml(model.name)}
                </button>
              `
            )
            .join("")
        : provider.versions.slice(0, 2).map((version) => `<span class="arsenal-mini-chip">${escapeHtml(version)}</span>`).join("");

      return `
        <article class="arsenal-entry ${rowClass}">
          <div class="arsenal-entry-main">
            <div class="arsenal-icon">
              <span class="material-symbols-outlined">${escapeHtml(getArsenalIcon(provider.key))}</span>
            </div>
            <div class="arsenal-text">
              <p class="arsenal-title">${escapeHtml(getArsenalTitle(provider))}</p>
              <p class="arsenal-subtitle">${escapeHtml(getArsenalSubtitle(provider))}</p>
            </div>
          </div>
          <div class="arsenal-entry-side">
            <div class="arsenal-badges">
              <span class="arsenal-badge ${escapeAttr(stateBadge.tone)}">${escapeHtml(stateBadge.label)}</span>
              <span class="arsenal-badge ${escapeAttr(scopeBadge.tone)}">${escapeHtml(scopeBadge.label)}</span>
            </div>
            <p class="arsenal-footnote">${escapeHtml(provider.note)}</p>
          </div>
          <div class="arsenal-entry-actions">
            <div class="arsenal-version-row">
              ${modelButtons || `<span class="arsenal-mini-chip">${escapeHtml(provider.label)}</span>`}
            </div>
            <div class="arsenal-action-row">
              ${loginControl}
              ${
                provider.loginRequired
                  ? `<button class="connect-toggle ${provider.connected ? "connected" : ""}" type="button" data-connection-provider="${escapeAttr(provider.key)}">${provider.connected ? "연결 저장됨" : "연결 저장"}</button>`
                  : `<span class="arsenal-link muted">로그인 불필요</span>`
              }
              <button class="sync-button ${syncState.enabled ? "active" : ""}" type="button" data-provider-sync="${escapeAttr(provider.key)}" data-sync-mode="toggle" ${syncControlDisabled}>
                ${escapeHtml(syncLabel)}
              </button>
              <button class="sync-button" type="button" data-provider-sync="${escapeAttr(provider.key)}" data-sync-mode="run" ${syncControlDisabled}>
                동기화
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  return { metaMarkup, entriesMarkup, providers, connectedProviders, localReady, modelCount: models.length, installedSkillsCount: installedSkills.length };
}

function getArsenalIcon(providerKey) {
  const iconMap = {
    openai: "smart_toy",
    anthropic: "psychology",
    google: "neurology",
    xai: "travel_explore",
    deepseek: "tactic",
    qwen: "code",
    meta: "dns",
    mistral: "speed",
    cohere: "description",
    openrouter: "hub",
    cursor: "edit_square",
    windsurf: "waves",
    local: "memory"
  };
  return iconMap[providerKey] || "settings_suggest";
}

function getArsenalTitle(provider) {
  const titleMap = {
    openai: "GPT-5.x / Codex",
    anthropic: "Claude 4.x / Claude Code",
    google: "Gemini 2.5 Family",
    xai: "Grok 4.x",
    deepseek: "DeepSeek API Family",
    qwen: "Qwen3 / Qwen3-Coder",
    meta: "Llama 4 / Open Stack",
    mistral: "Mistral / Devstral",
    cohere: "Command A Family",
    openrouter: "OpenRouter Hub",
    cursor: "Cursor IDE",
    windsurf: "Windsurf IDE",
    local: "Ollama / LM Studio"
  };
  return titleMap[provider.key] || provider.versions[0] || provider.label;
}

function getArsenalSubtitle(provider) {
  return `${provider.label} / ${provider.sessionPurpose}`;
}

function getArsenalStateBadge(provider, syncState) {
  if (!provider.loginRequired) return { label: "Ready", tone: "ready" };
  if (provider.connected && syncState.enabled) return { label: "Stable", tone: "stable" };
  if (provider.connected) return { label: "Connected", tone: "connected" };
  return { label: "Pending", tone: "pending" };
}

function getArsenalScopeBadge(provider, syncState) {
  if (!provider.loginRequired) return { label: "Local", tone: "local" };
  if (provider.connected && syncState.enabled) return { label: "Auto Sync", tone: "sync" };
  if (provider.connected) return { label: "Session Saved", tone: "saved" };
  return { label: "Login Flow", tone: "login" };
}

function runRecommendation() {
  const previous = state.lastRecommendation;
  const result = analyzeProjectBrief(elements.projectInput?.value || "");
  state.lastRecommendation = result;
  renderRecommendationResult(result, previous);
}

function analyzeProjectBrief(rawText) {
  const text = normalize(rawText);
  const scored = arrayOrEmpty(state.recommendations.playbooks)
    .map((playbook) => ({ playbook, score: scorePlaybook(playbook, text) }))
    .sort((left, right) => right.score - left.score);

  const best = scored[0]?.playbook || state.recommendations.playbooks[0];
  const signals = detectProjectSignals(text);
  const rankedModels = rankCandidateModels(signals);
  const rankedTools = rankCandidateTools(signals);
  const primaryModel = rankedModels[0]?.name || best.primary_model;
  const backupModel = rankedModels[1]?.name || deriveBackup(best).model;
  const primaryTool = rankedTools[0]?.name || best.primary_tool;
  const backupTool = rankedTools[1]?.name || deriveBackup(best).tool;
  const toolId = resolveToolId(primaryTool);
  const installGuide = getInstallGuide(toolId);
  const modelVersion = findVersion(primaryModel);
  const backupVersion = findVersion(backupModel);
  const supportTools = buildSupportToolRecommendations(signals);
  const deploymentMode = resolveDeploymentMode(signals);
  const personalizationDepth = resolvePersonalizationDepth(signals);
  const promptAdapter = buildPromptAdapterCopy(signals);
  const why = buildDynamicWhy(best, signals);
  const switchWhen = buildDynamicSwitchWhen(best, signals);

  return {
    playbook: best,
    playbookSummary: buildRecommendationSummary(best, signals, deploymentMode, supportTools),
    primaryModel,
    backupModel,
    primaryTool,
    backupTool,
    supportTools,
    deploymentMode,
    personalizationDepth,
    promptAdapter,
    modalities: resolveModalities(signals),
    memoryStack: buildMemoryStackDescription(signals, personalizationDepth),
    installGuide,
    limitNote: buildLimitNote(modelVersion),
    backupLimitNote: buildLimitNote(backupVersion),
    rankedModels,
    rankedTools,
    signals,
    why,
    switchWhen
  };
}

function detectProjectSignals(text) {
  const signals = {
    coding: countKeywordMatches(text, ["코드", "레포", "리팩터링", "테스트", "backend", "frontend", "webapp", "app", "개발", "코딩"]),
    design: countKeywordMatches(text, ["디자인", "ui", "ux", "화면", "figma", "레이아웃"]),
    docs: countKeywordMatches(text, ["문서", "명세", "설계", "리뷰", "회의록", "pdf"]),
    vision: countKeywordMatches(text, ["비전", "vision", "image", "이미지", "ocr", "screenshot", "video", "사진"]),
    tts: countKeywordMatches(text, ["tts", "음성합성", "보이스", "voice", "읽어주기"]),
    stt: countKeywordMatches(text, ["stt", "전사", "speech", "음성인식", "transcribe"]),
    realtime: countKeywordMatches(text, ["실시간", "realtime", "live", "stream"]),
    ondevice: countKeywordMatches(text, ["온디바이스", "ondevice", "on-device", "오프라인", "localonly", "온프레미스"]),
    cloud: countKeywordMatches(text, ["클라우드", "cloud", "api", "hosted", "saas", "serverless", "호스팅"]),
    memory: countKeywordMatches(text, ["메모리", "기억", "handover", "공유", "contexttransfer", "컨텍스트전환"]),
    personalization: countKeywordMatches(text, ["개인화", "프로필", "persona", "말투", "사용자기억", "취향"]),
    prompt: countKeywordMatches(text, ["프롬프트", "prompt", "systemprompt", "system"]),
    search: countKeywordMatches(text, ["검색", "뉴스", "트렌드", "최신", "리서치", "web"]),
    automation: countKeywordMatches(text, ["자동화", "배치", "평가", "분류", "대량", "workflow"]),
    ide: countKeywordMatches(text, ["ide", "cursor", "windsurf", "preview", "에디터"]),
    longContext: countKeywordMatches(text, ["긴문서", "긴컨텍스트", "로그", "회의록", "대용량", "longcontext"]),
    cost: countKeywordMatches(text, ["저비용", "비용", "budget", "cheap"]),
    speed: countKeywordMatches(text, ["속도", "빠르게", "latency", "반응속도"]),
    performance: countKeywordMatches(text, ["성능", "정확도", "품질", "복잡한"]),
    privacy: countKeywordMatches(text, ["보안", "프라이버시", "사내망", "private", "민감정보"]),
    enterprise: countKeywordMatches(text, ["엔터프라이즈", "기업", "조직", "workflow", "운영"]),
    browser: countKeywordMatches(text, ["브라우저", "웹검색", "탐색", "browser"])
  };

  const priorityBoosts = {
    cost: () => { signals.cost += 2; signals.automation += 1; },
    speed: () => { signals.speed += 2; signals.realtime += 1; },
    performance: () => { signals.performance += 2; signals.coding += 1; },
    privacy: () => { signals.privacy += 2; signals.ondevice += 1; },
    memory: () => { signals.memory += 2; signals.personalization += 1; },
    long_context: () => { signals.longContext += 2; signals.docs += 1; },
    ide: () => { signals.ide += 2; signals.coding += 1; },
    ondevice: () => { signals.ondevice += 2; signals.privacy += 1; },
    personalization: () => { signals.personalization += 2; signals.prompt += 1; signals.memory += 1; },
    multimodal: () => { signals.vision += 2; signals.tts += 1; signals.stt += 1; }
  };

  state.selectedPriorities.forEach((priority) => priorityBoosts[priority]?.());
  return signals;
}

function rankCandidateModels(signals) {
  return [
    { name: "GPT-5.x / Codex Family", score: 1 + signals.coding * 2.8 + signals.ide * 1.8 + signals.memory * 1.3 + signals.performance * 1.9 + signals.prompt * 0.8 },
    { name: "Claude 4.x / Claude Code", score: 1 + signals.docs * 2.6 + signals.design * 1.7 + signals.memory * 1.8 + signals.personalization * 1.4 + signals.performance * 1.6 },
    { name: "Gemini 2.5 Family", score: 1 + signals.vision * 2.7 + signals.longContext * 2.5 + signals.stt * 1.2 + signals.tts * 0.9 + signals.realtime * 1.1 },
    { name: "Grok 4 / 4.1", score: 1 + signals.search * 2.8 + signals.speed * 1.5 + signals.realtime * 1.7 + signals.browser * 1.2 },
    { name: "DeepSeek-V3.2 API Family", score: 1 + signals.cost * 2.9 + signals.automation * 2.1 + signals.coding * 1.1 },
    { name: "Qwen3 / Qwen3-Coder", score: 1 + signals.ondevice * 3.0 + signals.privacy * 1.8 + signals.coding * 1.9 },
    { name: "Llama 4 Scout / Maverick", score: 1 + signals.ondevice * 2.4 + signals.privacy * 1.7 + signals.longContext * 0.8 },
    { name: "Command A / Command A Reasoning", score: 1 + signals.enterprise * 2.2 + signals.docs * 1.7 + signals.memory * 0.9 },
    { name: "Mistral Large 3 / Devstral 2 / Ministral 3", score: 1 + signals.cost * 1.5 + signals.ondevice * 1.3 + signals.docs * 1.0 },
    { name: "o3 / o3-deep-research", score: 1 + signals.search * 1.7 + signals.docs * 1.3 + signals.performance * 1.5 }
  ].sort((left, right) => right.score - left.score);
}

function rankCandidateTools(signals) {
  return [
    { name: "Codex CLI", score: 1 + signals.coding * 2.8 + signals.memory * 1.2 + signals.performance * 1.4 + signals.prompt * 0.8 },
    { name: "Claude Code", score: 1 + signals.docs * 2.2 + signals.design * 1.5 + signals.memory * 1.4 + signals.personalization * 0.9 },
    { name: "Gemini CLI", score: 1 + signals.longContext * 2.1 + signals.vision * 2.2 + signals.realtime * 0.8 },
    { name: "Cursor", score: 1 + signals.ide * 2.7 + signals.coding * 1.4 + signals.design * 1.0 },
    { name: "Windsurf", score: 1 + signals.ide * 2.3 + signals.memory * 1.4 + signals.speed * 1.0 },
    { name: "Aider", score: 1 + signals.coding * 1.9 + signals.cost * 1.2 + signals.ondevice * 1.3 },
    { name: "Continue", score: 1 + signals.ondevice * 2.2 + signals.ide * 1.6 + signals.privacy * 1.7 },
    { name: "OpenHands", score: 1 + signals.automation * 2.1 + signals.browser * 1.3 + signals.cloud * 1.1 },
    { name: "Ollama", score: 1 + signals.ondevice * 3.0 + signals.privacy * 2.4 },
    { name: "LM Studio", score: 1 + signals.ondevice * 2.6 + signals.vision * 0.8 + signals.tts * 0.8 },
    { name: "OpenRouter", score: 1 + signals.cost * 1.7 + signals.memory * 0.8 + signals.cloud * 1.8 + signals.automation * 0.8 },
    { name: "Cline", score: 1 + signals.ide * 1.6 + signals.cloud * 1.1 + signals.prompt * 0.7 }
  ].sort((left, right) => right.score - left.score);
}

function buildSupportToolRecommendations(signals) {
  const tools = [];
  if (signals.vision > 0) tools.push("Vision OCR / image parser");
  if (signals.stt > 0) tools.push("Whisper / realtime STT");
  if (signals.tts > 0) tools.push("OpenAI TTS / ElevenLabs");
  if (signals.realtime > 0) tools.push("Realtime streaming bridge");
  if (signals.ondevice > 0) tools.push("Local vector store / Ollama cache");
  if (signals.memory > 0 || signals.personalization > 0) tools.push("Central memory hub / adapter exports");
  if (signals.prompt > 0 || signals.personalization > 0) tools.push("prompt-personalization-ko prompt adapter");
  return [...new Set(tools)];
}

function resolveDeploymentMode(signals) {
  if (signals.ondevice >= signals.cloud + 1) return "On-device / Private";
  if (signals.cloud >= signals.ondevice + 1) return "Cloud API / Hosted";
  return "Hybrid";
}

function resolvePersonalizationDepth(signals) {
  const score = signals.memory + signals.personalization + signals.prompt;
  if (score >= 6) return "깊음 / profile + prompt adaptation";
  if (score >= 3) return "중간 / project + persona memory";
  return "얕음 / project runtime 중심";
}

function resolveModalities(signals) {
  const types = [];
  if (signals.vision > 0) types.push("Vision");
  if (signals.stt > 0) types.push("STT");
  if (signals.tts > 0) types.push("TTS");
  if (!types.length) types.push("Text");
  return types.join(" / ");
}

function buildMemoryStackDescription(signals, personalizationDepth) {
  const parts = ["shared hub"];
  if (signals.memory > 0) parts.push("handover packet");
  if (signals.personalization > 0) parts.push("private personalization vault");
  if (signals.prompt > 0 || personalizationDepth.includes("깊음")) parts.push("prompt adapter");
  parts.push("model-local cache");
  return parts.join(" + ");
}

function buildPromptAdapterCopy(signals) {
  if (signals.prompt > 0 || signals.personalization > 0 || signals.memory > 1) {
    return "prompt-personalization-ko가 공통 프롬프트를 각 모델 스타일과 한계에 맞게 변환";
  }
  return "기본 규칙 파일 중심, 필요 시에만 모델별 프롬프트 변환";
}

function buildRecommendationSummary(playbook, signals, deploymentMode, supportTools) {
  const highlights = [];
  if (signals.coding > 0) highlights.push("코딩/레포 작업");
  if (signals.docs > 0) highlights.push("문서/설계");
  if (signals.vision > 0) highlights.push("비전");
  if (signals.tts > 0 || signals.stt > 0) highlights.push("음성");
  if (signals.memory > 0 || signals.personalization > 0) highlights.push("중앙 메모리");
  const highlightText = highlights.length ? highlights.join(", ") : playbook.scope;
  const supportText = supportTools.length ? `부가 툴: ${supportTools.join(" / ")}` : "부가 툴 없음";
  return `${highlightText} 기준으로 ${deploymentMode} 구성을 우선 추천합니다. ${supportText}`;
}

function buildDynamicWhy(playbook, signals) {
  const reasons = [...arrayOrEmpty(playbook.why)];
  if (signals.ondevice > 0) reasons.unshift("온디바이스 / 사내망 제약");
  if (signals.vision > 0) reasons.unshift("비전 입력 처리 필요");
  if (signals.tts > 0 || signals.stt > 0) reasons.unshift("음성 입출력 필요");
  if (signals.memory > 0 || signals.personalization > 0) reasons.unshift("중앙 메모리 / 개인화 공유 필요");
  return [...new Set(reasons)].slice(0, 5);
}

function buildDynamicSwitchWhen(playbook, signals) {
  const rules = [...arrayOrEmpty(playbook.switch_when)];
  if (signals.cost > 1) rules.unshift("비용이 급격히 중요해지면 DeepSeek / 오픈모델 비중 확대");
  if (signals.ondevice > 0) rules.unshift("클라우드 사용이 막히면 Ollama / LM Studio / Continue로 전환");
  if (signals.vision > 0 || signals.tts > 0 || signals.stt > 0) rules.unshift("비전/음성 비중이 커지면 멀티모달 모델과 전용 부가 툴을 함께 투입");
  return [...new Set(rules)].slice(0, 5);
}

function buildRecommendationTimelineMarkup(result) {
  const selectedPriorityIds = arrayOrEmpty(state.selectedPriorities);
  const stages = [
    {
      id: "launch",
      tone: "primary",
      lane: "Day 0",
      title: "Launch",
      icon: "rocket_launch",
      copy: "환경, 설치 뷰, 주 경로를 먼저 고정합니다.",
      priorityIds: ["speed", "ide", "multimodal"],
      items: [
        `Install view ${result.installGuide.mode}`,
        `Deploy ${result.deploymentMode}`,
        `Starter ${result.primaryTool}`
      ]
    },
    {
      id: "build",
      tone: "secondary",
      lane: "Day 1-2",
      title: "Build",
      icon: "build",
      copy: "주력 모델과 툴로 실제 작업을 전개합니다.",
      priorityIds: ["performance", "cost", "ondevice", "long_context"],
      items: [
        `Primary ${result.primaryModel}`,
        `Tool ${result.primaryTool}`,
        result.supportTools[0] || `Modalities ${result.modalities}`
      ]
    },
    {
      id: "validate",
      tone: "warning",
      lane: "Day 2-3",
      title: "Validate",
      icon: "fact_check",
      copy: "교체 기준과 fallback 경로로 결과를 고정합니다.",
      priorityIds: ["performance", "privacy", "long_context", "cost"],
      items: [
        `Fallback ${result.backupModel}`,
        result.switchWhen[0] || "교체 조건 없음",
        `Depth ${result.personalizationDepth}`
      ]
    },
    {
      id: "handover",
      tone: "mint",
      lane: "Always",
      title: "Handover",
      icon: "sync_alt",
      copy: "메모리와 어댑터 규칙으로 다음 사람과 모델에 넘깁니다.",
      priorityIds: ["memory", "personalization", "privacy"],
      items: [
        `Memory ${result.memoryStack}`,
        trimText(result.promptAdapter, 64),
        result.supportTools.includes("Central memory hub / adapter exports") ? "Central memory hub linked" : "Project runtime handover"
      ]
    }
  ];

  const stageScores = stages.map((stage) => {
    const matchedIds = stage.priorityIds.filter((priorityId) => selectedPriorityIds.includes(priorityId));
    return {
      ...stage,
      matchedIds,
      score: matchedIds.length
    };
  });

  const maxScore = Math.max(...stageScores.map((stage) => stage.score), 0);
  const prioritySummary = selectedPriorityIds.length
    ? selectedPriorityIds.map((priorityId) => getPriorityLabel(priorityId)).join(" / ")
    : "기본 추천 흐름";

  return `
    <section class="recommendation-calendar-panel">
      <div class="recommendation-calendar-head">
        <div>
          <p class="tiny-label">Execution Calendar</p>
          <h5>Launch / Build / Validate / Handover</h5>
          <p>선택한 우선순위에 따라 강조되는 단계가 달라집니다. 지금은 ${escapeHtml(prioritySummary)} 기준으로 읽히도록 조정했습니다.</p>
        </div>
        <div class="recommendation-calendar-badges">
          <span class="recommendation-calendar-badge active">선택 기준 반영</span>
          <span class="recommendation-calendar-badge">${escapeHtml(result.playbook.name)}</span>
        </div>
      </div>
      <div class="recommendation-calendar-track">
        ${stageScores
          .map((stage) => {
            const matchedLabels = stage.matchedIds.map((priorityId) => getPriorityLabel(priorityId));
            const emphasisClass = stage.score > 0 ? (stage.score === maxScore ? "dominant" : "active") : "";
            const stageLabels = matchedLabels.length ? matchedLabels : stage.priorityIds.slice(0, 2).map((priorityId) => getPriorityLabel(priorityId));
            return `
              <article class="recommendation-calendar-stage ${escapeAttr(stage.tone)} ${escapeAttr(emphasisClass)}">
                <div class="recommendation-calendar-stage-top">
                  <div class="recommendation-calendar-stage-icon">
                    <span class="material-symbols-outlined">${escapeHtml(stage.icon)}</span>
                  </div>
                  <div class="recommendation-calendar-stage-copy">
                    <span>${escapeHtml(stage.lane)}</span>
                    <strong>${escapeHtml(stage.title)}</strong>
                  </div>
                </div>
                <p>${escapeHtml(stage.copy)}</p>
                <ul class="recommendation-calendar-points">
                  ${stage.items.filter(Boolean).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
                </ul>
                <div class="recommendation-calendar-priority-row">
                  ${stageLabels.map((label) => `<span class="recommendation-calendar-chip ${matchedLabels.includes(label) ? "matched" : ""}">${escapeHtml(label)}</span>`).join("")}
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function countKeywordMatches(text, keywords) {
  return keywords.reduce((count, keyword) => count + (text.includes(normalize(keyword)) ? 1 : 0), 0);
}

function scorePlaybook(playbook, text) {
  const keywordMap = {
    "레포 규모가 큰 실제 코딩 프로젝트": ["레포", "코드", "리팩터링", "테스트", "백엔드", "프론트", "웹앱", "앱", "대형"],
    "설계 품질이 중요한 코드베이스": ["설계", "문서", "리뷰", "아키텍처", "품질", "명세"],
    "긴 문서와 로그를 많이 보는 프로젝트": ["문서", "pdf", "로그", "회의록", "긴", "대용량", "컨텍스트"],
    "저비용 대량 평가와 자동화": ["저비용", "대량", "평가", "배치", "자동화", "실험"],
    "오픈모델 기반 프라이빗 스택": ["프라이빗", "로컬", "오프라인", "사내", "보안", "온프레미스"],
    "실시간 검색/뉴스/트렌드 의존 작업": ["검색", "뉴스", "트렌드", "최신", "리서치", "웹"],
    "IDE 안에서 빠르게 돌려보는 웹/앱 개발": ["ui", "화면", "프론트", "ide", "preview", "웹앱", "앱", "디자인"],
    "멀티유저 운영 비서 / 메모리 우선 에이전트": ["메모리", "handover", "운영", "비서", "개인화", "장기기억", "컨텍스트 전환"]
  };

  const keywords = keywordMap[playbook.name] || [];
  const keywordScore = keywords.reduce((score, keyword) => score + (text.includes(normalize(keyword)) ? 2 : 0), 0);
  const scopeScore = text.includes(normalize(playbook.scope)) ? 1 : 0;
  const fallbackScore = playbook.priority === "high" ? 0.5 : 0;
  const priorityScore = getPriorityScore(playbook);

  return keywordScore + scopeScore + fallbackScore + priorityScore;
}

function renderRecommendationResult(result, previous) {
  const primaryVersion = findVersion(result.primaryModel);
  const primaryModelRecord = findModelRecordByName(result.primaryModel);
  const backupModelRecord = findModelRecordByName(result.backupModel);
  const primaryToolRecord = findToolRecordByName(result.primaryTool);
  const backupToolRecord = findToolRecordByName(result.backupTool);
  const primaryMeta = getVersionConnectionMeta(primaryVersion, getModelProviderKey(result.primaryModel));
  const backupVersion = findVersion(result.backupModel);
  const backupMeta = getVersionConnectionMeta(backupVersion, getModelProviderKey(result.backupModel));
  const toolMeta = getToolConnectionMeta(primaryToolRecord || {});
  const backupToolMeta = getToolConnectionMeta(backupToolRecord || {});
  const selectedPriorityText = getSelectedPriorityLabels().join(" / ");
  const changed = {
    primaryModel: previous && previous.primaryModel !== result.primaryModel,
    backupModel: previous && previous.backupModel !== result.backupModel,
    primaryTool: previous && previous.primaryTool !== result.primaryTool,
    backupTool: previous && previous.backupTool !== result.backupTool,
    deploymentMode: previous && previous.deploymentMode !== result.deploymentMode,
    personalizationDepth: previous && previous.personalizationDepth !== result.personalizationDepth,
    supportTools: previous && previous.supportTools.join(" / ") !== result.supportTools.join(" / "),
    memoryStack: previous && previous.memoryStack !== result.memoryStack
  };

  const stackCards = [
    buildRecommendationSelectionCard({
      kind: "model",
      role: "Primary Model",
      title: result.primaryModel,
      subtitle: primaryVersion?.name || primaryModelRecord?.category || "latest stable",
      meta: `${result.limitNote}${primaryMeta.locked ? " / provider login 필요" : ""}`,
      accent: "primary",
      emphasis: "selected",
      changed: changed.primaryModel,
      points: [
        `Context ${primaryVersion?.context_window || "tiered"}`,
        `Max output ${primaryVersion?.max_output || "tiered"}`,
        getKnowledgeCutoffShort(primaryVersion),
        ...(arrayOrEmpty(primaryModelRecord?.strengths).slice(0, 1))
      ],
      modalType: primaryModelRecord ? "model" : "",
      modalId: primaryModelRecord?.id || ""
    }),
    buildRecommendationSelectionCard({
      kind: "tool",
      role: "Primary Tool",
      title: result.primaryTool,
      subtitle: result.installGuide.mode,
      meta: `${primaryToolRecord?.memory_bridge || "tool memory bridge"}${toolMeta.locked ? " / login flow 필요" : ""}`,
      accent: "secondary",
      emphasis: "selected",
      changed: changed.primaryTool,
      points: [
        `Install ${result.installGuide.mode}`,
        `Bridge ${primaryToolRecord?.memory_bridge || "shared hub adapter"}`,
        toolMeta.requiresLogin ? "Provider auth 필요" : "로그인 없이 바로 사용",
        installStepsPreview(result.installGuide.steps)
      ],
      modalType: primaryToolRecord ? "tool" : "",
      modalId: primaryToolRecord?.id || ""
    }),
    buildRecommendationSelectionCard({
      kind: "model",
      role: "Backup Model",
      title: result.backupModel,
      subtitle: backupVersion?.name || backupModelRecord?.category || "fallback line",
      meta: `${result.backupLimitNote}${backupMeta.locked ? " / 별도 auth" : ""}`,
      accent: "support",
      emphasis: "support",
      changed: changed.backupModel,
      points: [
        `Fallback ${result.switchWhen[0] || "추가 reasoning 필요 시"}`,
        `Context ${backupVersion?.context_window || "tiered"}`,
        ...(arrayOrEmpty(backupModelRecord?.strengths).slice(0, 1))
      ],
      modalType: backupModelRecord ? "model" : "",
      modalId: backupModelRecord?.id || ""
    }),
    buildRecommendationSelectionCard({
      kind: "tool",
      role: "Backup Tool",
      title: result.backupTool,
      subtitle: "fallback / 비교 / 검증",
      meta: `${backupToolRecord?.memory_bridge || "tool fallback path"}${backupToolMeta.locked ? " / session login" : ""}`,
      accent: "neutral",
      emphasis: "support",
      changed: changed.backupTool,
      points: [
        "비교 실행 / 보조 수정 / 검증용",
        `Install ${getInstallGuide(resolveToolId(result.backupTool)).mode}`,
        backupToolMeta.requiresLogin ? "로그인 후 사용" : "즉시 실행 가능"
      ],
      modalType: backupToolRecord ? "tool" : "",
      modalId: backupToolRecord?.id || ""
    })
  ].join("");

  const metricCards = [
    buildRecommendationSnapshotCard("Context", primaryVersion?.context_window || "tiered", primaryVersion?.name || "primary model", "data_array", "primary"),
    buildRecommendationSnapshotCard("Max Output", primaryVersion?.max_output || "tiered", result.modalities, "output", "secondary"),
    buildRecommendationSnapshotCard("Deployment", result.deploymentMode, environmentLabel(state.environment), "deployed_code", "mint"),
    buildRecommendationSnapshotCard("Memory", result.personalizationDepth, result.memoryStack, "account_tree", "warning")
  ].join("");

  const quickTags = [
    buildRecommendationChip("model", result.primaryModel),
    buildRecommendationChip("tool", result.primaryTool),
    buildRecommendationChip("model", result.backupModel),
    buildRecommendationChip("tool", result.backupTool),
    ...result.supportTools.map((tool) => buildRecommendationChip("support", tool)),
    buildRecommendationChip("memory", result.memoryStack),
    buildRecommendationChip("modality", result.modalities)
  ].join("");

  const bars = [
    buildRecommendationBar("Quality Fit", computeSignalPercent(result.signals.performance + result.signals.coding + result.signals.docs), "primary"),
    buildRecommendationBar("Speed Bias", computeSignalPercent(result.signals.speed + result.signals.realtime + result.signals.ide), "secondary"),
    buildRecommendationBar("Memory Share", computeSignalPercent(result.signals.memory + result.signals.personalization + result.signals.prompt), "mint")
  ].join("");

  const readinessValue = primaryMeta.locked || toolMeta.locked ? "Pending" : "Ready";
  const readinessRows = [
    buildRecommendationStatusRow("Primary model", primaryMeta.locked ? "Login needed" : "Ready"),
    buildRecommendationStatusRow("Primary tool", toolMeta.locked ? "Setup needed" : "Ready"),
    buildRecommendationStatusRow("Prompt adapter", result.promptAdapter.includes("prompt-personalization-ko") ? "Adapter on" : "Base rules"),
    buildRecommendationStatusRow("Handover lane", result.memoryStack)
  ].join("");

  const rationaleCards = [
    buildRecommendationInsightCard("왜 이 구성이 맞는가", result.why.join(" / "), "architecture", "primary"),
    buildRecommendationInsightCard("공유 메모리 경로", `${result.memoryStack} / ${result.promptAdapter}`, "database", "secondary"),
    buildRecommendationInsightCard("언제 교체하는가", result.switchWhen.join(" / "), "update", "warning"),
    buildRecommendationInsightCard("설치 시작점", installStepsPreview(result.installGuide.steps), "terminal", "neutral", buildRecommendationInstallChecklist(result.installGuide.steps))
  ].join("");
  const timelineMarkup = buildRecommendationTimelineMarkup(result);

  elements.recommendationResult.innerHTML = `
    <div class="recommendation-shell">
      <section class="recommendation-strategy-card">
        <div class="recommendation-strategy-head">
          <div class="recommendation-topcopy">
            <p class="tiny-label">Suggested Stack</p>
            <h4>${escapeHtml(result.playbook.name)}</h4>
            <p>${escapeHtml(result.playbookSummary)}</p>
          </div>
          <div class="recommendation-topmeta">
            ${(selectedPriorityText ? selectedPriorityText.split(" / ") : ["기본값"]).map((item) => `<span class="recommendation-top-pill">${escapeHtml(item)}</span>`).join("")}
          </div>
        </div>
        <div class="recommendation-summary-ribbon">
          <div class="recommendation-summary-item">
            <span>Deployment</span>
            <strong>${escapeHtml(result.deploymentMode)}</strong>
          </div>
          <div class="recommendation-summary-item">
            <span>Install View</span>
            <strong>${escapeHtml(result.installGuide.mode)}</strong>
          </div>
          <div class="recommendation-summary-item">
            <span>Modalities</span>
            <strong>${escapeHtml(result.modalities)}</strong>
          </div>
          <div class="recommendation-summary-item">
            <span>Memory Path</span>
            <strong>${escapeHtml(result.memoryStack)}</strong>
          </div>
        </div>
      </section>

      <div class="recommendation-layout">
        <section class="recommendation-stack-stage">
          <div class="recommendation-stage-head">
            <div class="recommendation-stage-copy">
              <p class="tiny-label">Selected Stack</p>
              <h5>추천 결과로 묶인 실행 카드</h5>
              <p>모델과 툴을 따로 떼지 않고 한 조합으로 묶었습니다. 파란 카드가 주 경로, 연한 카드가 fallback 경로입니다.</p>
            </div>
          </div>
          <div class="recommendation-stack-grid">
            ${stackCards}
          </div>
        </section>

        <aside class="recommendation-side-rail">
          <article class="recommendation-readiness-card">
            <p class="tiny-label">Setup Readiness</p>
            <strong class="recommendation-readiness-value">${escapeHtml(readinessValue)}</strong>
            <p>지금 바로 붙일 수 있는 상태와 추가 로그인/설치가 필요한 지점을 한눈에 확인합니다.</p>
            <div class="recommendation-status-list">
              ${readinessRows}
            </div>
          </article>

          <article class="recommendation-tag-panel">
            <p class="tiny-label">Recommended Architecture</p>
            <h5>Quick Deploy Tags</h5>
            <div class="recommendation-chip-group">
              ${quickTags}
            </div>
            <div class="recommendation-bar-group">
              ${bars}
            </div>
            <div class="recommendation-tag-note">
              <span>${escapeHtml(result.supportTools.length ? `부가 툴 ${result.supportTools.join(" / ")}` : "부가 툴 없음")}</span>
              <span>${escapeHtml(result.switchWhen[0] || "현재 조합 유지")}</span>
            </div>
          </article>
        </aside>
      </div>

      <div class="recommendation-metric-strip">
        ${metricCards}
      </div>

      <div class="recommendation-rationale-grid">
        ${rationaleCards}
      </div>

      ${timelineMarkup}
    </div>
  `;

  const panel = elements.recommendationResult.closest(".result-panel");
  if (panel) {
    panel.classList.remove("flash-update");
    void panel.offsetWidth;
    panel.classList.add("flash-update");
  }

  renderHomeMobileShell();
}

function buildRecommendationRegistryItem({ type, role, title, subtitle, meta, accent, changed, modalType, modalId }) {
  const iconMap = {
    model: "smart_toy",
    tool: "terminal",
    support: "extension"
  };
  const badgeLabel = type === "model" ? "Model" : "Tool";
  const detailControl = modalType && modalId
    ? `<button class="recommendation-detail" type="button" data-modal-type="${escapeAttr(modalType)}" data-modal-id="${escapeAttr(modalId)}">세부</button>`
    : "";
  return `
    <article class="recommendation-registry-item ${escapeAttr(type)} ${escapeAttr(accent)} ${changed ? "changed" : ""}">
      <div class="recommendation-registry-main">
        <div class="recommendation-registry-icon ${escapeAttr(type)} ${escapeAttr(accent)}">
          <span class="material-symbols-outlined">${escapeHtml(iconMap[type] || "hub")}</span>
        </div>
        <div class="recommendation-registry-copy">
          <p class="recommendation-registry-title">${escapeHtml(title)}</p>
          <p class="recommendation-registry-subtitle">${escapeHtml(subtitle)}</p>
        </div>
      </div>
      <div class="recommendation-registry-side">
        <div class="recommendation-registry-badges">
          <span class="recommendation-kind ${escapeAttr(type)}">${escapeHtml(badgeLabel)}</span>
          <span class="recommendation-kind role">${escapeHtml(role)}</span>
        </div>
        <p class="recommendation-registry-note">${escapeHtml(meta)}</p>
      </div>
      ${detailControl}
    </article>
  `;
}

function buildRecommendationSelectionCard({ kind, role, title, subtitle, meta, accent, emphasis, changed, points, modalType, modalId }) {
  const iconMap = {
    model: "smart_toy",
    tool: "terminal",
    support: "extension"
  };
  const detailControl = modalType && modalId
    ? `<button class="recommendation-detail" type="button" data-modal-type="${escapeAttr(modalType)}" data-modal-id="${escapeAttr(modalId)}">세부</button>`
    : "";

  return `
    <article class="recommendation-selection-card ${escapeAttr(kind)} ${escapeAttr(accent)} ${escapeAttr(emphasis)} ${changed ? "changed" : ""}">
      <div class="recommendation-selection-top">
        <div class="recommendation-selection-icon ${escapeAttr(kind)} ${escapeAttr(accent)}">
          <span class="material-symbols-outlined">${escapeHtml(iconMap[kind] || "hub")}</span>
        </div>
        <div class="recommendation-selection-badges">
          <span class="recommendation-selection-kind ${escapeAttr(kind)}">${escapeHtml(kind === "model" ? "Model" : "Tool")}</span>
          <span class="recommendation-selection-role">${escapeHtml(role)}</span>
        </div>
      </div>
      <div class="recommendation-selection-copy">
        <h6 class="recommendation-selection-title">${escapeHtml(title)}</h6>
        <p class="recommendation-selection-subtitle">${escapeHtml(subtitle)}</p>
        <p class="recommendation-selection-meta">${escapeHtml(meta)}</p>
      </div>
      <ul class="recommendation-selection-points">
        ${arrayOrEmpty(points).filter(Boolean).slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
      <div class="recommendation-detail-row">
        ${detailControl}
      </div>
    </article>
  `;
}

function buildRecommendationSnapshotCard(label, value, note, icon, tone) {
  return `
    <article class="recommendation-snapshot-card ${escapeAttr(tone)}">
      <div class="recommendation-snapshot-head">
        <span>${escapeHtml(label)}</span>
        <span class="material-symbols-outlined">${escapeHtml(icon)}</span>
      </div>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(note)}</p>
    </article>
  `;
}

function buildRecommendationInsightCard(title, body, icon, tone, extraMarkup = "") {
  return `
    <article class="recommendation-insight-card ${escapeAttr(tone)}">
      <div class="recommendation-insight-head">
        <div class="recommendation-insight-icon">
          <span class="material-symbols-outlined">${escapeHtml(icon)}</span>
        </div>
        <strong>${escapeHtml(title)}</strong>
      </div>
      <p>${escapeHtml(body)}</p>
      ${extraMarkup}
    </article>
  `;
}

function buildRecommendationInstallChecklist(steps) {
  const items = arrayOrEmpty(steps).slice(0, 3);
  if (!items.length) return "";

  return `
    <div class="recommendation-install-list">
      ${items
        .map(
          (step, index) => `
            <div class="recommendation-install-step">
              <span>${escapeHtml(String(index + 1).padStart(2, "0"))}</span>
              <p>${escapeHtml(step)}</p>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function buildRecommendationStatusRow(label, value) {
  return `
    <div class="recommendation-status-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function buildRecommendationMetricCard(label, value, note, tone) {
  return `
    <article class="recommendation-slim-card ${escapeAttr(tone)}">
      <div class="recommendation-slim-head">
        <span class="material-symbols-outlined">${escapeHtml(tone === "warning" ? "warning" : tone === "mint" ? "sync_alt" : tone === "secondary" ? "token" : "speed")}</span>
        <span>${escapeHtml(label)}</span>
      </div>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(note)}</p>
    </article>
  `;
}

function buildRecommendationChip(kind, label) {
  return `
    <span class="recommendation-chip ${escapeAttr(kind)}">${escapeHtml(label)}</span>
  `;
}

function buildRecommendationBar(label, value, tone) {
  return `
    <div class="recommendation-bar">
      <div class="recommendation-bar-label">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(`${value}%`)}</strong>
      </div>
      <div class="recommendation-bar-track">
        <div class="recommendation-bar-fill ${escapeAttr(tone)}" style="width:${escapeAttr(String(value))}%"></div>
      </div>
    </div>
  `;
}

function computeSignalPercent(rawScore) {
  return Math.max(18, Math.min(96, 24 + rawScore * 12));
}

function renderRecipeTable() {
  const rows = sortPlaybooksForSelection(arrayOrEmpty(state.recommendations.playbooks))
    .map((playbook) => {
      const backup = deriveBackup(playbook);
      const toolId = resolveToolId(playbook.primary_tool);
      const installGuide = getInstallGuide(toolId);
      const modelVersion = findVersion(playbook.primary_model);
      const modelMeta = getVersionConnectionMeta(modelVersion, getModelProviderKey(playbook.primary_model));
      const rowClass = modelMeta.locked ? "locked-row" : "";

      return `
        <tr class="${rowClass}">
          <td>
            <div class="table-main">
              <strong>${escapeHtml(playbook.name)}</strong>
              <span>${escapeHtml(playbook.summary)}</span>
            </div>
          </td>
          <td>${escapeHtml(playbook.primary_model)}</td>
          <td>${escapeHtml(backup.model)}</td>
          <td>${escapeHtml(playbook.primary_tool)}</td>
          <td>${escapeHtml(installGuide.mode)}</td>
          <td>${escapeHtml(buildLimitNote(modelVersion))}</td>
          <td>${escapeHtml(playbook.memory_stack)}</td>
        </tr>
      `;
    })
    .join("");

  elements.recipeTable.innerHTML = `
    <thead>
      <tr>
        <th>상황</th>
        <th>주력 모델</th>
        <th>보조 모델</th>
        <th>주력 툴</th>
        <th>설치 뷰</th>
        <th>리밋</th>
        <th>메모리 공유</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

function renderQuestionGuide() {
  if (!elements.questionGuideTable) return;

  const rows = sortPlaybooksForSelection(arrayOrEmpty(state.recommendations.playbooks))
    .map((playbook) => {
      const guide = QUESTION_GUIDE_BY_PLAYBOOK[playbook.name] || {
        ask: `${playbook.name}에 맞는 모델/툴 추천해줘.`,
        priorityIds: [],
        signals: arrayOrEmpty(playbook.why).slice(0, 3)
      };
      const priorityLabels = guide.priorityIds.map((id) => getPriorityLabel(id));
      return `
        <tr>
          <td>
            <div class="table-main">
              <strong>${escapeHtml(playbook.name)}</strong>
              <span>${escapeHtml(playbook.summary)}</span>
            </div>
          </td>
          <td>
            <div class="result-metadata">
              ${priorityLabels.map((label) => `<span class="chip">${escapeHtml(label)}</span>`).join("")}
            </div>
          </td>
          <td><span class="table-subtext">${escapeHtml(guide.ask)}</span></td>
          <td>
            <div class="result-metadata">
              ${arrayOrEmpty(guide.signals).map((signal) => `<span class="chip">${escapeHtml(signal)}</span>`).join("")}
            </div>
          </td>
          <td>
            <div class="table-main">
              <strong>${escapeHtml(playbook.primary_model)}</strong>
              <span>${escapeHtml(playbook.primary_tool)}</span>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  elements.questionGuideTable.innerHTML = `
    <thead>
      <tr>
        <th>상황</th>
        <th>먼저 고를 기준</th>
        <th>이렇게 물어보기</th>
        <th>모델을 가르는 신호</th>
        <th>우선 추천 조합</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

function renderMemorySection() {
  const publicProjects = arrayOrEmpty(state.projects.projects).filter((project) => project.visibility === "public");
  const memoryNodes = buildMemoryNodes(publicProjects.length).filter((node) => ["shared-governance", "shared-project-records", "collaboration-packet"].includes(node.id));
  state.memoryProtocolCode = buildMemoryProtocolCode();

  if (elements.sharedMemoryDiagram) {
    elements.sharedMemoryDiagram.innerHTML = buildSharedMemoryDiagramMarkup();
  }

  if (elements.mermaidGuideLegend) {
    elements.mermaidGuideLegend.innerHTML = buildMermaidLegendMarkup();
  }

  renderMermaidDiagram(elements.protocolMermaid, state.memoryProtocolCode);

  elements.memoryGovernanceBoard.innerHTML = buildSharedMemoryPolicyMarkup();

  elements.handoverBoard.innerHTML = buildCollaborationHandoverMarkup();

  elements.memoryNodeTable.innerHTML = `
    <thead>
      <tr>
        <th>공유 레이어</th>
        <th>여기에 남는 내용</th>
        <th>누가 읽는지</th>
        <th>언제 갱신하는지</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      ${memoryNodes
        .map(
          (node) => `
            <tr>
              <td>
                <div class="table-main">
                  <strong>${escapeHtml(node.label)}</strong>
                  <span>${escapeHtml(`${node.classification} / ${node.summary}`)}</span>
                </div>
              </td>
              <td>${escapeHtml(getSharedNodeObserverContents(node.id))}</td>
              <td>${escapeHtml(node.readWhen)}</td>
              <td>${escapeHtml(node.updateWhen)}</td>
              <td><button class="table-action" type="button" data-modal-type="node" data-modal-id="${escapeAttr(node.id)}">상세</button></td>
            </tr>
          `
        )
        .join("")}
    </tbody>
  `;
}

function renderPersonalizationSection() {
  const profile = state.memory?.user_profile || {};
  const layers = arrayOrEmpty(state.memory?.layers);
  const currentFocus = arrayOrEmpty(state.memory?.current_focus);
  const adapters = arrayOrEmpty(state.memory?.adapters);
  const longTermItems = extractBullets(state.docs.longTerm).slice(0, 3);
  const midTermItems = extractBullets(state.docs.midTerm).slice(0, 3);
  const shortTermItems = extractBullets(state.docs.shortTerm).slice(0, 3);
  const localMemoryLayer = layers.find((layer) => normalize(layer.name).includes("model-local"));
  const protocolLayer = layers.find((layer) => normalize(layer.name).includes("tool adapters"));

  if (elements.personalizationMatrix) {
    elements.personalizationMatrix.innerHTML = buildPersonalizationCloudMarkup({
      authenticated: state.personalization.authenticated,
      currentFocus,
      profile
    });
  }

  if (elements.personalizationSnapshot) {
    elements.personalizationSnapshot.innerHTML = buildPersonalizationUsageMapMarkup({ profile, adapters, currentFocus });
  }

  if (elements.personalizationPlaybook) {
    elements.personalizationPlaybook.innerHTML = buildContinuityArchiveMarkup({
      authenticated: state.personalization.authenticated,
      profile,
      adapters,
      currentFocus,
      longTermItems,
      midTermItems,
      shortTermItems,
      localMemoryLayer,
      protocolLayer
    });
  }

  if (elements.personalizationNotesInput && document.activeElement !== elements.personalizationNotesInput) {
    elements.personalizationNotesInput.value = state.personalization.notes || "";
  }

  if (elements.personalizationNotesStatus) {
    const savedAt = state.personalization.savedAt ? `마지막 저장 ${formatDateTime(state.personalization.savedAt)}` : "아직 저장된 개인화 메모가 없습니다.";
    elements.personalizationNotesStatus.textContent = state.personalization.authenticated
      ? `${savedAt} 이 메모는 이 브라우저의 private personalization 영역에 유지됩니다.`
      : "로그인 후 저장하면 이 브라우저에 개인화 메모가 유지됩니다.";
  }

  if (elements.personalizationShell) {
    elements.personalizationShell.classList.toggle("is-locked", false);
  }

  if (elements.personalizationLock) {
    elements.personalizationLock.classList.toggle("hidden", state.personalization.authenticated);
  }

  if (elements.personalizationAuthStatus) {
    elements.personalizationAuthStatus.textContent = state.personalization.authenticated
      ? `${state.personalization.user || state.personalization.email || "session"} 세션으로 개인화 화면이 열렸습니다.`
      : state.personalization.status;
  }

  if (elements.personalizationLogoutButton) {
    elements.personalizationLogoutButton.classList.toggle("hidden", !state.personalization.authenticated);
  }

  if (elements.personalizationGoogleButton) {
    elements.personalizationGoogleButton.classList.toggle("hidden", state.personalization.authenticated);
  }

  renderPersonalizationMobileShell({
    profile,
    adapters,
    currentFocus,
    longTermItems,
    midTermItems,
    shortTermItems
  });
}

function renderPersonalizationMobileShell({ profile, adapters, currentFocus, longTermItems, midTermItems, shortTermItems }) {
  if (!elements.personalizationMobileShell) return;

  const healthScore = Math.min(98, 70 + currentFocus.length * 4 + adapters.length * 2);
  const tendencyCards = PERSONALIZATION_MEMORY_CLOUD.slice(0, 3)
    .map(
      (item, index) => `
        <article class="mobile-tendency-card tone-${escapeAttr(item.tone)} ${index === 2 ? "wide" : ""}">
          <span class="material-symbols-outlined">${escapeHtml(index === 0 ? "code" : index === 1 ? "architecture" : "summarize")}</span>
          <strong>${escapeHtml(item.label)}</strong>
          <p>${escapeHtml(item.usage)}</p>
        </article>
      `
    )
    .join("");

  const continuityCards = [
    { label: "Short-term", items: shortTermItems, icon: "timer", tone: "primary" },
    { label: "Mid-term", items: midTermItems, icon: "update", tone: "secondary" },
    { label: "Long-term", items: longTermItems, icon: "database", tone: "neutral" }
  ]
    .map(
      (entry) => `
        <article class="mobile-memory-tier ${escapeAttr(entry.tone)}">
          <div class="mobile-memory-tier-head">
            <span class="material-symbols-outlined">${escapeHtml(entry.icon)}</span>
            <div>
              <strong>${escapeHtml(entry.label)}</strong>
              <p>${escapeHtml(entry.items[0] || "아직 기록 없음")}</p>
            </div>
          </div>
        </article>
      `
    )
    .join("");

  elements.personalizationMobileShell.innerHTML = `
    <section class="mobile-app-card">
      <div class="mobile-profile-head">
        <div>
          <p class="tiny-label">Current Profile</p>
          <h3>${escapeHtml(state.memory?.owner || "Dowon")}</h3>
          <p>${escapeHtml(profile.one_line || PERSONALIZATION_REFERENCE_BRIEF.oneLine)}</p>
        </div>
        <span class="mobile-persona-pill ${state.personalization.authenticated ? "active" : "locked"}">
          ${escapeHtml(state.personalization.authenticated ? "Private Unlocked" : "Locked")}
        </span>
      </div>
      <div class="mobile-health-card">
        <div class="mobile-health-ring">
          <strong>${escapeHtml(`${healthScore}%`)}</strong>
        </div>
        <div class="mobile-health-copy">
          <strong>Global Memory Health</strong>
          <p>${escapeHtml(`현재 focus ${currentFocus.length}개 / adapter ${adapters.length}개 연동`)}</p>
        </div>
      </div>
    </section>

    <section class="mobile-app-card">
      <div class="mobile-block-head">
        <div>
          <p class="tiny-label">Learned Tendencies</p>
          <h3>반영 중인 개인화 경향</h3>
        </div>
      </div>
      <div class="mobile-tendency-grid">
        ${tendencyCards}
      </div>
    </section>

    <section class="mobile-app-card">
      <div class="mobile-block-head">
        <div>
          <p class="tiny-label">Continuity Archive</p>
          <h3>장기 / 중기 / 단기 기억 층</h3>
        </div>
      </div>
      <div class="mobile-memory-tier-list">
        ${continuityCards}
      </div>
    </section>
  `;
}

function buildSharedMemoryDiagramMarkup() {
  const adapterFiles = arrayOrEmpty(state.memory?.adapters).slice(0, 4).map((adapter) => adapter.file);
  return `
    <div class="memory-guide-flow">
      <section class="guide-flow-section">
        <div class="guide-flow-header">
          <span class="guide-step-index">1</span>
          <div>
            <strong>Shared Memory Hub는 공용 저장소가 아니라 공통 출발점입니다.</strong>
            <p>현재 모델, planner-agent-ko, architect-agent-ko, idea-agent-ko, 사람 협업자가 남긴 핵심만 한곳으로 모아 다음 작업자가 같은 기준으로 시작하도록 맞춥니다.</p>
          </div>
        </div>
        <div class="guide-core-layout">
          <article class="guide-party-card">
            <span class="material-symbols-outlined">group</span>
            <strong>입력 주체</strong>
            <p>현재 모델 / 협업자 / 기획·설계·아이디어 에이전트가 공용으로 남겨야 할 변화만 올립니다.</p>
          </article>
          <div class="guide-core-emblem">
            <div class="guide-core-ring"></div>
            <div class="guide-core-body">
              <span class="material-symbols-outlined">database</span>
              <strong>Shared Memory Hub</strong>
              <p>같은 프로젝트를 이어받는 사람과 모델이 함께 보는 공용 기준점</p>
              <div class="guide-core-chips">
                <span>Common Rules</span>
                <span>Shared Outputs</span>
                <span>Collaboration Packet</span>
              </div>
            </div>
          </div>
          <article class="guide-party-card">
            <span class="material-symbols-outlined">forward</span>
            <strong>출력 주체</strong>
            <p>다음 모델 / 리뷰어 / IDE 런타임 / 다음 협업자가 같은 문맥에서 바로 이어받습니다.</p>
          </article>
        </div>
        <div class="guide-source-strip">
          <span class="guide-source-chip">planner-agent-ko</span>
          <span class="guide-source-chip">architect-agent-ko</span>
          <span class="guide-source-chip">idea-agent-ko</span>
          <span class="guide-source-chip">README / next action / risk</span>
          <span class="guide-source-chip">${escapeHtml(`Adapter exports: ${adapterFiles.length ? "AGENTS / CLAUDE / GEMINI / IDE rules" : "pending exports"}`)}</span>
        </div>
      </section>

      <div class="guide-arrow-row"><span class="material-symbols-outlined">south</span></div>

      <section class="guide-flow-section">
        <div class="guide-flow-header">
          <span class="guide-step-index">2</span>
          <div>
            <strong>Shared와 Private는 섞이지 않고, 필요한 내용만 승격됩니다.</strong>
            <p>개인 취향과 모델 내부 메모리는 그대로 복사하지 않습니다. 팀과 다음 모델이 꼭 알아야 할 요약만 공용 레이어로 승격합니다.</p>
          </div>
        </div>
        <div class="guide-type-grid">
          <article class="guide-type-card shared">
            <div class="guide-type-head">
              <span class="material-symbols-outlined">folder_shared</span>
              <div>
                <strong>Shared Memory</strong>
                <p>모두가 함께 읽는 공용 층</p>
              </div>
            </div>
            <ul class="modal-bullets">
              <li>공통 규칙과 시작 순서</li>
              <li>현재 프로젝트 상태와 결정</li>
              <li>다음 사람과 모델이 읽을 handover packet</li>
            </ul>
          </article>
          <article class="guide-type-card private">
            <div class="guide-type-head">
              <span class="material-symbols-outlined">lock</span>
              <div>
                <strong>Private / Model-local</strong>
                <p>개인화와 모델 내부 기억 층</p>
              </div>
            </div>
            <ul class="modal-bullets">
              <li>말투, 작업 감각, 개인 continuity notes</li>
              <li>각 모델 내부 long-term / mid-term / short-term</li>
              <li>필요한 요약만 shared로 승격</li>
            </ul>
          </article>
        </div>
      </section>

      <div class="guide-arrow-row"><span class="material-symbols-outlined">south</span></div>

      <section class="guide-flow-section">
        <div class="guide-flow-header">
          <span class="guide-step-index">3</span>
          <div>
            <strong>Shared Memory는 항상 세 줄기로 읽습니다.</strong>
            <p>공통 규칙은 출발 순서를 맞추고, 공유 결과물은 현재 상태를 남기고, 협업 전달은 다음 사람과 다음 모델이 바로 이어받게 만듭니다.</p>
          </div>
        </div>
        <div class="guide-lane-grid">
          <article class="guide-lane-card rules">
            <div class="guide-lane-head">
              <span class="material-symbols-outlined">gavel</span>
              <strong>공통 규칙</strong>
            </div>
            <p>누가 먼저 무엇을 읽고, 어떤 기록은 무시해야 하는지 정하는 공용 rulebook입니다.</p>
          </article>
          <article class="guide-lane-card outputs">
            <div class="guide-lane-head">
              <span class="material-symbols-outlined">inventory_2</span>
              <strong>공유 결과물</strong>
            </div>
            <p>decision, blocker, next action, 현재 단계처럼 다음 작업자가 알아야 하는 현재 상태를 남깁니다.</p>
          </article>
          <article class="guide-lane-card handoff">
            <div class="guide-lane-head">
              <span class="material-symbols-outlined">handshake</span>
              <strong>협업 전달</strong>
            </div>
            <p>README, brief, risk, adapter export를 묶어 다음 사람과 다음 모델이 그대로 이어받게 만듭니다.</p>
          </article>
        </div>
      </section>
    </div>
  `;
}

function buildMermaidLegendMarkup() {
  return `
    <div class="mermaid-legend-row">
      <span class="mermaid-legend-chip rules">파란 선: 모두가 먼저 읽는 공용 경로</span>
      <span class="mermaid-legend-chip outputs">청록 선: 프로젝트 상태와 adapter export</span>
      <span class="mermaid-legend-chip private">주황 점선: private/local에서 승격될 때만 연결</span>
      <span class="mermaid-legend-chip handoff">민트 선: handover packet이 다음 사람과 모델로 전달</span>
    </div>
  `;
}

function buildSharedMemoryPolicyMarkup() {
  return `
    <div class="memory-meaning-grid">
      <article class="memory-meaning-card rules">
        <div class="memory-meaning-head">
          <span class="material-symbols-outlined">gavel</span>
          <div>
            <p class="tiny-label">Common Rules</p>
            <strong>모두가 같은 출발점을 읽습니다.</strong>
          </div>
        </div>
        <p>작업을 시작할 때 무엇을 먼저 읽고, 어떤 기록은 공유 대상에서 제외하는지 정합니다.</p>
        <div class="memory-chip-row">
          <span>read first</span>
          <span>ignore stale temp notes</span>
          <span>update before handover</span>
        </div>
      </article>
      <article class="memory-meaning-card outputs">
        <div class="memory-meaning-head">
          <span class="material-symbols-outlined">inventory_2</span>
          <div>
            <p class="tiny-label">Shared Outputs</p>
            <strong>프로젝트의 현재 상태를 남깁니다.</strong>
          </div>
        </div>
        <p>decision, blocker, next action, 현재 단계, planner/architect/idea 요약처럼 다음 작업자도 알아야 하는 현재 상태를 남깁니다.</p>
        <div class="memory-chip-row">
          <span>current stage</span>
          <span>decision</span>
          <span>blocker</span>
          <span>next action</span>
        </div>
      </article>
      <article class="memory-meaning-card handoff">
        <div class="memory-meaning-head">
          <span class="material-symbols-outlined">handshake</span>
          <div>
            <p class="tiny-label">Collaboration Packet</p>
            <strong>다음 사람과 다음 모델이 바로 이어받습니다.</strong>
          </div>
        </div>
        <p>README, brief, risk, adapter export를 묶어 사람 협업자와 다음 모델이 같은 문맥에서 바로 시작하게 만듭니다.</p>
        <div class="memory-chip-row">
          <span>README</span>
          <span>risk</span>
          <span>brief</span>
          <span>adapter export</span>
        </div>
      </article>
    </div>
  `;
}

function buildCollaborationHandoverMarkup() {
  return `
    <div class="handover-journey">
      <article class="handover-journey-step">
        <div class="handover-journey-icon"><span class="material-symbols-outlined">edit_note</span></div>
        <div>
          <p class="tiny-label">01 Record</p>
          <strong>현재 작업자가 핵심 변화만 정리합니다.</strong>
          <p>로그 전체가 아니라 결정, blocker, next action, 꼭 남길 risk를 추려서 기록합니다.</p>
        </div>
      </article>
      <div class="handover-journey-arrow"><span class="material-symbols-outlined">east</span></div>
      <article class="handover-journey-step">
        <div class="handover-journey-icon"><span class="material-symbols-outlined">database</span></div>
        <div>
          <p class="tiny-label">02 Promote</p>
          <strong>공용 허브로 승격합니다.</strong>
          <p>다음 작업자가 알아야 하는 내용만 shared hub에 올리고, 개인 성향과 임시 사고 과정은 private/local에 둡니다.</p>
        </div>
      </article>
      <div class="handover-journey-arrow"><span class="material-symbols-outlined">east</span></div>
      <article class="handover-journey-step">
        <div class="handover-journey-icon"><span class="material-symbols-outlined">conversion_path</span></div>
        <div>
          <p class="tiny-label">03 Package</p>
          <strong>읽는 대상에 맞게 재패키징합니다.</strong>
          <p>모델에는 adapter export, 사람에게는 brief와 README, 둘 다에게는 handover packet을 준비합니다.</p>
        </div>
      </article>
      <div class="handover-journey-arrow"><span class="material-symbols-outlined">east</span></div>
      <article class="handover-journey-step">
        <div class="handover-journey-icon"><span class="material-symbols-outlined">group</span></div>
        <div>
          <p class="tiny-label">04 Continue</p>
          <strong>다음 사람과 다음 모델이 바로 이어받습니다.</strong>
          <p>의료 기록이 다음 병원으로 넘어가듯, 같은 프로젝트 문맥이 다음 작업 주체로 끊기지 않고 전달됩니다.</p>
        </div>
      </article>
    </div>
  `;
}

function getSharedNodeObserverContents(nodeId) {
  const copyByNode = {
    "shared-governance": "읽기 순서, 무시 규칙, 공유 경계, handover 전 체크 기준",
    "shared-project-records": "현재 단계, decision, blocker, next action, 공용으로 봐야 하는 상태",
    "collaboration-packet": "README, brief, risk, adapter export, 다음 작업 순서"
  };
  return copyByNode[nodeId] || "공용으로 남겨야 하는 핵심 요약";
}

function buildPersonalMemoryCloudSections(currentFocus, profile) {
  const actualSections = [
    {
      title: "업무 스코프",
      summary: "실제 반복 업무와 제품 문맥에서 장기 기억으로 유지되는 기준입니다.",
      items: PERSONALIZATION_REFERENCE_BRIEF.workScope
    },
    {
      title: "문제 해결 루틴",
      summary: "답변과 작업 분해 순서를 바꾸는 핵심 판단 패턴입니다.",
      items: PERSONALIZATION_REFERENCE_BRIEF.workingStyle
    },
    {
      title: "커뮤니케이션 톤",
      summary: "답변 길이, 결론 위치, 말투에 직접 반영되는 규칙입니다.",
      items: PERSONALIZATION_REFERENCE_BRIEF.communication
    },
    {
      title: "환경 / 기술 선호",
      summary: `${profile.one_line || PERSONALIZATION_REFERENCE_BRIEF.oneLine} 기준으로 자주 반복되는 환경과 리스크 관점입니다.`,
      items: PERSONALIZATION_REFERENCE_BRIEF.environment
    }
  ];

  const promotedRows = [
    {
      layer: "장기",
      value: "재현 가능한 근거 / 조건+가설+검증 / Windows+WSL / 보안 리스크",
      usage: "답변 톤, 작업 기준, 기본 guardrail"
    },
    {
      layer: "중기",
      value: currentFocus.slice(0, 3).join(" / ") || "LLM·STT 제품 문맥 / handover 기준 / 현재 집중 이슈",
      usage: "현재 프로젝트 continuity와 handover"
    },
    {
      layer: "단기",
      value: "방금 수정한 화면 / 직전 피드백 / immediate next action",
      usage: "현재 세션 작업과 즉시 다음 응답"
    }
  ];

  return { sections: actualSections, rows: promotedRows };
}

function buildPersonalizationSectionCardsMarkup(sections) {
  return sections
    .map(
      (section) => `
        <article class="memory-cloud-card">
          <div class="memory-cloud-card-head">
            <strong>${escapeHtml(section.title)}</strong>
            <p>${escapeHtml(section.summary)}</p>
          </div>
          <ul class="modal-bullets">
            ${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </article>
      `
    )
    .join("");
}

function buildMemoryCloudRowsMarkup(rows) {
  return rows
    .map(
      (row) => `
        <tr>
          <td><strong>${escapeHtml(row.layer)}</strong></td>
          <td>${escapeHtml(row.value)}</td>
          <td>${escapeHtml(row.usage)}</td>
        </tr>
      `
    )
    .join("");
}

function buildPartialLockOverlayMarkup({ title, copy, compact = false }) {
  return `
    <div class="personalization-private-overlay ${compact ? "compact" : ""}">
      <div class="personalization-private-overlay-card">
        <p class="tiny-label">${escapeHtml(title)}</p>
        <strong>${escapeHtml(copy)}</strong>
        <p>${escapeHtml("개발자 로그인 후 실제 개인 기록이 열립니다. 로그인 전에는 템플릿 구조만 미리 보여줍니다.")}</p>
      </div>
    </div>
  `;
}

function buildPersonalizationCloudMarkup({ authenticated, currentFocus, profile }) {
  const actual = buildPersonalMemoryCloudSections(currentFocus, profile);
  const preview = authenticated
    ? actual
    : {
        sections: PERSONALIZATION_TEMPLATE_PREVIEW.sections,
        rows: PERSONALIZATION_TEMPLATE_PREVIEW.rows.map((row) => ({
          layer: row[0],
          value: row[1],
          usage: row[2]
        }))
      };

  return `
    <div class="memory-cloud-panel">
      <p class="cloud-guide">${escapeHtml(authenticated ? `${PERSONALIZATION_REFERENCE_BRIEF.sourcePath} 기준으로 실제 개인 기억을 요약해 둔 private summary입니다. shared로 바로 공개되지 않고, 필요한 항목만 continuity와 handover로 승격합니다.` : "로그인 전에는 실제 개인 기록 대신 어떤 형태의 메모리가 private 영역에 쌓이는지 템플릿만 미리 보여줍니다.")}</p>
      <div class="personalization-private-shell ${authenticated ? "is-unlocked" : "is-locked"}">
        <div class="memory-cloud-summary">
          <article class="memory-cloud-summary-hero">
            <p class="tiny-label">${escapeHtml(authenticated ? "Imported Personal Brief" : "Private Template Preview")}</p>
            <strong>${escapeHtml(authenticated ? PERSONALIZATION_REFERENCE_BRIEF.oneLine : "로그인 후 실제 업무 스코프 / 작업 스타일 / 환경 선호가 여기에 요약됩니다.")}</strong>
            <p>${escapeHtml(authenticated ? "실제 brief를 기준으로 장기적으로 유지되는 성향과 최근 프로젝트 문맥을 함께 읽을 수 있게 재구성했습니다." : "실제 기록은 숨기고, 중앙 메모리에서 어떤 종류의 개인 기록을 관리하는지만 약하게 보여줍니다.")}</p>
          </article>
          <article class="memory-cloud-summary-strip">
            <div class="memory-chip-row">
              ${(authenticated
                ? PERSONALIZATION_MEMORY_CLOUD.slice(0, 6).map((item) => `<span>${escapeHtml(item.label)}</span>`).join("")
                : ["업무 스코프", "문제 해결 루틴", "톤/말투", "환경 선호", "리스크 감수성", "현재 집중 문맥"]
                    .map((item) => `<span>${escapeHtml(item)}</span>`)
                    .join(""))}
            </div>
          </article>
        </div>
        <div class="memory-cloud-dossier-grid">
          ${buildPersonalizationSectionCardsMarkup(preview.sections)}
        </div>
        <div class="table-wrap memory-cloud-table-wrap">
          <table class="data-table memory-cloud-table">
            <thead>
              <tr>
                <th>기억 층</th>
                <th>무엇이 들어가는지</th>
                <th>어디에 쓰이는지</th>
              </tr>
            </thead>
            <tbody>
              ${buildMemoryCloudRowsMarkup(preview.rows)}
            </tbody>
          </table>
        </div>
        ${authenticated ? "" : buildPartialLockOverlayMarkup({ title: "Locked Memory Cloud", copy: "로그인하면 실제 개인 기억 요약이 이 영역을 덮습니다." })}
      </div>
    </div>
  `;
}

function buildPersonalizationUsageMapMarkup({ profile, adapters, currentFocus }) {
  const usageSteps = [
    {
      icon: "inventory_2",
      step: "01 Source",
      title: "개인 브리프와 최근 기록",
      copy: `${profile.one_line || "개인 브리프"} / ${currentFocus[0] || "현재 집중 주제"}`
    },
    {
      icon: "layers",
      step: "02 Sort",
      title: "장기 / 중기 / 단기 분류",
      copy: "오래 남길 기준과 현재 프로젝트 문맥, 세션 상태를 분리합니다."
    },
    {
      icon: "tune",
      step: "03 Apply",
      title: "답변과 계획에 반영",
      copy: "톤, 작업 분해, handover 문서, adapter export에 다른 형태로 씁니다."
    },
    {
      icon: "publish",
      step: "04 Promote",
      title: "공용으로 올릴 것만 승격",
      copy: "팀과 다음 모델이 꼭 알아야 하는 것만 shared memory로 올립니다."
    }
  ];
  const usageTargets = [
    { icon: "forum", label: "답변 톤", copy: "직설형, 핵심 우선, 확인되지 않은 정보는 단정하지 않는 구조" },
    { icon: "account_tree", label: "작업 분해", copy: "조건 / 관측 / 가설 / 검증 순서로 태스크를 나누는 방식" },
    { icon: "description", label: "handover 문서", copy: "brief / next action / risk를 읽는 사람 중심으로 다시 정리" },
    { icon: "route", label: "adapter export", copy: "AGENTS / CLAUDE / GEMINI / IDE rules로 재작성하는 기준" }
  ];
  const adapterSummary = adapters.length
    ? trimText(adapters.slice(0, 4).map((adapter) => `${adapter.label} / ${adapter.file}`).join(" / "), 140)
    : "아직 연결된 adapter export가 없습니다.";

  return `
    <div class="usage-flow-shell">
      <div class="usage-flow-rail">
        ${usageSteps
          .map(
            (step) => `
              <article class="usage-flow-node">
                <div class="usage-flow-icon"><span class="material-symbols-outlined">${escapeHtml(step.icon)}</span></div>
                <div>
                  <p class="tiny-label">${escapeHtml(step.step)}</p>
                  <strong>${escapeHtml(step.title)}</strong>
                  <p>${escapeHtml(step.copy)}</p>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
      <div class="usage-application-grid">
        ${usageTargets
          .map(
            (target) => `
              <div class="usage-application-card">
                <span class="material-symbols-outlined">${escapeHtml(target.icon)}</span>
                <div>
                  <strong>${escapeHtml(target.label)}</strong>
                  <p>${escapeHtml(target.copy)}</p>
                </div>
              </div>
            `
          )
          .join("")}
        <div class="usage-application-card compact">
          <span class="material-symbols-outlined">description</span>
          <div>
            <strong>Adapter files</strong>
            <p>${escapeHtml(adapterSummary)}</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildContinuityArchiveMarkup({ authenticated, currentFocus, longTermItems, midTermItems, shortTermItems, localMemoryLayer, protocolLayer }) {
  const personalExamples = {
    longTerm: longTermItems.slice(0, 3).filter(Boolean).length
      ? longTermItems.slice(0, 3)
      : PERSONALIZATION_REFERENCE_BRIEF.longTermExamples,
    midTerm: midTermItems.slice(0, 3).filter(Boolean).length
      ? midTermItems.slice(0, 3)
      : (currentFocus.slice(0, 3).length ? currentFocus.slice(0, 3) : PERSONALIZATION_REFERENCE_BRIEF.midTermExamples),
    shortTerm: shortTermItems.slice(0, 3).filter(Boolean).length
      ? shortTermItems.slice(0, 3)
      : PERSONALIZATION_REFERENCE_BRIEF.shortTermExamples
  };

  const templateExamples = {
    longTerm: ["개인 작업 기준", "답변 톤 / 보고 스타일", "환경 선호 / 리스크 기준"],
    midTerm: ["현재 프로젝트 문맥", "이번 주 반복 이슈", "handover에 남길 문장"],
    shortTerm: ["직전 피드백", "지금 수정 중인 태스크", "바로 이어질 next action"]
  };

  const tierCards = [
    {
      label: "Long-term",
      icon: "auto_awesome",
      tone: "primary",
      persistence: "indefinite",
      rule: "여러 프로젝트와 여러 세션에서 반복되면 장기 기억으로 승격합니다.",
      current: longTermItems.slice(0, 3).filter(Boolean),
      candidates: [
        "직설형, 핵심 우선, 과장 없는 답변 톤",
        "보안 우선 / 접근성 기본 / 검증 먼저 같은 작업 기준",
        "WSL + terminal 중심 같은 환경 선호"
      ],
      personal: authenticated ? personalExamples.longTerm : templateExamples.longTerm
    },
    {
      label: "Mid-term",
      icon: "layers",
      tone: "secondary",
      persistence: "7-30 days",
      rule: "현재 프로젝트에서 며칠에서 몇 주 유지되는 암묵지는 중기 기억으로 묶습니다.",
      current: (midTermItems.length ? midTermItems : currentFocus).slice(0, 3).filter(Boolean),
      candidates: [
        "지금 맡고 있는 프로젝트의 아키텍처 검토 포인트",
        "이번 주 집중 주제와 반복되는 협업 문맥",
        "한동안 계속 참고해야 하는 handover 기준"
      ],
      personal: authenticated ? personalExamples.midTerm : templateExamples.midTerm
    },
    {
      label: "Short-term",
      icon: "bolt",
      tone: "tertiary",
      persistence: "session",
      rule: "방금 받은 피드백, 현재 파일 상태, 직전 next action은 단기 기억에 머뭅니다.",
      current: shortTermItems.slice(0, 3).filter(Boolean),
      candidates: [
        "방금 수정 중인 파일과 immediate blocker",
        "이번 세션에서만 필요한 임시 판단",
        "사용자 직전 피드백과 바로 이어질 next action"
      ],
      personal: authenticated ? personalExamples.shortTerm : templateExamples.shortTerm
    }
  ];

  return `
    <div class="continuity-archive">
      <div class="continuity-overview">
        <article class="continuity-overview-block">
          <p class="tiny-label">Imported Dossier</p>
          <strong>${escapeHtml(PERSONALIZATION_REFERENCE_BRIEF.oneLine)}</strong>
          <p>${escapeHtml(PERSONALIZATION_REFERENCE_BRIEF.sourcePath)} 에서 가져온 기준을 개인 기억의 시작점으로 삼고, 이후 작업 중 쌓이는 continuity notes를 여기에 계속 덧붙입니다.</p>
        </article>
        <article class="continuity-overview-block">
          <p class="tiny-label">Where Memory Lives</p>
          <ul class="modal-bullets">
            <li>Private Vault: 로그인 후 저장하는 개인 continuity notes</li>
            <li>Model-local Memory: ${escapeHtml(localMemoryLayer?.summary || "각 모델 내부 long-term / mid-term / short-term 층")}</li>
            <li>Adapter Export: ${escapeHtml(protocolLayer?.summary || "목적지별 규칙 파일로 다시 쓰는 export 층")}</li>
            <li>Shared Promotion: 팀과 다음 모델이 꼭 알아야 하는 요약만 shared memory로 승격</li>
          </ul>
        </article>
      </div>

      <div class="continuity-tier-grid">
        ${tierCards
          .map(
            (card) => `
              <article class="continuity-tier-card tone-${escapeAttr(card.tone)}">
                <div class="continuity-tier-head">
                  <div class="continuity-tier-icon"><span class="material-symbols-outlined">${escapeHtml(card.icon)}</span></div>
                  <div>
                    <p class="tiny-label">${escapeHtml(card.persistence)}</p>
                    <strong>${escapeHtml(card.label)}</strong>
                    <p>${escapeHtml(card.rule)}</p>
                  </div>
                </div>
                <div class="continuity-tier-block">
                  <span class="continuity-tier-label">현재 얹어둔 기억</span>
                  <ul class="modal-bullets">
                    ${(card.current.length ? card.current : ["아직 명시된 항목이 없으면 예비 후보에서 시작합니다."])
                      .map((item) => `<li>${escapeHtml(item)}</li>`)
                      .join("")}
                  </ul>
                </div>
                <div class="continuity-tier-block">
                  <span class="continuity-tier-label">예비 후보</span>
                  <ul class="modal-bullets">
                    ${card.candidates.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
                  </ul>
                </div>
                <div class="continuity-tier-block continuity-tier-private ${authenticated ? "is-unlocked" : "is-locked"}">
                  <span class="continuity-tier-label">개인화 영역</span>
                  <ul class="modal-bullets">
                    ${card.personal.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
                  </ul>
                  ${authenticated ? "" : buildPartialLockOverlayMarkup({ title: `${card.label} Private`, copy: "로그인하면 이 층에 실제 개인 기억 예시가 열립니다.", compact: true })}
                </div>
              </article>
            `
          )
          .join("")}
      </div>

      <div class="table-wrap lifecycle-table-wrap">
        <table class="data-table lifecycle-table">
          <thead>
            <tr>
              <th>기억 층</th>
              <th>어디에 저장되는지</th>
              <th>무엇을 담는지</th>
              <th>어디에 쓰이는지</th>
              <th>shared로 올리는 순간</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div class="table-main">
                  <strong>Long-term</strong>
                  <span>오래 유지되는 성향과 작업 기준</span>
                </div>
              </td>
              <td>${escapeHtml("imported brief + canonical profile")}</td>
              <td>${escapeHtml(longTermItems.slice(0, 2).join(" / ") || "말투, 작업 기준, 환경 선호")}</td>
              <td>${escapeHtml("답변 톤 / 작업 분해 방식 / 기본 guardrail")}</td>
              <td>${escapeHtml("팀 규칙이나 공통 handover에도 꼭 필요할 때만 발췌")}</td>
            </tr>
            <tr>
              <td>
                <div class="table-main">
                  <strong>Mid-term</strong>
                  <span>현재 프로젝트 문맥과 집중 주제</span>
                </div>
              </td>
              <td>${escapeHtml("private notes + current focus + runtime registry")}</td>
              <td>${escapeHtml(midTermItems.slice(0, 2).join(" / ") || currentFocus.slice(0, 2).join(" / ") || "현재 프로젝트 맥락")}</td>
              <td>${escapeHtml("다음 세션 시작점 / continuity packet / project handover")}</td>
              <td>${escapeHtml("다른 모델이나 협업자가 같은 프로젝트를 이어받을 때")}</td>
            </tr>
            <tr>
              <td>
                <div class="table-main">
                  <strong>Short-term</strong>
                  <span>방금 작업한 임시 상태와 active task</span>
                </div>
              </td>
              <td>${escapeHtml("current runtime + latest continuity note")}</td>
              <td>${escapeHtml(shortTermItems.slice(0, 2).join(" / ") || "last action / temp blocker / next action")}</td>
              <td>${escapeHtml("즉시 다음 응답 / 현재 파일 수정 / 방금 이어받기")}</td>
              <td>${escapeHtml("blocker, next action, 결과 요약이 생겼을 때만 승격")}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="continuity-rule-strip">
        <div class="continuity-rule-item">
          <span class="material-symbols-outlined">lock</span>
          <div>
            <strong>기본값은 private 유지</strong>
            <p>말투와 개인 감각 전체를 shared로 복사하지 않습니다.</p>
          </div>
        </div>
        <div class="continuity-rule-item">
          <span class="material-symbols-outlined">upgrade</span>
          <div>
            <strong>공용 필요가 생기면 승격</strong>
            <p>다음 모델과 협업자가 꼭 알아야 하는 부분만 요약해 올립니다.</p>
          </div>
        </div>
        <div class="continuity-rule-item">
          <span class="material-symbols-outlined">sync_alt</span>
          <div>
            <strong>기록만으로 연속 작업</strong>
            <p>핵심은 기록만 있어도 다음 도구와 모델이 다시 같은 문맥으로 진입하는 것입니다.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildPersonalizationCard(title, summary, badge, items, tone) {
  return `
    <article class="personalization-card tone-${escapeAttr(tone)}">
      <div class="personalization-card-head">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <p>${escapeHtml(summary)}</p>
        </div>
        <span class="personalization-badge">${escapeHtml(badge)}</span>
      </div>
      <ul class="modal-bullets">
        ${arrayOrEmpty(items).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </article>
  `;
}

function getModelMainstreamScore(model) {
  const rank = {
    "openai-gpt52-family": 100,
    "anthropic-claude-family": 96,
    "google-gemini-family": 90,
    "deepseek-v32-family": 84,
    "openai-o-series": 82,
    "xai-grok-family": 74,
    "qwen3-family": 72,
    "meta-llama4-family": 69,
    "mistral-frontier-family": 66,
    "cohere-command-family": 60,
    "provider:OpenAI": 88,
    "provider:Anthropic": 84,
    "provider:Google": 80,
    "provider:DeepSeek": 72,
    "provider:xAI": 68,
    "provider:Meta": 66,
    "provider:Qwen": 65,
    "provider:Mistral": 64,
    "provider:Cohere": 58
  };

  return rank[model.id] ?? rank[`provider:${model.provider}`] ?? 0;
}

function getToolMainstreamScore(tool) {
  const rank = {
    cursor: 100,
    "claude-code": 97,
    windsurf: 94,
    cline: 91,
    aider: 88,
    continue: 84,
    "codex-cli": 82,
    "gemini-cli": 78,
    openhands: 74,
    ollama: 72,
    openrouter: 70,
    "lm-studio": 66,
    openclaw: 58
  };

  return rank[tool.id] ?? 0;
}

function compareRegistryItemsByMainstream(a, b, getScore) {
  const scoreDiff = getScore(b) - getScore(a);
  if (scoreDiff !== 0) return scoreDiff;

  return String(a.name || "").localeCompare(String(b.name || ""), "ko");
}

function getSortedRegistryModels() {
  return arrayOrEmpty(state.registry.models)
    .filter((model) => {
      if (state.modelFilter === "all") return true;
      return arrayOrEmpty(model.tags).includes(state.modelFilter);
    })
    .slice()
    .sort((a, b) => compareRegistryItemsByMainstream(a, b, getModelMainstreamScore));
}

function getSortedRegistryTools() {
  return arrayOrEmpty(state.registry.tools)
    .slice()
    .sort((a, b) => compareRegistryItemsByMainstream(a, b, getToolMainstreamScore));
}

function renderModelsTable() {
  const models = getSortedRegistryModels();

  elements.modelTable.innerHTML = `
    <colgroup>
      <col style="width: 24%" />
      <col style="width: 16%" />
      <col style="width: 18%" />
      <col style="width: 18%" />
      <col style="width: 15%" />
      <col style="width: 9%" />
    </colgroup>
    <thead>
      <tr>
        <th>모델</th>
        <th>핵심 버전</th>
        <th>컨텍스트 / 출력</th>
        <th>접근 / 비용</th>
        <th>추천 상황</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      ${models
        .map((model) => {
          const version = getPrimaryVersion(model);
          const meta = getModelConnectionMeta(model);
          const officialUrl = getOfficialUrlForModel(model);
          const loginLabel = meta.requiresLogin ? "로그인 필요" : "로그인 불필요";
          const contextOutput = version
            ? `${version.context_window || "tiered"} / ${version.max_output || "tiered"}`
            : "tiered / tiered";
          const accessPricing = version
            ? `${loginLabel} / ${version.pricing || model.category}`
            : `${loginLabel} / ${model.category}`;
          const bestFor = arrayOrEmpty(model.recommended_for).slice(0, 2).join(" / ") || model.memory_fit;
          const versionMeta = [
            arrayOrEmpty(model.tags).slice(0, 2).join(" / "),
            getKnowledgeCutoffShort(version)
          ]
            .filter(Boolean)
            .join(" / ");
          return `
            <tr>
              <td>
                <div class="table-main">
                  <strong>${escapeHtml(model.name)}</strong>
                  <span>${escapeHtml(model.summary)}</span>
                </div>
              </td>
              <td>
                <div class="table-main">
                  <strong>${escapeHtml(version?.name || model.category)}</strong>
                  <span>${escapeHtml(versionMeta || model.category)}</span>
                </div>
              </td>
              <td>
                <div class="table-main">
                  <strong>${escapeHtml(contextOutput)}</strong>
                  <span>${escapeHtml(version?.rate_limit || "tiered rate limit")}</span>
                </div>
              </td>
              <td>
                <div class="table-main">
                  <strong>${escapeHtml(accessPricing)}</strong>
                  <span>${escapeHtml(model.memory_fit)}</span>
                </div>
              </td>
              <td><span class="table-subtext">${escapeHtml(bestFor)}</span></td>
              <td>${buildRegistryActionMarkup("model", model.id, officialUrl)}</td>
            </tr>
          `;
        })
        .join("")}
    </tbody>
  `;

  renderRegistryMobileShell();
}

function renderToolsTable() {
  const tools = getSortedRegistryTools();

  elements.toolTable.innerHTML = `
    <colgroup>
      <col style="width: 23%" />
      <col style="width: 20%" />
      <col style="width: 19%" />
      <col style="width: 19%" />
      <col style="width: 10%" />
      <col style="width: 9%" />
    </colgroup>
    <thead>
      <tr>
        <th>툴</th>
        <th>유형 / 설치</th>
        <th>접근 / 쿼터</th>
        <th>메모리 브리지</th>
        <th>추천 용도</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      ${tools
        .map((tool) => {
          const guide = getInstallGuide(tool.id);
          const meta = getToolConnectionMeta(tool);
          const officialUrl = getOfficialUrlForTool(tool);
          const loginLabel = meta.requiresLogin ? "로그인 필요" : "로그인 불필요";
          const installMeta = `${guide.mode} / ${installStepsPreview(guide.steps)}`;
          const accessQuota = `${loginLabel} / ${tool.quota_notes}`;
          const recommendedFor = arrayOrEmpty(tool.recommended_for).slice(0, 2).join(" / ") || tool.class;
          return `
            <tr>
              <td>
                <div class="table-main">
                  <strong>${escapeHtml(tool.name)}</strong>
                  <span>${escapeHtml(tool.summary)}</span>
                </div>
              </td>
              <td>
                <div class="table-main">
                  <strong>${escapeHtml(tool.class)}</strong>
                  <span>${escapeHtml(installMeta)}</span>
                </div>
              </td>
              <td>
                <div class="table-main">
                  <strong>${escapeHtml(accessQuota)}</strong>
                  <span>${escapeHtml(meta.requiresLogin ? "provider auth" : "ready to use")}</span>
                </div>
              </td>
              <td><span class="table-subtext">${escapeHtml(tool.memory_bridge)}</span></td>
              <td><span class="table-subtext">${escapeHtml(recommendedFor)}</span></td>
              <td>${buildRegistryActionMarkup("tool", tool.id, officialUrl)}</td>
            </tr>
          `;
        })
        .join("")}
    </tbody>
  `;

  renderRegistryMobileShell();
}

function renderRegistryMobileShell() {
  if (!elements.registryMobileShell) return;

  const models = getSortedRegistryModels();
  const tools = getSortedRegistryTools();

  const modelFilterChips = [
    { id: "all", label: "전체" },
    { id: "frontier", label: "Frontier" },
    { id: "open", label: "Open" },
    { id: "coding", label: "Coding" },
    { id: "enterprise", label: "Enterprise" }
  ]
    .map(
      (filter) => `
        <button class="filter-chip ${state.modelFilter === filter.id ? "active" : ""}" data-filter-type="${escapeAttr(filter.id)}" type="button">
          ${escapeHtml(filter.label)}
        </button>
      `
    )
    .join("");

  const modelCards = models
    .map((model) => {
      const version = getPrimaryVersion(model);
      const officialUrl = getOfficialUrlForModel(model);
      const cutoff = getKnowledgeCutoffShort(version);
      return `
        <article class="registry-mobile-card model">
          <div class="registry-mobile-card-head">
            <div>
              <strong>${escapeHtml(model.name)}</strong>
              <p>${escapeHtml(version?.name || model.category)}</p>
            </div>
            <span class="mobile-status-badge">${escapeHtml(arrayOrEmpty(model.tags)[0] || model.category)}</span>
          </div>
          <div class="mobile-mini-chip-row">
            <span class="mobile-mini-chip">${escapeHtml(version?.context_window || "tiered")}</span>
            <span class="mobile-mini-chip">${escapeHtml(version?.max_output || "tiered")}</span>
            <span class="mobile-mini-chip">${escapeHtml(cutoff)}</span>
          </div>
          <p class="registry-mobile-copy">${escapeHtml(model.summary)}</p>
          <div class="registry-mobile-actions">
            <button class="table-action" type="button" data-modal-type="model" data-modal-id="${escapeAttr(model.id)}">상세</button>
            ${
              officialUrl
                ? `<a class="table-link-icon" href="${escapeAttr(officialUrl)}" target="_blank" rel="noreferrer noopener" aria-label="공식 링크 열기">
                    <span class="material-symbols-outlined">open_in_new</span>
                  </a>`
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");

  const toolCards = tools
    .map((tool) => {
      const guide = getInstallGuide(tool.id);
      const meta = getToolConnectionMeta(tool);
      const officialUrl = getOfficialUrlForTool(tool);
      return `
        <article class="registry-mobile-card tool">
          <div class="registry-mobile-card-head">
            <div>
              <strong>${escapeHtml(tool.name)}</strong>
              <p>${escapeHtml(tool.class)}</p>
            </div>
            <span class="mobile-status-badge ${meta.requiresLogin ? "locked" : "ready"}">${escapeHtml(meta.requiresLogin ? "Login" : "Local")}</span>
          </div>
          <p class="registry-mobile-copy">${escapeHtml(tool.summary)}</p>
          <div class="registry-mobile-meta">
            <span>${escapeHtml(guide.mode)}</span>
            <span>${escapeHtml(tool.memory_bridge)}</span>
          </div>
          <div class="registry-mobile-actions">
            <button class="table-action" type="button" data-modal-type="tool" data-modal-id="${escapeAttr(tool.id)}">상세</button>
            ${
              officialUrl
                ? `<a class="table-link-icon" href="${escapeAttr(officialUrl)}" target="_blank" rel="noreferrer noopener" aria-label="공식 링크 열기">
                    <span class="material-symbols-outlined">open_in_new</span>
                  </a>`
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");

  elements.registryMobileShell.innerHTML = `
    <section class="mobile-app-card">
      <div class="mobile-block-head">
        <div>
          <p class="tiny-label">Models</p>
          <h3>모델 카드 뷰</h3>
        </div>
      </div>
      <div class="mobile-filter-strip">
        ${modelFilterChips}
      </div>
      <div class="registry-mobile-scroll">
        ${modelCards}
      </div>
    </section>

    <section class="mobile-app-card">
      <div class="mobile-block-head">
        <div>
          <p class="tiny-label">Tools</p>
          <h3>툴 카드 뷰</h3>
        </div>
      </div>
      <div class="registry-mobile-list">
        ${toolCards}
      </div>
    </section>
  `;
}

function renderSkillsSection() {
  const skills = arrayOrEmpty(state.skillRegistry.skills);
  const models = arrayOrEmpty(state.skillRegistry.models);
  const managerSkills = skills.filter((skill) => skill.role === "manager" || skill.role === "advisor");
  const installedSkills = skills.filter((skill) => skill.status === "installed");
  const activeModels = models.filter((model) => model.status === "active");
  const plannedModels = models.filter((model) => model.status !== "active");
  const selectedSkill = skills.find((skill) => skill.name === state.activeSkillName) || null;
  if (state.activeSkillName && !selectedSkill) {
    state.activeSkillName = null;
  }

  const modelIconMap = {
    codex: "terminal",
    "claude-code": "psychology",
    "gemini-cli": "auto_awesome"
  };

  const plannedSkillMap = {
    codex: [],
    "claude-code": [
      {
        name: "claude-bridge-planned",
        scope: "bridge",
        description: "CLAUDE.md 중심 handover adapter와 prompt export를 붙일 예정입니다.",
        memory_pattern: "CLAUDE.md / shared memory adapter",
        trigger: "bridge planned"
      }
    ],
    "gemini-cli": [
      {
        name: "gemini-bridge-planned",
        scope: "bridge",
        description: "GEMINI.md 중심 long context handover와 multimodal context export를 붙일 예정입니다.",
        memory_pattern: "GEMINI.md / shared memory adapter",
        trigger: "bridge planned"
      }
    ]
  };

  elements.skillRuntimeSummary.innerHTML = models
    .map(
      (model) => `
        <article class="runtime-card runtime-strip ${model.status === "active" ? "active" : "planned"}">
          <p class="tiny-label">${escapeHtml(model.label)}</p>
          <strong>${escapeHtml(model.runtime)}</strong>
          <p>${escapeHtml(model.summary)}</p>
          <div class="runtime-meta">
            <span class="status-chip ${model.status === "active" ? "success" : "warn"}">${escapeHtml(model.status)}</span>
            <span class="chip">${escapeHtml(`skills ${model.skill_count}`)}</span>
            <span class="chip">${escapeHtml(model.memory_mode)}</span>
          </div>
        </article>
      `
    )
    .join("");

  const renderSkillNode = (skill, index, isPlanned = false) => {
    const flowMeta = isPlanned
      ? { id: "planned", label: "planned bridge node", shortLabel: "planned" }
      : getSkillFlowMeta(skill);

    return `
      <div class="skill-node-wrap ${isPlanned ? "planned" : ""} ${state.activeSkillName === skill.name ? "selected" : ""} ${state.suppressedSkillName === skill.name ? "tooltip-suppressed" : ""}">
        <button
          class="skill-node ${state.activeSkillName === skill.name ? "active" : ""} ${isPlanned ? "planned" : ""} ${escapeAttr(flowMeta.id)}"
          type="button"
          data-skill-select="${escapeAttr(skill.name)}"
        >
          <span class="skill-node-flow ${escapeAttr(flowMeta.id)}">${escapeHtml(flowMeta.shortLabel)}</span>
          <span class="skill-node-name">${escapeHtml(skill.name)}</span>
          <span class="skill-node-scope">${escapeHtml(skill.scope || (isPlanned ? "planned" : skill.role))}</span>
        </button>
        <div class="skill-tooltip" role="tooltip">
          <div class="skill-tooltip-head">
            <div class="skill-tooltip-icon">
              <span class="material-symbols-outlined">${escapeHtml(isPlanned ? "schedule" : "schema")}</span>
            </div>
            <div>
              <strong>${escapeHtml(skill.name)}</strong>
              <p>${escapeHtml(`${isPlanned ? "planned node" : skill.role} / ${skill.scope || "general"}`)}</p>
            </div>
          </div>
          <p class="skill-tooltip-copy">${escapeHtml(skill.description)}</p>
          <div class="skill-tooltip-meta">
            <span>${escapeHtml(flowMeta.label)}</span>
            <span>${escapeHtml(skill.trigger)}</span>
            <span>${escapeHtml(skill.memory_pattern)}</span>
          </div>
        </div>
      </div>
    `;
  };

  const renderSkillGroup = (label, note, tone, nodes) => {
    if (!nodes.length) return "";
    return `
      <section class="skill-subcluster ${escapeAttr(tone)}">
        <div class="skill-subcluster-head">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(note)}</strong>
        </div>
        <div class="skill-node-grid">
          ${nodes.join("")}
        </div>
      </section>
    `;
  };

  const modelColumns = models
    .map((model) => {
      const modelSkills = skills.filter(
        (skill) => skill.model_target === model.id && !["manager", "advisor"].includes(skill.role)
      );
      const plannedSkills = arrayOrEmpty(plannedSkillMap[model.id]);
      const managerLinkedSkills = modelSkills.filter((skill) => getSkillFlowMeta(skill).id === "manager-linked");
      const directSkills = modelSkills.filter((skill) => getSkillFlowMeta(skill).id === "direct");
      const clusterMarkup = modelSkills.length
        ? [
            renderSkillGroup(
              "Manager-linked Specialists",
              "multi-agent-manager-ko가 묶어서 호출하는 흐름",
              "manager",
              managerLinkedSkills.map((skill) => renderSkillNode(skill, skills.findIndex((item) => item.name === skill.name)))
            ),
            renderSkillGroup(
              "Direct Specialists",
              "직접 호출하거나 독립적으로 쓰는 흐름",
              "direct",
              directSkills.map((skill) => renderSkillNode(skill, skills.findIndex((item) => item.name === skill.name)))
            )
          ]
            .filter(Boolean)
            .join("")
        : renderSkillGroup(
            "Planned Bridge Nodes",
            "아직 실제 스킬 런타임이 없고 브리지 설계만 준비된 흐름",
            "planned",
            plannedSkills.map((skill) => renderSkillNode(skill, -1, true))
          );

      return `
        <article class="skill-model-column ${model.status === "active" ? "active" : "planned"}">
          <div class="skill-model-stem"></div>
          <div class="skill-model-card">
            <div class="skill-model-head">
              <div class="skill-model-icon">
                <span class="material-symbols-outlined">${escapeHtml(modelIconMap[model.id] || "hub")}</span>
              </div>
              <div>
                <p class="tiny-label">${escapeHtml(model.label)}</p>
                <strong>${escapeHtml(model.runtime)}</strong>
              </div>
            </div>
            <p>${escapeHtml(model.summary)}</p>
            <div class="runtime-meta">
              <span class="status-chip ${model.status === "active" ? "success" : "warn"}">${escapeHtml(model.status)}</span>
              <span class="chip">${escapeHtml(`skills ${model.skill_count}`)}</span>
              <span class="chip">${escapeHtml(model.memory_mode)}</span>
            </div>
          </div>
          <div class="skill-cluster">
            <div class="skill-cluster-head">
              <span>${escapeHtml(model.status === "active" ? "active skill nodes" : "planned bridge nodes")}</span>
            </div>
            ${clusterMarkup || `<div class="skill-node-empty">registered skill 없음</div>`}
          </div>
        </article>
      `;
    })
    .join("");

  elements.hierarchyLane.innerHTML = `
    <div class="skill-tree-shell">
      <div class="skill-tree-background"></div>
      <div class="skill-tree-root">
        <div class="skill-tree-root-card">
          <div class="skill-tree-root-icon">
            <span class="material-symbols-outlined">hub</span>
          </div>
          <p class="tiny-label">Root Skill Core</p>
          <strong>사용자 요청 → Manager / Advisor Router</strong>
          <p>사용자 지시를 받은 뒤 ${escapeHtml(managerSkills.map((skill) => skill.name).join(" / "))} 가 먼저 흐름을 정리하고, 그 아래에서는 manager-linked specialist와 direct specialist가 다시 나뉩니다.</p>
          <div class="result-metadata">
            <span class="chip">${escapeHtml(`installed ${installedSkills.length}`)}</span>
            <span class="chip">${escapeHtml(`active models ${activeModels.length}`)}</span>
            <span class="chip">${escapeHtml(`planned models ${plannedModels.length}`)}</span>
            ${selectedSkill ? `<span class="chip">${escapeHtml(`selected ${selectedSkill.name}`)}</span>` : ""}
          </div>
        </div>
        <div class="skill-tree-root-line"></div>
      </div>
      <div class="skill-model-row">
        <div class="skill-model-crossbar"></div>
        ${modelColumns}
      </div>
      <div class="skill-tree-foot">
        <p class="skill-tree-foot-copy">스킬 노드는 마우스를 올리면 미리 보이고, 클릭하면 말풍선이 고정됩니다. 파란 계열은 multi-agent-manager-ko와 함께 움직이는 흐름이고, 민트 계열은 직접 호출하거나 독립적으로 쓰는 흐름입니다.</p>
        <div class="skill-utility-row">
          <span class="utility-chip">Shared Memory Hub</span>
          <span class="utility-chip">AGENTS.md Adapter</span>
          <span class="utility-chip">CLAUDE.md Bridge</span>
          <span class="utility-chip">GEMINI.md Bridge</span>
          <span class="utility-chip">Protocol Playbook</span>
        </div>
      </div>
    </div>
  `;
  renderSkillsMobileShell({ models, managerSkills, skills, selectedSkill });
  renderSkillDetailPanel();
}

function renderSkillsMobileShell({ models, managerSkills, skills, selectedSkill }) {
  if (!elements.skillsMobileShell) return;

  const groupDefinitions = [
    {
      title: "Manager / Advisor",
      tone: "primary",
      badge: "CORE",
      skills: skills.filter((skill) => skill.role === "manager" || skill.role === "advisor")
    },
    {
      title: "Specialists",
      tone: "secondary",
      badge: "VERTICALS",
      skills: skills.filter((skill) => skill.role === "specialist")
    },
    {
      title: "Planned Bridges",
      tone: "warning",
      badge: "PLANNED",
      skills: arrayOrEmpty(models)
        .filter((model) => model.status !== "active")
        .map((model) => ({
          name: `${model.label} bridge`,
          description: `${model.runtime} 중심 memory adapter와 handover export를 붙일 예정입니다.`,
          role: "planned",
          scope: "bridge",
          trigger: "bridge planned",
          memory_pattern: `${model.runtime} / shared memory adapter`,
          model_target: model.id,
          status: "planned",
          path: model.runtime
        }))
    }
  ];

  const runtimeTabs = models
    .map(
      (model) => `
        <div class="mobile-runtime-pill ${model.status === "active" ? "active" : "planned"}">
          <strong>${escapeHtml(model.label)}</strong>
          <span>${escapeHtml(model.status === "active" ? "active runtime" : "planned bridge")}</span>
        </div>
      `
    )
    .join("");

  const groupMarkup = groupDefinitions
    .map((group) => {
      if (!group.skills.length) return "";
      return `
        <section class="mobile-skill-group ${escapeAttr(group.tone)}">
          <div class="mobile-skill-group-head">
            <div class="mobile-skill-group-bar ${escapeAttr(group.tone)}"></div>
            <h3>${escapeHtml(group.title)}</h3>
            <span>${escapeHtml(group.badge)}</span>
          </div>
          <div class="mobile-skill-card-list">
            ${group.skills
              .map(
                (skill) => `
                  <button
                    class="mobile-skill-card ${state.activeSkillName === skill.name ? "active" : ""}"
                    type="button"
                    data-skill-select="${escapeAttr(skill.name)}"
                  >
                    <div class="mobile-skill-card-head">
                      <div>
                        <strong>${escapeHtml(skill.name)}</strong>
                        <p>${escapeHtml(skill.scope || skill.role)}</p>
                      </div>
                      <span class="mobile-status-badge ${escapeAttr(skill.status === "installed" ? "ready" : "planned")}">${escapeHtml(skill.status)}</span>
                    </div>
                    <div class="mobile-skill-metadata">
                      <div>
                        <span>Trigger</span>
                        <p>${escapeHtml(skill.trigger)}</p>
                      </div>
                      <div>
                        <span>Memory Path</span>
                        <p>${escapeHtml(skill.memory_pattern)}</p>
                      </div>
                    </div>
                  </button>
                `
              )
              .join("")}
          </div>
        </section>
      `;
    })
    .join("");

  const detailMarkup = selectedSkill ? buildSkillDetailPanelMarkup(selectedSkill, "mobile") : "";

  elements.skillsMobileShell.innerHTML = `
    <section class="mobile-app-card">
      <div class="mobile-block-head">
        <div>
          <p class="tiny-label">Integrated Skill Map</p>
          <h3>모델별 스킬 구성</h3>
        </div>
      </div>
      <div class="mobile-runtime-scroll">
        ${runtimeTabs}
      </div>
    </section>

    ${groupMarkup}

    <section class="mobile-skill-metric-grid">
      <article class="mobile-skill-metric-card primary">
        <span class="material-symbols-outlined">hub</span>
        <strong>${escapeHtml(`${skills.length} Connected Skills`)}</strong>
        <p>${escapeHtml(`manager/advisor ${managerSkills.length}개, specialist ${skills.filter((skill) => skill.role === "specialist").length}개`)}</p>
      </article>
      <article class="mobile-skill-metric-card">
        <span class="material-symbols-outlined">memory</span>
        <strong>${escapeHtml(`${models.filter((model) => model.status === "active").length} Active Runtime`)}</strong>
        <p>${escapeHtml("Codex 기준 실제 동작 런타임과 planned bridge를 함께 표시합니다.")}</p>
      </article>
    </section>

    ${detailMarkup}
  `;
}

function initializePromptWorkbenches() {
  state.promptTailor.output = "";
  state.promptTailor.fit = null;
  state.promptTailor.loading = false;
  state.promptTailor.usage = null;
  state.promptForge.output = "";
  state.promptForge.fit = null;
  state.promptForge.loading = false;
  state.promptForge.usage = null;
  setPromptTailorIdleStatus();
  setPromptForgeIdleStatus();
}

function renderPromptTailorSection() {
  if (!elements.promptTailorShell) return;

  const profile = getPromptModelProfile(state.promptTailor.modelId);
  const version = findVersion(profile.versionHint);
  const usageChips = buildPromptUsageChips(state.promptTailor.usage);
  const inputGuide = buildPromptInputGuide(state.promptTailor.input, profile, { mode: "tailor" });
  const historyMarkup = buildPromptHistoryPanelMarkup("tailor", {
    title: "생성 기록",
    emptyTitle: "아직 저장된 변환 결과가 없습니다",
    emptyCopy: "생성에 성공하면 API Key 없이 결과만 저장됩니다."
  });

  if (!state.personalization.authenticated) {
    elements.promptTailorShell.innerHTML = buildPromptStudioLockedMarkup({
      studio: "Prompt Tailor",
      description: "로그인 후 목표 / 해야할 일 / 결과 템플릿을 채우면 서비스 관리 모델이 프롬프트를 생성합니다. 무료 3회 이후에는 Pro가 필요합니다.",
      status: state.personalization.status,
      historyMarkup
    });
    return;
  }

  elements.promptTailorShell.innerHTML = `
    <div class="prompt-workbench-shell prompt-shell-compact prompt-studio-shell">
      <div class="panel prompt-studio-topbar prompt-studio-topbar-tailor">
        <div class="prompt-studio-copy">
          <p class="tiny-label">Prompt Tailor Studio</p>
          <h3>자연어로 적은 업무 목표를 실행용 프롬프트로 생성합니다</h3>
          <p class="registry-explainer prompt-studio-inline-lead">아무 문장만 던지는 대신 최소 템플릿인 목표 / 해야할 일 / 결과를 채우면, 서비스 관리 모델이 이를 읽어 선택한 타겟 모델용 프롬프트로 정리합니다.</p>
          <p class="prompt-studio-meta">로그인 완료 · 무료 3회 체험 · Pro 월 $${state.promptAccess.proMonthlyUsd.toFixed(2)} / 연 $${Math.round(state.promptAccess.proYearlyUsd)} · 월 ${state.promptAccess.monthlyLimit}회 · 1회 ${state.promptAccess.charLimit}자</p>
        </div>
        <div class="prompt-topbar-setup">
          <div class="prompt-topbar-control-grid prompt-topbar-control-grid-tailor prompt-topbar-control-grid-tailor-billing">
            <div class="prompt-control prompt-control-card">
              <label class="field-label prompt-control-label" for="prompt-tailor-model">
                <span class="material-symbols-outlined">switch_right</span>
                <span>변환 후 모델</span>
              </label>
              <select id="prompt-tailor-model" class="prompt-select" data-prompt-model="true" data-prompt-model-role="target" data-prompt-lab="tailor">
                ${buildPromptModelOptions(state.promptTailor.modelId)}
              </select>
            </div>
            <div class="prompt-control prompt-control-card prompt-access-card">
              <div class="prompt-access-head">
                <label class="field-label prompt-control-label">
                  <span class="material-symbols-outlined">workspace_premium</span>
                  <span>사용량 / 업그레이드</span>
                </label>
                <button class="buttonlike prompt-access-refresh" type="button" data-prompt-access-action="refresh">새로고침</button>
              </div>
              <div class="prompt-access-chip-row">
                <span class="prompt-chip">${escapeHtml(`Plan ${String(state.promptAccess.plan || "free").toUpperCase()}`)}</span>
                <span class="prompt-chip">${escapeHtml(`Free ${state.promptAccess.freeUsed}/${state.promptAccess.freeLimit}`)}</span>
                <span class="prompt-chip">${escapeHtml(`Month ${state.promptAccess.monthlyUsed}/${state.promptAccess.monthlyLimit}`)}</span>
              </div>
              <p class="prompt-access-copy">${escapeHtml(state.promptAccess.message || `${getPromptManagedLabel()}가 현재 요청을 처리합니다.`)}</p>
              <div class="prompt-access-mini-grid">
                <input
                  class="prompt-input"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="구매 후 받은 Pro 코드를 입력"
                  data-prompt-access-field="upgradeCode"
                  value="${escapeAttr(state.promptAccess.upgradeCode)}"
                />
                <button class="primary-button prompt-access-button" type="button" data-prompt-access-action="redeem" ${state.promptAccess.loading ? "disabled" : ""}>코드 등록</button>
              </div>
              ${state.promptAccess.checkoutUrl ? `<button class="buttonlike prompt-access-link" type="button" data-prompt-access-action="checkout">Pro 결제 열기</button>` : ""}
            </div>
          </div>
          <p class="prompt-control-footnote">서비스가 관리하는 모델은 ${escapeHtml(getPromptManagedLabel())}입니다. 무료 체험 3회 이후에는 Pro가 필요하고, Pro는 월 ${state.promptAccess.monthlyLimit}회, 1회 ${state.promptAccess.charLimit}자까지 사용할 수 있습니다.</p>
        </div>
      </div>

      <div class="prompt-workbench-grid prompt-workbench-grid-dual">
        <article class="panel prompt-workbench-panel input-panel">
          <div class="prompt-field-head">
            <div class="prompt-field-title">
              <p class="tiny-label">Structured Brief</p>
              <h3>최소 템플릿으로 목표를 적어주세요</h3>
              <p class="registry-explainer prompt-tight-copy prompt-soft-copy">아무렇게나 쓰지 말고 최소한 목표, 해야할 일, 결과를 나눠 적으면 프롬프트 품질이 훨씬 안정적입니다.</p>
            </div>
            <div class="prompt-model-badge neutral">최소 틀 유지</div>
          </div>

          <div class="prompt-template-card">
            <strong>권장 입력 틀</strong>
            <p>목표: 무엇을 해결할지</p>
            <p>해야할 일: 모델이 꼭 수행해야 하는 액션</p>
            <p>결과: 언어, 형식, 검증 기준</p>
          </div>

          <textarea
            id="prompt-tailor-input"
            class="prompt-textarea prompt-textarea-xl"
            data-prompt-field="input"
            data-prompt-lab="tailor"
            rows="14"
            placeholder="목표:\n무엇을 해결할지\n\n해야할 일:\n- 모델이 해야 하는 액션\n\n결과:\n- 원하는 언어\n- 원하는 형식\n- 검증 기준"
          >${escapeHtml(state.promptTailor.input)}</textarea>

          <div id="prompt-tailor-input-guide">${buildPromptInputGuideStripMarkup(inputGuide)}</div>
          <div id="prompt-tailor-model-guide">${buildPromptModelGuideStripMarkup(profile, "타겟 모델 팁")}</div>

          <div class="prompt-action-block">
            <button class="primary-button prompt-primary-action prompt-primary-action-wide" type="button" data-prompt-action="translate" ${state.promptTailor.loading ? "disabled" : ""}>
              <span class="material-symbols-outlined">${state.promptTailor.loading ? "progress_activity" : "arrow_forward"}</span>
              <span>${escapeHtml(state.promptTailor.loading ? "생성 중..." : "프롬프트 만들기")}</span>
            </button>
            <p class="prompt-action-note">실시간 자동 호출이 아니라 아래 버튼을 눌렀을 때만 실제 비용이 발생합니다.</p>
            ${buildPromptStatusLineMarkup(state.promptTailor.liveTone, state.promptTailor.liveStatus)}
          </div>
        </article>

        <div class="prompt-output-stack">
          <article class="panel prompt-workbench-panel output-panel">
            <div class="prompt-workbench-head">
              <div>
                <p class="tiny-label">Tailored Prompt</p>
                <h3>맞춤 프롬프트</h3>
                <p class="registry-explainer">${escapeHtml(`${profile.label}에서 바로 붙여 넣어 쓸 수 있는 형식으로 정리합니다.`)}</p>
              </div>
              <div class="prompt-output-meta">
                ${usageChips}
              </div>
            </div>
            ${
              state.promptTailor.output
                ? `<pre class="prompt-output-box prompt-output-box-xl">${escapeHtml(state.promptTailor.output)}</pre>`
                  : `<div class="prompt-output-placeholder prompt-output-placeholder-xl">
                    <span class="material-symbols-outlined">tune</span>
                    <strong>아직 생성되지 않았습니다</strong>
                    <p>로그인 후 템플릿을 채우고 생성하면 여기에 맞춤 프롬프트가 들어옵니다.</p>
                  </div>`
            }
          </article>

          ${buildPromptOutputFooterMarkup(profile, version, "tailor")}
        </div>
      </div>

      <section class="prompt-secondary-grid prompt-secondary-grid-single">
        ${historyMarkup}
      </section>
    </div>
  `;
}

function renderPromptForgeSection() {
  if (!elements.promptForgeShell) return;

  const route = getPromptForgeRoute();
  const sourceProfile = route.sourceProfile;
  const profile = route.targetProfile;
  const sameModel = route.sameModel;
  const liveConfig = getLivePromptModelConfig(state.promptForge.modelId);
  const fit = state.promptForge.output
    ? (state.promptForge.fit || buildPromptFitCheck(state.promptForge.output, profile, {
    mode: "forge",
    repairProvided: Boolean(String(state.promptForge.repair || "").trim())
  }))
    : null;
  const version = findVersion(profile.versionHint);
  const usageChips = buildPromptUsageChips(state.promptForge.usage);
  const statusTone = state.promptForge.liveTone || "info";
  const inputGuide = buildPromptInputGuide(state.promptForge.input, profile, {
    mode: "forge",
    repairProvided: Boolean(String(state.promptForge.repair || "").trim())
  });
  const historyMarkup = buildPromptHistoryPanelMarkup("forge", {
    title: "생성 기록",
    emptyTitle: "아직 저장된 Forge 결과가 없습니다",
    emptyCopy: "정교화 또는 포팅에 성공하면 결과만 저장됩니다."
  });

  if (!state.personalization.authenticated) {
    elements.promptForgeShell.innerHTML = buildPromptStudioLockedMarkup({
      studio: "Prompt Forge",
      description: "로그인 후 source prompt와 repair feedback을 넣고 Target Model API Key로 정교화/포팅합니다. API Key는 저장하지 않고, 탭을 벗어나면 즉시 지웁니다.",
      status: state.personalization.status,
      historyMarkup
    });
    return;
  }

  elements.promptForgeShell.innerHTML = `
    <div class="prompt-workbench-shell prompt-forge-shell prompt-shell-compact prompt-studio-shell">
      <div class="panel prompt-studio-topbar prompt-studio-topbar-forge">
        <div class="prompt-studio-copy">
          <p class="tiny-label">Prompt Forge</p>
          <h3>기존 프롬프트를 정교화하고 다른 모델용으로 다시 맞춥니다</h3>
          <p class="registry-explainer prompt-studio-inline-lead">같은 모델이면 더 자연스럽고 안정적으로 다듬고, 다른 모델이면 해당 모델 문법에 맞는 버전으로 다시 씁니다.</p>
          <p class="prompt-studio-meta">Source Prompt는 유지하고, 실행 키는 항상 Target Model 기준으로만 사용합니다.</p>
        </div>
        <div class="prompt-topbar-setup">
          <div class="prompt-topbar-control-grid prompt-topbar-control-grid-forge">
            <div class="prompt-control prompt-control-card">
              <label class="field-label prompt-control-label" for="prompt-forge-source-model">
                <span class="material-symbols-outlined">source_environment</span>
                <span>Source Model</span>
              </label>
              <select id="prompt-forge-source-model" class="prompt-select" data-prompt-model="true" data-prompt-model-role="source" data-prompt-lab="forge">
                ${buildPromptModelOptions(state.promptForge.sourceModelId)}
              </select>
            </div>
            <div class="prompt-control prompt-control-card">
              <label class="field-label prompt-control-label" for="prompt-forge-model">
                <span class="material-symbols-outlined">switch_right</span>
                <span>Target Model</span>
              </label>
              <select id="prompt-forge-model" class="prompt-select" data-prompt-model="true" data-prompt-model-role="target" data-prompt-lab="forge">
                ${buildPromptModelOptions(state.promptForge.modelId)}
              </select>
            </div>
            <div class="prompt-control prompt-control-card prompt-control-bubble" data-prompt-bubble-anchor="forge">
              <label class="field-label prompt-control-label" for="prompt-forge-api-key">
                <span class="material-symbols-outlined">key</span>
                <span>Target Model API Key</span>
              </label>
              <input
                id="prompt-forge-api-key"
                class="prompt-input"
                type="password"
                autocomplete="off"
                spellcheck="false"
                placeholder="${escapeAttr(`${liveConfig.provider.toUpperCase()} API Key를 붙여 넣으세요`)}"
                data-prompt-field="apiKey"
                data-prompt-lab="forge"
                value="${escapeAttr(state.promptForge.apiKey)}"
              />
              ${state.promptForge.alertBubble ? buildPromptAlertBubbleMarkup(state.promptForge.alertBubble) : ""}
            </div>
          </div>
          <p class="prompt-control-footnote">${escapeHtml(`주의: ${profile.label} Target Model API Key만 넣습니다. source model 키가 아니며 저장하지 않습니다. 새로고침, 탭 이탈, 섹션 이동 시 즉시 삭제됩니다.`)}</p>
        </div>
      </div>

      <div class="prompt-workbench-grid prompt-workbench-grid-dual">
        <article class="panel prompt-workbench-panel input-panel">
          <div class="prompt-field-head">
            <div class="prompt-field-title">
              <p class="tiny-label">Source Prompt + Repair</p>
              <h3>${escapeHtml(sameModel ? "같은 모델 기준으로 프롬프트를 더 단단하게 고칩니다" : `${sourceProfile.label} 프롬프트를 ${profile.label} 문법으로 다시 맞춥니다`)}</h3>
              <p class="registry-explainer prompt-tight-copy">${escapeHtml(sameModel ? "실패했던 지점을 적으면 구조와 검증 규칙을 다시 조입니다." : "기존 프롬프트의 의도는 유지하면서 Target Model에 맞는 버전으로 다시 씁니다.")}</p>
            </div>
            <div class="prompt-model-badge ${escapeAttr(sameModel ? profile.tone : "neutral")}">${escapeHtml(sameModel ? "Refine" : "Port")}</div>
          </div>

          <label class="field-label" for="prompt-forge-input">Source Prompt</label>
          <textarea
            id="prompt-forge-input"
            class="prompt-textarea prompt-textarea-xl"
            data-prompt-field="input"
            data-prompt-lab="forge"
            rows="14"
          >${escapeHtml(state.promptForge.input)}</textarea>

          <label class="field-label" for="prompt-forge-repair">동작 안 한 부분 / 더 세게 고칠 부분</label>
          <textarea
            id="prompt-forge-repair"
            class="prompt-textarea"
            data-prompt-field="repair"
            data-prompt-lab="forge"
            rows="7"
          >${escapeHtml(state.promptForge.repair)}</textarea>

          <div id="prompt-forge-input-guide">${buildPromptInputGuideStripMarkup(inputGuide)}</div>
          <div id="prompt-forge-model-guide">${buildPromptModelGuideStripMarkup(profile, sameModel ? "같은 모델 정교화" : "교차 모델 포팅")}</div>

          <div class="prompt-action-block">
            <button class="primary-button prompt-primary-action prompt-primary-action-wide" type="button" data-prompt-action="generate" ${state.promptForge.loading ? "disabled" : ""}>
              <span class="material-symbols-outlined">${state.promptForge.loading ? "progress_activity" : "arrow_forward"}</span>
              <span>${escapeHtml(state.promptForge.loading ? "생성 중..." : sameModel ? "프롬프트 정교화" : "프롬프트 포팅")}</span>
            </button>
            <p class="prompt-action-note">이 탭도 버튼을 눌렀을 때만 실제 호출합니다.</p>
            ${buildPromptStatusLineMarkup(statusTone, state.promptForge.liveStatus)}
          </div>
        </article>

        <div class="prompt-output-stack">
          <article class="panel prompt-workbench-panel output-panel">
            <div class="prompt-workbench-head">
              <div>
                <p class="tiny-label">Generated Prompt</p>
                <h3>${escapeHtml(sameModel ? `${profile.label} 정교화 결과` : `${profile.label} 포팅 결과`)}</h3>
                <p class="registry-explainer">${escapeHtml(sameModel ? "실패 피드백을 반영해 같은 모델에서 더 안정적으로 먹는 버전으로 다시 조입니다." : `${sourceProfile.label} 프롬프트를 ${profile.label} 문법과 강점에 맞게 다시 씁니다.`)}</p>
              </div>
              <div class="prompt-output-meta">
                ${usageChips}
              </div>
            </div>
            ${
              state.promptForge.output
                ? `<pre class="prompt-output-box prompt-output-box-xl">${escapeHtml(state.promptForge.output)}</pre>`
                : `<div class="prompt-output-placeholder prompt-output-placeholder-xl">
                    <span class="material-symbols-outlined">auto_fix_high</span>
                    <strong>아직 생성되지 않았습니다</strong>
                    <p>${escapeHtml(sameModel ? "안 먹히는 프롬프트를 다듬은 결과가 여기에 들어옵니다." : `${sourceProfile.label} 프롬프트를 ${profile.label}용으로 포팅한 결과가 여기에 들어옵니다.`)}</p>
                  </div>`
            }
          </article>

          ${buildPromptOutputFooterMarkup(profile, version, "forge", fit)}
        </div>
      </div>

      <section class="prompt-secondary-grid prompt-secondary-grid-single">
        ${historyMarkup}
      </section>
    </div>
  `;
}

function buildPromptStudioLockedMarkup({ studio, description, status, historyMarkup }) {
  return `
    <div class="prompt-workbench-shell prompt-shell-compact prompt-studio-shell">
      <div class="panel prompt-studio-topbar">
        <div>
          <p class="tiny-label">${escapeHtml(studio)}</p>
          <h3>전문 기능 보호를 위해 로그인 후 열립니다</h3>
          <p class="registry-explainer">${escapeHtml(description)}</p>
        </div>
        <div class="prompt-studio-pills">
          ${buildPromptSessionPillMarkup("shield_lock", "로그인 필요", "studio 잠금")}
          ${buildPromptSessionPillMarkup("database", "결과 히스토리 유지", "API Key 제외")}
          ${buildPromptSessionPillMarkup("timer", "세션 키 자동 삭제", "새로고침 / 섹션 이탈")}
        </div>
      </div>

      <div class="prompt-studio-login-grid">
        <article class="panel prompt-login-panel">
          <div class="prompt-footer-head">
            <div>
              <p class="tiny-label">Prompt Studio Login</p>
              <h4>상단 Login에서 세션을 열면 Prompt Studio 전체가 함께 열립니다</h4>
            </div>
          </div>
          <p class="registry-explainer">Google Auth 또는 개발자 마스터키 세션을 상단에서 한 번 열면 Prompt Tailor와 Prompt Forge가 같이 풀립니다. 로그인 후 API Key는 각 세션에서만 직접 입력합니다.</p>
          <button class="primary-button prompt-primary-action prompt-primary-action-wide" type="button" data-auth-action="open">
            <span class="material-symbols-outlined">lock_open</span>
            <span>상단 Login 열기</span>
          </button>
          <div class="prompt-status-inline info">
            <span class="material-symbols-outlined">info</span>
            <p>${escapeHtml(status || "로그인 후 사용할 수 있습니다.")}</p>
          </div>
        </article>
        ${historyMarkup}
      </div>
    </div>
  `;
}

function buildPromptSessionPillMarkup(icon, label, caption) {
  return `
    <span class="prompt-session-pill">
      <span class="material-symbols-outlined">${escapeHtml(icon)}</span>
      <span>
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(caption)}</small>
      </span>
    </span>
  `;
}

function buildPromptAlertBubbleMarkup(message) {
  return `
    <div class="prompt-alert-bubble" data-prompt-bubble>
      <span class="material-symbols-outlined">campaign</span>
      <div>
        <strong>먼저 API Key가 필요해요</strong>
        <p>${escapeHtml(message)}</p>
      </div>
    </div>
  `;
}

function buildPromptStatusLineMarkup(tone, text) {
  return `
    <div class="prompt-status-inline prompt-status-inline-compact ${escapeAttr(tone || "info")}">
      <span class="material-symbols-outlined">${escapeHtml(getPromptStatusIcon(tone))}</span>
      <p>${escapeHtml(text)}</p>
    </div>
  `;
}

function buildPromptHistoryPanelMarkup(mode, { title, emptyTitle, emptyCopy }) {
  const entries = getPromptHistoryEntries(mode);
  return `
    <aside class="panel prompt-history-board">
      <div class="prompt-footer-head">
        <div>
          <p class="tiny-label">History</p>
          <h4>${escapeHtml(title)}</h4>
        </div>
        <button class="ghost-button prompt-history-clear" type="button" data-prompt-history-clear="${escapeAttr(mode)}" ${entries.length ? "" : "disabled"}>
          전체 삭제
        </button>
      </div>
      <div class="prompt-history-list">
        ${
          entries.length
            ? entries
                .map(
                  (entry) => `
                    <button class="prompt-history-card" type="button" data-prompt-history-load="${escapeAttr(entry.id)}">
                      <div class="prompt-history-card-head">
                        <strong>${escapeHtml(trimText(entry.title || entry.input, 72))}</strong>
                        <span>${escapeHtml(formatDateTime(entry.createdAt))}</span>
                      </div>
                      <p>${escapeHtml(trimText(entry.summary || entry.output, 120))}</p>
                      <div class="prompt-history-card-meta">
                        ${entry.engineModelId ? `<span class="prompt-chip">${escapeHtml(`변환 ${entry.engineModelId === "managed-service" ? getPromptManagedLabel() : getPromptModelProfile(entry.engineModelId).label}`)}</span>` : ""}
                        ${entry.sourceModelId ? `<span class="prompt-chip">${escapeHtml(`원본 ${getPromptModelProfile(entry.sourceModelId).label}`)}</span>` : ""}
                        <span class="prompt-chip">${escapeHtml(`대상 ${getPromptModelProfile(entry.modelId).label}`)}</span>
                      </div>
                      <span class="prompt-history-delete" data-prompt-history-delete="${escapeAttr(entry.id)}" title="이 결과 삭제">
                        <span class="material-symbols-outlined">close</span>
                      </span>
                    </button>
                  `
                )
                .join("")
            : `
              <div class="prompt-history-empty">
                <span class="material-symbols-outlined">history</span>
                <strong>${escapeHtml(emptyTitle)}</strong>
                <p>${escapeHtml(emptyCopy)}</p>
              </div>
            `
        }
      </div>
    </aside>
  `;
}

function getLivePromptModelConfig(modelId) {
  return LIVE_PROMPT_MODEL_MAP[modelId] || { supported: false, provider: "", model: "", label: "Unsupported model" };
}

function getPromptForgeRoute() {
  const sourceProfile = getPromptModelProfile(state.promptForge.sourceModelId || state.promptForge.modelId);
  const targetProfile = getPromptModelProfile(state.promptForge.modelId);
  const sameModel = sourceProfile.id === targetProfile.id;
  return {
    sourceProfile,
    targetProfile,
    sameModel
  };
}

function getPromptStatusIcon(tone) {
  if (tone === "success") return "verified";
  if (tone === "error") return "error";
  if (tone === "loading") return "progress_activity";
  return "info";
}

function refreshPromptHelperPanels(lab) {
  if (lab === "tailor") {
    const profile = getPromptModelProfile(state.promptTailor.modelId);
    const guide = buildPromptInputGuide(state.promptTailor.input, profile, { mode: "tailor" });
    const guideElement = document.getElementById("prompt-tailor-input-guide");
    const modelElement = document.getElementById("prompt-tailor-model-guide");
    if (guideElement) guideElement.innerHTML = buildPromptInputGuideStripMarkup(guide);
    if (modelElement) modelElement.innerHTML = buildPromptModelGuideStripMarkup(profile, "타겟 모델 팁");
  }

  if (lab === "forge") {
    const route = getPromptForgeRoute();
    const guide = buildPromptInputGuide(state.promptForge.input, route.targetProfile, {
      mode: "forge",
      repairProvided: Boolean(String(state.promptForge.repair || "").trim())
    });
    const guideElement = document.getElementById("prompt-forge-input-guide");
    const modelElement = document.getElementById("prompt-forge-model-guide");
    if (guideElement) guideElement.innerHTML = buildPromptInputGuideStripMarkup(guide);
    if (modelElement) modelElement.innerHTML = buildPromptModelGuideStripMarkup(route.targetProfile, route.sameModel ? "같은 모델 정교화" : "교차 모델 포팅");
  }
}

function setPromptTailorIdleStatus() {
  const targetProfile = getPromptModelProfile(state.promptTailor.modelId);
  state.promptTailor.liveTone = "info";
  if (!state.personalization.authenticated) {
    state.promptTailor.liveStatus = "로그인 후 무료 3회까지 바로 사용할 수 있습니다.";
    return;
  }

  if (!state.promptAccess.loaded || state.promptAccess.loading) {
    state.promptTailor.liveStatus = "사용량 상태를 불러오는 중입니다.";
    return;
  }

  if (!state.promptAccess.canUse) {
    state.promptTailor.liveStatus = state.promptAccess.message || "무료 3회를 모두 사용했어요. 계속 생성하려면 Pro로 업그레이드하세요.";
    return;
  }

  const remainingText = state.promptAccess.plan === "pro"
    ? `이번 달 ${state.promptAccess.monthlyRemaining}회 더 사용할 수 있습니다.`
    : `무료 ${state.promptAccess.freeRemaining}회가 남아 있습니다.`;
  state.promptTailor.liveStatus = `${getPromptManagedLabel()} 준비 완료. ${targetProfile.label}용 프롬프트를 생성합니다. ${remainingText}`;
}

function setPromptForgeIdleStatus() {
  const route = getPromptForgeRoute();
  const liveConfig = getLivePromptModelConfig(state.promptForge.modelId);
  state.promptForge.liveTone = "info";
  if (!String(state.promptForge.apiKey || "").trim()) {
    state.promptForge.liveStatus = route.sameModel
      ? `${route.targetProfile.label} Target Model API Key를 넣은 뒤 아래 버튼으로 정교화하세요.`
      : `${route.targetProfile.label} Target Model API Key를 넣은 뒤 아래 버튼으로 ${route.sourceProfile.label} 프롬프트를 포팅하세요.`;
    return;
  }

  state.promptForge.liveStatus = route.sameModel
    ? `${liveConfig.label} 준비 완료. 아래 버튼으로 같은 모델 기준 정교화를 실행합니다.`
    : `${liveConfig.label} 준비 완료. 아래 버튼으로 ${route.sourceProfile.label} -> ${route.targetProfile.label} 포팅을 실행합니다.`;
}

async function generatePromptTailorLive() {
  const profile = getPromptModelProfile(state.promptTailor.modelId);
  const engineProfile = { label: getPromptManagedLabel() };

  if (!state.personalization.authenticated) {
    state.promptTailor.liveTone = "info";
    state.promptTailor.liveStatus = "로그인 후 사용할 수 있습니다.";
    renderPromptTailorSection();
    return;
  }

  if (!state.promptAccess.loaded) {
    state.promptTailor.liveTone = "info";
    state.promptTailor.liveStatus = "사용량 상태를 먼저 확인하는 중입니다.";
    renderPromptTailorSection();
    return;
  }

  if (!state.promptAccess.canUse) {
    state.promptTailor.liveTone = "info";
    state.promptTailor.liveStatus = state.promptAccess.message || "무료 3회를 모두 사용했어요. 계속 생성하려면 Pro로 업그레이드하세요.";
    renderPromptTailorSection();
    return;
  }

  if (String(state.promptTailor.input || "").trim().length > state.promptAccess.charLimit) {
    state.promptTailor.liveTone = "info";
    state.promptTailor.liveStatus = `입력은 ${state.promptAccess.charLimit}자 이하로 줄여주세요.`;
    renderPromptTailorSection();
    return;
  }

  const internalDraft = buildTailoredPrompt(state.promptTailor.input, profile);

  state.promptTailor.loading = true;
  state.promptTailor.liveTone = "loading";
  state.promptTailor.usage = null;
  state.promptTailor.output = "";
  state.promptTailor.fit = null;
  state.promptTailor.liveStatus = `${engineProfile.label}가 ${profile.label}용 프롬프트를 생성하는 중입니다. 이번 호출은 ${state.promptAccess.freeRemaining > 0 && state.promptAccess.plan !== "pro" ? "무료 체험" : "Pro 사용량"}으로 처리됩니다.`;
  renderPromptTailorSection();

  try {
    const response = await fetch("/api/prompt-tailor-live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      credentials: "same-origin",
      body: JSON.stringify({
        systemPrompt: buildPromptTailorLiveSystemPrompt(profile, engineProfile),
        userPrompt: buildPromptTailorLiveUserPrompt({
          sourceGoal: state.promptTailor.input,
          internalDraft,
          profile
        })
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      handleAuthSessionExpired(payload.message);
      return;
    }
    if (payload.access) {
      applyPromptAccessStatus(payload.access);
    }
    if (!response.ok || !payload.ok) {
      state.promptTailor.loading = false;
      state.promptTailor.liveTone = response.status >= 500 ? "error" : "info";
      state.promptTailor.liveStatus = payload.message || "Live API 호출에 실패했습니다.";
      renderPromptTailorSection();
      return;
    }

    state.promptTailor.loading = false;
    state.promptTailor.liveTone = "success";
    state.promptTailor.output = String(payload.prompt || internalDraft).trim() || internalDraft;
    state.promptTailor.usage = payload.usage || null;
    state.promptTailor.fit = buildPromptFitCheck(state.promptTailor.output, profile, { mode: "tailor", repairProvided: false });
    const freeRemaining = payload.access?.free_remaining ?? state.promptAccess.freeRemaining;
    const monthlyRemaining = payload.access?.monthly_remaining ?? state.promptAccess.monthlyRemaining;
    const plan = String(payload.access?.plan || state.promptAccess.plan || "free").trim();
    state.promptTailor.liveStatus = plan === "pro"
      ? `${engineProfile.label}가 ${profile.label}용 프롬프트 생성을 완료했습니다. 이번 달 ${monthlyRemaining}회 더 사용할 수 있습니다.`
      : `${engineProfile.label}가 ${profile.label}용 프롬프트 생성을 완료했습니다. 무료 ${freeRemaining}회가 남아 있습니다.`;
    savePromptHistoryEntry({
      mode: "tailor",
      engineModelId: "managed-service",
      modelId: profile.id,
      input: state.promptTailor.input,
      output: state.promptTailor.output,
      fit: state.promptTailor.fit,
      usage: state.promptTailor.usage,
      title: derivePromptParts(state.promptTailor.input).title,
      summary: trimText(state.promptTailor.output, 140)
    });
    renderPromptTailorSection();
  } catch (error) {
    state.promptTailor.loading = false;
    state.promptTailor.liveTone = "error";
    state.promptTailor.liveStatus = error.message || "Live API 서버에 연결하지 못했습니다.";
    renderPromptTailorSection();
  }
}

async function generatePromptForgeLive() {
  const route = getPromptForgeRoute();
  const sourceProfile = route.sourceProfile;
  const profile = route.targetProfile;
  const liveConfig = getLivePromptModelConfig(state.promptForge.modelId);
  const apiKey = String(state.promptForge.apiKey || "").trim();

  if (!state.personalization.authenticated) {
    state.promptForge.liveTone = "info";
    state.promptForge.liveStatus = "로그인 후 사용할 수 있습니다.";
    renderPromptForgeSection();
    return;
  }

  if (!apiKey) {
    state.promptForge.liveTone = "info";
    state.promptForge.liveStatus = `${profile.label} Target Model API Key를 먼저 입력하세요.`;
    state.promptForge.alertBubble = `${profile.label} 실제 호출용 API Key가 비어 있습니다. 원본 모델 키가 아니라 타겟 모델 키를 넣어야 합니다.`;
    renderPromptForgeSection();
    return;
  }

  const templateDraft = buildGeneratedPrompt({
    sourcePrompt: state.promptForge.input,
    repair: state.promptForge.repair,
    sourceProfile,
    targetProfile: profile,
    sameModel: route.sameModel
  });

  state.promptForge.loading = true;
  state.promptForge.alertBubble = "";
  state.promptForge.liveTone = "loading";
  state.promptForge.usage = null;
  state.promptForge.output = "";
  state.promptForge.fit = null;
  state.promptForge.liveStatus = route.sameModel
    ? `${liveConfig.label}에 같은 모델 정교화를 요청하는 중입니다.`
    : `${liveConfig.label}에 ${sourceProfile.label} 프롬프트 포팅을 요청하는 중입니다.`;
  renderPromptForgeSection();

  try {
    const response = await fetch("/api/prompt-forge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        provider: liveConfig.provider,
        model: liveConfig.model,
        label: liveConfig.label,
        systemPrompt: buildPromptForgeLiveSystemPrompt(profile, { sourceProfile, sameModel: route.sameModel }),
        userPrompt: buildPromptForgeLiveUserPrompt({
          sourcePrompt: state.promptForge.input,
          repair: state.promptForge.repair,
          templateDraft,
          sourceProfile,
          profile,
          sameModel: route.sameModel
        }),
        apiKey
      })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.ok) {
      if (response.status === 401) {
        handleAuthSessionExpired(payload.message);
        return;
      }
      state.promptForge.loading = false;
      state.promptForge.liveTone = response.status >= 500 ? "error" : "info";
      state.promptForge.liveStatus = payload.message || "Live API 호출에 실패했습니다.";
      state.promptForge.usage = null;
      renderPromptForgeSection();
      return;
    }

    state.promptForge.loading = false;
    state.promptForge.liveTone = "success";
    state.promptForge.output = String(payload.prompt || templateDraft).trim() || templateDraft;
    state.promptForge.usage = payload.usage || null;
    state.promptForge.fit = buildPromptFitCheck(state.promptForge.output, profile, {
      mode: "forge",
      repairProvided: Boolean(String(state.promptForge.repair || "").trim())
    });
    state.promptForge.liveStatus = route.sameModel
      ? `${liveConfig.label} 기준 정교화가 완료되었습니다. 사용한 토큰은 우측 상단에 표시합니다.`
      : `${sourceProfile.label} -> ${liveConfig.label} 포팅이 완료되었습니다. 사용한 토큰은 우측 상단에 표시합니다.`;
    savePromptHistoryEntry({
      mode: "forge",
      sourceModelId: sourceProfile.id,
      modelId: profile.id,
      input: state.promptForge.input,
      repair: state.promptForge.repair,
      output: state.promptForge.output,
      fit: state.promptForge.fit,
      usage: state.promptForge.usage,
      title: derivePromptParts(state.promptForge.input).title,
      summary: trimText(state.promptForge.output, 140)
    });
    renderPromptForgeSection();
  } catch (error) {
    state.promptForge.loading = false;
    state.promptForge.liveTone = "error";
    state.promptForge.liveStatus = error.message || "Live API 서버에 연결하지 못했습니다.";
    renderPromptForgeSection();
  }
}

function getPromptModelProfile(profileId) {
  return PROMPT_MODEL_PROFILES.find((profile) => profile.id === profileId) || PROMPT_MODEL_PROFILES[0];
}

function buildPromptModelOptions(activeId) {
  const groups = PROMPT_MODEL_PROFILES.reduce((accumulator, profile) => {
    const key = profile.family;
    accumulator[key] = accumulator[key] || [];
    accumulator[key].push(profile);
    return accumulator;
  }, {});

  return Object.entries(groups)
    .map(
      ([family, profiles]) => `
        <optgroup label="${escapeAttr(family)}">
          ${profiles
            .map(
              (profile) => `
                <option value="${escapeAttr(profile.id)}" ${profile.id === activeId ? "selected" : ""}>
                  ${escapeHtml(profile.label)}
                </option>
              `
            )
            .join("")}
        </optgroup>
      `
    )
    .join("");
}

function derivePromptParts(rawText) {
  const cleaned = String(rawText || "").trim();
  const compact = cleaned.replace(/\n{3,}/g, "\n\n");
  const paragraphs = compact.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const lines = compact.split("\n").map((item) => item.trim()).filter(Boolean);
  const structured = parseStructuredPromptBrief(compact);
  const firstSentence = structured.goal
    || compact.replace(/\s+/g, " ").split(/(?<=[.!?。！？])\s+/)[0]
    || lines[0]
    || "주어진 업무를 정확히 수행한다.";
  return {
    cleaned: compact || "원문 프롬프트가 비어 있습니다.",
    title: trimText(firstSentence, 120),
    context: structured.tasks || paragraphs.slice(1).join("\n\n") || lines.slice(1).join("\n") || "추가 맥락은 원문 프롬프트 안에서 해석한다.",
    structured,
    wantsKorean: /(한국어|korean)/i.test(compact),
    wantsFormat: /(json|markdown|표|table|bullet|list|형식|format|schema|xml|yaml|코드블록|결과)/i.test(compact),
    wantsVerification: /(테스트|검증|validation|verify|acceptance|성공 기준|risk|리스크)/i.test(compact),
    mentionsRepo: /(repo|레포|파일|path|경로|command|명령어|diff|commit)/i.test(compact)
  };
}

function parseStructuredPromptBrief(rawText) {
  const sections = {
    goal: "",
    tasks: "",
    result: "",
    constraints: "",
    audience: ""
  };
  const labelMap = {
    "목표": "goal",
    "goal": "goal",
    "해야할 일": "tasks",
    "할 일": "tasks",
    "해야 할 일": "tasks",
    "task": "tasks",
    "tasks": "tasks",
    "결과": "result",
    "output": "result",
    "deliverable": "result",
    "constraints": "constraints",
    "제약": "constraints",
    "audience": "audience",
    "대상": "audience"
  };
  let currentKey = "";

  String(rawText || "").split("\n").forEach((rawLine) => {
    const line = rawLine.trim();
    const labelMatch = line.match(/^([A-Za-z가-힣 ]+)\s*:\s*(.*)$/);
    if (labelMatch) {
      const rawLabel = labelMatch[1].trim().toLowerCase();
      const normalizedKey = labelMap[rawLabel] || "";
      if (normalizedKey) {
        currentKey = normalizedKey;
        sections[currentKey] = [sections[currentKey], labelMatch[2].trim()].filter(Boolean).join("\n").trim();
        return;
      }
    }

    if (currentKey) {
      sections[currentKey] = [sections[currentKey], rawLine].filter(Boolean).join("\n").trim();
    }
  });

  return sections;
}

function buildTailoredPrompt(rawText, profile) {
  const parts = derivePromptParts(rawText);

  if (profile.promptStyle === "anthropic") {
    return [
      "<role>",
      "You are a structured Claude prompt that preserves the user's exact goal and separates context, instructions, and output contract cleanly.",
      "</role>",
      "",
      "<goal>",
      parts.title,
      "</goal>",
      "",
      "<source_prompt>",
      parts.cleaned,
      "</source_prompt>",
      "",
      "<instructions>",
      "- Preserve the real task scope from <source_prompt>.",
      "- If a blocking detail is missing, ask up to 3 targeted questions before acting.",
      `- Respond in ${parts.wantsKorean ? "Korean" : "the language requested in the source prompt"}.`,
      `- ${parts.mentionsRepo ? "When relevant, name likely file scope, commands, and validation steps." : "Prefer concrete steps instead of abstract advice."}`,
      "</instructions>",
      "",
      "<output_format>",
      "1. Short conclusion",
      "2. Recommended steps or changes",
      "3. Validation and risks",
      "</output_format>",
      "",
      "<quality_bar>",
      "- Do not invent missing facts.",
      "- Keep the answer compact but operational.",
      `- ${parts.wantsVerification ? "Preserve the original validation intent." : "Add a brief validation or confidence note."}`,
      "</quality_bar>"
    ].join("\n");
  }

  if (profile.promptStyle === "google") {
    return [
      "Task:",
      parts.title,
      "",
      "Context:",
      parts.cleaned,
      "",
      "Constraints:",
      `- Answer in ${parts.wantsKorean ? "Korean" : "the user's requested language"}.`,
      "- Preserve the original goal exactly.",
      `- ${parts.mentionsRepo ? "When code or repo work is implied, call out scope, commands, and validation explicitly." : "Prefer concrete actions over broad commentary."}`,
      "",
      "Mini example:",
      "Input: vague project request",
      "Output: concise conclusion + prioritized steps + validation note",
      "",
      "Return format:",
      "1. Conclusion",
      "2. Prioritized steps",
      "3. Validation / open questions",
      "",
      "If the task is underspecified, ask only the blocking questions first."
    ].join("\n");
  }

  if (profile.promptStyle === "deepseek") {
    return [
      "System goal:",
      parts.title,
      "",
      "Original prompt:",
      parts.cleaned,
      "",
      "Reasoning checklist:",
      "1. Identify the exact task and constraints.",
      "2. Separate assumptions from known facts.",
      `3. ${parts.mentionsRepo ? "Name likely file scope, commands, and verification." : "Turn the request into executable steps."}`,
      "4. Keep the final answer concise and directly actionable.",
      "",
      "Final answer format:",
      "- Summary",
      "- Action steps",
      "- Validation / risks",
      "",
      `Language: ${parts.wantsKorean ? "Korean" : "match user request"}.`
    ].join("\n");
  }

  if (profile.promptStyle === "qwen") {
    return [
      "Role:",
      "Repo-aware coding assistant operating on a local or open-model stack.",
      "",
      "Task:",
      parts.title,
      "",
      "Source prompt:",
      parts.cleaned,
      "",
      "Execution rules:",
      "- Preserve scope tightly.",
      `- ${parts.mentionsRepo ? "Call out target files, commands, and validation path." : "Prefer actionable steps and stable output formatting."}`,
      `- Answer in ${parts.wantsKorean ? "Korean" : "the requested language"}.`,
      "- If required context is missing, ask focused questions first.",
      "",
      "Output contract:",
      "1. What to do",
      "2. Expected changes or deliverables",
      "3. Validation / follow-up"
    ].join("\n");
  }

  return [
    "[System]",
    "You are tailoring this request for GPT-5 / Codex. Keep the user's exact goal and make the execution contract explicit.",
    "",
    "[Primary Objective]",
    parts.title,
    "",
    "[Source Prompt]",
    parts.cleaned,
    "",
    "[Instructions]",
    "- Preserve the task scope exactly.",
    "- If critical input is missing, ask up to 3 blocking questions first.",
    `- Respond in ${parts.wantsKorean ? "Korean" : "the language requested by the user"}.`,
    `- ${parts.mentionsRepo ? "If code or repo work is involved, name likely files, commands, and validation steps." : "Prefer operational steps over broad commentary."}`,
    "- State assumptions briefly instead of inventing facts.",
    "",
    "[Output Format]",
    "1. Short conclusion",
    "2. Recommended steps or changes",
    "3. Validation and risks",
    "",
    "[Quality Bar]",
    `- ${parts.wantsFormat ? "Preserve the user's requested format if compatible." : "Keep the output format stable and easy to scan."}`,
    `- ${parts.wantsVerification ? "Keep explicit validation criteria." : "Add a short validation note."}`,
    "- If the task cannot be completed with current information, say what is missing."
  ].join("\n");
}

function buildGeneratedPrompt({ sourcePrompt, repair, sourceProfile, targetProfile, sameModel }) {
  const sourceParts = derivePromptParts(sourcePrompt);
  const repairText = String(repair || "").trim();
  const repairBlock = repairText ? trimText(repairText, 600) : "";
  const modeLine = sameModel
    ? `Refine this prompt so it works better on ${targetProfile.label} without changing the real task.`
    : `Port this prompt from ${sourceProfile.label} to ${targetProfile.label} while preserving the real task and output intent.`;

  if (targetProfile.promptStyle === "anthropic") {
    return [
      "<role>",
      "You are a senior operator refining or porting an existing prompt into a Claude-ready prompt.",
      "</role>",
      "",
      "<mode>",
      modeLine,
      "</mode>",
      "",
      "<source_prompt>",
      sourceParts.cleaned,
      "</source_prompt>",
      "",
      "<instructions>",
      "- Preserve the real task in <source_prompt>.",
      "- If required context is missing, ask up to 3 blocking questions before execution.",
      "- Keep the response compact, technically concrete, and ready for handoff.",
      `- ${sourceParts.wantsKorean ? "Respond in Korean." : "Respond in the user's requested language."}`,
      `- ${sameModel ? "Tighten scope, output contract, and validation logic." : `Make the prompt feel native to ${targetProfile.label}.`}`,
      "</instructions>",
      "",
      repairBlock ? `<repair_feedback>\n${repairBlock}\n</repair_feedback>\n` : "",
      "<output_format>",
      "1. Diagnosis",
      "2. Prioritized plan",
      "3. Concrete changes or deliverables",
      "4. Validation and risks",
      "</output_format>",
      "",
      "<quality_bar>",
      "- Keep scope tight.",
      "- Do not hide uncertainty.",
      "- Make the validation criteria explicit.",
      "</quality_bar>"
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (targetProfile.promptStyle === "google") {
    return [
      "Task:",
      modeLine,
      "",
      "Context:",
      sourceParts.cleaned,
      "",
      repairBlock ? `Known failure from previous run:\n${repairBlock}\n` : "",
      "Constraints:",
      "- Preserve the user's real objective from the source prompt.",
      "- If context is missing, ask only the blocking questions.",
      "- Use a fixed answer structure.",
      `- ${sameModel ? "Refine the same-model prompt instead of rewriting the task from scratch." : `Rebuild the prompt for ${targetProfile.label} conventions.`}`,
      "",
      "Example answer shape:",
      "Conclusion -> Prioritized steps -> Validation / open issues",
      "",
      "Return format:",
      "1. Conclusion",
      "2. Prioritized steps",
      "3. Validation / open questions"
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (targetProfile.promptStyle === "deepseek") {
    return [
      "System goal:",
      modeLine,
      "",
      "Original prompt:",
      sourceParts.cleaned,
      "",
      repairBlock ? `Previous failure to correct:\n${repairBlock}\n` : "",
      "Reasoning steps:",
      "1. Identify exact success conditions.",
      "2. Separate facts, assumptions, and missing inputs.",
      `3. ${sameModel ? "Keep the task intact and strengthen execution rules." : `Port the task into ${targetProfile.label} style without losing intent.`}`,
      "4. Return only the final actionable answer in the requested format.",
      "",
      "Final answer schema:",
      "- Summary",
      "- Priority actions",
      "- Validation / risks",
      "",
      `Language: ${sourceParts.wantsKorean ? "Korean" : "match user request"}.`
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (targetProfile.promptStyle === "qwen") {
    return [
      "Role:",
      "Local/open-model coding assistant with explicit repo boundaries.",
      "",
      "Work objective:",
      modeLine,
      "",
      "Source prompt:",
      sourceParts.cleaned,
      "",
      repairBlock ? `Failure feedback to fix:\n${repairBlock}\n` : "",
      "Rules:",
      "- Keep the task executable.",
      "- Name file scope, command scope, and validation route when relevant.",
      "- If input is missing, ask blocking questions before proposing changes.",
      "",
      "Output contract:",
      "1. Objective restatement",
      "2. Execution plan",
      "3. Validation / follow-up"
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "[System]",
    "You are a senior technical operator refining or porting an existing prompt into a GPT-5 / Codex-ready prompt.",
    "",
    "[Mode]",
    modeLine,
    "",
    "[Source Prompt]",
    sourceParts.cleaned,
    "",
    repairBlock ? `[Failure Feedback]\n${repairBlock}\n` : "",
    "[Instructions]",
    "- Preserve the real work objective inside the source prompt.",
    "- If required context is missing, ask up to 3 blocking questions first.",
    `- ${sameModel ? "Strengthen structure, scope, validation, and output stability." : `Translate the prompt into ${targetProfile.label}-native structure and phrasing.`}`,
    "- Prefer file scope, commands, validation criteria, and risks when relevant.",
    `- Respond in ${sourceParts.wantsKorean ? "Korean" : "the requested language"}.`,
    "",
    "[Deliverable]",
    "1. Short diagnosis",
    "2. Prioritized plan",
    "3. Concrete changes or deliverables",
    "4. Validation and residual risks",
    "",
    "[Self-check]",
    "- Scope preserved",
    "- Output format fixed",
    "- Validation criteria explicit"
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPromptTailorLiveSystemPrompt(profile, engineProfile) {
  return [
    `You are an expert prompt engineer using ${engineProfile.label} to author prompts for ${profile.label}.`,
    "The user may provide only a short goal. You must infer the missing structure and rewrite it into a production-ready prompt for the selected model.",
    "Return only the final prompt. Do not add commentary, markdown fences, or explanations outside the prompt itself.",
    "Make the final prompt explicit about task, context, constraints, output format, and blocking questions.",
    `Model-specific guidance: ${profile.summary}`,
    `What works best: ${profile.worksBest.join(" / ")}`,
    `Avoid: ${profile.avoid.join(" / ")}`
  ].join("\n");
}

function buildPromptTailorLiveUserPrompt({ sourceGoal, internalDraft, profile }) {
  const parts = derivePromptParts(sourceGoal);
  const structuredGoal = parts.structured.goal || parts.title;
  const structuredTasks = parts.structured.tasks || parts.context;
  const structuredResult = parts.structured.result || "원하는 언어, 출력 형식, 검증 기준을 source 안에서 해석하세요.";

  return [
    "[Structured Brief]",
    String(sourceGoal || "").trim() || DEFAULT_TAILOR_INPUT,
    "",
    "[Goal]",
    structuredGoal,
    "",
    "[Must Do]",
    structuredTasks,
    "",
    "[Expected Result]",
    structuredResult,
    "",
    "[Internal Clarification Draft]",
    internalDraft,
    "",
    "[Target]",
    `Rewrite this into the strongest direct-use prompt for ${profile.label}.`,
    "",
    "[Output Rules]",
    "- Preserve the user's actual goal.",
    "- Expand missing structure internally instead of asking the user to write a long prompt.",
    "- Keep the final prompt compact but immediately usable.",
    "- Make the response language explicit if the source implies Korean.",
    "- Include output format and validation rules."
  ].join("\n");
}

function buildPromptForgeLiveSystemPrompt(profile, { sourceProfile, sameModel }) {
  return [
    `You are an expert prompt engineer specializing in ${profile.label}.`,
    "Return only the final production-ready prompt.",
    "Do not add commentary, markdown fences, or explanations outside the prompt itself.",
    `${sameModel ? `The source prompt already targets ${sourceProfile.label}. Refine it to make it more reliable and more explicit.` : `The source prompt was written for ${sourceProfile.label}. Port it so it feels native to ${profile.label}.`}`,
    "Preserve the user's real work objective and tighten scope instead of broadening it.",
    "If failure feedback is provided, incorporate it into the final prompt as retry constraints or quality checks.",
    "Prefer explicit task, context, constraints, output format, validation, and blocking-question rules.",
    `Model-specific guidance: ${profile.summary}`,
    `What works best: ${profile.worksBest.join(" / ")}`,
    `Avoid: ${profile.avoid.join(" / ")}`
  ].join("\n");
}

function buildPromptForgeLiveUserPrompt({ sourcePrompt, repair, templateDraft, sourceProfile, profile, sameModel }) {
  return [
    "[Mode]",
    sameModel ? `Refine this existing ${profile.label} prompt.` : `Port this ${sourceProfile.label} prompt to ${profile.label}.`,
    "",
    "[Source Prompt]",
    String(sourcePrompt || "").trim() || DEFAULT_FORGE_INPUT,
    "",
    repair ? `[Failure Feedback]\n${String(repair).trim()}\n` : "",
    "[Template Draft]",
    templateDraft,
    "",
    "[Target]",
    `Rewrite this into the strongest direct-use prompt for ${profile.label}.`,
    "",
    "[Output Rules]",
    "- Keep the final answer as a single ready-to-use prompt.",
    "- Keep it compact but operational.",
    "- Make the output format and validation logic explicit.",
    "- If the prompt should ask clarifying questions first, include that rule inside the prompt."
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPromptUsageChips(usage) {
  if (!usage) return "";

  const chips = [];
  if (Number.isFinite(Number(usage.input_tokens))) {
    chips.push(`<span class="prompt-chip">${escapeHtml(`in ${usage.input_tokens}`)}</span>`);
  }
  if (Number.isFinite(Number(usage.output_tokens))) {
    chips.push(`<span class="prompt-chip">${escapeHtml(`out ${usage.output_tokens}`)}</span>`);
  }
  if (Number.isFinite(Number(usage.total_tokens))) {
    chips.push(`<span class="prompt-chip">${escapeHtml(`total ${usage.total_tokens}`)}</span>`);
  }
  return chips.join("");
}

function buildPromptFitCheck(prompt, profile, { mode = "tailor", repairProvided = false } = {}) {
  const text = String(prompt || "");
  const checks = [
    {
      label: "목표가 고정돼 있는가",
      pass: /(Primary Objective|User Goal|Task:|<goal>|System goal:|Work objective:)/i.test(text),
      note: "실제 업무 목표가 별도 블록으로 분리돼야 모델이 scope를 덜 넓힙니다."
    },
    {
      label: "출력 형식이 고정돼 있는가",
      pass: /(Output Format|Return format|Final answer format|Final answer schema|<output_format>|Output contract:)/i.test(text),
      note: "표현이 달라도 결과 형식이 있어야 재시도 편차가 줄어듭니다."
    },
    {
      label: "누락 정보 질문 규칙이 있는가",
      pass: /(blocking questions|missing|ask up to 3|누락|질문)/i.test(text),
      note: "모르는 상태에서 억지로 답하지 않게 하는 안전장치입니다."
    },
    {
      label: "검증 또는 위험 기준이 있는가",
      pass: /(validation|risk|검증|리스크|Self-check|Quality Bar|quality_bar)/i.test(text),
      note: "실무 프롬프트는 답변 품질보다 검증 루프가 더 중요합니다."
    }
  ];

  if (profile.promptStyle === "anthropic") {
    checks.push({
      label: "Claude용 XML 구조가 있는가",
      pass: /<role>|<instructions>|<output_format>|<quality_bar>/i.test(text),
      note: "Claude는 맥락과 지시와 형식을 태그로 나누면 안정성이 좋아집니다."
    });
  } else if (profile.promptStyle === "google") {
    checks.push({
      label: "Gemini용 example / context 순서가 있는가",
      pass: /(Mini example|Example answer shape|Context:)/i.test(text),
      note: "Gemini는 명확한 지시와 예시, 응답 형식 조합이 잘 먹습니다."
    });
  } else if (profile.promptStyle === "deepseek") {
    checks.push({
      label: "Reasoning 단계와 final schema가 분리됐는가",
      pass: /(Reasoning checklist|Reasoning steps|Final answer schema|Final answer format)/i.test(text),
      note: "DeepSeek 계열은 thinking lane과 최종 출력 스키마를 분리하는 편이 안전합니다."
    });
  } else if (profile.promptStyle === "qwen") {
    checks.push({
      label: "Repo-aware contract가 있는가",
      pass: /(repo|file scope|Output contract|Execution rules)/i.test(text),
      note: "오픈모델 코딩 스택은 파일/명령/결과 형식을 더 분명히 고정해야 합니다."
    });
  } else {
    checks.push({
      label: "성공 기준이 explicit한가",
      pass: /(Quality Bar|Self-check|success|validation criteria|검증 기준)/i.test(text),
      note: "OpenAI 계열은 명시적 quality bar와 eval-friendly contract가 유리합니다."
    });
  }

  if (mode === "forge") {
    checks.push({
      label: "재작업 힌트가 반영됐는가",
      pass: repairProvided ? /(Failure Feedback|repair_feedback|Known failure|Previous failure|Failure feedback to fix)/i.test(text) : true,
      note: "문제가 안 풀렸던 이유를 같이 넣어야 재시도 prompt 품질이 올라갑니다."
    });
  }

  const passed = checks.filter((check) => check.pass).length;
  const score = Math.round((passed / checks.length) * 100);
  const label = score >= 88 ? "Strong Fit" : score >= 72 ? "Usable Fit" : "Needs More Structure";
  const summary = score >= 88
    ? "선택한 모델 문법에 거의 맞습니다."
    : score >= 72
      ? "실무 사용은 가능하지만 형식 고정이나 검증 루프를 더 넣는 편이 좋습니다."
      : "모델별 문법 힌트가 아직 약합니다. 구조를 더 고정하는 것이 좋습니다.";

  return {
    score,
    label,
    summary,
    checks,
    note: "실제 API 실행 테스트는 계정 연결이 필요합니다. 현재 점수는 공식 prompt guide 기반 lint입니다."
  };
}

function buildPromptInputGuide(rawText, profile, { mode = "tailor", repairProvided = false } = {}) {
  const parts = derivePromptParts(rawText);
  const checks = mode === "forge"
    ? [
        {
          label: "원본 목적",
          pass: parts.cleaned.length >= 24,
          note: "이 프롬프트가 원래 무엇을 하려던 건지 한두 문장으로 보이면 충분합니다."
        },
        {
          label: "실패 피드백",
          pass: repairProvided,
          note: "이전 답변이 왜 안 먹혔는지 적어야 정교화 품질이 올라갑니다."
        },
        {
          label: "결과 방향",
          pass: parts.wantsFormat || parts.wantsVerification || parts.mentionsRepo,
          note: "출력 형식, 검증 기준, 파일 범위 중 하나라도 있으면 훨씬 안정적입니다."
        }
      ]
    : [
        {
          label: "목표",
          pass: Boolean(String(parts.structured.goal || "").trim()),
          note: "무엇을 해결할지 한 줄로 고정해야 합니다."
        },
        {
          label: "해야할 일",
          pass: Boolean(String(parts.structured.tasks || "").trim()),
          note: "모델이 반드시 수행해야 하는 액션을 적어야 합니다."
        },
        {
          label: "결과",
          pass: Boolean(String(parts.structured.result || "").trim()),
          note: "언어, 출력 형식, 검증 기준을 결과 칸에 적어야 합니다."
        }
      ];

  const passed = checks.filter((check) => check.pass).length;
  const score = Math.round((passed / checks.length) * 100);
  const label = score >= 85 ? "Strong Base" : score >= 60 ? "Usable Structure" : "Needs More Structure";
  const tone = score >= 85 ? "success" : score >= 60 ? "info" : "warn";
  return { label, tone, checks };
}

function getPromptGuideFixExample(check) {
  const examples = {
    "목표": "예: auth 문제 원인을 찾고 바로 손댈 수정 방향까지 정리해줘.",
    "해야할 일": "예: - 취약 지점 찾기 - 파일 범위 제안 - 테스트 항목 제안",
    "결과": "예: 한국어, bullet 5개, 마지막에 검증/리스크 포함",
    "원본 목적": "예: 이 프롬프트는 auth 취약점 진단과 수정 방향 제시가 목적이야.",
    "실패 피드백": "예: 이전 답변은 너무 길었고 파일 경로가 빠졌어.",
    "결과 방향": "예: 짧은 bullet 구조로, 수정 범위와 검증 기준까지 넣어줘."
  };

  return examples[check.label] || check.note;
}

function buildPromptInputGuideStripMarkup(guide) {
  return `
    <section class="prompt-guide-strip prompt-guide-strip-minimal">
      <div class="prompt-guide-row">
        ${guide.checks
          .map(
            (check) => `
              <div class="prompt-guide-pill ${check.pass ? "pass" : "warn"}" data-guide-tip="${escapeAttr(`${check.note} ${getPromptGuideFixExample(check)}`)}">
                <span class="material-symbols-outlined">${check.pass ? "check_circle" : "priority_high"}</span>
                <strong>${escapeHtml(check.label)}</strong>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function buildPromptModelGuideStripMarkup(profile, modeLabel = "") {
  const guideItems = profile.worksBest.slice(0, 3);
  return `
    <section class="prompt-guide-strip">
      <div class="prompt-guide-row">
        <span class="prompt-guide-label">${escapeHtml(`${profile.label}에서 잘 먹는 규칙`)}</span>
        ${modeLabel ? `<span class="prompt-guide-summary info">${escapeHtml(modeLabel)}</span>` : ""}
        ${guideItems
          .map(
            (item) => `
              <div class="prompt-guide-pill pass" data-guide-tip="${escapeAttr(item)}">
                <span class="material-symbols-outlined">check_circle</span>
                <span class="prompt-guide-pill-copy">
                  <strong>${escapeHtml(trimText(item, 30))}</strong>
                  <small>마우스 오버 설명</small>
                </span>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function buildPromptOutputFooterMarkup(profile, version, mode, fit = null) {
  const lead = `${profile.label} MODEL NOTES`;
  const notes = [
    `${profile.label}는 ${profile.summary}`,
    `잘 먹는 방식은 ${profile.worksBest[0].replace(/\.$/, "")} 쪽이고, ${profile.worksBest[1].replace(/\.$/, "")}처럼 구조를 또렷하게 주면 결과가 더 안정적입니다.`,
    `피해야 할 방식은 ${profile.avoid[0].replace(/\.$/, "")} 같은 패턴입니다. ${getKnowledgeCutoffShort(version)} 기준 가이드와 공식 문서를 바탕으로 정리했습니다.`
  ];
  const fitNote = fit ? `${fit.label} ${fit.score} 기준으로 현재 결과는 ${fit.summary}` : "";

  return `
    <article class="panel prompt-model-footer">
      <div class="prompt-footer-head">
        <div>
          <p class="tiny-label">Model Notes</p>
          <h4>${escapeHtml(lead)}</h4>
        </div>
      </div>
      <ul class="prompt-model-notes-list">
        ${notes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        ${fitNote ? `<li>${escapeHtml(fitNote)}</li>` : ""}
      </ul>
      <div class="prompt-source-links">
        ${profile.sources
          .map(
            (source) => `
              <a href="${escapeAttr(source.url)}" target="_blank" rel="noreferrer noopener">
                <span class="material-symbols-outlined">open_in_new</span>
                <span>${escapeHtml(source.label)}</span>
              </a>
            `
          )
          .join("")}
      </div>
    </article>
  `;
}

function buildPromptFitCardMarkup(fit) {
  return `
    <article class="panel prompt-info-card prompt-fit-card">
      <div class="prompt-info-head">
        <div>
          <p class="tiny-label">Prompt Fit Check</p>
          <h4>${escapeHtml(fit.label)}</h4>
        </div>
        <div class="prompt-fit-score">${escapeHtml(`${fit.score}`)}</div>
      </div>
      <p class="registry-explainer">${escapeHtml(fit.summary)}</p>
      <ul class="prompt-check-list">
        ${fit.checks
          .map(
            (check) => `
              <li class="${check.pass ? "pass" : "warn"}">
                <span class="material-symbols-outlined">${check.pass ? "check_circle" : "error"}</span>
                <div>
                  <strong>${escapeHtml(check.label)}</strong>
                  <p>${escapeHtml(check.note)}</p>
                </div>
              </li>
            `
          )
          .join("")}
      </ul>
      <p class="prompt-footnote">${escapeHtml(fit.note)}</p>
    </article>
  `;
}

function buildPromptProfileCardMarkup(profile, version, mode) {
  return `
    <article class="panel prompt-info-card">
      <div class="prompt-info-head">
        <div>
          <p class="tiny-label">${escapeHtml(mode === "tailor" ? "Model Notes" : "Prompt DNA")}</p>
          <h4>${escapeHtml(profile.label)}</h4>
        </div>
        <div class="prompt-model-badge ${escapeAttr(profile.tone)}">${escapeHtml(profile.family)}</div>
      </div>
      <p class="registry-explainer">${escapeHtml(profile.summary)}</p>
      <div class="prompt-note-grid">
        <section>
          <span class="prompt-subtitle">잘 먹는 방식</span>
          <ul class="prompt-mini-list">${profile.worksBest.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </section>
        <section>
          <span class="prompt-subtitle">피할 방식</span>
          <ul class="prompt-mini-list">${profile.avoid.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </section>
      </div>
      <div class="prompt-source-row">
        <span class="prompt-chip">${escapeHtml(getKnowledgeCutoffShort(version))}</span>
        <span class="prompt-chip">${escapeHtml(getRegistryValidationText())}</span>
      </div>
      <div class="prompt-source-links">
        ${profile.sources
          .map(
            (source) => `
              <a href="${escapeAttr(source.url)}" target="_blank" rel="noreferrer noopener">
                <span class="material-symbols-outlined">open_in_new</span>
                <span>${escapeHtml(source.label)}</span>
              </a>
            `
          )
          .join("")}
      </div>
    </article>
  `;
}

function trimText(value, maxLength = 140) {
  const compact = String(value || "").replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function renderAppendix() {
  if (elements.appendixMetricGrid) {
    elements.appendixMetricGrid.innerHTML = `
      <article class="metric-card primary">
        <span class="tiny-label">Registry Reading</span>
        <strong>상세 + 공식 링크</strong>
        <p>Registry 표의 상세 버튼은 이 허브가 정리한 요약 해석이고, 옆 아이콘은 공식 문서나 공식 홈페이지로 바로 이동하는 출처 링크입니다.</p>
      </article>
      <article class="metric-card">
        <span class="tiny-label">Shared Memory Reading</span>
        <strong>협업 전달 구조</strong>
        <p>Shared Memory는 저장소 설명이 아니라 협업 구조 설명입니다. 공통 규칙에서 시작해 공유 결과물과 collaboration packet으로 이어지는 흐름을 보면 됩니다.</p>
      </article>
      <article class="metric-card">
        <span class="tiny-label">Hierarchy Reading</span>
        <strong>manager-linked vs direct</strong>
        <p>Skill Hierarchy에서는 multi-agent-manager-ko가 함께 움직이는 스킬과 독립적으로 직접 호출하는 스킬을 나눠서 보면 실제 운영 흐름이 더 잘 보입니다.</p>
      </article>
    `;
  }
}

function renderSkillDetailPanel() {
  if (!elements.skillDetailPanel) return;

  const skill = arrayOrEmpty(state.skillRegistry.skills).find((item) => item.name === state.activeSkillName);
  if (!skill) {
    elements.skillDetailPanel.innerHTML = "";
    elements.skillDetailPanel.classList.add("skill-detail-panel-hidden");
    elements.skillDetailPanel.setAttribute("aria-hidden", "true");
    return;
  }

  elements.skillDetailPanel.innerHTML = buildSkillDetailPanelMarkup(skill, "desktop");
  elements.skillDetailPanel.classList.remove("skill-detail-panel-hidden");
  elements.skillDetailPanel.setAttribute("aria-hidden", "false");
}

function buildSkillDetailPanelMarkup(skill, mode = "desktop") {
  const stage = arrayOrEmpty(state.skillRegistry.hierarchy).find((item) =>
    arrayOrEmpty(item.members).some((member) => member.name === skill.name)
  );
  const flowMeta = getSkillFlowMeta(skill);
  const relatedSkills = arrayOrEmpty(state.skillRegistry.skills)
    .filter((item) => item.model_target === skill.model_target && item.name !== skill.name)
    .slice(0, 4);
  const handoverItems = getSkillCapabilities(skill).slice(0, 3);
  const flowSteps = [
    { label: "Trigger", note: skill.trigger, icon: "bolt" },
    { label: "Context", note: `${stage?.role || "unknown"} / ${stage?.label || "unassigned"}`, icon: "account_tree" },
    { label: "Memory", note: skill.memory_pattern, icon: "database" },
    { label: "Handover", note: handoverItems[0] || "handover note 없음", icon: "output" }
  ];

  return `
    <article class="skill-detail-hero ${mode === "mobile" ? "mobile" : ""}">
      <div class="skill-detail-hero-head">
        <div>
          <p class="tiny-label">${escapeHtml(mode === "mobile" ? "Selected Skill" : "Pinned Skill Detail")}</p>
          <h4>${escapeHtml(skill.name)}</h4>
        </div>
        <div class="skill-detail-kinds">
          <span class="recommendation-selection-kind ${escapeAttr(flowMeta.id === "direct" ? "tool" : "model")}">${escapeHtml(stage?.role || "specialist")}</span>
          <span class="recommendation-selection-role">${escapeHtml(skill.status)}</span>
        </div>
      </div>
      <p class="skill-detail-description">${escapeHtml(skill.description)}</p>
      <div class="skill-detail-strip">
        <span>${escapeHtml(skill.model_target)}</span>
        <span>${escapeHtml(skill.scope)}</span>
        <span>${escapeHtml(flowMeta.label)}</span>
      </div>
    </article>

    <article class="detail-card skill-flow-board ${mode === "mobile" ? "mobile" : ""}">
      <div class="skill-detail-section-head">
        <span class="material-symbols-outlined">route</span>
        <strong>Execution Flow</strong>
      </div>
      <div class="skill-flow-track">
        ${flowSteps
          .map(
            (step) => `
              <div class="skill-flow-step">
                <div class="skill-flow-icon">
                  <span class="material-symbols-outlined">${escapeHtml(step.icon)}</span>
                </div>
                <div class="skill-flow-copy">
                  <span>${escapeHtml(step.label)}</span>
                  <p>${escapeHtml(step.note)}</p>
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    </article>

    <div class="skill-inspector-grid ${mode === "mobile" ? "mobile" : ""}">
      <article class="detail-card">
        <span class="detail-label">Memory Path</span>
        <div class="detail-value">${escapeHtml(skill.path)}</div>
        <div class="skill-detail-strip compact">
          <span>${escapeHtml(skill.memory_pattern)}</span>
        </div>
      </article>
      <article class="detail-card">
        <span class="detail-label">Handover Deliverables</span>
        <ul class="modal-bullets">${handoverItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
      <article class="detail-card">
        <span class="detail-label">Same Runtime Neighbors</span>
        <div class="skill-neighbor-row">
          ${
            relatedSkills.length
              ? relatedSkills.map((item) => `<span class="skill-neighbor-chip">${escapeHtml(item.name)}</span>`).join("")
              : `<span class="skill-neighbor-chip muted">현재 같은 런타임 이웃 없음</span>`
          }
        </div>
      </article>
    </div>
  `;
}

function openDetailModal(type, id) {
  const modalData = buildModalData(type, id);
  if (!modalData) return;

  elements.modalKicker.textContent = modalData.kicker;
  elements.modalTitle.textContent = modalData.title;
  elements.modalSubtitle.textContent = modalData.subtitle;
  elements.modalBody.innerHTML = modalData.body;
  elements.modal.classList.remove("hidden");
  elements.modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  elements.modal.classList.add("hidden");
  elements.modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function renderConnectionGate() {
  if (!elements.connectionGate) return;
  elements.connectionGate.innerHTML = `
    <article class="connection-card">
      <p class="tiny-label">즉시 개선안</p>
      <strong>로그인 / 동기화는 여기서 직접 채팅하려는 목적이 아니라, “내가 실제로 쓸 수 있는 스택”만 추천에 반영하기 위한 준비 단계입니다.</strong>
      <p>연결된 공급자만 남겨서 추천 후보를 줄이고, 각 모델에 맞는 prompt adapter, install export, handover 경로를 현실적으로 설계할 수 있습니다.</p>
    </article>
    <article class="connection-card">
      <p class="tiny-label">확장 아이디어</p>
      <strong>연결 정보를 쓰면 “내 계정 기준 실제 배포 가능한 조합”, “메모리 handover 가능한 조합”, “비용 아끼는 fallback 조합” 같은 추천을 따로 만들 수 있습니다.</strong>
      <p>즉, 이 허브는 모델 실행기가 아니라 사전 설계기입니다. 어떤 공급자에 로그인돼 있는지 알면 추천 결과를 더 실전형으로 좁힐 수 있습니다.</p>
    </article>
    <article class="connection-card">
      <p class="tiny-label">실험 제안</p>
      <strong>다음 단계로는 연결된 공급자만 기준으로 “즉시 사용 가능”, “추가 결제 필요”, “설치만 하면 됨” 세 그룹으로 나눠 보여줄 수 있습니다.</strong>
      <p>그러면 Project Fit 결과가 단순 추천이 아니라, 바로 실행 가능한 우선순위 보드로 바뀝니다.</p>
    </article>
  `;
}

function renderLiveSyncPanel() {
  if (!elements.liveSyncPanel) return;
  const lastSynced = state.liveSync.lastSyncedAt ? formatTime(state.liveSync.lastSyncedAt) : "not yet";
  const modeLabel = state.liveSync.mode === "local" ? "로컬 Codex watch" : "배포본 poll";
  const statusCopy = {
    idle: "대기 중",
    syncing: "동기화 중",
    updated: "변경 반영됨",
    clean: "변경 없음",
    error: "동기화 오류"
  }[state.liveSync.status] || "대기 중";

  elements.liveSyncPanel.innerHTML = `
    <div class="sync-row">
      <div>
        <p class="tiny-label">Codex Live Sync</p>
        <strong>${escapeHtml(modeLabel)}</strong>
        <p class="table-subtext">로컬 서버에서 Codex가 memory/project 파일을 바꾸면 8초 주기로 다시 읽습니다. 배포본에서는 배포된 파일만 감시합니다.</p>
      </div>
      <div class="sync-status">
        <span class="status-dot"></span>
        <span>${escapeHtml(statusCopy)}</span>
      </div>
    </div>
    <div class="sync-actions">
      <span class="table-subtext">Last sync: ${escapeHtml(lastSynced)}</span>
      <div class="filter-row">
        <button class="sync-button ${state.liveSync.enabled ? "active" : ""}" type="button" data-sync-action="toggle">
          ${state.liveSync.enabled ? "Auto Sync ON" : "Auto Sync OFF"}
        </button>
        <button class="sync-button" type="button" data-sync-action="refresh">지금 갱신</button>
      </div>
    </div>
  `;
}

function buildModalData(type, id) {
  if (type === "layer") {
    return buildLayerModal(id);
  }

  if (type === "node") {
    const node = buildMemoryNodes(arrayOrEmpty(state.projects.projects).filter((project) => project.visibility === "public").length).find((item) => item.id === id);
    if (!node) return null;
    return {
      kicker: "Memory Node",
      title: node.label,
      subtitle: node.summary,
      body: node.details
    };
  }

  if (type === "adapter") {
    const adapter = arrayOrEmpty(state.memory.adapters)[Number(id)];
    if (!adapter) return null;
    return {
      kicker: "Tool Adapter",
      title: adapter.label,
      subtitle: adapter.summary,
      body: `
        <div class="detail-grid">
          <div class="detail-card">
            <span class="detail-label">Tool</span>
            <div class="detail-value">${escapeHtml(adapter.tool)}</div>
          </div>
          <div class="detail-card">
            <span class="detail-label">File</span>
            <div class="detail-value">${escapeHtml(adapter.file)}</div>
          </div>
        </div>
        <div class="detail-card">
          <span class="detail-label">Usage</span>
          <ul class="modal-bullets">${arrayOrEmpty(adapter.usage).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </div>
      `
    };
  }

  if (type === "model") {
    const model = arrayOrEmpty(state.registry.models).find((item) => item.id === id);
    if (!model) return null;
    const officialUrl = getOfficialUrlForModel(model);
    return {
      kicker: "Model Detail",
      title: model.name,
      subtitle: model.summary,
      body: `
        <div class="detail-grid">
          <div class="detail-card">
            <span class="detail-label">Provider</span>
            <div class="detail-value">${escapeHtml(model.provider)}</div>
          </div>
          <div class="detail-card">
            <span class="detail-label">Memory Fit</span>
            <div class="detail-value">${escapeHtml(model.memory_fit)}</div>
          </div>
          <div class="detail-card">
            <span class="detail-label">Registry Validation</span>
            <div class="detail-value">${escapeHtml(getRegistryValidationText())}</div>
          </div>
          <div class="detail-card">
            <span class="detail-label">Official Source</span>
            <div class="detail-value">${officialUrl ? `<a href="${escapeAttr(officialUrl)}" target="_blank" rel="noreferrer noopener">${escapeHtml(officialUrl)}</a>` : "공식 링크 없음"}</div>
          </div>
        </div>
        <div class="detail-card">
          <span class="detail-label">Versions</span>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Context</th>
                  <th>Max Output</th>
                  <th>Knowledge Cutoff</th>
                  <th>Pricing</th>
                  <th>Rate Limit</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                ${arrayOrEmpty(model.versions)
                  .map(
                    (version) => `
                      <tr>
                        <td>${escapeHtml(version.name)}</td>
                        <td>${escapeHtml(version.context_window)}</td>
                        <td>${escapeHtml(version.max_output)}</td>
                        <td>${escapeHtml(getKnowledgeCutoffLabel(version))}</td>
                        <td>${escapeHtml(version.pricing)}</td>
                        <td>${escapeHtml(version.rate_limit)}</td>
                        <td>${escapeHtml(version.access)}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
        <div class="detail-grid">
          <div class="detail-card">
            <span class="detail-label">Strengths</span>
            <ul class="modal-bullets">${arrayOrEmpty(model.strengths).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </div>
          <div class="detail-card">
            <span class="detail-label">Weaknesses</span>
            <ul class="modal-bullets">${arrayOrEmpty(model.weaknesses).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </div>
        </div>
      `
    };
  }

  if (type === "tool") {
    const tool = arrayOrEmpty(state.registry.tools).find((item) => item.id === id);
    if (!tool) return null;
    const guide = getInstallGuide(tool.id);
    const officialUrl = getOfficialUrlForTool(tool);
    return {
      kicker: "Tool Detail",
      title: tool.name,
      subtitle: tool.summary,
      body: `
        <div class="detail-grid">
          <div class="detail-card">
            <span class="detail-label">Class / Release</span>
            <div class="detail-value">${escapeHtml(`${tool.class} / ${tool.release_channel}`)}</div>
          </div>
          <div class="detail-card">
            <span class="detail-label">Login / Quota</span>
            <div class="detail-value">${escapeHtml(`${tool.login_required} / ${tool.quota_notes}`)}</div>
          </div>
          <div class="detail-card">
            <span class="detail-label">Registry Validation</span>
            <div class="detail-value">${escapeHtml(getRegistryValidationText())}</div>
          </div>
          <div class="detail-card">
            <span class="detail-label">Official Source</span>
            <div class="detail-value">${officialUrl ? `<a href="${escapeAttr(officialUrl)}" target="_blank" rel="noreferrer noopener">${escapeHtml(officialUrl)}</a>` : "공식 링크 없음"}</div>
          </div>
        </div>
        <div class="detail-card">
          <span class="detail-label">Best With</span>
          <div class="detail-value">${escapeHtml(arrayOrEmpty(tool.best_with).join(" / "))}</div>
        </div>
        <div class="detail-card">
          <span class="detail-label">Install Flow</span>
          ${buildInstallFlowMarkup(guide.steps)}
        </div>
        <div class="detail-grid">
          <div class="detail-card">
            <span class="detail-label">Strengths</span>
            <ul class="modal-bullets">${arrayOrEmpty(tool.strengths).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </div>
          <div class="detail-card">
            <span class="detail-label">Weaknesses</span>
            <ul class="modal-bullets">${arrayOrEmpty(tool.weaknesses).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </div>
        </div>
        <div class="detail-card">
          <span class="detail-label">Memory Bridge</span>
          <div class="detail-value">${escapeHtml(tool.memory_bridge)}</div>
        </div>
      `
    };
  }

  if (type === "skill") {
    const skill = arrayOrEmpty(state.skillRegistry.skills)[Number(id)];
    if (!skill) return null;
    return {
      kicker: "Skill Detail",
      title: skill.name,
      subtitle: skill.description,
      body: `
        <div class="detail-grid">
          <div class="detail-card">
            <span class="detail-label">Runtime</span>
            <div class="detail-value">${escapeHtml(skill.model_target)}</div>
          </div>
          <div class="detail-card">
            <span class="detail-label">Status</span>
            <div class="detail-value">${escapeHtml(skill.status)}</div>
          </div>
          <div class="detail-card">
            <span class="detail-label">Role / Scope</span>
            <div class="detail-value">${escapeHtml(`${skill.role} / ${skill.scope}`)}</div>
          </div>
          <div class="detail-card">
            <span class="detail-label">Memory Pattern</span>
            <div class="detail-value">${escapeHtml(skill.memory_pattern)}</div>
          </div>
        </div>
        <div class="detail-card">
          <span class="detail-label">Trigger</span>
          <div class="detail-value">${escapeHtml(skill.trigger)}</div>
        </div>
        <div class="detail-card">
          <span class="detail-label">Path</span>
          <div class="detail-value">${escapeHtml(skill.path)}</div>
        </div>
      `
    };
  }

  return null;
}

function buildLayerModal(layerName) {
  if (layerName === "Canonical Memory") {
    return {
      kicker: "Memory Layer",
      title: "Canonical Memory",
      subtitle: "사용자 성향, 업무 스타일, 기술 선호, 장기 방향의 단일 기준점",
      body: `
        <div class="detail-grid">
          <div class="detail-card">
            <span class="detail-label">User Snapshot</span>
            <div class="detail-value">${escapeHtml(state.memory.user_profile.one_line)}</div>
          </div>
          <div class="detail-card">
            <span class="detail-label">Current Focus</span>
            <ul class="modal-bullets">${arrayOrEmpty(state.memory.current_focus).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </div>
        </div>
        <div class="detail-grid">
          <div class="detail-card">
            <span class="detail-label">Communication Style</span>
            <ul class="modal-bullets">${arrayOrEmpty(state.memory.user_profile.communication_style).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </div>
          <div class="detail-card">
            <span class="detail-label">Working / Technical Preferences</span>
            <ul class="modal-bullets">
              ${arrayOrEmpty(state.memory.user_profile.working_style).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
              ${arrayOrEmpty(state.memory.user_profile.technical_preferences).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </div>
        </div>
      `
    };
  }

  if (layerName === "Project Runtime Registry") {
    return {
      kicker: "Memory Layer",
      title: "Project Runtime Registry",
      subtitle: "RUNTIME BOARD는 여기로 통합했습니다. 프로젝트별 handover bundle과 작업 메모리를 이 레이어에서 관리합니다.",
      body: projectRegistryMarkup()
    };
  }

  if (layerName === "Tool Adapters") {
    return {
      kicker: "Memory Layer",
      title: "Tool Adapters",
      subtitle: "canonical memory를 실제 실행툴 규격으로 안전하게 내려주는 번역층",
      body: `
        <div class="detail-card">
          <span class="detail-label">Adapter Policy</span>
          <div class="detail-value">특정 벤더 전용 메모리에 종속되지 않고, AGENTS.md / CLAUDE.md / GEMINI.md / IDE rules로 동일 컨텍스트를 전달합니다.</div>
        </div>
        <div class="detail-card">
          <span class="detail-label">Rendered Mermaid</span>
          <pre class="modal-code">${escapeHtml(state.memoryProtocolCode || "diagram not rendered yet")}</pre>
        </div>
        <div class="detail-stack">
          ${arrayOrEmpty(state.memory.adapters)
            .map(
              (adapter) => `
                <div class="detail-card">
                  <span class="detail-label">${escapeHtml(adapter.tool)}</span>
                  <div class="detail-value">${escapeHtml(adapter.file)} / ${escapeHtml(arrayOrEmpty(adapter.usage).join(" / "))}</div>
                </div>
              `
            )
            .join("")}
        </div>
      `
    };
  }

  if (layerName === "Model-local Memory") {
    return {
      kicker: "Memory Layer",
      title: "Model-local Memory",
      subtitle: "각 모델 내부 long-term / mid-term / short-term 메모리 규칙",
      body: `
        <div class="detail-grid">
          <div class="detail-card">
            <span class="detail-label">Long-term</span>
            <div class="detail-value">개인화 성향, 선호 컨벤션, 반복되는 업무 패턴</div>
          </div>
          <div class="detail-card">
            <span class="detail-label">Mid-term</span>
            <div class="detail-value">현재 프로젝트 단계, 유지해야 할 결정, 최근 handover 결과</div>
          </div>
          <div class="detail-card">
            <span class="detail-label">Short-term</span>
            <div class="detail-value">지금 보고 있는 파일, 다음 액션, 임시 이슈, 마지막 실행 결과</div>
          </div>
          <div class="detail-card">
            <span class="detail-label">Escalation Rule</span>
            <div class="detail-value">협업자가 알아야 하거나 다음 모델에 꼭 필요한 정보는 Collaboration Packet으로 승격한다.</div>
          </div>
        </div>
      `
    };
  }

  if (layerName === "Collaboration Packet") {
    return {
      kicker: "Memory Layer",
      title: "Collaboration Packet",
      subtitle: "사람과 모델이 같이 읽는 handover package",
      body: `
        <div class="detail-card">
          <span class="detail-label">Must Include</span>
          <ul class="modal-bullets">
            <li>README / 작업 순서 / 다음 액션</li>
            <li>리스크 / 문제점 / 수정 금지 원본</li>
            <li>planner-agent-ko 출력: 목표, 요구사항, 범위, 완료 기준, 오픈 이슈</li>
            <li>idea-agent-ko 출력: 즉시 개선안, 확장 아이디어, 실험 제안, 우선순위</li>
          </ul>
        </div>
        <div class="detail-card">
          <span class="detail-label">Reason</span>
          <div class="detail-value">전역 메모리만으로는 사람이 바로 이어받기 어렵다. 협업 패키지는 실행 순서와 맥락을 인간 친화적으로 묶어주는 층이다.</div>
        </div>
      `
    };
  }

  return null;
}

function projectRegistryMarkup() {
  return `
    <div class="detail-stack">
      ${arrayOrEmpty(state.projects.projects)
        .map(
          (project) => `
            <div class="detail-card">
              <div class="detail-grid">
                <div>
                  <span class="detail-label">Project</span>
                  <div class="detail-value">${escapeHtml(project.name)} / ${escapeHtml(project.stage || project.status)}</div>
                </div>
                <div>
                  <span class="detail-label">Runtime</span>
                  <div class="detail-value">${escapeHtml(project.runtime)}</div>
                </div>
                <div>
                  <span class="detail-label">Working Memory</span>
                  <div class="detail-value">${escapeHtml(project.working_memory || project.location)}</div>
                </div>
                <div>
                  <span class="detail-label">Next Model</span>
                  <div class="detail-value">${escapeHtml(project.next_model || "TBD")}</div>
                </div>
              </div>
              <div class="detail-card" style="margin-top:12px;">
                <span class="detail-label">Handover Brief</span>
                <div class="detail-value">${escapeHtml(project.handover_brief || project.summary)}</div>
              </div>
              <div class="detail-card" style="margin-top:12px;">
                <span class="detail-label">Handover Bundle</span>
                <ul class="modal-bullets">${arrayOrEmpty(project.handover_bundle).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
              </div>
              <div class="detail-card" style="margin-top:12px;">
                <span class="detail-label">Risk</span>
                <div class="detail-value">${escapeHtml(project.risk || "no major risk recorded")}</div>
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function buildMemoryNodes(publicProjectCount) {
  return [
    {
      id: "shared-governance",
      label: "Shared Rules",
      summary: "모든 모델과 협업자가 공통으로 따라야 하는 읽기 / 쓰기 / 무시 규칙",
      classification: "공통 규칙",
      source: "AGENTS.md + source_of_truth.md",
      readWhen: "새 프로젝트 시작 / 모델 전환 직전",
      updateWhen: "규칙 변경 / 금지사항 추가 / 정책 수정",
      ignoreWhen: "없음. 항상 최신 기준 우선",
      access: "shared / read-first",
      details: `
        <div class="detail-card">
          <span class="detail-label">Rule Set</span>
          <ul class="modal-bullets">
            <li>먼저 공통 규칙을 읽고 그 다음 관련 프로젝트 기록을 읽는다.</li>
            <li>전환 전에 next action, blocker, decision, risk를 shared hub에 올린다.</li>
            <li>오래된 temp note, 이미 해결된 임시 로그, provider 전용 secret은 기본 주입에서 제외한다.</li>
          </ul>
        </div>
      `
    },
    {
      id: "shared-project-records",
      label: "Shared Project Records",
      summary: `공개 ${publicProjectCount}개 포함, 프로젝트 상태 / decision / risk / next action을 함께 보는 기록`,
      classification: "공유 결과물",
      source: "data/projects.json + manager_memory",
      readWhen: "관련 프로젝트를 시작하거나 이어받을 때",
      updateWhen: "단계 변경 / 결정 / blocker / 다음 액션 발생 시",
      ignoreWhen: "현재 프로젝트와 무관한 오래된 프로젝트 기록",
      access: "shared / read-write",
      details: projectRegistryMarkup()
    },
    {
      id: "model-local-memory",
      label: "Model Working Memory",
      summary: "각 모델이 내부적으로 유지하는 long-term / mid-term / short-term 작업 메모리",
      classification: "모델 내부",
      source: "provider local context / active session",
      readWhen: "해당 모델이 작업을 시작할 때",
      updateWhen: "파일 진행 상태 / 실행 결과 / 임시 메모 변경 시",
      ignoreWhen: "다른 모델에게 직접 넘길 때는 그대로 복사하지 않음",
      access: "local only",
      details: `
        <div class="detail-grid">
          <div class="detail-card">
            <span class="detail-label">Long-term</span>
            <div class="detail-value">성향, 선호 컨벤션, 반복 패턴</div>
          </div>
          <div class="detail-card">
            <span class="detail-label">Mid-term</span>
            <div class="detail-value">현재 프로젝트 맥락, 유지할 결정</div>
          </div>
          <div class="detail-card">
            <span class="detail-label">Short-term</span>
            <div class="detail-value">active file, last action, temp issue</div>
          </div>
          <div class="detail-card">
            <span class="detail-label">Promotion Rule</span>
            <div class="detail-value">다른 모델이나 사람이 알아야 하는 내용만 shared records 또는 collaboration packet으로 승격한다.</div>
          </div>
        </div>
      `
    },
    {
      id: "private-personalization",
      label: "Private Personalization",
      summary: "개인 취향, 말투, 디자인/업무 감각처럼 자동 공개하지 않는 비공개 영역",
      classification: "비공개 개인화",
      source: "memory_profile.json",
      readWhen: "허용된 개인화가 필요한 경우에만",
      updateWhen: "장기 선호나 개인화 결과가 변할 때",
      ignoreWhen: "공용 handover에서 기본값으로는 제외",
      access: "private / opt-in",
      details: `
        <div class="detail-card">
          <span class="detail-label">Private Contents</span>
          <ul class="modal-bullets">
            <li>${escapeHtml(state.memory.user_profile.one_line)}</li>
            ${arrayOrEmpty(state.memory.user_profile.communication_style).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            ${arrayOrEmpty(state.memory.user_profile.technical_preferences).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </div>
      `
    },
    {
      id: "collaboration-packet",
      label: "Collaboration Packet",
      summary: `사람과 다음 모델이 바로 이어받을 수 있게 만든 handover 묶음`,
      classification: "협업 전달",
      source: "README + handover brief + adapter exports",
      readWhen: "사람이나 다른 모델이 이어받을 때",
      updateWhen: "handover 직전 / 프로젝트 milestone 직후",
      ignoreWhen: "같은 모델 내부에서만 짧게 반복 작업할 때",
      access: "shared / export",
      details: `
        <div class="detail-card">
          <span class="detail-label">Bundle</span>
          <ul class="modal-bullets">
            <li>README / 작업 순서 / 다음 액션</li>
            <li>리스크 / 이슈 로그 / handover brief</li>
            <li>planner-agent-ko / idea-agent-ko 출력 요약</li>
            <li>${arrayOrEmpty(state.memory.adapters).map((adapter) => escapeHtml(adapter.file)).join(" / ")}</li>
          </ul>
        </div>
      `
    }
  ];
}

function buildMemoryProtocolCode() {
  return [
    "flowchart LR",
    '  Start["Any Model / Any Collaborator"] --> Rules["Common Rules\\nread-first contract"]',
    '  Planner["planner-agent-ko"] --> Records["Shared Project Records\\ngoal / stage / issues / decisions"]',
    '  Architect["architect-agent-ko"] --> Records',
    '  Idea["idea-agent-ko"] --> Records',
    '  Rules --> Records',
    '  Private["Private Vault\\nstyle / work preference / user dossier"] -. opt-in only .-> Records',
    '  Local["Model-local Memory\\nlong-term / mid-term / short-term"] -. promote only .-> Records',
    '  Records --> Prompt["Prompt Adapter\\nprompt-personalization-ko"]',
    '  Prompt --> Adapters["Adapter Exports\\nAGENTS / CLAUDE / GEMINI / IDE Rules"]',
    '  Records --> Packet["Collaboration Packet\\nREADME / next action / risk / brief"]',
    '  Adapters --> NextModel["Next Model / Tool Runtime"]',
    '  Packet --> Human["Reviewer / Next Collaborator"]',
    '  Packet --> NextModel',
    '  Ignore["Ignore\\nstale temp notes / solved old issues / provider-only secrets"] -. filtered out .-> Packet',
    '  classDef input fill:#ffffff,stroke:#a7aabd,color:#424656,stroke-width:1.5px;',
    '  classDef shared fill:#edf4fd,stroke:#0b70d8,color:#243f67,stroke-width:2px;',
    '  classDef private fill:#fde8ee,stroke:#cd385d,color:#6e2439,stroke-width:2px;',
    '  classDef export fill:#f2f3f7,stroke:#a7aabd,color:#424656,stroke-width:2px;',
    '  class Start,Planner,Architect,Idea input;',
    '  class Rules,Records shared;',
    '  class Private,Local private;',
    '  class Prompt,Adapters,Packet,NextModel,Human export;',
    '  class Ignore input;',
    '  linkStyle 0,1,2,3,4 stroke:#0b70d8,stroke-width:2px;',
    '  linkStyle 5,6 stroke:#cd385d,stroke-width:2px,stroke-dasharray:6 4;',
    '  linkStyle 7,8,10 stroke:#a7aabd,stroke-width:2px;',
    '  linkStyle 9,11,12 stroke:#a7aabd,stroke-width:2px;',
    '  linkStyle 13 stroke:#a7aabd,stroke-width:2px,stroke-dasharray:5 4;'
  ].join("\n");
}

async function renderMermaidDiagram(container, code) {
  if (!container) return;
  if (!code) {
    container.innerHTML = "";
    return;
  }

  if (!window.mermaid) {
    container.innerHTML = `<pre class="modal-code">${escapeHtml(code)}</pre>`;
    return;
  }

  try {
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: "base",
      themeVariables: getMermaidThemeVariables()
    });
    const renderId = `memory-diagram-${Date.now()}`;
    const { svg } = await window.mermaid.render(renderId, code);
    container.innerHTML = svg;
  } catch (error) {
    console.error(error);
    container.innerHTML = `<pre class="modal-code">${escapeHtml(code)}</pre>`;
  }
}

function getMermaidThemeVariables() {
  const dark = document.body.dataset.theme === "dark";
  return {
    primaryColor: dark ? "#27364c" : "#edf4fd",
    primaryTextColor: dark ? "#f2f3f7" : "#424656",
    primaryBorderColor: "#0b70d8",
    lineColor: dark ? "#c7cad7" : "#a7aabd",
    secondaryColor: dark ? "#403441" : "#f4f5f9",
    tertiaryColor: dark ? "#242937" : "#ffffff",
    fontFamily: "Inter, sans-serif",
    background: dark ? "#242937" : "#ffffff"
  };
}

function buildInstallFlowMarkup(steps) {
  return `
    <div class="install-flow">
      ${arrayOrEmpty(steps)
        .map(
          (step, index) => `
            <article class="install-step">
              <span class="install-step-index">${String(index + 1).padStart(2, "0")}</span>
              <strong>${escapeHtml(getInstallStepLabel(step, index))}</strong>
              <p>${escapeHtml(step)}</p>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function getInstallStepLabel(step, index) {
  const normalized = normalize(step);
  if (normalized.includes("install") || normalized.includes("설치")) return index === 0 ? "설치 준비" : "설치";
  if (normalized.includes("login") || normalized.includes("로그인") || normalized.includes("api key")) return "인증";
  if (normalized.includes("agents.md") || normalized.includes("claude.md") || normalized.includes("gemini.md") || normalized.includes("rules")) return "메모리 연결";
  if (normalized.includes("open") || normalized.includes("다운로드")) return "다운로드";
  return `단계 ${index + 1}`;
}

function getSkillCapabilities(skill) {
  const capabilitiesByScope = {
    planning: ["목표 / 요구사항 / 범위 정리", "완료 기준과 오픈 이슈 명시", "handover에 남길 기준선 정의"],
    idea: ["즉시 개선안 정리", "확장 아이디어와 실험안 제시", "우선순위와 근거를 handover에 남김"],
    architecture: ["구조 / 인터페이스 / 리스크 정리", "설계 리뷰 포인트 기록", "다음 구현 단계의 제약조건 남김"],
    implementation: ["코드 변경과 검증 결과 기록", "현재 active task 상태 정리", "다음 실행 액션 남김"],
    qa: ["결함 / 품질 게이트 / 테스트 결과 기록", "재현 조건과 남은 위험 기록", "다음 검증 포인트 전달"],
    design: ["레이아웃 / 토큰 / 톤앤매너 정리", "반응형 제약과 시각 기준 기록", "디자인 handoff 메모 남김"],
    persona: ["대화 톤 / 페르소나 가이드 유지", "표현 스타일 차이 기록", "개인화 허용 범위 표시"],
    "tool-recommendation": ["모델 / 툴 / 설치 조합 추천", "리밋 / 비용 / 로그인 조건 요약", "메모리 브리지 구조 제안"],
    "global-management": ["전문가 역할 조율", "장기 / 중기 / 단기 메모리 분배", "최종 handover 구조 통합"],
    prompt: ["개인화 프롬프트 설계", "장기/단기 프롬프트 분리", "토큰 절약 규칙 기록"],
    data: ["지표 / SQL / 분석 가설 정리", "데이터 검증 결과 기록", "보고용 인사이트 전달"],
    business: ["시장성 / GTM / 우선순위 정리", "사업 관점의 위험 기록", "기획/개발 산출물 재정렬"]
  };
  return capabilitiesByScope[skill.scope] || ["설명 / 트리거 / 메모리 패턴 기록", "handover에 필요한 핵심 포인트 정리"];
}

function getSkillFlowMeta(skill) {
  if (!skill) {
    return { id: "unknown", label: "unclassified", shortLabel: "unknown" };
  }

  if (skill.role === "manager") {
    return { id: "manager-core", label: "multi-agent-manager-ko root layer", shortLabel: "manager core" };
  }

  if (skill.role === "advisor") {
    return { id: "advisor", label: "advisor / direct recommendation lane", shortLabel: "advisor" };
  }

  if (String(skill.description || "").includes("multi-agent-manager-ko")) {
    return { id: "manager-linked", label: "multi-agent-manager-ko linked specialist", shortLabel: "manager-linked" };
  }

  return { id: "direct", label: "direct / standalone specialist", shortLabel: "direct" };
}

function getInitialSection() {
  const allowed = ["home", "memory", "personalization", "registry", "skills", "prompt-tailor", "prompt-forge"];
  const hash = window.location.hash.replace("#", "");
  return allowed.includes(hash) ? hash : "home";
}

function activateSection(sectionId, { pushHash = false } = {}) {
  const targetId = sectionId || "home";
  const previousSection = state.activeSection;
  if (previousSection && previousSection !== targetId && isPromptSection(previousSection)) {
    clearPromptSecrets();
  }
  state.activeSection = targetId;

  document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    const isActive = panel.dataset.tabPanel === targetId;
    panel.classList.toggle("active-pane", isActive);
    if (isActive) {
      panel.scrollTop = 0;
    }
  });

  syncActiveLinks(targetId);

  window.requestAnimationFrame(() => {
    scrollActiveViewToTop(targetId, pushHash ? "smooth" : "auto");
  });

  if (pushHash) {
    window.history.replaceState(null, "", `#${targetId}`);
  }
}

function isPromptSection(sectionId) {
  return sectionId === "prompt-tailor" || sectionId === "prompt-forge";
}

function scrollActiveViewToTop(sectionId, behavior = "auto") {
  const activePanel = document.querySelector(`[data-tab-panel="${sectionId}"]`);
  activePanel?.scrollTo?.({ top: 0, behavior });
  elements.contentShell?.scrollTo?.({ top: 0, behavior });
  window.scrollTo?.({ top: 0, behavior });
}

function syncActiveLinks(sectionId) {
  document.querySelectorAll('.sidebar-link, .topbar-link, .mobile-link').forEach((link) => {
    const active = link.dataset.sectionTarget === sectionId || link.getAttribute("href") === `#${sectionId}`;
    link.classList.toggle("active", active);
  });
}

function clearPromptSecrets() {
  state.promptTailor.apiKey = "";
  state.promptTailor.alertBubble = "";
  state.promptForge.apiKey = "";
  state.promptForge.alertBubble = "";
  setPromptTailorIdleStatus();
  setPromptForgeIdleStatus();
}

function dismissPromptBubbles(event) {
  const clickedInsideTailor = Boolean(event.target.closest("[data-prompt-bubble-anchor=\"tailor\"]"));
  const clickedInsideForge = Boolean(event.target.closest("[data-prompt-bubble-anchor=\"forge\"]"));
  let changed = false;

  if (!clickedInsideTailor && state.promptTailor.alertBubble) {
    state.promptTailor.alertBubble = "";
    changed = true;
  }

  if (!clickedInsideForge && state.promptForge.alertBubble) {
    state.promptForge.alertBubble = "";
    changed = true;
  }

  if (!changed) return;

  if (state.activeSection === "prompt-tailor") {
    renderPromptTailorSection();
  }
  if (state.activeSection === "prompt-forge") {
    renderPromptForgeSection();
  }
}

function loadPromptHistory() {
  try {
    const raw = JSON.parse(window.localStorage.getItem("llm-tool-hub-prompt-history") || "[]");
    return arrayOrEmpty(raw).filter((item) => item && item.id && item.mode && item.output);
  } catch {
    return [];
  }
}

function persistPromptHistory() {
  window.localStorage.setItem("llm-tool-hub-prompt-history", JSON.stringify(state.promptHistory));
}

function savePromptHistoryEntry(entry) {
  const nextEntry = {
    id: `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...entry
  };
  state.promptHistory = [nextEntry, ...arrayOrEmpty(state.promptHistory)]
    .slice(0, PROMPT_HISTORY_LIMIT);
  persistPromptHistory();
}

function getPromptHistoryEntries(mode) {
  return arrayOrEmpty(state.promptHistory).filter((item) => item.mode === mode);
}

function loadPromptHistoryEntry(entryId) {
  const entry = arrayOrEmpty(state.promptHistory).find((item) => item.id === entryId);
  if (!entry) return;

  if (entry.mode === "tailor") {
    state.promptTailor.modelId = entry.modelId || state.promptTailor.modelId;
    state.promptTailor.input = entry.input || "";
    state.promptTailor.output = entry.output || "";
    state.promptTailor.fit = entry.fit || null;
    state.promptTailor.usage = entry.usage || null;
    state.promptTailor.liveTone = "success";
    state.promptTailor.liveStatus = "이전 변환 결과를 불러왔습니다.";
    activateSection("prompt-tailor", { pushHash: true });
    renderPromptTailorSection();
    return;
  }

  if (entry.mode === "forge") {
    state.promptForge.sourceModelId = entry.sourceModelId || state.promptForge.sourceModelId;
    state.promptForge.modelId = entry.modelId || state.promptForge.modelId;
    state.promptForge.input = entry.input || "";
    state.promptForge.repair = entry.repair || "";
    state.promptForge.output = entry.output || "";
    state.promptForge.fit = entry.fit || null;
    state.promptForge.usage = entry.usage || null;
    state.promptForge.apiKey = "";
    state.promptForge.alertBubble = "";
    state.promptForge.liveTone = "success";
    state.promptForge.liveStatus = "이전 정교화/포팅 결과를 불러왔습니다. Target Model API Key는 다시 입력해야 합니다.";
    activateSection("prompt-forge", { pushHash: true });
    renderPromptForgeSection();
  }
}

function deletePromptHistoryEntry(entryId) {
  state.promptHistory = arrayOrEmpty(state.promptHistory).filter((item) => item.id !== entryId);
  persistPromptHistory();
  if (state.activeSection === "prompt-tailor") renderPromptTailorSection();
  if (state.activeSection === "prompt-forge") renderPromptForgeSection();
}

function clearPromptHistory(mode) {
  state.promptHistory = arrayOrEmpty(state.promptHistory).filter((item) => item.mode !== mode);
  persistPromptHistory();
  if (state.activeSection === "prompt-tailor") renderPromptTailorSection();
  if (state.activeSection === "prompt-forge") renderPromptForgeSection();
}

function getInstallGuide(toolId) {
  const guideMap = state.installMatrix?.tools?.[toolId] || {};
  return guideMap[state.environment] || guideMap.web || { mode: "manual review", steps: ["설치 가이드 수동 검토 필요"] };
}

function resolveToolId(label) {
  const rules = [
    { test: /codex/i, id: "codex-cli" },
    { test: /claude code/i, id: "claude-code" },
    { test: /gemini cli/i, id: "gemini-cli" },
    { test: /cursor/i, id: "cursor" },
    { test: /windsurf/i, id: "windsurf" },
    { test: /cline/i, id: "cline" },
    { test: /aider/i, id: "aider" },
    { test: /continue/i, id: "continue" },
    { test: /openhands/i, id: "openhands" },
    { test: /ollama/i, id: "ollama" },
    { test: /lm studio/i, id: "lm-studio" },
    { test: /openrouter/i, id: "openrouter" },
    { test: /openclaw/i, id: "openclaw" }
  ];
  const matched = rules.find((rule) => rule.test.test(label));
  return matched?.id || "codex-cli";
}

function buildProviderCards() {
  const providers = new Map();

  arrayOrEmpty(state.registry.models).forEach((model) => {
    const providerKey = getModelProviderKey(model.provider);
    const entry = providers.get(providerKey) || {
      key: providerKey,
      label: PROVIDER_META[providerKey]?.label || model.provider,
      loginUrl: PROVIDER_META[providerKey]?.loginUrl || "",
      note: PROVIDER_META[providerKey]?.note || model.summary,
      sessionPurpose: PROVIDER_META[providerKey]?.sessionPurpose || model.memory_fit,
      versions: [],
      loginRequired: false,
      connected: Boolean(state.authStatus[providerKey])
    };
    const primaryVersion = getPrimaryVersion(model);
    entry.versions.push(primaryVersion?.name || model.name);
    entry.loginRequired = entry.loginRequired || String(primaryVersion?.login_required || "").toLowerCase().includes("yes");
    providers.set(providerKey, entry);
  });

  [
    { key: "cursor", label: "Cursor" },
    { key: "windsurf", label: "Windsurf" },
    { key: "openrouter", label: "OpenRouter" }
  ].forEach((extra) => {
    if (providers.has(extra.key)) return;
    providers.set(extra.key, {
      key: extra.key,
      label: PROVIDER_META[extra.key].label,
      loginUrl: PROVIDER_META[extra.key].loginUrl,
      note: PROVIDER_META[extra.key].note,
      sessionPurpose: PROVIDER_META[extra.key].sessionPurpose,
      versions: [PROVIDER_META[extra.key].label],
      loginRequired: true,
      connected: Boolean(state.authStatus[extra.key])
    });
  });

  return Array.from(providers.values()).map((provider) => ({
    ...provider,
    versions: [...new Set(provider.versions)].slice(0, 4)
  })).sort((left, right) => {
    const order = ["openai", "anthropic", "google", "cursor", "windsurf", "openrouter", "deepseek", "mistral", "qwen", "cohere", "xai", "meta", "local"];
    const leftIndex = order.includes(left.key) ? order.indexOf(left.key) : 999;
    const rightIndex = order.includes(right.key) ? order.indexOf(right.key) : 999;
    return leftIndex - rightIndex;
  });
}

function getProviderSyncState(providerKey) {
  const value = state.providerSync[providerKey];
  return {
    enabled: Boolean(value?.enabled),
    lastSyncedAt: value?.lastSyncedAt || null,
    flashing: Boolean(value?.flashing)
  };
}

function syncProviderMemory(providerKey) {
  const current = getProviderSyncState(providerKey);
  state.providerSync[providerKey] = {
    ...current,
    enabled: current.enabled || Boolean(state.authStatus[providerKey]),
    lastSyncedAt: new Date().toISOString(),
    flashing: true
  };
  persistProviderSyncState();
  renderHomeSummary();
  refreshLiveData({ manual: true });
  window.setTimeout(() => {
    const next = getProviderSyncState(providerKey);
    state.providerSync[providerKey] = { ...next, flashing: false };
    persistProviderSyncState();
    renderHomeSummary();
  }, 850);
}

function deriveBackup(playbook) {
  const rules = [
    { test: /codex/i, model: "Claude Sonnet 4", tool: "Claude Code" },
    { test: /claude/i, model: "GPT-5.3-Codex", tool: "Codex CLI" },
    { test: /gemini/i, model: "GPT-5 mini", tool: "Codex CLI" },
    { test: /deepseek/i, model: "Claude Sonnet 4", tool: "Claude Code" },
    { test: /qwen|mistral/i, model: "GPT-5 mini", tool: "Cursor" },
    { test: /grok|o3/i, model: "Gemini 2.5 Pro", tool: "Gemini CLI" },
    { test: /memory layer/i, model: "Claude Sonnet 4", tool: "OpenClaw style agent" }
  ];
  const matched = rules.find((rule) => rule.test.test(playbook.primary_model));
  return matched || { model: "GPT-5 mini", tool: "Cursor" };
}

function sortPlaybooksForSelection(playbooks) {
  return [...playbooks].sort((left, right) => getPriorityScore(right) - getPriorityScore(left));
}

function getPriorityScore(playbook) {
  const scoreMap = {
    cost: {
      "저비용 대량 평가와 자동화": 2.6,
      "오픈모델 기반 프라이빗 스택": 1.8,
      "긴 문서와 로그를 많이 보는 프로젝트": 0.8
    },
    speed: {
      "IDE 안에서 빠르게 돌려보는 웹/앱 개발": 2.5,
      "저비용 대량 평가와 자동화": 1.9,
      "실시간 검색/뉴스/트렌드 의존 작업": 1.5,
      "레포 규모가 큰 실제 코딩 프로젝트": 1.0
    },
    performance: {
      "레포 규모가 큰 실제 코딩 프로젝트": 2.8,
      "설계 품질이 중요한 코드베이스": 2.7,
      "긴 문서와 로그를 많이 보는 프로젝트": 1.8
    },
    privacy: {
      "오픈모델 기반 프라이빗 스택": 3.0,
      "멀티유저 운영 비서 / 메모리 우선 에이전트": 1.3
    },
    memory: {
      "멀티유저 운영 비서 / 메모리 우선 에이전트": 3.0,
      "설계 품질이 중요한 코드베이스": 1.5,
      "레포 규모가 큰 실제 코딩 프로젝트": 1.2
    },
    long_context: {
      "긴 문서와 로그를 많이 보는 프로젝트": 3.0,
      "실시간 검색/뉴스/트렌드 의존 작업": 1.3,
      "설계 품질이 중요한 코드베이스": 0.9
    },
    ide: {
      "IDE 안에서 빠르게 돌려보는 웹/앱 개발": 3.0,
      "레포 규모가 큰 실제 코딩 프로젝트": 1.2,
      "설계 품질이 중요한 코드베이스": 0.8
    },
    ondevice: {
      "오픈모델 기반 프라이빗 스택": 3.0,
      "멀티유저 운영 비서 / 메모리 우선 에이전트": 0.9
    },
    personalization: {
      "멀티유저 운영 비서 / 메모리 우선 에이전트": 2.8,
      "설계 품질이 중요한 코드베이스": 1.2
    },
    multimodal: {
      "긴 문서와 로그를 많이 보는 프로젝트": 1.4,
      "IDE 안에서 빠르게 돌려보는 웹/앱 개발": 1.0,
      "실시간 검색/뉴스/트렌드 의존 작업": 0.9
    }
  };

  return state.selectedPriorities.reduce((total, priorityId) => total + (scoreMap[priorityId]?.[playbook.name] || 0), 0);
}

function loadAuthStatus() {
  try {
    return JSON.parse(window.localStorage.getItem("llm-tool-hub-auth") || "{}");
  } catch {
    return {};
  }
}

function loadProviderSyncState() {
  try {
    return JSON.parse(window.localStorage.getItem("llm-tool-hub-provider-sync") || "{}");
  } catch {
    return {};
  }
}

function consumeAuthFlash() {
  const currentUrl = new URL(window.location.href);
  const auth = currentUrl.searchParams.get("auth");
  const authError = currentUrl.searchParams.get("auth_error");
  const authToken = currentUrl.searchParams.get("auth_token");

  if (!auth && !authError && !authToken) {
    return null;
  }

  currentUrl.searchParams.delete("auth");
  currentUrl.searchParams.delete("auth_error");
  currentUrl.searchParams.delete("auth_token");
  const nextLocation = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
  window.history.replaceState(null, "", nextLocation);

  return {
    auth: auth || "",
    authError: authError || "",
    authToken: authToken || ""
  };
}

async function completeAuthSession(token) {
  try {
    const response = await fetch("/api/auth/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      credentials: "same-origin",
      body: JSON.stringify({ token })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      return {
        ok: false,
        authError: "google_failed"
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      authError: "google_failed"
    };
  }
}

async function fetchAuthSession() {
  try {
    const response = await fetch("/api/auth/session", {
      cache: "no-store",
      credentials: "same-origin"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        configured: false,
        authenticated: false,
        method: "",
        user: "",
        email: "",
        picture: "",
        message: payload.message || "세션 상태를 읽지 못했습니다."
      };
    }
    return payload;
  } catch {
    return {
      ok: false,
      configured: false,
      authenticated: false,
      method: "",
      user: "",
      email: "",
      picture: "",
      message: "인증 서버에 연결하지 못했습니다."
    };
  }
}

function getPromptManagedLabel() {
  return String(state.promptAccess.managedLabel || "Service-managed model").trim() || "Service-managed model";
}

function resetPromptAccessState() {
  state.promptAccess = {
    ...state.promptAccess,
    loaded: true,
    loading: false,
    authenticated: false,
    plan: "free",
    freeLimit: 3,
    freeUsed: 0,
    freeRemaining: 3,
    monthlyLimit: 300,
    monthlyUsed: 0,
    monthlyRemaining: 300,
    charLimit: 2000,
    proMonthlyUsd: 4.99,
    proYearlyUsd: 39,
    tokenBalance: 0,
    tokenSpent: 0,
    lastChargeTokens: 0,
    billingUnitTokens: 1000,
    pricePer1kTokensUsd: 3,
    canUse: false,
    checkoutUrl: "",
    managedLabel: "Service-managed model",
    message: "로그인 후 무료 3회까지 바로 사용할 수 있습니다.",
    upgradeCode: ""
  };
}

function applyPromptAccessStatus(payload = {}) {
  state.promptAccess.loaded = true;
  state.promptAccess.loading = false;
  state.promptAccess.authenticated = Boolean(payload.authenticated);
  state.promptAccess.plan = String(payload.plan || "free").trim() || "free";
  state.promptAccess.freeLimit = Number.isFinite(Number(payload.free_limit)) ? Number(payload.free_limit) : 3;
  state.promptAccess.freeUsed = Number.isFinite(Number(payload.free_used)) ? Number(payload.free_used) : 0;
  state.promptAccess.freeRemaining = Number.isFinite(Number(payload.free_remaining))
    ? Number(payload.free_remaining)
    : Math.max(0, state.promptAccess.freeLimit - state.promptAccess.freeUsed);
  state.promptAccess.monthlyLimit = Number.isFinite(Number(payload.monthly_limit)) ? Number(payload.monthly_limit) : 300;
  state.promptAccess.monthlyUsed = Number.isFinite(Number(payload.monthly_used)) ? Number(payload.monthly_used) : 0;
  state.promptAccess.monthlyRemaining = Number.isFinite(Number(payload.monthly_remaining))
    ? Number(payload.monthly_remaining)
    : Math.max(0, state.promptAccess.monthlyLimit - state.promptAccess.monthlyUsed);
  state.promptAccess.charLimit = Number.isFinite(Number(payload.char_limit)) ? Number(payload.char_limit) : 2000;
  state.promptAccess.proMonthlyUsd = Number.isFinite(Number(payload.pro_monthly_usd)) ? Number(payload.pro_monthly_usd) : 4.99;
  state.promptAccess.proYearlyUsd = Number.isFinite(Number(payload.pro_yearly_usd)) ? Number(payload.pro_yearly_usd) : 39;
  state.promptAccess.tokenBalance = Number.isFinite(Number(payload.token_balance)) ? Number(payload.token_balance) : 0;
  state.promptAccess.tokenSpent = Number.isFinite(Number(payload.token_spent)) ? Number(payload.token_spent) : 0;
  state.promptAccess.lastChargeTokens = Number.isFinite(Number(payload.last_charge_tokens)) ? Number(payload.last_charge_tokens) : 0;
  state.promptAccess.billingUnitTokens = Number.isFinite(Number(payload.billing_unit_tokens)) ? Number(payload.billing_unit_tokens) : 1000;
  state.promptAccess.pricePer1kTokensUsd = Number.isFinite(Number(payload.price_per_1k_tokens_usd)) ? Number(payload.price_per_1k_tokens_usd) : 3;
  state.promptAccess.canUse = Boolean(payload.can_use);
  state.promptAccess.checkoutUrl = String(payload.checkout_url || "").trim();
  state.promptAccess.managedLabel = String(payload.managed_label || "Service-managed model").trim() || "Service-managed model";
  state.promptAccess.message = String(payload.message || "").trim() || "무료 3회까지 바로 사용할 수 있습니다.";
}

async function fetchPromptAccessStatus() {
  try {
    const response = await fetch("/api/prompt-access/status", {
      cache: "no-store",
      credentials: "same-origin"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        authenticated: false,
        plan: "free",
        free_limit: 3,
        free_used: 0,
        free_remaining: 3,
        monthly_limit: 300,
        monthly_used: 0,
        monthly_remaining: 300,
        char_limit: 2000,
        pro_monthly_usd: 4.99,
        pro_yearly_usd: 39,
        token_balance: 0,
        token_spent: 0,
        last_charge_tokens: 0,
        billing_unit_tokens: 1000,
        price_per_1k_tokens_usd: 3,
        can_use: false,
        message: payload.message || "사용량 상태를 읽지 못했습니다."
      };
    }
    return payload;
  } catch {
    return {
        authenticated: false,
        plan: "free",
        free_limit: 3,
        free_used: 0,
        free_remaining: 3,
        monthly_limit: 300,
        monthly_used: 0,
        monthly_remaining: 300,
        char_limit: 2000,
        pro_monthly_usd: 4.99,
        pro_yearly_usd: 39,
        token_balance: 0,
        token_spent: 0,
        last_charge_tokens: 0,
      billing_unit_tokens: 1000,
      price_per_1k_tokens_usd: 3,
      can_use: false,
      message: "사용량 서버에 연결하지 못했습니다."
    };
  }
}

async function refreshPromptAccessStatus({ rerender = false, announce = "" } = {}) {
  if (!state.personalization.authenticated) {
    resetPromptAccessState();
    if (rerender) {
      setPromptTailorIdleStatus();
      renderPromptTailorSection();
    }
    return;
  }

  state.promptAccess.loading = true;
  if (rerender) renderPromptTailorSection();

  const payload = await fetchPromptAccessStatus();
  applyPromptAccessStatus(payload);
  if (announce) {
    state.promptAccess.message = announce;
  }
  setPromptTailorIdleStatus();
  if (rerender) renderPromptTailorSection();
}

async function redeemPromptUpgradeCode() {
  if (!state.personalization.authenticated) {
    state.promptAccess.message = "Pro 코드 등록은 로그인 후 가능합니다.";
    renderPromptTailorSection();
    return;
  }

  const code = String(state.promptAccess.upgradeCode || "").trim();
  if (!code) {
    state.promptAccess.message = "Pro 코드를 입력하세요.";
    renderPromptTailorSection();
    return;
  }

  state.promptAccess.loading = true;
  state.promptAccess.message = "Pro 코드를 확인하는 중입니다.";
  renderPromptTailorSection();

  try {
    const response = await fetch("/api/prompt-access/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      credentials: "same-origin",
      body: JSON.stringify({ code })
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      handleAuthSessionExpired(payload.message);
      return;
    }
    if (!response.ok || !payload.ok) {
      state.promptAccess.loading = false;
      state.promptAccess.message = payload.message || "코드 등록에 실패했습니다.";
      renderPromptTailorSection();
      return;
    }

    state.promptAccess.upgradeCode = "";
    applyPromptAccessStatus(payload.access || {});
    state.promptAccess.message = payload.message || "Pro 업그레이드가 적용되었습니다.";
    setPromptTailorIdleStatus();
    renderPromptTailorSection();
  } catch {
    state.promptAccess.loading = false;
    state.promptAccess.message = "Pro 인증 서버에 연결하지 못했습니다.";
    renderPromptTailorSection();
  }
}

function getDefaultAuthStatus(configured) {
  return configured
    ? "상단 Login에서 Google 세션 또는 개발자 마스터키로 잠금을 해제할 수 있습니다."
    : "Google OAuth 환경변수가 아직 설정되지 않았습니다. 상단 Login에서 개발자 마스터키로 잠금을 해제할 수 있습니다.";
}

function getAuthFlashMessage(authFlash, sessionPayload) {
  if (authFlash?.authError) {
    const errorMap = {
      google_config_missing: "Google OAuth 환경변수가 아직 설정되지 않았습니다. 개발자 마스터키는 계속 사용할 수 있습니다.",
      google_denied: "Google 로그인 승인이 취소되었습니다.",
      google_state_mismatch: "Google 로그인 상태 검증에 실패했습니다. 다시 시도하세요.",
      google_verify_failed: "Google 로그인 검증에 실패했습니다.",
      google_not_allowed: "허용된 Google 계정이 아닙니다.",
      google_failed: "Google 로그인 처리 중 오류가 발생했습니다.",
      session_required: "로그인 세션이 만료되었습니다. 상단 Login에서 다시 인증하세요."
    };
    return errorMap[authFlash.authError] || "로그인 처리 중 오류가 발생했습니다.";
  }

  if (sessionPayload.authenticated) {
    const userLabel = sessionPayload.user || sessionPayload.email || "session";
    if (authFlash?.auth === "google") {
      return `${userLabel} Google 세션으로 Personalization과 Prompt Studio가 열렸습니다.`;
    }
    if (authFlash?.auth === "developer") {
      return `${userLabel} 마스터키 세션으로 Personalization과 Prompt Studio가 열렸습니다.`;
    }
    return `${userLabel} 세션으로 Personalization과 Prompt Studio가 열려 있습니다.`;
  }

  return getDefaultAuthStatus(Boolean(sessionPayload.configured));
}

function applyAuthSession(sessionPayload = {}, authFlash = null, options = {}) {
  const configured = Boolean(sessionPayload.configured);
  const authenticated = Boolean(sessionPayload.authenticated);
  const user = authenticated ? String(sessionPayload.user || "").trim() : "";
  const email = authenticated ? String(sessionPayload.email || "").trim() : "";
  const picture = authenticated ? String(sessionPayload.picture || "").trim() : "";
  const authMethod = authenticated ? String(sessionPayload.method || "").trim() : "";

  state.personalization.configured = configured;
  state.personalization.authenticated = authenticated;
  state.personalization.authMethod = authMethod;
  state.personalization.user = user;
  state.personalization.email = email;
  state.personalization.picture = picture;
  state.personalization.status = options.statusOverride || getAuthFlashMessage(authFlash, {
    configured,
    authenticated,
    user,
    email,
    method: authMethod
  });

  if (authFlash?.authError || options.openPopover) {
    state.authPopoverOpen = true;
  }

  if (!authenticated) {
    resetPromptAccessState();
  }

  window.localStorage.removeItem("llm-tool-hub-personalization-auth");
}

function rerenderAuthBoundViews() {
  renderAuthPopover();
  renderPersonalizationSection();
  renderPromptTailorSection();
  renderPromptForgeSection();
}

function startGoogleLogin() {
  const nextSection = state.activeSection === "personalization" || isPromptSection(state.activeSection)
    ? state.activeSection
    : "personalization";
  const targetUrl = `/api/auth/google/start?next=${encodeURIComponent(nextSection)}`;
  window.location.assign(targetUrl);
}

async function handleMasterKeyLogin(form) {
  const formData = new window.FormData(form);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "").trim();

  if (!username || !password) {
    applyAuthSession(
      {
        configured: state.personalization.configured,
        authenticated: false
      },
      null,
      {
        statusOverride: "ID와 Password를 모두 입력해야 합니다.",
        openPopover: true
      }
    );
    rerenderAuthBoundViews();
    return;
  }

  state.personalization.status = "개발자 마스터키를 확인하는 중입니다.";
  renderAuthPopover();

  try {
    const response = await fetch("/api/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      credentials: "same-origin",
      body: JSON.stringify({ username, password })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      const passwordInput = form.querySelector('input[name="password"]');
      passwordInput?.setAttribute("value", "");
      if (passwordInput) passwordInput.value = "";
      applyAuthSession(
        {
          configured: state.personalization.configured,
          authenticated: false
        },
        null,
        {
          statusOverride: payload.message || "로그인에 실패했습니다.",
          openPopover: true
        }
      );
      rerenderAuthBoundViews();
      return;
    }

    form.reset();
    state.authPopoverOpen = false;
    applyAuthSession(
      {
        configured: state.personalization.configured,
        authenticated: true,
        method: payload.method || "developer",
        user: payload.user || username,
        email: payload.email || "",
        picture: payload.picture || ""
      },
      { auth: "developer" }
    );
    await refreshPromptAccessStatus({ rerender: false });
    rerenderAuthBoundViews();
  } catch {
    const passwordInput = form.querySelector('input[name="password"]');
    passwordInput?.setAttribute("value", "");
    if (passwordInput) passwordInput.value = "";
    applyAuthSession(
      {
        configured: state.personalization.configured,
        authenticated: false
      },
      null,
      {
        statusOverride: "로그인 서버에 연결하지 못했습니다. 로컬 서버 또는 Railway 상태를 확인하세요.",
        openPopover: true
      }
    );
    rerenderAuthBoundViews();
  }
}

function handleAuthSessionExpired(message) {
  state.promptTailor.loading = false;
  state.promptTailor.usage = null;
  state.promptForge.loading = false;
  state.promptForge.usage = null;
  clearPromptSecrets();
  resetPromptAccessState();
  applyAuthSession(
    {
      configured: state.personalization.configured,
      authenticated: false
    },
    { authError: "session_required" },
    {
      statusOverride: message || "로그인 세션이 만료되었습니다. 상단 Login에서 다시 인증하세요.",
      openPopover: true
    }
  );
  rerenderAuthBoundViews();
}

function loadPersonalizationNotes() {
  try {
    return JSON.parse(window.localStorage.getItem("llm-tool-hub-personalization-notes") || "{}");
  } catch {
    return {};
  }
}

function isLocalRuntime() {
  return ["127.0.0.1", "localhost"].includes(window.location.hostname);
}

function startLiveSync() {
  if (state.liveSync.timer) {
    window.clearInterval(state.liveSync.timer);
    state.liveSync.timer = null;
  }
  if (!state.liveSync.enabled) return;
  state.liveSync.timer = window.setInterval(() => refreshLiveData({ manual: false }), 8000);
}

async function refreshLiveData({ manual }) {
  state.liveSync.status = "syncing";
  renderLiveSyncPanel();
  try {
    const [projects, memory, skillRegistry, shortTerm, midTerm, longTerm, sourceOfTruth] = await Promise.all([
      fetchJson("data/projects.json"),
      fetchJson("global_memory/memory_profile.json"),
      fetchJson("data/skill_registry.json"),
      fetchText("manager_memory/short-term/active-tasks.md"),
      fetchText("manager_memory/mid-term/current-initiatives.md"),
      fetchText("manager_memory/long-term/strategy-roadmap.md"),
      fetchText("global_memory/exports/source_of_truth.md")
    ]);

    const signature = buildLiveSignature({ projects, memory, skillRegistry, shortTerm, midTerm, longTerm, sourceOfTruth });
    const changed = signature !== state.liveSync.signature;
    state.liveSync.signature = signature;
    state.projects = projects;
    state.memory = memory;
    state.skillRegistry = skillRegistry;
    state.docs = { ...state.docs, sourceOfTruth, shortTerm, midTerm, longTerm };
    state.liveSync.lastSyncedAt = new Date();
    state.liveSync.status = changed ? "updated" : "clean";

    if (changed || manual) {
      renderHomeSummary();
      renderMemorySection();
      renderPersonalizationSection();
      renderSkillsSection();
      runRecommendation();
    } else {
      renderLiveSyncPanel();
    }
  } catch (error) {
    console.error(error);
    state.liveSync.status = "error";
    renderLiveSyncPanel();
  }
}

function buildLiveSignature(payload) {
  return JSON.stringify(payload);
}

function formatTime(dateValue) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(dateValue);
}

function formatDateTime(dateValue) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(dateValue));
}

function persistAuthStatus() {
  window.localStorage.setItem("llm-tool-hub-auth", JSON.stringify(state.authStatus));
}

function persistProviderSyncState() {
  window.localStorage.setItem("llm-tool-hub-provider-sync", JSON.stringify(state.providerSync));
}

function persistPersonalizationNotesState() {
  window.localStorage.setItem(
    "llm-tool-hub-personalization-notes",
    JSON.stringify({
      notes: state.personalization.notes,
      savedAt: state.personalization.savedAt
    })
  );
}

async function logoutPersonalization() {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin"
    });
  } catch (error) {
    console.error(error);
  }

  clearPromptSecrets();
  resetPromptAccessState();
  applyAuthSession(
    {
      configured: state.personalization.configured,
      authenticated: false
    },
    null,
    {
      statusOverride: getDefaultAuthStatus(state.personalization.configured),
      openPopover: true
    }
  );
  rerenderAuthBoundViews();
}

function persistPersonalizationNotesFromInput() {
  if (!state.personalization.authenticated) {
    state.personalization.status = "개인화 메모 저장은 로그인 후 가능합니다.";
    renderPersonalizationSection();
    return;
  }

  state.personalization.notes = elements.personalizationNotesInput?.value || "";
  state.personalization.savedAt = new Date().toISOString();
  state.personalization.status = "개인화 메모를 저장했습니다.";
  persistPersonalizationNotesState();
  renderPersonalizationSection();
}

function loadSelectedPriorities() {
  try {
    const raw = JSON.parse(window.localStorage.getItem("llm-tool-hub-priorities") || "[]");
    const valid = arrayOrEmpty(raw).filter((item) => PRIORITY_OPTIONS.some((priority) => priority.id === item));
    return valid.length ? valid : ["performance", "memory"];
  } catch {
    return ["performance", "memory"];
  }
}

function getRegistryValidationText() {
  const date = state.registry?.generated_at || "unknown";
  const policy = state.registry?.validation_policy || "공식 문서 seed";
  return `${date} / ${policy}`;
}

function getKnowledgeCutoffLabel(version) {
  return version?.knowledge_cutoff || "공식 공개 cutoff 미확인";
}

function getKnowledgeCutoffShort(version) {
  const value = getKnowledgeCutoffLabel(version);
  return value === "공식 공개 cutoff 미확인" ? "cutoff 미공개" : `cutoff ${value}`;
}

function persistSelectedPriorities() {
  window.localStorage.setItem("llm-tool-hub-priorities", JSON.stringify(state.selectedPriorities));
}

function getPriorityLabel(id) {
  return PRIORITY_OPTIONS.find((priority) => priority.id === id)?.label || id;
}

function getSelectedPriorityLabels() {
  return state.selectedPriorities.map((id) => getPriorityLabel(id));
}

function getModelProviderKey(modelNameOrProvider) {
  const value = normalize(modelNameOrProvider);
  if (value.includes("openai") || value.includes("gpt") || value.includes("o3")) return "openai";
  if (value.includes("anthropic") || value.includes("claude")) return "anthropic";
  if (value.includes("google") || value.includes("gemini")) return "google";
  if (value.includes("xai") || value.includes("grok")) return "xai";
  if (value.includes("mistral")) return "mistral";
  if (value.includes("deepseek")) return "deepseek";
  if (value.includes("qwen")) return "qwen";
  if (value.includes("meta") || value.includes("llama")) return "meta";
  if (value.includes("cohere") || value.includes("command")) return "cohere";
  if (value.includes("openrouter")) return "openrouter";
  return "local";
}

function getVersionConnectionMeta(version, providerKey) {
  const requiresLogin = version ? String(version.login_required).toLowerCase().includes("yes") : false;
  const locked = requiresLogin && !state.authStatus[providerKey];
  return { requiresLogin, locked, providerKey };
}

function getModelConnectionMeta(model) {
  const version = getPrimaryVersion(model);
  return getVersionConnectionMeta(version, getModelProviderKey(model.provider));
}

function getToolConnectionMeta(tool) {
  const loginRequired = !String(tool.login_required).toLowerCase().includes("no");
  const providerMap = {
    "codex-cli": "openai",
    "claude-code": "anthropic",
    "gemini-cli": "google",
    cursor: "cursor",
    windsurf: "windsurf",
    openrouter: "openrouter"
  };
  const providerKey = providerMap[tool.id] || "local";
  const locked = loginRequired && providerKey !== "local" && !state.authStatus[providerKey];
  return { requiresLogin: loginRequired, locked, providerKey };
}

function getPrimaryVersion(model) {
  return arrayOrEmpty(model.versions).find((version) => version.state.includes("stable") || version.state.includes("latest")) || arrayOrEmpty(model.versions)[0];
}

function findVersion(name) {
  const normalizedName = normalize(name);
  for (const model of arrayOrEmpty(state.registry.models)) {
    for (const version of arrayOrEmpty(model.versions)) {
      if (normalize(version.name).includes(normalizedName) || normalizedName.includes(normalize(version.name))) {
        return version;
      }
    }
    if (normalize(model.name).includes(normalizedName)) {
      return getPrimaryVersion(model);
    }
  }
  return null;
}

function findModelRecordByName(name) {
  const normalizedName = normalize(name);
  return arrayOrEmpty(state.registry.models).find((model) => {
    if (normalize(model.name).includes(normalizedName) || normalizedName.includes(normalize(model.name))) {
      return true;
    }
    return arrayOrEmpty(model.versions).some((version) => {
      const versionName = normalize(version.name);
      return versionName.includes(normalizedName) || normalizedName.includes(versionName);
    });
  }) || null;
}

function findToolRecordByName(name) {
  const normalizedName = normalize(name);
  const resolvedId = resolveToolId(name);
  return arrayOrEmpty(state.registry.tools).find((tool) => {
    const toolName = normalize(tool.name);
    return tool.id === resolvedId || toolName.includes(normalizedName) || normalizedName.includes(toolName);
  }) || null;
}

function findOfficialSourceUrl(hints, fallback = "") {
  const matched = arrayOrEmpty(state.registry?.sources).find((source) => {
    const haystack = `${source.label} ${source.url} ${source.note || ""}`;
    const normalizedHaystack = normalize(haystack);
    return arrayOrEmpty(hints).some((hint) => normalizedHaystack.includes(normalize(hint)));
  });
  return matched?.url || fallback || "";
}

function getOfficialUrlForModel(model) {
  const providerKey = getModelProviderKey(model.provider);
  const hintMap = {
    openai: ["OpenAI Models Overview"],
    anthropic: ["Anthropic Models Overview"],
    google: ["Gemini Models"],
    xai: ["xAI Docs Overview"],
    mistral: ["Mistral Models"],
    deepseek: ["DeepSeek First API Call"],
    qwen: ["Qwen3"],
    cohere: ["Cohere Command A"],
    meta: ["llama.com"]
  };
  return findOfficialSourceUrl(hintMap[providerKey], OFFICIAL_LINK_FALLBACKS.models[providerKey]);
}

function getOfficialUrlForTool(tool) {
  const hintMap = {
    "codex-cli": ["OpenAI Codex Repository"],
    "claude-code": ["Claude Code Quickstart"],
    "gemini-cli": ["Gemini Models"],
    cursor: ["Cursor Rules"],
    windsurf: ["Windsurf Memories"],
    aider: ["Aider Chat Modes"],
    "lm-studio": ["LM Studio CLI"],
    ollama: ["Ollama Library"],
    openclaw: ["OpenClaw"]
  };
  return findOfficialSourceUrl(hintMap[tool.id], OFFICIAL_LINK_FALLBACKS.tools[tool.id]);
}

function buildRegistryActionMarkup(type, id, officialUrl) {
  return `
    <div class="table-action-row">
      <button class="table-action" type="button" data-modal-type="${escapeAttr(type)}" data-modal-id="${escapeAttr(id)}">상세</button>
      ${
        officialUrl
          ? `<a class="table-link-icon" href="${escapeAttr(officialUrl)}" target="_blank" rel="noreferrer noopener" aria-label="공식 링크 열기" title="공식 링크 열기">
              <span class="material-symbols-outlined">open_in_new</span>
            </a>`
          : ""
      }
    </div>
  `;
}

function buildLimitNote(version) {
  if (!version) {
    return "공식 문서 기준 수동 확인 필요";
  }
  const loginLabel = String(version.login_required).toLowerCase().includes("yes") ? "로그인/API 필요" : "로컬 가능";
  return `${version.context_window} / max ${version.max_output} / ${loginLabel} / ${version.rate_limit}`;
}

function environmentLabel(id) {
  const environment = arrayOrEmpty(state.installMatrix.environments).find((item) => item.id === id);
  return environment?.label || id;
}

function installStepsPreview(steps) {
  return arrayOrEmpty(steps).slice(0, 2).join(" → ") || "수동 확인";
}

function extractBullets(markdown) {
  return String(markdown)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^- /, "").replace(/`/g, "").trim());
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function statCard(value, label) {
  return `
    <article class="stat-card">
      <strong>${escapeHtml(String(value))}</strong>
      <span>${escapeHtml(label)}</span>
    </article>
  `;
}

function focusCard(label, value, summary) {
  return `
    <article class="focus-card">
      <p class="tiny-label">${escapeHtml(label)}</p>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(summary)}</p>
    </article>
  `;
}

function packetCard(label, title, summary) {
  return `
    <article class="packet-card">
      <p class="tiny-label">${escapeHtml(label)}</p>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(summary)}</p>
    </article>
  `;
}

function governanceCard(kind, title, summary, items) {
  return `
    <article class="governance-card ${escapeAttr(kind)}">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(summary)}</p>
      <ul class="packet-list">
        ${arrayOrEmpty(items).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </article>
  `;
}

function definitionCard(label, value, note, changed = false) {
  return `
    <article class="result-definition ${changed ? "changed" : ""}">
      <p class="tiny-label">${escapeHtml(label)}</p>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(note)}</p>
    </article>
  `;
}

function renderVisitCounter(counter) {
  const target = elements.visitCounterFloating;
  if (!target || !counter) return;
  target.textContent = `TODAY | ${Number(counter.today || 0)}  TOTAL | ${Number(counter.total || 0)}`;
}

async function trackVisitAndRenderCounter() {
  try {
    const hit = await fetch("/api/analytics/visit", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin"
    });
    if (hit.ok) {
      renderVisitCounter(await hit.json());
      return;
    }
  } catch (_error) {
    // Ignore counter hit failures.
  }

  try {
    const response = await fetch("/api/analytics/counter", {
      cache: "no-store",
      credentials: "same-origin"
    });
    if (!response.ok) return;
    renderVisitCounter(await response.json());
  } catch (_error) {
    // Ignore counter read failures.
  }
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${path} 요청 실패 (${response.status})`);
  }
  return response.json();
}

async function fetchText(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${path} 요청 실패 (${response.status})`);
  }
  return response.text();
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
