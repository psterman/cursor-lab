
(()=>{
const $=id=>document.getElementById(id),orbit=$("orbit"),sub=$("sub"),nav=$("nav"),time=$("time"),ax=$("ax"),ay=$("ay"),cl=$("cl"),pl=$("pupil-l"),pr=$("pupil-r"),oc=$("oc"),reactor=$("reactor"),radar=$("radar"),wc=$("wc"),list=$("list"),boot=$("boot"),status=$("status");
const state={themes:[],payload:{},metrics:null,idx:0,anim:false,lastWheel:0,dir:1,open:false,lang:(localStorage.getItem("openclaw2_lang")||"zh").replace(/^en$/i,"en").replace(/^zh$/i,"zh")||"zh"};
/** OpenClaw Gateway 地址：默认本机端口；端口变化时可通过 ?gwPort= / ?gateway= 指定，或自动探测常见端口并写入 localStorage */
const OpenClawGateway=(function(){
  const LS_PORT='openclaw2_gateway_port';
  const LS_HOST='openclaw2_gateway_host';
  const DEFAULT_PORT=18789;
  const DEFAULT_HOST='127.0.0.1';
  const EXTRA_PORTS=[18790,18889,3000,8080,5173,5174];
  let cachedPort=null;
  function parsePortFromLocation(){
    try{
      const q=new URLSearchParams(window.location.search||'');
      const raw=q.get('gwPort')||q.get('gatewayPort')||q.get('openclaw_port')||q.get('openclawPort')||'';
      if(raw){
        const n=parseInt(String(raw).replace(/^:/,''),10);
        if(Number.isFinite(n)&&n>0&&n<65536)return n;
      }
      const gw=q.get('gateway')||q.get('gw')||'';
      if(gw){
        const s=String(gw).trim();
        if(/^\d+$/.test(s))return parseInt(s,10);
        try{
          const u=s.includes('://')?new URL(s):new URL('http://'+s);
          if(u.port){const p=parseInt(u.port,10);if(Number.isFinite(p)&&p>0)return p;}
        }catch(_){}
      }
      const h=window.location.hash||'';
      const m=h.match(/(?:^#|[?&])gw(?:Port)?=(\d{2,5})/);
      if(m)return parseInt(m[1],10);
    }catch(_){}
    return null;
  }
  function loadInitialPort(){
    const fromUrl=parsePortFromLocation();
    if(fromUrl!=null){
      try{localStorage.setItem(LS_PORT,String(fromUrl));}catch(_){}
      return fromUrl;
    }
    try{
      const s=localStorage.getItem(LS_PORT);
      if(s!=null){
        const n=parseInt(s,10);
        if(Number.isFinite(n)&&n>0&&n<65536)return n;
      }
    }catch(_){}
    return DEFAULT_PORT;
  }
  function getHost(){
    try{
      const h=(localStorage.getItem(LS_HOST)||DEFAULT_HOST).trim();
      return h||DEFAULT_HOST;
    }catch(_){return DEFAULT_HOST;}
  }
  function getPort(){
    if(cachedPort==null)cachedPort=loadInitialPort();
    return cachedPort;
  }
  function setPort(p){
    const n=parseInt(String(p),10);
    if(!Number.isFinite(n)||n<=0||n>=65536)return;
    cachedPort=n;
    try{localStorage.setItem(LS_PORT,String(n));}catch(_){}
    refreshSubtitle();
  }
  function getDisplay(){return getHost()+':'+getPort();}
  /** 从 localhost 打开开发服页面时，fetch 直连 127.0.0.1:网关端口会触发 CORS；改为走 Vite 同源代理 /__openclaw/{port}/ */
  function useDevHttpProxy(){
    try{
      const h=window.location.hostname;
      if(h!=='localhost'&&h!=='127.0.0.1')return false;
      const p=String(window.location.port||'');
      if(p==='3000'||p==='5173'||p==='5174'||p==='')return true;
      return false;
    }catch(_){return false;}
  }
  function httpBase(){
    if(useDevHttpProxy()){
      try{
        return window.location.origin.replace(/\/$/,'')+'/__openclaw/'+getPort();
      }catch(_){}
    }
    return 'http://'+getDisplay();
  }
  function wsBase(){return 'ws://'+getDisplay();}
  function refreshSubtitle(){
    const el=document.getElementById('api-panel-subtitle');
    if(el)el.textContent=wsBase();
  }
  async function probePort(port){
    const base=useDevHttpProxy()
      ? window.location.origin.replace(/\/$/,'')+'/__openclaw/'+port
      : 'http://'+getHost()+':'+port;
    const tryCors=async(path,opts={})=>{
      try{
        const ac=new AbortController();
        const tid=setTimeout(()=>ac.abort(),700);
        const r=await fetch(base+path,Object.assign({method:'GET',mode:'cors',signal:ac.signal},opts));
        clearTimeout(tid);
        if(r.ok)return 2;
        /* 仅 401/403 视为「有服务且可能需鉴权」；404/405 在任意占位服务上太常见，会误判为网关在线而锁死错误端口 */
        if(r.status===401||r.status===403)return 1;
      }catch(_){}
      return 0;
    };
    let s=await tryCors('/api/channels/status');
    if(s>0)return true;
    s=await tryCors('/api/channels');
    if(s>0)return true;
    try{
      const ac=new AbortController();
      const tid=setTimeout(()=>ac.abort(),700);
      const r=await fetch(base+'/api/dialogue-token',{method:'POST',headers:{'Content-Type':'application/json'},mode:'cors',signal:ac.signal,body:JSON.stringify({source:'probe'})});
      clearTimeout(tid);
      if(r.ok)return true;
    }catch(_){}
    /* 已移除 no-cors GET /：任意 HTTP 服务都会「成功」，导致误选端口（例如空端口或静态站） */
    return false;
  }
  async function autoDetectPort(){
    const preferred=getPort();
    const list=[];
    const add=(p)=>{const n=typeof p==='number'?p:parseInt(p,10);if(Number.isFinite(n)&&n>0&&n<65536&&!list.includes(n))list.push(n);};
    add(preferred);
    /* 先扫常见备用端口（含 18790），再补默认 18789，避免「默认 18789 + 误判」挡住真实网关 */
    EXTRA_PORTS.forEach(add);
    add(DEFAULT_PORT);
    try{
      const q=new URLSearchParams(window.location.search||'');
      const probeExtra=q.get('gwProbePorts')||q.get('openclaw_probe_ports')||'';
      probeExtra.split(/[,;\s]+/).forEach(function(s){const n=parseInt(String(s).trim(),10);add(n);});
    }catch(_){}
    for(const p of list){
      if(await probePort(p)){
        if(p!==getPort())setPort(p);
        else refreshSubtitle();
        return p;
      }
    }
    refreshSubtitle();
    return getPort();
  }
  return{getHost,getPort,setPort,getDisplay,httpBase,wsBase,autoDetectPort,probePort,refreshSubtitle,useDevHttpProxy,DEFAULT_PORT,DEFAULT_HOST};
})();
try{window.OpenClawGateway=OpenClawGateway;}catch(_){}
// 初始展示由探测/读取 localStorage 后的动态网关地址决定
OpenClawGateway.refreshSubtitle();
const i18n={
  zh:{
    noData:"暂无数据",
    heroTitle:"OpenClaw",
    viewDetails:"[查看详情]",
    close:"关闭",
    sysGroupHeader:"系统与连接",
    signalPanels:"信号面板",
    radar:"能力雷达",
    wordCloud:"词云",
    sessionList:"会话列表",
    bootTitle:"OpenClaw 启动中",
    statusLoading:"正在加载本地数据…",
    statusFetch:"正在拉取云端数据…",
    statusProcess:"正在处理画像与卡片…",
    statusOnline:"已就绪",
    statusFailed:"加载失败，使用空数据。",
    topTitle:"OpenClaw 数据报告",
    topSub:"遥测上行: 活跃 // 来源: OpenClaw_Nexus",
    linkReport:"体检报告",
    linkStats:"PK地图",
    hudTerminal:"数据终端",
    levelMap:{S:"传说 OpenClaw",A:"专业 OpenClaw",B:"进阶 OpenClaw",C:"初级 OpenClaw",D:"OpenClaw 新手"},
    workRhythmMap:{"night-owl":"夜猫子",morning:"早起",afternoon:"下午档",evening:"夜间档",unknown:"未知"},
    tokenSourceMap:{thinking:"基于思考估算",messages:"基于消息估算","sessions.json":"sessions.json",usage:"原始用量",estimate:"估算"},
    partialDataHint:"缺少 exitCode",
    dataSourceTitle:"数据来源",
    dataSourceDesc:"以下指标来自 openclawPortrait 与 sessions.json 的汇总。Token/缓存/模型/渠道/时间/技能/工具/上下文/心跳/状态及 System Prompt 统计在上传 sessions.json 时出自该文件。",
    dataSourcePayloadHint:"【说明】当前加载到的 OpenClaw 分析载荷不完整（画像 dimensions、composite 与会话汇总 openclawSessionsSummary 多为空），因此大量卡片会显示「暂无数据」或 0——这是缺数据的表现，不是页面渲染故障。处理方式：① 在站内主流程选择 OpenClaw 引擎完成一次分析（会写入 localStorage 键 vibe_openclaw_analysis_cache，含 openclawPortrait 等）；② 保证本机 Gateway 能通过 /api/openclaw/latest 等返回上述结构的 JSON（npm run dev 会多路径回源）；③ 或将合规 JSON 存为 ~/.openclaw/last_analysis_data.json 供开发服读取。按 F12 可在控制台查看 [openclaw2] 载荷诊断日志。",
    cardModalLabels:{source:"数据来源",analysis:"数值分析",calculation:"计算方法",ownerTrait:"主人特点"},
    cardHelp:[
      [{source:"openclawPortrait.dimensions.toolSkillHeat.topTools 与 taskHabit.topSkills、sessions.skills 汇总",analysis:"展示 OpenClaw 最常触发的工具与技能关键词，反映使用偏好与能力侧重。",calculation:"从 topTools/topSkills 取前 3 项，按权重去重后拼接。",ownerTrait:"可以看出你是偏「工具流」还是「技能流」OpenClaw 用户，以及当前阶段最顺手的能力标签。"},{source:"portrait.composite.level 与 composite.score",analysis:"等级由 composite 分数映射为 S/A/B/C/D，对应排行榜段位。",calculation:"level 取自画像；rank 为 L1～L5（按 score≥60/70/80/90 分段）。",ownerTrait:"传说 OpenClaw(S)到新手(D)，一眼看出你在排行榜的段位。"},{source:"portrait.composite.score",analysis:"综合能力分，整合消耗、模型、工具、习惯、健康等维度。",calculation:"0～100 的整数，由画像 composite 直接取整。",ownerTrait:"分数越高说明整体 OpenClaw 能力越均衡、越强。"},{source:"portrait.dimensions 各维度 score：consumptionCost、modelPreference、toolSkillHeat",analysis:"三维能力向量，分别表示算力消耗、模型使用、工具调用上的得分。",calculation:"各 dimension 的 score 字段取整，格式为 消耗/模型/工具。",ownerTrait:"可看出你在「烧 Token」「用模型」「玩工具」上的侧重点。"},{source:"portrait.dimensions.taskHabit.workRhythm",analysis:"工作节奏类型：夜猫子、早起、下午档、夜间档等。",calculation:"habit.workRhythm 原始值，经 workRhythmMap 翻译为中文标签。",ownerTrait:"反映 OpenClaw 的活跃时段偏好，是夜猫子还是早起型。"},{source:"portrait.dimensions.taskHabit.peakHours",analysis:"活跃高峰时段（小时），多用于与 workRhythm 配合理解。",calculation:"habit.peakHours 取前 3 个 hour 拼接。",ownerTrait:"看出你一天中精力最集中的时间点。"},{source:"portrait.dimensions.taskHabit.activeHours",analysis:"统计意义上的活跃小时数。",calculation:"habit.activeHours 直接展示。",ownerTrait:"数值越高说明在时间维度上投入越多。"},{source:"portrait.dimensions.taskHabit.score",analysis:"习惯维度得分，综合节奏、峰值、活跃度等。",calculation:"taskHabit.score 取整。",ownerTrait:"习惯分高说明使用节奏稳定、可预测。"},{source:"portrait.dimensions.stabilityHealth.score",analysis:"健康/稳定性得分，与成功率、异常中断率相关。",calculation:"stabilityHealth.score 取整。",ownerTrait:"健康分高说明会话稳定、异常少，OpenClaw「体质」好。"}],
      [{source:"portrait.dimensions.consumptionCost.totalTokens 与 sessions.token 汇总",analysis:"总 Token 消耗，优先用画像，缺则用 input+output 或 totalTokensSum。",calculation:"portraitTotalTokens>0 取画像；否则取 sessions 的 totalTokensSum 或 input+output 之和。",ownerTrait:"看出 OpenClaw「吃了多少」算力，用量大说明任务重或模型用得猛。"},{source:"sessions.token.inputTokensSum / outputTokensSum",analysis:"输入与输出 Token 的分别汇总。",calculation:"sessions.token 对应字段直接求和。",ownerTrait:"输入多偏「读长文/长上下文」，输出多偏「生成多」。"},{source:"consumption.cacheHitRate 或 sessions 的 cacheRead/input 比例",analysis:"缓存命中率，越高说明重复上下文利用越好。",calculation:"画像有 cacheHitRate 则用；否则 cacheReadSum/inputTokensSum*100%。",ownerTrait:"命中率高说明 OpenClaw 会「省着吃」，重复内容少重复算。"},{source:"portrait.consumptionCost.totalCostUSD 或 sessions.cost.totalCostUsd",analysis:"估算或实际消耗的美元成本。",calculation:"优先画像 totalCostUSD，否则 sessions.cost。",ownerTrait:"反映你在 Cursor/API 上的花费量级。"},{source:"sessions.token.contextTokensMax 或画像等价字段",analysis:"上下文窗口使用上限（Token 数）。",calculation:"token.contextTokensMax 或 sessions 对应字段。",ownerTrait:"窗口越大，OpenClaw 能「一次看完」的内容越多。"},{source:"sessions.cache.cacheReadSum",analysis:"缓存读取总量。",calculation:"sessions.cache.cacheReadSum。",ownerTrait:"读得多说明缓存利用充分。"},{source:"sessions.cache.cacheWriteSum",analysis:"缓存写入总量。",calculation:"sessions.cache.cacheWriteSum。",ownerTrait:"写得多说明有大量可复用上下文被缓存。"},{source:"sessions.token.totalTokensSum 或 input+output",analysis:"会话侧 Token 合计。",calculation:"totalTokensSum 或 inputTokensSum+outputTokensSum。",ownerTrait:"与画像总 Token 对照，可判断数据是否一致。"},{source:"portrait.consumptionCost.tokenSource / usedEstimate",analysis:"Token 数据来源：原始用量、估算(消息/思考)、sessions.json。",calculation:"consumption.tokenSource 或 usedEstimate 推导的标签。",ownerTrait:"了解数值是实测还是估算，便于解读可信度。"}],
      [{source:"portrait.dimensions.modelPreference.dominantModelId 与 sessions.model",analysis:"使用占比最高的模型 ID。",calculation:"dominantModelId 非 unknown 则用，否则 sessions.model 或 openclaw-default。",ownerTrait:"看出 OpenClaw「主粮」是哪个模型。"},{source:"portrait.modelPreference.uniqueModelCount / totalModelCalls",analysis:"使用过的不同模型数与总调用次数。",calculation:"uniqueModelCount 与 totalModelCalls 直接展示。",ownerTrait:"模型种类多说明你在多模型间切换；总调用多说明请求频繁。"},{source:"portrait.toolSkillHeat.topTools[0] 或 sessions.tools.toolNames",analysis:"调用最多的工具名。",calculation:"topTools[0].toolName 或 toolNames[0]。",ownerTrait:"最顺手工具反映你的主力工作流（如 search、codebase）。"},{source:"portrait.toolSkillHeat.toolCallsTotal 或 sessions.tools.sessionsWithTools",analysis:"涉及工具调用的会话数或总调用次数。",calculation:"toolCallsTotal 或 sessionsWithTools。",ownerTrait:"数值高说明你常依赖工具完成任务。"},{source:"sessions.model.modelProvider",analysis:"模型提供商。",calculation:"sessions.model.modelProvider。",ownerTrait:"看出 OpenClaw 接的是哪家「粮仓」。"},{source:"sessions.model.model",analysis:"会话中记录的模型 ID。",calculation:"sessions.model.model。",ownerTrait:"与 dominant 对照可看是否一致。"},{source:"portrait.toolSkillHeat.toolKinds 或 toolNames.length",analysis:"使用过的工具种类数。",calculation:"toolHeat.toolKinds 或 toolNames 长度。",ownerTrait:"种类多说明你「工具链」丰富。"},{source:"topTools[0].count 或 sessions 工具相关计数",analysis:"最常用工具的调用次数或会话内工具条目数。",calculation:"topTools[0].count 或 entriesCount。",ownerTrait:"看出你对单一工具的依赖程度。"}],
      [{source:"portrait.dimensions.stabilityHealth.score",analysis:"健康维度得分。",calculation:"stabilityHealth.score 取整。",ownerTrait:"整体会话稳定性与「体质」。"},{source:"portrait.health.successRate 或 sessions.status.successRate",analysis:"会话成功率（无异常结束的比例）。",calculation:"有 successBase 用 health.successRate；否则 status.successRate；再否则 (sessions-aborted)/sessions。",ownerTrait:"成功率高说明 OpenClaw 跑任务很少半路崩。"},{source:"portrait.health.abnormalInterruptionRate 或 status.abnormalInterruptionRate",analysis:"异常中断率。",calculation:"画像或 status 的异常率 * 100。",ownerTrait:"率低说明运行稳定，少有意外中断。"},{source:"sessions.lastActiveAt / updatedAt 或 heartbeat.lastHeartbeatSentAt",analysis:"最近一次活跃时间。",calculation:"lastActiveAt 或 updatedAt 或 lastHeartbeatSentAt。",ownerTrait:"看出 OpenClaw 最近是否还在「动」。"},{source:"sessions.sessionCount",analysis:"会话总数。",calculation:"sessions.sessionCount 或 legacy.work_days。",ownerTrait:"会话多说明使用频次高、样本足。"},{source:"sessions.channel.lastChannel",analysis:"最近使用的渠道。",calculation:"channel.lastChannel 数组拼接。",ownerTrait:"看出你从哪个入口用 Cursor。"},{source:"sessions.channel.originProvider / originSurface",analysis:"请求来源提供商与界面。",calculation:"originProvider 与 originSurface 拼接。",ownerTrait:"区分 IDE、Web、API 等来源。"},{source:"ClawController.rpcCall('tasks.list') 或 HTTP GET /api/tasks；缓存 openclawTasksSummary.scheduled_tasks_count",analysis:"当前 Gateway 上已配置的定时/周期任务条数（cron、interval、schedule 等）。",calculation:"优先用响应字段 scheduled_tasks_count；否则对 tasks 列表逐项判定 schedule/cron/interval。",ownerTrait:"条数多说明自动化工作流多、后台例行任务重。"}],
      [{source:"sessions.channel.lastChannel",analysis:"最近渠道。",calculation:"channel.lastChannel 拼接。",ownerTrait:"同健康主题渠道。"},{source:"sessions.token.contextTokensMax",analysis:"上下文 Token 上限。",calculation:"同上。",ownerTrait:"同算力主题。"},{source:"sessions.injectedWorkspaceFilesCount",analysis:"注入工作区的文件数。",calculation:"sessions 对应字段。",ownerTrait:"看出你给 AI 开了多少「工作区视野」。"},{source:"sessions.cache.cacheReadSum / cacheWriteSum",analysis:"缓存读/写。",calculation:"同上。",ownerTrait:"同算力主题。"},{source:"sessions.lastActiveAt / updatedAt",analysis:"最近活跃。",calculation:"同上。",ownerTrait:"同健康主题。"},{source:"sessions.model.modelProvider",analysis:"模型提供商。",calculation:"同上。",ownerTrait:"同模型与工具。"},{source:"sessions.systemPromptChars 或 systemPromptReport",analysis:"系统提示词字符数。",calculation:"sessions 对应字段。",ownerTrait:"系统提示长说明你定制了较多「人设」或规则。"},{source:"tasks.list / openclawTasksSummary（与「健康与状态」同源）",analysis:"定时任务数量。",calculation:"scheduled_tasks_count 或对任务列表解析。",ownerTrait:"同健康主题定时任务卡片。"},{source:"sessions.heartbeat.lastHeartbeatText",analysis:"最近一次心跳文本摘要。",calculation:"lastHeartbeatText 截断 60 字。",ownerTrait:"可窥见小虾最近在「念叨」什么状态。"}]
    ],
    radarLabels:["消耗","模型","工具","习惯","健康","综合"],
    rowLabels:["会话数","输入Token","输出Token","Token总量","缓存读/写","模型提供商","模型","最近渠道","来源","最近活跃","上下文上限","工具种类数","使用工具会话数","工具名","心跳时间","心跳内容","定时任务数量","systemSent","compactionCount","系统提示字数","注入工作区文件","技能"],
    themeNames:["核心信号","算力消耗","模型与工具","健康与状态","会话核心","实时后台","查看详情"],
    themes:[
      [{t:"OpenClaw 最爱用的关键词",d:"工具与技能激活信号"},{t:"等级评定",d:null},{t:"综合能力值",d:"综合得分"},{t:"能力向量",d:"消耗/模型/工具"},{t:"工作节奏",d:null},{t:"峰值时段",d:null},{t:"活跃时长",d:null},{t:"习惯分",d:"taskHabit.score"},{t:"健康分",d:"stabilityHealth.score"}],
      [{t:"OpenClaw Token 总量",d:"画像+会话汇总"},{t:"输入/输出",d:null},{t:"缓存命中率",d:null},{t:"花费(美元)",d:"consumption.totalCostUSD"},{t:"上下文窗口",d:"token.contextTokensMax"},{t:"缓存读取",d:"cacheReadSum"},{t:"缓存写入",d:"cacheWriteSum"},{t:"Token合计",d:"totalTokensSum"},{t:"数据来源",d:null}],
      [{t:"OpenClaw 最常用的模型",d:null},{t:"模型分布",d:"不同模型/总调用"},{t:"最顺手工具",d:null},{t:"工具调用",d:null},{t:"模型提供商",d:null},{t:"模型ID",d:"model id"},{t:"工具种类数",d:null},{t:"工具调用次数",d:null}],
      [{t:"健康分",d:"stabilityHealth.score"},{t:"成功率",d:"健康/状态成功率"},{t:"异常中断率",d:null},{t:"最近活跃",d:"sessions.updatedAt / heartbeat"},{t:"工作量",d:null},{t:"渠道",d:null},{t:"来源",d:null},{t:"定时任务数量",d:"tasks.list + HEARTBEAT.md，条数与摘要"}],
      [{t:"渠道",d:null},{t:"上下文Token",d:"token.contextTokensMax"},{t:"注入工作区文件",d:null},{t:"缓存读/写",d:"sessions.cache"},{t:"最近活跃",d:"sessions.updatedAt"},{t:"模型提供商",d:null},{t:"系统提示字数",d:null},{t:"定时任务",d:"scheduled_tasks_count"},{t:"心跳摘要",d:null}]
    ]
  },
  en:{
    noData:"No data",
    heroTitle:"OpenClaw",
    viewDetails:"[VIEW_DETAILS]",
    close:"CLOSE",
    sysGroupHeader:"System & connection",
    signalPanels:"Signal Panels",
    radar:"Radar",
    wordCloud:"Word Cloud",
    sessionList:"Session List",
    bootTitle:"OpenClaw Bootstrap",
    statusLoading:"Loading session payload...",
    statusFetch:"Fetching Cloudflare Worker payload...",
    statusProcess:"Processing stats and routing to card clusters...",
    statusOnline:"Online",
    statusFailed:"Failed to load payload. Using fallback.",
    topTitle:"OpenClaw Data Report",
    topSub:"Telemetry Uplink: Active // Source: OpenClaw_Nexus",
    linkReport:"Report",
    linkStats:"PK Map",
    hudTerminal:"DATA TERMINAL",
    levelMap:{S:"Legendary Shrimper",A:"Pro Shrimper",B:"Rising Shrimper",C:"Junior Shrimper",D:"Shrimp Newbie"},
    workRhythmMap:{"night-owl":"Night Owl",morning:"Morning",afternoon:"Afternoon",evening:"Evening",unknown:"Unknown"},
    tokenSourceMap:{thinking:"Estimated from thinking",messages:"Estimated from messages","sessions.json":"sessions.json",usage:"Usage",estimate:"Estimate"},
    partialDataHint:"Partial data",
    dataSourceTitle:"Data source",
    dataSourceDesc:"Metrics below are from openclawPortrait and sessions.json. Token/cache/model/channel/time/skills/tools/context/heartbeat/status and system prompt stats come from sessions.json when uploaded.",
    dataSourcePayloadHint:"Note: The payload is incomplete (missing rich openclawPortrait / openclawSessionsSummary), so many cards show “No data” or zero — expected, not a rendering bug. Fix: run OpenClaw analysis from the main app (writes localStorage key vibe_openclaw_analysis_cache), or expose JSON from Gateway (/api/openclaw/latest, etc.), or place data in ~/.openclaw/last_analysis_data.json. Check the console for [openclaw2] diagnostics.",
    cardModalLabels:{source:"Data source",analysis:"Value analysis",calculation:"How it's calculated",ownerTrait:"What it says about you"},
    cardHelp:[
      [{source:"openclawPortrait.dimensions.toolSkillHeat.topTools, taskHabit.topSkills, sessions.skills",analysis:"Top 3 tools/skills by usage; reflects your preference and focus.",calculation:"Merge topTools/topSkills, dedupe by weight, join top 3.",ownerTrait:"Shows whether you're tool-heavy or skill-heavy, and your main capability tags."},{source:"portrait.composite.level and composite.score",analysis:"Level S/A/B/C/D maps to rank tier.",calculation:"level from portrait; rank L1–L5 by score thresholds 60/70/80/90.",ownerTrait:"From Legendary Shrimper to Shrimp Newbie at a glance."},{source:"portrait.composite.score",analysis:"Composite ability score across consumption, model, tool, habit, health.",calculation:"Integer 0–100 from portrait.composite.",ownerTrait:"Higher = more balanced, stronger overall usage."},{source:"portrait.dimensions scores: consumptionCost, modelPreference, toolSkillHeat",analysis:"Three scores: consumption / model / tool.",calculation:"Each dimension score rounded; format cons/model/tool.",ownerTrait:"Shows where you burn tokens, use models, and call tools most."},{source:"portrait.dimensions.taskHabit.workRhythm",analysis:"Work rhythm type: night-owl, morning, afternoon, evening.",calculation:"habit.workRhythm mapped via workRhythmMap.",ownerTrait:"Reveals when you're most active."},{source:"portrait.dimensions.taskHabit.peakHours",analysis:"Peak activity hours.",calculation:"First 3 hour values from habit.peakHours.",ownerTrait:"When your 'shrimp power' peaks."},{source:"portrait.dimensions.taskHabit.activeHours",analysis:"Active hours count.",calculation:"habit.activeHours.",ownerTrait:"Higher = more time invested."},{source:"portrait.dimensions.taskHabit.score",analysis:"Habit dimension score.",calculation:"taskHabit.score rounded.",ownerTrait:"Stable, predictable rhythm."},{source:"portrait.dimensions.stabilityHealth.score",analysis:"Health/stability score.",calculation:"stabilityHealth.score rounded.",ownerTrait:"Higher = fewer crashes, healthier sessions."}],
      [{source:"portrait.consumptionCost.totalTokens and sessions.token",analysis:"Total tokens; portrait preferred, else sessions sum.",calculation:"portrait totalTokens if >0 else totalTokensSum or input+output.",ownerTrait:"How much 'food' your shrimp consumed."},{source:"sessions.token.inputTokensSum / outputTokensSum",analysis:"Input vs output token sums.",calculation:"From sessions.token.",ownerTrait:"Input-heavy = long context; output-heavy = lots of generation."},{source:"consumption.cacheHitRate or cacheRead/input ratio",analysis:"Cache hit rate.",calculation:"Portrait cacheHitRate or (cacheReadSum/inputTokensSum)*100%.",ownerTrait:"Higher = better reuse of context."},{source:"portrait.consumptionCost.totalCostUSD or sessions.cost",analysis:"Estimated or actual USD cost.",calculation:"Portrait or sessions.cost.totalCostUsd.",ownerTrait:"Spend level on Cursor/API."},{source:"sessions.token.contextTokensMax",analysis:"Context window cap (tokens).",calculation:"token.contextTokensMax.",ownerTrait:"Larger = more context per request."},{source:"sessions.cache.cacheReadSum",analysis:"Cache read total.",calculation:"sessions.cache.cacheReadSum.",ownerTrait:"More reads = good cache use."},{source:"sessions.cache.cacheWriteSum",analysis:"Cache write total.",calculation:"sessions.cache.cacheWriteSum.",ownerTrait:"More writes = more cached context."},{source:"sessions.token.totalTokensSum or input+output",analysis:"Session-side token sum.",calculation:"totalTokensSum or sum of input+output.",ownerTrait:"Cross-check with portrait total."},{source:"portrait.consumptionCost.tokenSource / usedEstimate",analysis:"Token source: usage, estimate (messages/thinking), sessions.json.",calculation:"From consumption.tokenSource or usedEstimate.",ownerTrait:"Tells you if value is measured or estimated."}],
      [{source:"portrait.modelPreference.dominantModelId and sessions.model",analysis:"Dominant model ID by usage.",calculation:"dominantModelId or sessions.model or openclaw-default.",ownerTrait:"Your shrimp's main 'diet' model."},{source:"portrait.modelPreference.uniqueModelCount / totalModelCalls",analysis:"Distinct models used and total calls.",calculation:"Direct from modelPreference.",ownerTrait:"More models = more switching; more calls = busier."},{source:"portrait.toolSkillHeat.topTools[0] or sessions.tools.toolNames",analysis:"Most-used tool name.",calculation:"topTools[0].toolName or toolNames[0].",ownerTrait:"Your go-to tool (e.g. search, codebase)."},{source:"portrait.toolSkillHeat.toolCallsTotal or sessions.tools.sessionsWithTools",analysis:"Sessions with tool calls or total tool calls.",calculation:"toolCallsTotal or sessionsWithTools.",ownerTrait:"Higher = you rely on tools a lot."},{source:"sessions.model.modelProvider",analysis:"Model provider.",calculation:"sessions.model.modelProvider.",ownerTrait:"Which 'warehouse' your shrimp uses."},{source:"sessions.model.model",analysis:"Model ID in sessions.",calculation:"sessions.model.model.",ownerTrait:"Compare with dominant."},{source:"portrait.toolSkillHeat.toolKinds or toolNames.length",analysis:"Number of distinct tools used.",calculation:"toolHeat.toolKinds or toolNames.length.",ownerTrait:"More kinds = richer toolchain."},{source:"topTools[0].count or sessions tool count",analysis:"Top tool call count.",calculation:"topTools[0].count or entriesCount.",ownerTrait:"How dependent you are on one tool."}],
      [{source:"portrait.stabilityHealth.score",analysis:"Health dimension score.",calculation:"stabilityHealth.score rounded.",ownerTrait:"Overall session stability."},{source:"portrait.health.successRate or sessions.status.successRate",analysis:"Session success rate.",calculation:"health.successRate if successBase>0 else status.successRate or (sessions-aborted)/sessions.",ownerTrait:"Higher = fewer runs ending badly."},{source:"portrait.health.abnormalInterruptionRate or status",analysis:"Abnormal interruption rate.",calculation:"From health or status * 100.",ownerTrait:"Lower = more stable runs."},{source:"sessions.lastActiveAt / updatedAt or heartbeat",analysis:"Last active time.",calculation:"lastActiveAt or updatedAt or lastHeartbeatSentAt.",ownerTrait:"When your shrimp was last active."},{source:"sessions.sessionCount",analysis:"Total sessions.",calculation:"sessionCount or legacy.work_days.",ownerTrait:"More sessions = more usage, better sample."},{source:"sessions.channel.lastChannel",analysis:"Last channel used.",calculation:"channel.lastChannel joined.",ownerTrait:"Which entry point you use."},{source:"sessions.channel.originProvider / originSurface",analysis:"Request origin provider and surface.",calculation:"Origin fields concatenated.",ownerTrait:"IDE vs Web vs API."},{source:"ClawController.rpcCall('tasks.list') or HTTP GET /api/tasks; cache openclawTasksSummary.scheduled_tasks_count",analysis:"Count of scheduled/recurring tasks on the Gateway (cron, interval, schedule, etc.).",calculation:"Prefer scheduled_tasks_count from the response; else infer from the tasks list (schedule/cron/interval fields).",ownerTrait:"Higher = more automated workflows running in the background."}],
      [{source:"sessions.channel.lastChannel",analysis:"Last channel.",calculation:"Same as health.",ownerTrait:"Same as above."},{source:"sessions.token.contextTokensMax",analysis:"Context token cap.",calculation:"Same as resource.",ownerTrait:"Same as above."},{source:"sessions.injectedWorkspaceFilesCount",analysis:"Injected workspace file count.",calculation:"From sessions.",ownerTrait:"How much workspace context you give the AI."},{source:"sessions.cache read/write",analysis:"Cache read/write.",calculation:"Same as resource.",ownerTrait:"Same as above."},{source:"sessions.lastActiveAt / updatedAt",analysis:"Last active.",calculation:"Same as health.",ownerTrait:"Same as above."},{source:"sessions.model.modelProvider",analysis:"Model provider.",calculation:"Same as model+tool.",ownerTrait:"Same as above."},{source:"sessions.systemPromptChars",analysis:"System prompt character count.",calculation:"From sessions.",ownerTrait:"Longer = more custom rules/persona."},{source:"tasks.list / openclawTasksSummary (same as Health + Status)",analysis:"Scheduled task count.",calculation:"scheduled_tasks_count or parse task list.",ownerTrait:"Same as the Health + Status scheduled-tasks card."},{source:"sessions.heartbeat.lastHeartbeatText",analysis:"Last heartbeat text snippet.",calculation:"lastHeartbeatText truncated to 60 chars.",ownerTrait:"A peek at what your shrimp was last 'saying'."}]
    ],
    radarLabels:["Consumption","Model","Tool","Habit","Health","Composite"],
    rowLabels:["Session Count","Token Input","Token Output","Token Total","Cache Read / Write","Model Provider","Model","Last Channel","Origin","Last Active","Context Tokens Max","Tools Schema Count","Tools Sessions","Tool Names","Heartbeat","Heartbeat Text","Scheduled tasks","systemSent","compactionCount","systemPromptChars","workspaceInjectedFiles","skills"],
    themeNames:["Core Signal","Resource","Model + Tool","Health + Status","sessions.json Core","Live Backend","View Details"],
    themes:[
      [{t:"Top 3 Keywords",d:"Tool + skill activation signals"},{t:"Rank Grade",d:null},{t:"Core Ability",d:"composite score"},{t:"Capability Vector",d:"consumption / model / tool"},{t:"Work Rhythm",d:null},{t:"Peak Hours",d:null},{t:"Active Hours",d:null},{t:"Habit Score",d:"taskHabit.score"},{t:"Health Score",d:"stabilityHealth.score"}],
      [{t:"Total Token",d:"portrait + sessions summary"},{t:"Input / Output",d:null},{t:"Cache Hit Rate",d:null},{t:"Cost USD",d:"consumption.totalCostUSD"},{t:"Context Window",d:"token.contextTokensMax"},{t:"Cache Read",d:"cacheReadSum"},{t:"Cache Write",d:"cacheWriteSum"},{t:"Token Sum",d:"totalTokensSum"},{t:"Data source",d:null}],
      [{t:"Dominant Model",d:null},{t:"Model Spread",d:"unique / total calls"},{t:"Top Tool",d:null},{t:"Tool Calls",d:null},{t:"Model Provider",d:null},{t:"Model ID",d:"model id"},{t:"Tool Kinds",d:null},{t:"Top Tool Count",d:null}],
      [{t:"Health Score",d:"stabilityHealth.score"},{t:"Success Rate",d:"health.successRate / status.successRate"},{t:"Abnormal Interrupt",d:null},{t:"Last Active",d:"sessions.updatedAt / heartbeat"},{t:"Workload",d:null},{t:"Channel",d:null},{t:"Origin",d:null},{t:"Scheduled tasks",d:"tasks.list + HEARTBEAT.md, count + preview"}],
      [{t:"Channel",d:null},{t:"Context Tokens",d:"token.contextTokensMax"},{t:"Injected Workspace Files",d:null},{t:"Cache Read / Write",d:"sessions.cache"},{t:"Last Active",d:"sessions.updatedAt"},{t:"Model Provider",d:null},{t:"System Prompt Chars",d:null},{t:"Scheduled tasks",d:"scheduled_tasks_count"},{t:"Heartbeat",d:null}]
    ]
  }
};
const eyes={l:{x:195,y:225},r:{x:305,y:225}},eyeLimit=12;
const N=(v,f=0)=>typeof v==="number"&&Number.isFinite(v)?v:(typeof v==="string"&&Number.isFinite(Number(v))?Number(v):f);
const fmt=v=>Number.isFinite(N(v,NaN))?N(v).toLocaleString():"--";
const pct=(v,d=1,noData)=>Number.isFinite(N(v,NaN))?`${N(v).toFixed(d)}%`:(noData||i18n[state.lang].noData);
const money=(v,noData)=>Number.isFinite(N(v,NaN))&&N(v)>0?`$${N(v).toFixed(4)}`:(noData||i18n[state.lang].noData);
const dts=v=>v?String(v).replace("T"," ").slice(0,19):"--";
function getApiEndpoint(){const e=(window.__API_ENDPOINT__||window.API_ENDPOINT||"").trim();if(e)return e;const m=document.querySelector('meta[name="api-endpoint"]');return m&&m.content?m.content.trim():"https://cursor-clinical-analysis.psterman.workers.dev/";}
const base=u=>u?u.endsWith("/")?u:u+"/":"";
async function fetchJson(url,t=9000){const c=new AbortController(),tm=setTimeout(()=>c.abort(),t);try{const r=await fetch(url,{method:"GET",mode:"cors",cache:"no-store",headers:{"Content-Type":"application/json"},signal:c.signal});if(!r.ok)return null;return await r.json();}catch{return null}finally{clearTimeout(tm)}}
function pickPayload(raw){
  if(!raw||typeof raw!=="object")return null;
  if(raw.openclawPortrait||raw.openclawSessionsSummary)return raw;
  for(const c of [raw.data,raw.payload,raw.result,raw.analysis,raw.latest]){
    if(c&&typeof c==="object"&&(c.openclawPortrait||c.openclawSessionsSummary))return c;
  }
  const oc=raw.openclaw&&typeof raw.openclaw==="object"?raw.openclaw:null;
  if(oc){
    const pp=oc.openclawPortrait||oc.portrait,ss=oc.openclawSessionsSummary||oc.sessionsSummary||oc.sessions_summary;
    if(pp||ss)return{openclawPortrait:pp||{},openclawSessionsSummary:ss||{}};
  }
  if(raw.portrait&&typeof raw.portrait==="object"){
    const ss=raw.openclawSessionsSummary||raw.sessionsSummary||raw.sessions_summary;
    return{openclawPortrait:raw.portrait,openclawSessionsSummary:ss&&typeof ss==="object"?ss:{}};
  }
  const st=raw.stats&&typeof raw.stats==="object"?raw.stats:null;
  if(st&&st.openclaw&&typeof st.openclaw==="object"){
    const o=st.openclaw,pp=o.openclawPortrait||o.portrait,ss=o.openclawSessionsSummary||o.sessionsSummary||st.openclaw_stats;
    if(pp||ss)return{openclawPortrait:pp||{},openclawSessionsSummary:(ss&&typeof ss==="object")?ss:{}};
  }
  return null;
}
function localPayload(){
  /** 与 main.js VIBE_OPENCLAW_CACHE 一致：主流程 OpenClaw 分析只写此处，不写入 openclaw_analysis_data。 */
  for(const [s,k] of [[localStorage,"vibe_openclaw_analysis_cache"],[sessionStorage,"openclaw_analysis_data"],[localStorage,"openclaw_analysis_data"],[localStorage,"last_analysis_data"]]){
    try{const r=s.getItem(k);if(!r)continue;const d=JSON.parse(r),p=pickPayload(d);if(p)return p;if(d&&(d.stats||d.statistics))return {legacyStats:d.stats||d.statistics||{},updatedAt:d.updatedAt||d.createdAt||""};}catch{}
  }
  try{
    const hist=localStorage.getItem("cursor_clinical_history");
    if(hist){const h=JSON.parse(hist);const d=h&&h.analysisData?h.analysisData:h;const p=pickPayload(d);if(p)return p;}
  }catch{}
  return {};
}
/** 与 Gateway tasks.list / HTTP 返回对齐：展开 result、payload、data（可多一层 ok 包装） */
function normalizeTasksRpcPayload(raw){
  let v=raw;
  for(let depth=0;depth<8;depth++){
    if(!v||typeof v!=='object')break;
    if(Array.isArray(v))break;
    let inner=null;
    if(v.result!==undefined&&v.result!==null)inner=v.result;
    else if(v.payload!==undefined&&v.payload!==null)inner=v.payload;
    else if(v.data!==undefined&&v.data!==null)inner=v.data;
    else if(v.value!==undefined&&v.value!==null)inner=v.value;
    else if(v.body!==undefined&&v.body!==null)inner=v.body;
    else if(v.response!==undefined&&v.response!==null)inner=v.response;
    else if(v.ok===true&&v.payload!==undefined&&v.payload!==null)inner=v.payload;
    if(inner&&typeof inner==='object'&&!Array.isArray(inner))v=inner;
    else break;
  }
  return v&&typeof v==='object'?v:{};
}
function taskRecordLooksScheduled(t){
  if(!t||typeof t!=='object')return false;
  const st=String(t.status||t.state||'').toLowerCase();
  if(st==='scheduled'||st==='recurring'||st==='cron'||st==='interval')return true;
  const tt=String(t.taskType||t.runMode||'').toLowerCase();
  if(tt.includes('schedule')||tt.includes('cron')||tt.includes('interval')||tt==='timer'||tt==='recurring')return true;
  if(t.schedule||t.interval||t.intervalMs)return true;
  if(typeof t.cron==='string'&&t.cron.length)return true;
  if(t.cron&&typeof t.cron==='object')return true;
  if(t.trigger==='schedule'||t.type==='scheduled'||t.type==='schedule')return true;
  if(t.mode==='schedule'||t.mode==='scheduled')return true;
  if(t.kind==='cron'||t.kind==='interval')return true;
  if(t.recurring===true)return true;
  if(t.nextRunAt||t.nextRun||t.nextRunMs||t.nextRunAtMs)return true;
  const k=String(t.kind||t.type||'').toLowerCase();
  if(k.includes('cron')||k.includes('schedule'))return true;
  const c=t.config||t.spec||t.definition||t.def||t.meta||t.params||{};
  if(c&&typeof c==='object'){
    if(c.schedule||c.cron||c.interval||c.intervalMs)return true;
    if(typeof c.cron==='string'&&c.cron.length)return true;
  }
  return false;
}
function countOpenClawScheduledTasks(taskList){
  if(!Array.isArray(taskList))return 0;
  let n=0;
  for(const t of taskList){
    if(taskRecordLooksScheduled(t))n++;
  }
  return n;
}
/** 单条任务在卡片上展示的短标签（供健康主题「定时任务」卡片） */
function taskRecordLabel(t){
  if(!t||typeof t!=='object')return '';
  const name=t.name||t.title||t.label||t.taskName||t.id||t.taskId||t.key||t.slug;
  if(name!=null&&String(name).trim())return String(name).trim().slice(0,96);
  const c=t.config||t.spec||t.definition||{};
  if(typeof c.prompt==='string'&&c.prompt.trim())return c.prompt.trim().slice(0,64);
  if(c.cron||c.schedule)return String(c.cron||c.schedule||'').slice(0,64);
  if(typeof t.cron==='string'&&t.cron)return t.cron.slice(0,64);
  return '';
}
/** 从 tasks.list / HTTP 任务列表中筛出定时任务并取展示文案 */
function extractScheduledTaskLabelsFromGatewayRaw(raw){
  try{
    const list=extractTasksListFromGatewayValue(raw);
    const out=[];
    for(const t of list){
      if(!taskRecordLooksScheduled(t))continue;
      const lb=taskRecordLabel(t);
      if(lb)out.push(lb);
    }
    return out;
  }catch{return [];}
}
function extractTasksListFromGatewayValue(v){
  if(v==null)return[];
  v=normalizeTasksRpcPayload(v);
  if(Array.isArray(v))return v;
  if(typeof v!=='object')return[];
  const mergeTaskGroups=(o)=>{
    if(!o||typeof o!=='object'||Array.isArray(o))return[];
    const keys=['scheduled','schedules','schedule','adhoc','oneOff','oneoff','recurring','cron','interval','items','list','all','tasks'];
    const out=[];
    const seen=new Set();
    for(const k of keys){
      const a=o[k];
      if(!Array.isArray(a))continue;
      for(const it of a){
        if(!it||typeof it!=='object')continue;
        const id=it.id||it.taskId||it.key||it.slug||JSON.stringify(it).slice(0,120);
        if(seen.has(id))continue;
        seen.add(id);
        out.push(it);
      }
    }
    return out;
  };
  const tryArrays=['tasks','taskList','list','schedules','scheduledTasks','jobs','entries','rows','records','values','crons','allTasks','definitions','taskDefinitions'];
  for(const key of tryArrays){
    const a=v[key];
    if(Array.isArray(a))return a;
  }
  if(Array.isArray(v.tasks))return v.tasks;
  if(v.tasks&&typeof v.tasks==='object'&&!Array.isArray(v.tasks)){
    const merged=mergeTaskGroups(v.tasks);
    if(merged.length)return merged;
    if(Array.isArray(v.tasks.list))return v.tasks.list;
    if(Array.isArray(v.tasks.items))return v.tasks.items;
    if(Array.isArray(v.tasks.records))return v.tasks.records;
    const vals=Object.values(v.tasks).filter(x=>x&&typeof x==='object'&&!Array.isArray(x));
    if(vals.length)return vals;
  }
  if(v.summary&&typeof v.summary==='object'&&Array.isArray(v.summary.tasks))return v.summary.tasks;
  if(Array.isArray(v.items))return v.items;
  if(Array.isArray(v.data))return v.data;
  return [];
}
/** 优先使用服务端给出的定时任务条数 */
function pickScheduledCountFromGatewayObject(v){
  if(!v||typeof v!=='object')return null;
  const tskEarly=v.tasks&&typeof v.tasks==='object'&&!Array.isArray(v.tasks)?v.tasks:null;
  if(tskEarly&&Array.isArray(tskEarly.scheduled)&&tskEarly.scheduled.length)return tskEarly.scheduled.length;
  if(tskEarly&&Array.isArray(tskEarly.schedules)&&tskEarly.schedules.length)return tskEarly.schedules.length;
  const sumEarly=v.summary&&typeof v.summary==='object'?v.summary:null;
  if(sumEarly&&Array.isArray(sumEarly.scheduled)&&sumEarly.scheduled.length)return sumEarly.scheduled.length;
  if(Array.isArray(v.scheduledTasks)&&v.scheduledTasks.length){
    const n=countOpenClawScheduledTasks(v.scheduledTasks);
    if(n>=0)return n;
  }
  const stats=v.stats&&typeof v.stats==='object'?v.stats:null;
  const sum=v.summary&&typeof v.summary==='object'?v.summary:null;
  if(sum&&Array.isArray(sum.scheduledTasks)&&sum.scheduledTasks.length){
    const n=countOpenClawScheduledTasks(sum.scheduledTasks);
    if(n>=0)return n;
  }
  const meta=v.meta&&typeof v.meta==='object'?v.meta:null;
  const tsk=v.tasks&&typeof v.tasks==='object'&&!Array.isArray(v.tasks)?v.tasks:null;
  const cands=[
    v.scheduled_tasks_count,v.scheduledCount,v.scheduled_task_count,v.scheduledTotal,
    sum&&sum.scheduled,sum&&sum.scheduledCount,sum&&sum.scheduled_tasks_count,sum&&sum.scheduledTasks,
    meta&&meta.scheduled_tasks_count,
    tsk&&tsk.scheduledCount,tsk&&tsk.scheduled,
    stats&&stats.scheduled_tasks_count,stats&&stats.scheduledCount
  ];
  for(const c of cands){
    if(c===undefined||c===null||typeof c==='object')continue;
    const n=Number(c);
    if(Number.isFinite(n)&&n>=0)return Math.floor(n);
  }
  return null;
}
function pickTotalTaskCountFromGatewayObject(v,listLen){
  if(!v||typeof v!=='object')return listLen;
  const sum=v.summary&&typeof v.summary==='object'?v.summary:null;
  const tsk=v.tasks&&typeof v.tasks==='object'&&!Array.isArray(v.tasks)?v.tasks:null;
  const cands=[v.count,v.total,v.totalCount,v.taskCount,v.tasksCount,v.task_count,v.tasksTotal,sum&&sum.total,tsk&&tsk.total];
  for(const c of cands){
    if(c===undefined||c===null||typeof c==='object')continue;
    const n=Number(c);
    if(Number.isFinite(n)&&n>=0)return Math.floor(n);
  }
  return listLen;
}
/** API 报 0 但列表里仍能筛出定时任务时，以列表为准 */
function mergeScheduledCounts(fromApi,scheduledFromList){
  if(fromApi!=null&&fromApi>0)return fromApi;
  if(scheduledFromList>0)return scheduledFromList;
  if(fromApi!=null)return fromApi;
  return scheduledFromList;
}
/** 从载荷或 localStorage 缓存读取上次统计的定时任务条数 */
function readScheduledTasksCountFromPayload(payload){
  const p=payload||{};
  const ts=p.openclawTasksSummary||{};
  const sess=p.openclawSessionsSummary||{};
  const tsk=sess.tasks&&typeof sess.tasks==='object'?sess.tasks:{};
  let n=N(ts.scheduled_tasks_count,NaN);
  if(!Number.isFinite(n))n=N(ts.scheduledCount,NaN);
  if(!Number.isFinite(n))n=N(tsk.scheduled_tasks_count,NaN);
  if(Number.isFinite(n)&&n>=0)return Math.max(0,Math.floor(n));
  try{
    const snap=localStorage.getItem('openclaw2_scheduled_tasks_cache');
    if(snap!=null&&snap!==''){
      const n=parseInt(String(snap),10);
      if(Number.isFinite(n)&&n>=0)return Math.max(0,Math.floor(n));
    }
  }catch{}
  try{
    for(const k of ['vibe_openclaw_analysis_cache','openclaw_analysis_data']){
      const raw=localStorage.getItem(k);
      if(!raw)continue;
      const j=JSON.parse(raw);
      const x=j&&j.openclawTasksSummary;
      if(x&&Number.isFinite(Number(x.scheduled_tasks_count)))return Math.max(0,Math.floor(Number(x.scheduled_tasks_count)));
    }
  }catch{}
  return 0;
}
function persistLiveTaskSummary(tasksRes){
  try{
    if(!tasksRes||tasksRes.status!=='fulfilled'||tasksRes.value==null){
      try{window.__openclawScheduledTasksTrustZero=false;}catch{}
      return;
    }
    const raw=tasksRes.value;
    const v=normalizeTasksRpcPayload(raw);
    const list=extractTasksListFromGatewayValue(raw);
    const fromApi=pickScheduledCountFromGatewayObject(v);
    const scheduledFromList=countOpenClawScheduledTasks(list);
    const scheduled=mergeScheduledCounts(fromApi,scheduledFromList);
    const trustGatewayZero=(list.length>0)||(fromApi!==null&&Math.floor(Number(fromApi))===0);
    try{window.__openclawScheduledTasksTrustZero=trustGatewayZero;}catch{}
    const listLen=list.length;
    const totalPick=pickTotalTaskCountFromGatewayObject(v,listLen);
    const resolved=Math.max(0,Math.trunc(Number.isFinite(Number(totalPick))?Number(totalPick):listLen));
    if(!Number.isFinite(scheduled)||scheduled<0)return;
    const taskPayload={
      count:resolved,
      total:resolved,
      taskCount:resolved,
      tasksCount:resolved,
      tasksExecuted:resolved,
      scheduledCount:scheduled,
      scheduled_tasks_count:scheduled,
      source:'tasks.list',
      updatedAt:new Date().toISOString()
    };
    for(const [s,k] of [[localStorage,"vibe_openclaw_analysis_cache"],[localStorage,"openclaw_analysis_data"],[sessionStorage,"openclaw_analysis_data"]]){
      try{
        const raw=s.getItem(k);
        const base=raw?JSON.parse(raw):{};
        const next=(base&&typeof base==="object")?base:{};
        const sess=(next.openclawSessionsSummary&&typeof next.openclawSessionsSummary==="object")?next.openclawSessionsSummary:{};
        next.openclawTasksSummary=Object.assign({},(next.openclawTasksSummary&&typeof next.openclawTasksSummary==="object")?next.openclawTasksSummary:{},taskPayload);
        next.openclawSessionsSummary=Object.assign({},sess,{tasks:Object.assign({},(sess.tasks&&typeof sess.tasks==="object")?sess.tasks:{},taskPayload)});
        s.setItem(k,JSON.stringify(next));
      }catch{}
    }
    try{window.__openclawScheduledTasksCount=scheduled;}catch{}
    try{localStorage.setItem('openclaw2_scheduled_tasks_cache',String(scheduled));}catch{}
  }catch{}
}
/** HTTP GET Gateway /tasks、/api/tasks（与 openclaw-monitor 一致）；跨域时仅用 query token，避免触发 CORS 预检失败 */
async function fetchGatewayScheduledTaskRollupViaHttp(){
  const token=typeof ClawController!=='undefined'&&ClawController&&ClawController.getSavedToken?ClawController.getSavedToken():null;
  if(!token||typeof fetch!=='function'||typeof OpenClawGateway==='undefined'||!OpenClawGateway.httpBase)return null;
  const base=String(OpenClawGateway.httpBase()).replace(/\/$/,'');
  let curOrig='',gwOrig='';
  try{curOrig=window.location&&window.location.origin?String(window.location.origin):'';}catch{}
  try{gwOrig=new URL(base).origin;}catch{}
  const sameOrigin=!!(curOrig&&gwOrig&&curOrig===gwOrig);
  const q='?token='+encodeURIComponent(token);
  const urls=[base+'/tasks'+q,base+'/api/tasks'+q];
  const headers={};
  if(token&&sameOrigin)headers.Authorization='Bearer '+token;
  for(let i=0;i<urls.length;i++){
    try{
      const r=await fetch(urls[i],{method:'GET',headers,credentials:'include',mode:'cors'});
      if(!r||!r.ok)continue;
      const json=await r.json();
      const v=normalizeTasksRpcPayload(json);
      const list=extractTasksListFromGatewayValue(json);
      const fromApi=pickScheduledCountFromGatewayObject(v);
      const scheduledFromList=countOpenClawScheduledTasks(list);
      const scheduled=mergeScheduledCounts(fromApi,scheduledFromList);
      if(!Number.isFinite(scheduled)||scheduled<0)continue;
      return{scheduled:Math.max(0,Math.floor(scheduled)),total:Math.max(0,list.length),source:'http',raw:json};
    }catch{}
  }
  return null;
}
/**
 * 按 OpenClaw 文档：HEARTBEAT.md 中空文件或仅 # 注释则跳过心跳；非注释行视为一条「周期检查任务」。
 * 参考：https://open-claw.bot/docs/cli/reference/templates/heartbeat/
 */
function parseHeartbeatMdTasks(md){
  if(md==null||typeof md!=='string')return{count:0,tasks:[],empty:true,responseOnly:false};
  const raw=String(md).replace(/\r\n/g,'\n');
  const t=raw.trim();
  if(!t)return{count:0,tasks:[],empty:true,responseOnly:false};
  if(/^HEARTBEAT_OK\s*$/i.test(t))return{count:0,tasks:[],empty:true,responseOnly:true};
  const lines=raw.split('\n');
  const chunks=[];
  for(const line of lines){
    const s=line.trim();
    if(!s)continue;
    if(/^#/.test(s))continue;
    if(/^\/\//.test(s))continue;
    chunks.push(s);
  }
  if(!chunks.length)return{count:0,tasks:[],empty:true,responseOnly:false};
  const expanded=[];
  for(const c of chunks){
    if(c.length>200&&/\.(\s|$)/.test(c)){
      c.split(/\.\s+/).forEach(p=>{
        const x=p.trim().replace(/\s+$/,'');
        if(x&&!/^#/.test(x))expanded.push(x.replace(/\.$/,''));
      });
    }else expanded.push(c);
  }
  return{count:expanded.length,tasks:expanded,empty:false,responseOnly:false};
}
function extractHeartbeatMdTextFromUnknown(obj,depth){
  if(obj==null||depth>12)return null;
  if(typeof obj==='string')return obj;
  if(typeof obj!=='object')return null;
  const keys=['content','text','body','markdown','source','fileContent','heartbeatMarkdown','raw','value','message','lastMessage','lastText','heartbeatText','lastHeartbeatText','output','note','data'];
  for(const k of keys){
    if(Object.prototype.hasOwnProperty.call(obj,k)&&typeof obj[k]==='string')return obj[k];
  }
  if(obj.files&&typeof obj.files==='object'){
    const f=obj.files['HEARTBEAT.md']||obj.files['heartbeat.md'];
    if(typeof f==='string')return f;
  }
  const inner=obj.result!==undefined?obj.result:(obj.payload!==undefined?obj.payload:obj.data);
  if(inner&&typeof inner==='object'&&inner!==obj)return extractHeartbeatMdTextFromUnknown(inner,depth+1);
  return null;
}
/** 深度扫描 RPC 返回中疑似 HEARTBEAT 正文的长字符串（兼容未知字段名） */
function deepFindHeartbeatMarkdownString(obj,depth){
  if(obj==null||depth>14)return null;
  if(typeof obj==='string'){
    const s=obj;
    if(s.length<8||s.length>120000)return null;
    if(/^HEARTBEAT_OK\s*$/i.test(s.trim()))return null;
    if(s.includes('\n')||/^#\s/m.test(s)||/(check|verify|monitor|review|sync)\b/i.test(s)){
      const p=parseHeartbeatMdTasks(s);
      if(!p.responseOnly&&(p.count>0||!p.empty))return s;
    }
    return null;
  }
  if(typeof obj!=='object')return null;
  if(Array.isArray(obj)){
    for(let i=0;i<obj.length;i++){
      const f=deepFindHeartbeatMarkdownString(obj[i],depth+1);
      if(f)return f;
    }
    return null;
  }
  for(const k of Object.keys(obj)){
    if(k==='stack'||k==='trace'||k==='password')continue;
    const f=deepFindHeartbeatMarkdownString(obj[k],depth+1);
    if(f)return f;
  }
  return null;
}
/** 从已上传的 sessions 摘要里解析心跳文本（网关未暴露读文件时仍可有摘要） */
function parseHeartbeatFromSessionPayload(payload){
  try{
    const sess=(payload&&payload.openclawSessionsSummary)||{};
    const hb=sess.heartbeat||{};
    const raw=hb.lastHeartbeatText||hb.heartbeatText||sess.lastHeartbeatText;
    if(!raw||typeof raw!=='string')return null;
    const t=raw.trim();
    if(!t||t.length>100000)return null;
    const parsed=parseHeartbeatMdTasks(t);
    if(parsed.responseOnly)return null;
    return{count:parsed.count,tasks:parsed.tasks||[],source:'sessions.heartbeat'};
  }catch{return null;}
}
/** 通过 Gateway 拉取工作区 HEARTBEAT.md（多 RPC/HTTP 路径兼容） */
async function fetchHeartbeatMdTasksFromGateway(){
  if(typeof ClawController==='undefined'||!ClawController||!ClawController.authenticated||typeof ClawController.rpcCall!=='function')return null;
  const rpcAttempts=[
    ['workspace.read',{path:'HEARTBEAT.md'}],
    ['workspace.read',{path:'./HEARTBEAT.md'}],
    ['workspace.read',{file:'HEARTBEAT.md'}],
    ['file.read',{path:'HEARTBEAT.md'}],
    ['files.read',{path:'HEARTBEAT.md'}],
    ['fs.read',{path:'HEARTBEAT.md'}],
    ['readFile',{path:'HEARTBEAT.md'}],
    ['workspace.file.read',{path:'HEARTBEAT.md'}],
    ['heartbeat.file',{}],
    ['heartbeat.md',{}],
    ['heartbeat.content',{}],
    ['last-heartbeat',{}]
  ];
  function parseRpcBody(res,method){
    let txt=extractHeartbeatMdTextFromUnknown(res,0);
    if(txt==null)txt=deepFindHeartbeatMarkdownString(res,0);
    if(txt==null)return null;
    if(typeof txt!=='string')return null;
    const parsed=parseHeartbeatMdTasks(txt);
    if(parsed.responseOnly)return null;
    return{count:parsed.count,tasks:parsed.tasks||[],source:'rpc:'+method,readOk:true,rawText:txt};
  }
  for(const [method,params] of rpcAttempts){
    try{
      const res=await ClawController.rpcCall(method,params);
      const out=parseRpcBody(res,method);
      if(out)return out;
    }catch{}
  }
  const token=ClawController.getSavedToken();
  if(!token||typeof fetch!=='function'||typeof OpenClawGateway==='undefined'||!OpenClawGateway.httpBase)return null;
  const base=String(OpenClawGateway.httpBase()).replace(/\/$/,'');
  let curOrig='',gwOrig='';
  try{curOrig=window.location&&window.location.origin?String(window.location.origin):'';}catch{}
  try{gwOrig=new URL(base).origin;}catch{}
  const sameOrigin=!!(curOrig&&gwOrig&&curOrig===gwOrig);
  const q='?token='+encodeURIComponent(token);
  const urls=[base+'/HEARTBEAT.md'+q,base+'/api/workspace/HEARTBEAT.md'+q,base+'/api/files/HEARTBEAT.md'+q,base+'/api/HEARTBEAT.md'+q,base+'/workspace/HEARTBEAT.md'+q,base+'/files/HEARTBEAT.md'+q];
  const headers={};
  if(token&&sameOrigin)headers.Authorization='Bearer '+token;
  for(const url of urls){
    try{
      const r=await fetch(url,{method:'GET',headers,credentials:'include',mode:'cors'});
      if(!r||!r.ok)continue;
      const ct=(r.headers.get('content-type')||'').toLowerCase();
      let txt='';
      if(ct.includes('json')){
        const j=await r.json();
        txt=extractHeartbeatMdTextFromUnknown(j,0)||deepFindHeartbeatMarkdownString(j,0)||'';
      }else{
        txt=await r.text();
      }
      if(typeof txt==='string'){
        const parsed=parseHeartbeatMdTasks(txt);
        if(parsed.responseOnly)continue;
        return{count:parsed.count,tasks:parsed.tasks||[],source:'http',readOk:true,rawText:txt};
      }
    }catch{}
  }
  return null;
}
let __openclawHbStatsTimer=null;
function applyHeartbeatStatsToUI(){
  if(!state||!state.payload)return;
  state.metrics=processStats(state.payload,state.lang||'zh');
  state.themes=themes(state.metrics,state.lang||'zh');
  if(state.idx===3||state.idx===4)renderTheme(state.idx);
  if(state.idx===6)refreshDetails();
}
function stopOpenclawHeartbeatStatsSync(){
  if(__openclawHbStatsTimer){clearInterval(__openclawHbStatsTimer);__openclawHbStatsTimer=null;}
}
async function tickOpenclawHeartbeatStats(){
  if(typeof ClawController==='undefined'||!ClawController||!ClawController.authenticated)return;
  try{
    const hb=await fetchHeartbeatMdTasksFromGateway();
    if(hb&&hb.readOk){
      window.__openclawHeartbeatMdReadOk=true;
      window.__openclawHeartbeatTasksCount=hb.count;
      window.__openclawHeartbeatTasksLines=hb.tasks||[];
      window.__openclawHeartbeatMdSource=hb.source||'';
    }
    applyHeartbeatStatsToUI();
  }catch{}
}
function startOpenclawHeartbeatStatsSync(){
  stopOpenclawHeartbeatStatsSync();
  tickOpenclawHeartbeatStats();
  __openclawHbStatsTimer=setInterval(tickOpenclawHeartbeatStats,8000);
}
try{window.startOpenclawHeartbeatStatsSync=startOpenclawHeartbeatStatsSync;window.stopOpenclawHeartbeatStatsSync=stopOpenclawHeartbeatStatsSync;}catch{}
async function workerPayload(){
  const paths=["api/openclaw/latest","api/openclaw/latest_analysis","api/analysis/latest","api/latest_analysis","api/openclaw/portrait"];
  /** 仅请求「当前页面源」下的上述路径（如 localhost:3000 由 Vite 桥接到本机 Gateway）。默认 Cloudflare Worker 根地址未实现 /api/openclaw/*，轮询会产生 404，故不再自动请求 getApiEndpoint()。 */
  const origins=[];
  const o0=base(window.location.origin);
  if(o0)origins.push(o0);
  try{
    const w=(typeof window!=="undefined"&&window.OPENCLAW_DATA_ENDPOINT&&String(window.OPENCLAW_DATA_ENDPOINT).trim())||"";
    if(w){const bw=base(w);if(bw&&origins.indexOf(bw)<0)origins.push(bw);}
  }catch{}
  try{
    const m=document.querySelector('meta[name="openclaw-data-endpoint"]');
    const u=m&&m.content&&String(m.content).trim();
    if(u){const bw=base(u);if(bw&&origins.indexOf(bw)<0)origins.push(bw);}
  }catch{}
  for(const b of origins){
    if(!b)continue;
    for(const p of paths){const j=await fetchJson(b+p,7500),d=pickPayload(j);if(d)return d;}
  }
  return null;
}
function score(p){if(!p||typeof p!=="object")return 0;const po=p.openclawPortrait||{},se=p.openclawSessionsSummary||{};let s=0;if(Object.keys(po).length)s+=2;if(Object.keys(se).length)s+=2;if(N(po?.dimensions?.consumptionCost?.totalTokens,0)>0)s+=2;if(N(se?.token?.totalTokensSum,0)>0)s+=2;if(N(se?.sessionCount,0)>0)s++;if(Array.isArray(se?.skills)&&se.skills.length)s++;return s;}
function processStats(payload,L){
L=L||state.lang;
const portrait=payload.openclawPortrait||{},dims=portrait.dimensions||{},comp=portrait.composite||{},sess=payload.openclawSessionsSummary||{},legacy=payload.legacyStats||payload.stats||{};
const consumption=dims.consumptionCost||{},modelDim=dims.modelPreference||{},toolHeat=dims.toolSkillHeat||{},habit=dims.taskHabit||{},health=dims.stabilityHealth||{};
const tokenS=sess.token||{},cacheS=sess.cache||{},modelS=sess.model||{},channelS=sess.channel||{},toolsS=sess.tools||{},heartbeatS=sess.heartbeat||{},statusS=sess.status||{};
const topSkills=(Array.isArray(habit.topSkills)&&habit.topSkills.length)?habit.topSkills:(Array.isArray(toolHeat.topSkills)?toolHeat.topSkills:[]),skillsS=Array.isArray(sess.skills)?sess.skills:(Array.isArray(legacy.skills)?legacy.skills:[]);
const usageLegacy=legacy.usage||legacy.tokenUsage||{};
let inTok=N(tokenS.inputTokensSum,0),outTok=N(tokenS.outputTokensSum,0),sumTok=N(tokenS.totalTokensSum,0);
if(inTok===0&&outTok===0&&sumTok===0){
  inTok=N(usageLegacy.promptTokens,0)||N(usageLegacy.inputTokens,0);
  outTok=N(usageLegacy.completionTokens,0)||N(usageLegacy.outputTokens,0);
  sumTok=N(usageLegacy.totalTokens,0)||(inTok+outTok)||N(legacy.totalTokens,0)||N(legacy.totalChars,0);
}
const pTok=N(consumption.totalTokens,0),legacyTok=N(legacy.totalTokens,0)||N(legacy.totalChars,0);
const totalTok=pTok>0?pTok:Math.max(sumTok,inTok+outTok,legacyTok);
const cRead=N(cacheS.cacheReadSum,0),cWrite=N(cacheS.cacheWriteSum,0),cacheHit=(N(consumption.cacheHitRate,0)>0?N(consumption.cacheHitRate,0)*100:(inTok>0?(cRead/inTok)*100:N(cacheS.hitRate,0)*100));
const cost=N(consumption.totalCostUSD,0)>0?N(consumption.totalCostUSD,0):N(sess?.cost?.totalCostUsd,0);
const sessCnt=N(sess.sessionCount,0)||N(legacy.work_days,0),aborted=N(statusS.abortedLastRunCount,0);
const scheduledFromPayload=readScheduledTasksCountFromPayload(payload);
const gwAuth=typeof ClawController!=='undefined'&&ClawController&&ClawController.authenticated;
const liveRaw=(typeof window!=='undefined'&&Number.isFinite(window.__openclawScheduledTasksCount))?Math.max(0,Math.floor(window.__openclawScheduledTasksCount)):null;
const trustGwZero=typeof window!=='undefined'&&window.__openclawScheduledTasksTrustZero===true;
let liveSched=null;
if(gwAuth&&liveRaw!==null&&(liveRaw>0||trustGwZero))liveSched=liveRaw;
const hbReadOk=typeof window!=='undefined'&&window.__openclawHeartbeatMdReadOk===true;
const hbCnt=typeof window!=='undefined'&&Number.isFinite(window.__openclawHeartbeatTasksCount)?Math.max(0,Math.floor(window.__openclawHeartbeatTasksCount)):null;
const hbLines=typeof window!=='undefined'&&Array.isArray(window.__openclawHeartbeatTasksLines)?window.__openclawHeartbeatTasksLines:[];
const sessHb=parseHeartbeatFromSessionPayload(payload);
let hbLinesEffective=hbReadOk&&hbLines.length?hbLines.slice(0):[];
if(!hbLinesEffective.length&&sessHb&&Array.isArray(sessHb.tasks)&&sessHb.tasks.length)hbLinesEffective=sessHb.tasks.slice(0);
const gwLbl=typeof window!=='undefined'&&Array.isArray(window.__openclawScheduledTaskLabels)?window.__openclawScheduledTaskLabels:[];
let hbCountEffective=null;
if(hbReadOk&&hbCnt!==null)hbCountEffective=hbCnt;
else if(sessHb&&Number.isFinite(sessHb.count))hbCountEffective=sessHb.count;
const hbBlock=hbLinesEffective.length?hbLinesEffective.slice(0,8).map(s=>String(s).slice(0,80)).join(' · '):'';
const gwBlock=gwLbl.length?gwLbl.slice(0,10).map(s=>String(s).slice(0,80)).join(' · '):'';
let scheduledTasksNum;
/* 已连 Gateway 且汇总可信时优先 tasks.list；未置信的 0（解析空/失败）不压制 HEARTBEAT 与缓存 */
if(liveSched!=null)scheduledTasksNum=liveSched;
else if(hbCountEffective!==null)scheduledTasksNum=hbCountEffective;
else scheduledTasksNum=scheduledFromPayload;
const scheduledTasksDetail=[hbBlock,gwBlock].filter(Boolean).join('\n');
const scheduledTasksDisplay=fmt(scheduledTasksNum)+(scheduledTasksDetail?('\n'+scheduledTasksDetail):'');
const successBase=N(health.successBase,0),summarySuccessRate=statusS.successRate!=null?N(statusS.successRate,NaN):null;
const success=Number.isFinite(N(health.successRate,NaN))&&successBase>0?N(health.successRate)*100:(Number.isFinite(summarySuccessRate)?summarySuccessRate*100:(sessCnt>0?((sessCnt-Math.min(aborted,sessCnt))/sessCnt)*100:NaN));
const abnormal=Number.isFinite(N(health.abnormalInterruptionRate,NaN))?N(health.abnormalInterruptionRate)*100:(Number.isFinite(N(statusS.abnormalInterruptionRate,NaN))?N(statusS.abnormalInterruptionRate)*100:(sessCnt>0?(Math.min(aborted,sessCnt)/sessCnt)*100:0));
const usedEstimate=!!consumption.usedEstimate,tokenSourceRaw=consumption.tokenSource||(usedEstimate?"estimate":"usage"),tokenSourceLabel=(i18n[L]&&i18n[L].tokenSourceMap&&i18n[L].tokenSourceMap[tokenSourceRaw])?i18n[L].tokenSourceMap[tokenSourceRaw]:tokenSourceRaw;
const workRhythm=habit.workRhythm||"unknown",rhythmLabel=(i18n[L]&&i18n[L].workRhythmMap&&i18n[L].workRhythmMap[workRhythm])?i18n[L].workRhythmMap[workRhythm]:workRhythm;
const partialDataHint=(successBase===0&&summarySuccessRate==null&&i18n[L]&&i18n[L].partialDataHint)?i18n[L].partialDataHint:"";
const toolNames=Array.isArray(toolsS.toolNames)?toolsS.toolNames.filter(Boolean):[],topTools=Array.isArray(toolHeat.topTools)?toolHeat.topTools:[],legacyTools=legacy.tech_stack&&typeof legacy.tech_stack==="object"?Object.keys(legacy.tech_stack):[];
const topTool=topTools[0]?.toolName||toolNames[0]||legacyTools[0]||"--",topToolCount=N(topTools[0]?.count,0)||N(toolsS.maxEntriesPerSession,0)||N(toolsS.entriesCount,0),toolCalls=N(toolHeat.toolCallsTotal,0)||N(toolsS.toolCallsTotal,0)||N(toolsS.totalCalls,0)||N(toolsS.sessionsWithTools,0),toolKinds=N(toolHeat.toolKinds,0)||toolNames.length||legacyTools.length;
const topModelRaw=modelDim.dominantModelId||"--",topModel=(topModelRaw==="unknown"||topModelRaw==="--")?(modelS.model||"openclaw-default"):topModelRaw,modelShare=N(modelDim.dominantRatio,0)*100;
const level=comp.level||"D",levelMap={S:"Legend",A:"Master",B:"Advanced",C:"Skilled",D:"Rookie"};
const peak=Array.isArray(habit.peakHours)&&habit.peakHours.length?habit.peakHours.map(i=>i.hour).slice(0,3).join(", "):"--";
const kws=[];topTools.slice(0,3).forEach(t=>t&&t.toolName&&kws.push({word:t.toolName,weight:N(t.count,1)+8}));topSkills.slice(0,3).forEach(s=>{const n=s.skillName||s.name;n&&kws.push({word:n,weight:N(s.count,1)+6})});skillsS.slice(0,3).forEach((n,i)=>n&&kws.push({word:n,weight:Math.max(4,7-i)}));
const uniq=[],seen=new Set();kws.forEach(i=>{const k=String(i.word);if(!seen.has(k)){seen.add(k);uniq.push(i)}});
const topKeywords=uniq.slice(0,3).map(i=>i.word),cloud=uniq.length?uniq:[{word:topModel,weight:12},{word:topTool,weight:10},{word:levelMap[level]||level,weight:8}];
const last=sess.lastActiveAt||sess.updatedAt||heartbeatS.lastHeartbeatSentAt||payload.updatedAt||"",ctx=N(tokenS.contextTokensMax,0)||N(sess.contextTokensMax,0);
const rowLabels=(typeof L!=="undefined"&&i18n[L]&&i18n[L].rowLabels)?i18n[L].rowLabels:["Session Count","Token Input","Token Output","Token Total","Cache Read / Write","Model Provider","Model","Last Channel","Origin","Last Active","Context Tokens Max","Tools Schema Count","Tools Sessions","Tool Names","Heartbeat","Heartbeat Text","Scheduled tasks","systemSent","compactionCount","systemPromptChars","workspaceInjectedFiles","skills"];
const no=(typeof L!=="undefined"&&i18n[L])?i18n[L].noData:"暂无数据";
const rows=[[rowLabels[0],fmt(sessCnt)],[rowLabels[1],fmt(inTok)],[rowLabels[2],fmt(outTok)],[rowLabels[3],fmt(sumTok)],[rowLabels[4],`${fmt(cRead)} / ${fmt(cWrite)}`],[rowLabels[5],modelS.modelProvider||"--"],[rowLabels[6],modelS.model||"--"],[rowLabels[7],(channelS.lastChannel||[]).join(", ")||"--"],[rowLabels[8],`${(channelS.originProvider||[]).join(', ')||'--'} / ${(channelS.originSurface||[]).join(', ')||'--'}`],[rowLabels[9],dts(last)],[rowLabels[10],fmt(ctx)],[rowLabels[11],fmt(N(toolsS.entriesCount,0))],[rowLabels[12],fmt(N(toolsS.sessionsWithTools,0))],[rowLabels[13],toolNames.slice(0,8).join(', ')||legacyTools.slice(0,8).join(', ')||"--"],[rowLabels[14],dts(heartbeatS.lastHeartbeatSentAt)],[rowLabels[15],heartbeatS.lastHeartbeatText?String(heartbeatS.lastHeartbeatText).slice(0,80):"--"],[rowLabels[16],scheduledTasksDisplay],[rowLabels[17],fmt(N(statusS.systemSentCount,0))],[rowLabels[18],fmt(N(statusS.compactionCountSum,0))],[rowLabels[19],fmt(N(sess.systemPromptChars,0))],[rowLabels[20],fmt(N(sess.injectedWorkspaceFilesCount,0))],[rowLabels[21],skillsS.slice(0,12).join(', ')||"--"]];
return {composite:Math.round(N(comp.score,0)),level,levelName:(typeof L!=="undefined"&&i18n[L]&&i18n[L].levelMap&&i18n[L].levelMap[level])?i18n[L].levelMap[level]:levelMap[level]||level,tokenSourceLabel,usedEstimate,partialDataHint,rhythmLabel,rank:`L${N(comp.score,0)>=90?'5':N(comp.score,0)>=80?'4':N(comp.score,0)>=70?'3':N(comp.score,0)>=60?'2':'1'}`,cons:Math.round(N(consumption.score,0)),model:Math.round(N(modelDim.score,0)),tool:Math.round(N(toolHeat.score,0)),habit:Math.round(N(habit.score,0)),health:Math.round(N(health.score,0)),topKeywords,cloud,tokens:totalTok>0?fmt(totalTok):no,cacheHit:cacheHit>0?pct(cacheHit,1,no):no,cost:money(cost,no),cacheRead:fmt(cRead),cacheWrite:fmt(cWrite),inTok:fmt(inTok),outTok:fmt(outTok),sumTok:fmt(sumTok),topModel,modelShare:pct(modelShare),modelSpread:`${fmt(N(modelDim.uniqueModelCount,0))}/${fmt(N(modelDim.totalModelCalls,0))}`,topTool,topToolCount:fmt(topToolCount),toolCalls:fmt(toolCalls),toolKinds:fmt(toolKinds),rhythm:habit.workRhythm||"unknown",rhythmLabel,peak,active:fmt(N(habit.activeHours,0)),success:Number.isFinite(success)?pct(success,0,no):no,abnormal:pct(abnormal,0,no),sessCnt:fmt(sessCnt),last:dts(last),ctx:fmt(ctx),provider:modelS.modelProvider||"--",modelRaw:modelS.model||"--",channel:(channelS.lastChannel||[]).join(', ')||"--",origin:`${(channelS.originProvider||[]).join(', ')||'--'} / ${(channelS.originSurface||[]).join(', ')||'--'}`,injected:fmt(N(sess.injectedWorkspaceFilesCount,0)),spChars:fmt(N(sess.systemPromptChars,0)),heartbeatText:heartbeatS.lastHeartbeatText?String(heartbeatS.lastHeartbeatText).slice(0,60):"--",scheduledTasksCount:scheduledTasksDisplay,healthScheduledTasksCard:scheduledTasksDisplay,gatewayScheduledTasksPreview:gwBlock,heartbeatTasksPreview:hbBlock,heartbeatFromFile:hbReadOk||!!sessHb,rows,radar:[Math.max(0,Math.min(100,Math.round(N(consumption.score,0)))),Math.max(0,Math.min(100,Math.round(N(modelDim.score,0)))),Math.max(0,Math.min(100,Math.round(N(toolHeat.score,0)))),Math.max(0,Math.min(100,Math.round(N(habit.score,0)))),Math.max(0,Math.min(100,Math.round(N(health.score,0)))),Math.max(0,Math.min(100,Math.round(N(comp.score,0))))]};
}
function getCardDesc(i,j,m,L){const g=i18n[L];if(!g||!g.themes[i]||!g.themes[i][j])return"";const d=g.themes[i][j].d;if(d)return d;if(i===0&&j===4)return L==="zh"?`高峰 ${m.peak} · 活跃 ${m.active}`:`peak ${m.peak} · active ${m.active}`;if(i===1&&j===1)return L==="zh"?`合计 ${m.sumTok}`:`total ${m.sumTok}`;if(i===1&&j===2)return L==="zh"?`读 ${m.cacheRead} / 写 ${m.cacheWrite}`:`read ${m.cacheRead} / write ${m.cacheWrite}`;if(i===2&&j===0)return `share ${m.modelShare}`;if(i===2&&j===1)return L==="zh"?"不同模型/总调用":`unique / total calls`;if(i===2&&j===2)return `count ${m.topToolCount}`;if(i===2&&j===3)return L==="zh"?`工具种类 ${m.toolKinds}`:`tool kinds ${m.toolKinds}`;if(i===2&&j===4)return `raw model: ${m.modelRaw}`;if(i===3&&j===4)return `channel ${m.channel}`;if(i===4&&j===0)return m.origin;if(i===4&&j===2)return L==="zh"?`系统提示字数 ${m.spChars}`:`system prompt chars ${m.spChars}`;if(i===4&&j===3)return "sessions.cache";if(i===4&&j===4)return "sessions.updatedAt";return "";}
function themes(m,L){L=L||state.lang;const top3=m.topKeywords&&m.topKeywords.length?m.topKeywords.join(' / '):'--';const g=i18n[L],names=g.themeNames,themesArr=g.themes;
const c0=[{t:themesArr[0][0].t,v:top3,d:themesArr[0][0].d||"Tool + skill activation signals"},{t:themesArr[0][1].t,v:`${m.rank} · ${m.level}`,d:g.levelMap[m.level]||m.levelName},{t:themesArr[0][2].t,v:fmt(m.composite),d:themesArr[0][2].d||"composite score"},{t:themesArr[0][3].t,v:`${m.cons} / ${m.model} / ${m.tool}`,d:themesArr[0][3].d||"consumption / model / tool"},{t:themesArr[0][4].t,v:m.rhythmLabel||m.rhythm,d:getCardDesc(0,4,m,L)},{t:themesArr[0][5].t,v:m.peak,d:themesArr[0][5].d||""},{t:themesArr[0][6].t,v:m.active,d:themesArr[0][6].d||""},{t:themesArr[0][7].t,v:fmt(m.habit),d:themesArr[0][7].d||""},{t:themesArr[0][8].t,v:fmt(m.health),d:themesArr[0][8].d||""}];
const c1=[{t:themesArr[1][0].t,v:m.tokens,d:(themesArr[1][0].d||"portrait + sessions summary")+(m.tokenSourceLabel?" · "+m.tokenSourceLabel:"")},{t:themesArr[1][1].t,v:`${m.inTok} / ${m.outTok}`,d:getCardDesc(1,1,m,L)},{t:themesArr[1][2].t,v:m.cacheHit,d:getCardDesc(1,2,m,L)},{t:themesArr[1][3].t,v:m.cost,d:themesArr[1][3].d||"consumption.totalCostUSD"},{t:themesArr[1][4].t,v:m.ctx,d:themesArr[1][4].d||"token.contextTokensMax"},{t:themesArr[1][5].t,v:m.cacheRead,d:themesArr[1][5].d||""},{t:themesArr[1][6].t,v:m.cacheWrite,d:themesArr[1][6].d||""},{t:themesArr[1][7].t,v:m.sumTok,d:themesArr[1][7].d||""},{t:themesArr[1][8].t,v:m.tokenSourceLabel||"--",d:themesArr[1][8].d||""}];
const c2=[{t:themesArr[2][0].t,v:m.topModel,d:getCardDesc(2,0,m,L)},{t:themesArr[2][1].t,v:m.modelSpread,d:getCardDesc(2,1,m,L)},{t:themesArr[2][2].t,v:m.topTool,d:getCardDesc(2,2,m,L)},{t:themesArr[2][3].t,v:m.toolCalls,d:getCardDesc(2,3,m,L)},{t:themesArr[2][4].t,v:m.provider,d:getCardDesc(2,4,m,L)},{t:themesArr[2][5].t,v:m.modelRaw,d:themesArr[2][5].d||""},{t:themesArr[2][6].t,v:m.toolKinds,d:themesArr[2][6].d||""},{t:themesArr[2][7].t,v:m.topToolCount,d:themesArr[2][7].d||""}];
const c3=[{t:themesArr[3][0].t,v:fmt(m.health),d:themesArr[3][0].d||"stabilityHealth.score"},{t:themesArr[3][1].t,v:m.success,d:(themesArr[3][1].d||"health.successRate / status.successRate")+(m.partialDataHint?" · "+m.partialDataHint:"")},{t:themesArr[3][2].t,v:m.abnormal,d:themesArr[3][2].d||"health.abnormalInterruptionRate"},{t:themesArr[3][3].t,v:m.last,d:themesArr[3][3].d||"sessions.updatedAt / heartbeat"},{t:themesArr[3][4].t,v:`${m.sessCnt} ${L==="zh"?"次会话":"sessions"}`,d:getCardDesc(3,4,m,L)},{t:themesArr[3][5].t,v:m.channel,d:themesArr[3][5].d||""},{t:themesArr[3][6].t,v:m.origin,d:themesArr[3][6].d||""},{t:themesArr[3][7].t,v:m.healthScheduledTasksCard||m.scheduledTasksCount,d:themesArr[3][7].d||""}];
const c4=[{t:themesArr[4][0].t,v:m.channel,d:getCardDesc(4,0,m,L)},{t:themesArr[4][1].t,v:m.ctx,d:themesArr[4][1].d||"token.contextTokensMax"},{t:themesArr[4][2].t,v:m.injected,d:getCardDesc(4,2,m,L)},{t:themesArr[4][3].t,v:`${m.cacheRead} / ${m.cacheWrite}`,d:getCardDesc(4,3,m,L)},{t:themesArr[4][4].t,v:m.last,d:getCardDesc(4,4,m,L)},{t:themesArr[4][5].t,v:m.provider,d:themesArr[4][5].d||""},{t:themesArr[4][6].t,v:m.spChars,d:themesArr[4][6].d||""},{t:themesArr[4][7].t,v:m.scheduledTasksCount,d:themesArr[4][7].d||""},{t:themesArr[4][8].t,v:(m.heartbeatText||"--").slice(0,50)+(m.heartbeatText&&m.heartbeatText.length>50?"…":""),d:themesArr[4][8].d||""}];
return [{n:names[0],c:c0},{n:names[1],c:c1},{n:names[2],c:c2},{n:names[3],c:c3},{n:names[4],c:c4},{n:names[5],c:[]},{n:names[6],c:[]}];}
function renderCloud(words){wc.innerHTML='';const pal=['#00ff41','#f4f8ff','#9fd3ff','#ff9c9c','#ffd28a'];words.forEach((it,i)=>{const s=document.createElement('span');const w=Math.max(6,Math.min(28,N(it.weight,10)));s.textContent=String(it.word||'--');s.style.fontSize=`${10+w}px`;s.style.color=pal[i%pal.length];s.style.borderColor=i%2===0?'rgba(0,255,65,.34)':'rgba(230,57,70,.34)';wc.appendChild(s);});}
function drawRadar(scores,L){L=L||state.lang;const ctx=radar.getContext('2d'),r=window.devicePixelRatio||1,size=Math.min(radar.clientWidth||380,380);radar.width=Math.floor(size*r);radar.height=Math.floor(size*r);radar.style.width=`${size}px`;radar.style.height=`${size}px`;ctx.setTransform(r,0,0,r,0,0);ctx.clearRect(0,0,size,size);const labels=(i18n[L]&&i18n[L].radarLabels)||['Consumption','Model','Tool','Habit','Health','Composite'],c={x:size/2,y:size/2},rad=size*.34,p=labels.length;for(let k=1;k<=5;k++){ctx.beginPath();for(let i=0;i<p;i++){const a=Math.PI*2*i/p-Math.PI/2,rr=rad*k/5,x=c.x+Math.cos(a)*rr,y=c.y+Math.sin(a)*rr;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.strokeStyle='rgba(255,255,255,.16)';ctx.stroke();}
for(let i=0;i<p;i++){const a=Math.PI*2*i/p-Math.PI/2,x=c.x+Math.cos(a)*rad,y=c.y+Math.sin(a)*rad;ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.lineTo(x,y);ctx.strokeStyle='rgba(255,255,255,.18)';ctx.stroke();ctx.fillStyle='#8fa5be';ctx.font='11px JetBrains Mono';ctx.textAlign='center';ctx.fillText(labels[i],c.x+Math.cos(a)*(rad+22),c.y+Math.sin(a)*(rad+22));}
ctx.beginPath();scores.forEach((v,i)=>{const a=Math.PI*2*i/p-Math.PI/2,rr=Math.max(0,Math.min(100,N(v,0)))/100*rad,x=c.x+Math.cos(a)*rr,y=c.y+Math.sin(a)*rr;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.fillStyle='rgba(230,57,70,.24)';ctx.strokeStyle='rgba(0,255,65,.92)';ctx.lineWidth=2;ctx.fill();ctx.stroke();}
function renderRows(rows){list.innerHTML='';rows.forEach(r=>{const d=document.createElement('div');d.className='row';d.innerHTML='<div class="k"></div><div class="v"></div>';d.querySelector('.k').textContent=r[0];d.querySelector('.v').textContent=r[1];list.appendChild(d);});}
function refreshDetails(){if(!state.metrics)return;drawRadar(state.metrics.radar||[],state.lang);renderCloud(state.metrics.cloud||[]);renderRows(state.metrics.rows||[]);}
function orbitR(){const w=window.innerWidth,h=window.innerHeight,m=Math.min(w,h);if(w<=700)return{rx:Math.max(130,m*.32),ry:Math.max(92,m*.22)};if(w<=980)return{rx:Math.max(185,m*.38),ry:Math.max(122,m*.26)};return{rx:Math.max(280,m*.46),ry:Math.max(165,m*.30)}}
function pose(i,t){const o=orbitR(),a=Math.PI*2*i/Math.max(t,1)-Math.PI/2;return{x:Math.cos(a)*o.rx,y:Math.sin(a)*o.ry}}
function cardNode(data,i,t,themeIdx){const c=document.createElement('article');c.className='card';c.setAttribute('role','button');c.setAttribute('tabindex','0');c.dataset.theme=String(themeIdx);c.dataset.card=String(i);c.innerHTML=`<h3>${data.t}</h3><div class="v"></div><p class="d">${data.d}</p>`;const ve=c.querySelector('.v');if(ve)ve.textContent=data.v!=null?String(data.v):'';const p=pose(i,t);c.dataset.x=String(p.x);c.dataset.y=String(p.y);c.style.opacity='0';c.style.transform=`translate3d(${state.dir*10}px,0,0) scale(.35)`;return c;}
function openCardModal(themeIdx,cardIdx){const L=state.lang;const help=i18n[L].cardHelp;const labels=i18n[L].cardModalLabels;if(!help||!help[themeIdx]||!help[themeIdx][cardIdx])return;const h=help[themeIdx][cardIdx];const th=state.themes[themeIdx];const cardTitle=th&&th.c&&th.c[cardIdx]?th.c[cardIdx].t:"";const modal=$("card-modal");if(!modal)return;modal.querySelector("#card-modal-title").textContent=cardTitle;$("card-help-source").textContent=h.source||"--";$("card-help-analysis").textContent=h.analysis||"--";$("card-help-calc").textContent=h.calculation||"--";$("card-help-trait").textContent=h.ownerTrait||"--";$("card-help-source-label").textContent=labels.source;$("card-help-analysis-label").textContent=labels.analysis;$("card-help-calc-label").textContent=labels.calculation;$("card-help-trait-label").textContent=labels.ownerTrait;modal.classList.add("open");modal.setAttribute("aria-hidden","false");}
function closeCardModal(){const modal=$("card-modal");if(modal){modal.classList.remove("open");modal.setAttribute("aria-hidden","true");}}
function escapeHtml(s){if(s==null)return'';const t=String(s);const d=document.createElement('div');d.textContent=t;return d.innerHTML;}
function extractSessionsListFromGatewayValue(raw){
  const seen=new Set();
  let v=raw;
  for(let depth=0;depth<8;depth++){
    if(Array.isArray(v))return v;
    if(!v||typeof v!=='object'||seen.has(v))break;
    seen.add(v);
    if(Array.isArray(v.sessions))return v.sessions;
    if(Array.isArray(v.items))return v.items;
    if(Array.isArray(v.rows))return v.rows;
    if(Array.isArray(v.list))return v.list;
    if(Array.isArray(v.data))return v.data;
    if(Array.isArray(v.result))return v.result;
    if(v.result&&typeof v.result==='object'&&!Array.isArray(v.result)){v=v.result;continue;}
    if(v.payload&&typeof v.payload==='object'&&!Array.isArray(v.payload)){v=v.payload;continue;}
    if(v.data&&typeof v.data==='object'&&!Array.isArray(v.data)){v=v.data;continue;}
    break;
  }
  return [];
}
function hasSessionCollectionShape(raw){
  if(Array.isArray(raw))return true;
  if(!raw||typeof raw!=='object')return false;
  return !!(
    Array.isArray(raw.sessions)||
    Array.isArray(raw.items)||
    Array.isArray(raw.rows)||
    Array.isArray(raw.list)||
    Array.isArray(raw.data)||
    Array.isArray(raw.result)||
    (raw.result&&typeof raw.result==='object')||
    (raw.payload&&typeof raw.payload==='object')
  );
}
async function fetchGatewaySessionsData(){
  if(typeof ClawController==='undefined'||!ClawController||!ClawController.authenticated)return null;
  const preferred=Array.isArray(ClawController.supportedMethods)
    ? ClawController.supportedMethods.filter(m=>typeof m==='string'&&/(^|\.)(sessions?|conversations?)(\.|$)/i.test(m))
    : [];
  const rpcCandidates=[...new Set([...preferred,'sessions.list','session.list','chat.sessions.list','chat.sessions','conversations.list','conversation.list'])];
  let lastErr=null;
  for(const method of rpcCandidates){
    try{
      const res=await ClawController.rpcCall(method,{});
      if(hasSessionCollectionShape(res))return{source:'rpc',method,data:res};
      if(res!=null&&extractSessionsListFromGatewayValue(res).length)return{source:'rpc',method,data:res};
    }catch(e){lastErr=e;}
  }
  const httpCandidates=['/api/sessions','/sessions','/v1/sessions'];
  for(const path of httpCandidates){
    try{
      const res=await ClawController.apiRequest(path);
      if(hasSessionCollectionShape(res))return{source:'http',path,data:res};
      if(res!=null&&extractSessionsListFromGatewayValue(res).length)return{source:'http',path,data:res};
    }catch(e){lastErr=e;}
  }
  if(lastErr)throw lastErr;
  return null;
}
/* ===== LiveController: 实时后台标签数据轮询与渲染 ===== */
const LiveController={
  pollTimer:null,
  detailTimer:null,
  selectedKey:null,
  _lastSessionsList:[],
  _detailLoadSeq:0,
  POLL_INTERVAL:8000,
  DETAIL_INTERVAL:12000,
  _lang:()=>state.lang||'zh',
  _isVisible(){
    const liveView=document.getElementById('live-view');
    return !!((state&&state.idx===LIVE_IDX)||(liveView&&liveView.classList.contains('active')));
  },
  _setSessionsHint(text){
    const emptyEl=document.getElementById('live-sessions-empty');
    if(emptyEl){
      emptyEl.style.display='block';
      emptyEl.textContent=text||'';
    }
  },
  _extractSessionsList(data){
    return extractSessionsListFromGatewayValue(data);
  },

  /* ── 启动轮询 ── */
  start(){
    this.stop();
    this._setSessionsHint(this._lang()==='zh'?'正在加载会话…':'Loading sessions…');
    this._updateStatusDot(ClawController&&ClawController.authenticated?'connected':'idle');
    this._pollAll();
    this.pollTimer=setInterval(()=>this._pollAll(),this.POLL_INTERVAL);
  },

  /* ── 停止轮询 ── */
  stop(){
    if(this.pollTimer){clearInterval(this.pollTimer);this.pollTimer=null;}
    if(this.detailTimer){clearInterval(this.detailTimer);this.detailTimer=null;}
  },

  /* ── 一次性拉取所有摘要（含 models 供省钱版块） ── */
  async _pollAll(){
    const $=id=>document.getElementById(id);
    /* 无论是否已认证都先更新「方便」版块连接状态 */
    this._updateQuickBlocks(null,null,null);
    if(!ClawController||!ClawController.authenticated){
      if(this._isVisible())this.showOffline();
      return;
    }
    try{
      const [statusRes,healthRes,sessRes,tasksRes,usageRes,presRes,modelsRes]=await Promise.allSettled([
        ClawController.rpcCall('status',{}),
        ClawController.rpcCall('health',{}),
        fetchGatewaySessionsData(),
        ClawController.rpcCall('tasks.list',{}),
        ClawController.rpcCall('usage-cost',{}),
        ClawController.rpcCall('system-presence',{}),
        ClawController.rpcCall('models.list',{})
      ]);
      this._updateStatusBar(statusRes,healthRes,sessRes,tasksRes,usageRes,presRes);
      this._updateUsageDetail(usageRes);
      let sessionJustAutoSelected=false;
      if(sessRes.status==='fulfilled'&&sessRes.value&&sessRes.value.data)sessionJustAutoSelected=!!this._renderSessionList(sessRes.value.data);
      else this._setSessionsHint(this._lang()==='zh'?'已连接，但会话列表接口暂不可用':'Connected, but the sessions endpoint is unavailable');
      /* 同一会话已选时由此处拉取最新 chat.history（_selectSession 已会加载，避免重复） */
      if(this.selectedKey&&!sessionJustAutoSelected&&ClawController&&ClawController.authenticated&&sessRes.status==='fulfilled'&&sessRes.value&&sessRes.value.data){
        void this._loadSessionDetail(this.selectedKey);
      }
      this._updateQuickBlocks(statusRes,usageRes,modelsRes);
      persistLiveTaskSummary(tasksRes);
      try{
        if(tasksRes.status==='fulfilled'&&tasksRes.value!=null)window.__openclawScheduledTaskLabels=extractScheduledTaskLabelsFromGatewayRaw(tasksRes.value);
        else window.__openclawScheduledTaskLabels=[];
      }catch{}
      let st=this._scheduledTasksFromTasksRes(tasksRes);
      let listLen=0;
      if(tasksRes.status==='fulfilled'&&tasksRes.value!=null){
        try{listLen=extractTasksListFromGatewayValue(tasksRes.value).length;}catch{}
      }
      const needHttpFallback=tasksRes.status==='rejected'||tasksRes.value==null||st==null||(tasksRes.status==='fulfilled'&&listLen===0);
      if(needHttpFallback&&ClawController&&ClawController.getSavedToken){
        try{
          const httpRoll=await fetchGatewayScheduledTaskRollupViaHttp();
          if(httpRoll&&Number.isFinite(httpRoll.scheduled)){
            if(st==null||listLen===0||(st===0&&httpRoll.scheduled>0))st=httpRoll.scheduled;
            persistLiveTaskSummary({status:'fulfilled',value:Object.assign({},httpRoll.raw&&typeof httpRoll.raw==='object'?httpRoll.raw:{},{scheduled_tasks_count:httpRoll.scheduled,source:'http'})});
            try{if(httpRoll.raw)window.__openclawScheduledTaskLabels=extractScheduledTaskLabelsFromGatewayRaw(httpRoll.raw);}catch{}
          }
        }catch{}
      }
      if(st!=null)this._applyScheduledTasksToOrbit(st);
      this._updateStatusDot('connected');
    }catch(e){
      this._updateStatusDot('error');
      this._setSessionsHint((this._lang()==='zh'?'会话加载失败：':'Failed to load sessions: ')+(e&&e.message?e.message:String(e)));
    }
  },

  _scheduledTasksFromTasksRes(tasksRes){
    if(!tasksRes||tasksRes.status!=='fulfilled'||tasksRes.value==null)return null;
    const raw=tasksRes.value;
    const v=normalizeTasksRpcPayload(raw);
    const fromApi=pickScheduledCountFromGatewayObject(v);
    const list=extractTasksListFromGatewayValue(raw);
    const scheduledFromList=countOpenClawScheduledTasks(list);
    return mergeScheduledCounts(fromApi,scheduledFromList);
  },
  _applyScheduledTasksToOrbit(n){
    if(n==null||!Number.isFinite(n))return;
    try{window.__openclawScheduledTasksCount=Math.max(0,Math.floor(n));}catch{}
    if(!state||!state.payload)return;
    state.metrics=processStats(state.payload,state.lang||'zh');
    state.themes=themes(state.metrics,state.lang||'zh');
    if(state.idx===3||state.idx===4)renderTheme(state.idx);
    if(state.idx===6)refreshDetails();
  },

  /* ── 更新顶部状态条 ── */
  _updateStatusBar(statusRes,healthRes,sessRes,tasksRes,usageRes,presRes){
    const $=id=>document.getElementById(id);
    const L=this._lang();
    const gwEl=$('live-gw-status'),healthEl=$('live-gw-health'),scEl=$('live-sess-cnt'),tcEl=$('live-task-cnt'),ucEl=$('live-usage'),pcEl=$('live-presence');
    if(gwEl){
      let gwTxt='--';
      if(statusRes&&statusRes.status==='fulfilled'&&statusRes.value){const s=statusRes.value;gwTxt=s.status||s.state||'OK';}
      gwEl.textContent=gwTxt;
    }
    if(healthEl){
      let healthTxt='--';
      let healthClass='';
      if(healthRes&&healthRes.status==='fulfilled'&&healthRes.value){
        const h=healthRes.value;
        const ok=h&&(h.ok===true||h.healthy===true||h.status==='ok'||(typeof h.status==='string'&&h.status.toLowerCase()==='healthy'));
        healthTxt=ok?(L==='zh'?'正常':'OK'):(L==='zh'?'异常':'Error');
        healthClass=ok?'health-ok':'health-err';
      }
      healthEl.textContent=healthTxt;
      healthEl.className='live-stat-value '+healthClass;
    }
    if(scEl){
      let cnt='--';
      if(sessRes.status==='fulfilled'&&sessRes.value){const v=sessRes.value;cnt=Array.isArray(v)?v.length:(Array.isArray(v&&v.sessions)?v.sessions.length:'?');}
      scEl.textContent=cnt;
    }
    if(tcEl){
      let tc='--';
      if(tasksRes.status==='fulfilled'&&tasksRes.value){const v=tasksRes.value;tc=Array.isArray(v)?v.length:(Array.isArray(v&&v.tasks)?v.tasks.length:'?');}
      tcEl.textContent=tc;
    }
    if(ucEl){
      let uc='--';
      if(usageRes.status==='fulfilled'&&usageRes.value){const v=usageRes.value;uc=v.totalCostUSD!=null?`$${Number(v.totalCostUSD).toFixed(4)}`:v.cost||'?';}
      ucEl.textContent=uc;
    }
    if(pcEl){
      let pc='--';
      if(presRes.status==='fulfilled'&&presRes.value){const v=presRes.value;pc=Array.isArray(v)?v.length:(v&&v.count!=null?v.count:'?');}
      pcEl.textContent=pc;
    }
  },

  /* ── 更新用量明细（Token 总量 / 输入 / 输出） ── */
  _updateUsageDetail(usageRes){
    const $=id=>document.getElementById(id);
    const fmt=n=>n!=null&&Number.isFinite(Number(n))?(Number(n)>=1e6?(Number(n)/1e6).toFixed(1)+'M':Number(n)>=1e3?(Number(n)/1e3).toFixed(1)+'K':String(Number(n))):'--';
    const totalEl=$('live-token-total'),inEl=$('live-token-in'),outEl=$('live-token-out');
    if(!usageRes||usageRes.status!=='fulfilled'||!usageRes.value){
      if(totalEl)totalEl.textContent='--';if(inEl)inEl.textContent='--';if(outEl)outEl.textContent='--';
      return;
    }
    const v=usageRes.value;
    const total=v.totalTokens??(v.input!=null&&v.output!=null?v.input+v.output:null);
    if(totalEl)totalEl.textContent=fmt(total);
    if(inEl)inEl.textContent=fmt(v.input??v.inputTokens);
    if(outEl)outEl.textContent=fmt(v.output??v.outputTokens);
  },

  /* ── 更新新手三版块：省钱 / 方便 / 实用 ── */
  _updateQuickBlocks(statusRes,usageRes,modelsRes){
    const $=id=>document.getElementById(id);
    const L=this._lang();
    /* 方便：连接状态 */
    const connEl=$('live-conn-status');
    if(connEl){
      let connTxt='--';
      let connClass='offline';
      if(ClawController){
        if(ClawController.authenticated){connTxt=L==='zh'?'已连接':'Linked';connClass='linked';}
        else if(ClawController.ws&&ClawController.ws.readyState===WebSocket.CONNECTING){connTxt=L==='zh'?'连接中':'Connecting';connClass='connecting';}
        else{connTxt=L==='zh'?'未连接':'Offline';connClass='offline';}
      }
      connEl.textContent=connTxt;
      connEl.className='live-conn-status '+connClass;
    }
    /* 实用：Gateway */
    const gwBlockEl=$('live-block-gw');
    if(gwBlockEl){
      let gwTxt='--';
      if(statusRes&&statusRes.status==='fulfilled'&&statusRes.value){const s=statusRes.value;gwTxt=s.status||s.state||'OK';}
      gwBlockEl.textContent=gwTxt;
    }
    /* 省钱：用量 */
    const usageBlockEl=$('live-block-usage');
    if(usageBlockEl){
      let uc='--';
      if(usageRes&&usageRes.status==='fulfilled'&&usageRes.value){const v=usageRes.value;uc=v.totalCostUSD!=null?`$${Number(v.totalCostUSD).toFixed(4)}`:v.cost||'?';}
      usageBlockEl.textContent=uc;
    }
    /* 省钱：模型列表 */
    const modelsEl=$('live-models-list');
    if(modelsEl){
      if(modelsRes&&modelsRes.status==='fulfilled'&&modelsRes.value){
        const list=Array.isArray(modelsRes.value)?modelsRes.value:(Array.isArray(modelsRes.value&&modelsRes.value.models)?modelsRes.value.models:[]);
        if(list.length)modelsEl.textContent=list.slice(0,12).map(m=>typeof m==='string'?m:(m.id||m.name||m.model||'')).filter(Boolean).join(', ')+(list.length>12?' …':'');
        else modelsEl.textContent=L==='zh'?'暂无':'None';
      }else modelsEl.textContent='--';
    }
  },

  /* ── 渲染会话列表 ── */
  _renderSessionList(data){
    const container=document.getElementById('live-sessions-list');
    const emptyEl=document.getElementById('live-sessions-empty');
    if(!container)return false;
    let sessions=this._extractSessionsList(data);
    sessions=sessions.slice().sort((a,b)=>(new Date(b.updatedAt||b.createdAt||0)).getTime()-(new Date(a.updatedAt||a.createdAt||0)).getTime());
    this._lastSessionsList=sessions;
    if(!sessions.length){
      container.innerHTML='';
      if(emptyEl){container.appendChild(emptyEl);emptyEl.style.display='block';emptyEl.textContent=this._lang()==='zh'?'暂无会话数据':'No sessions';}
      return false;
    }
    if(emptyEl)emptyEl.style.display='none';
    container.innerHTML='';
    sessions.forEach(s=>{
      const key=s.sessionKey||s.key||s.id||'unknown';
      const active=s.status==='active'||s.active||s.running;
      const ts=s.updatedAt||s.createdAt||s.lastActivity||'';
      const tsStr=ts?new Date(ts).toLocaleTimeString():'';
      const item=document.createElement('div');
      item.className='live-session-item'+(this.selectedKey===key?' selected':'');
      item.dataset.key=key;
      item.innerHTML=`<div class="si-key" title="${key}">${key}</div><div class="si-meta"><span class="si-status${active?'':' inactive'}">${active?'active':'idle'}</span>${tsStr?`<span>${tsStr}</span>`:''}</div>`;
      item.addEventListener('click',()=>this._selectSession(key,item));
      container.appendChild(item);
    });
    const loadSelect=document.getElementById('chat-load-session');
    const loadLabel=document.getElementById('chat-load-session-label');
    if(loadSelect){
      const L=this._lang();
      if(loadLabel)loadLabel.textContent=L==='zh'?'加载会话':'Load session';
      loadSelect.innerHTML='<option value="">'+(L==='zh'?'选择会话…':'Select session…')+'</option>';
      sessions.forEach(s=>{
        const key=s.sessionKey||s.key||s.id||'unknown';
        const opt=document.createElement('option');
        opt.value=key;
        opt.textContent=key.length>36?key.slice(0,36)+'…':key;
        loadSelect.appendChild(opt);
      });
      const lastKey=typeof localStorage!=='undefined'?localStorage.getItem('openclaw2_lastSessionKey'):null;
      const toSelect=lastKey&&sessions.some(s=>(s.sessionKey||s.key||s.id)===''+lastKey)?lastKey:(sessions[0]&&(sessions[0].sessionKey||sessions[0].key||sessions[0].id));
      const currentKey=this.selectedKey&&sessions.some(s=>String(s.sessionKey||s.key||s.id)===String(this.selectedKey))?this.selectedKey:null;
      if(toSelect){
        loadSelect.value=currentKey||toSelect;
        /* 仅首次或当前选中已不在列表时切换选中；同一会话由 _pollAll 末尾 _loadSessionDetail 刷新 */
        if(!currentKey)this._selectSession(toSelect,null);
      }
      if(typeof window.renderChatAgentTabs==='function')window.renderChatAgentTabs(sessions,(currentKey||toSelect)||null);
      return!currentKey&&!!toSelect;
    }
    if(sessions.length){
      /* 无 chat-load-session 时仍要首次打开详情 */
      const lastKey=typeof localStorage!=='undefined'?localStorage.getItem('openclaw2_lastSessionKey'):null;
      const toSelect=lastKey&&sessions.some(s=>(s.sessionKey||s.key||s.id)===''+lastKey)?lastKey:(sessions[0]&&(sessions[0].sessionKey||sessions[0].key||sessions[0].id));
      const currentKey=this.selectedKey&&sessions.some(s=>String(s.sessionKey||s.key||s.id)===String(this.selectedKey))?this.selectedKey:null;
      if(!currentKey&&toSelect){
        this._selectSession(toSelect,null);
        return true;
      }
    }
    return false;
  },

  /* ── 选中一条会话 ── */
  _selectSession(key,itemEl){
    this.selectedKey=key;
    try{localStorage.setItem('openclaw2_lastSessionKey',key);}catch(e){}
    document.querySelectorAll('.live-session-item').forEach(el=>el.classList.toggle('selected',el.dataset.key===key));
    const loadSelect=document.getElementById('chat-load-session');
    if(loadSelect)loadSelect.value=key;
    const tabsEl=document.getElementById('chat-agents-tabs');
    if(tabsEl)tabsEl.querySelectorAll('.agent-tab').forEach(t=>t.classList.toggle('active',t.dataset.key===key));
    this._loadSessionDetail(key);
  },

  /* ── 加载会话详情：概要 + 尝试 chat.history 拉取最近对话内容与模型 ── */
  async _loadSessionDetail(key){
    const seq=++this._detailLoadSeq;
    const detailContent=document.getElementById('live-detail-content');
    const placeholder=document.getElementById('live-detail-placeholder');
    const keyEl=document.getElementById('live-detail-key');
    const statusEl=document.getElementById('live-detail-status');
    const historyEl=document.getElementById('live-chat-history');
    if(!detailContent||!placeholder)return;
    if(keyEl)keyEl.textContent=key;
    detailContent.style.display='flex';
    placeholder.style.display='none';
    const session=this._lastSessionsList&&this._lastSessionsList.find(s=>(s.sessionKey||s.key||s.id)===''+key);
    if(statusEl)statusEl.textContent=session?(session.status||session.state||(session.active?'active':'idle')):'--';
    if(!historyEl)return;
    const L=this._lang();
    historyEl.innerHTML='<div class="live-detail-loading" id="live-detail-loading">'+(L==='zh'?'加载对话…':'Loading chat…')+'</div>';
    let messages=[];
    if(ClawController&&ClawController.authenticated){
      try{
        const res=await ClawController.rpcCall('chat.history',{sessionKey:key,limit:100});
        messages=ClawController.getMessagesFromHistoryResponse?ClawController.getMessagesFromHistoryResponse(res):(Array.isArray(res&&res.messages)?res.messages:[]);
      }catch(_){}
    }
    if(seq!==this._detailLoadSeq)return;
    if(ClawController&&typeof ClawController.syncHistoryFromMessages==='function')ClawController.syncHistoryFromMessages(messages,key);
    const loadingEl=document.getElementById('live-detail-loading');
    if(loadingEl)loadingEl.remove();
    if(!session){
      historyEl.innerHTML=`<div style="color:var(--dim);font-size:11px;padding:8px">${L==='zh'?'未找到该会话':'Session not found'}</div>`;
      if(messages.length){
        const list=document.createElement('div');
        list.className='live-chat-messages';
        list.setAttribute('aria-label',L==='zh'?'最近对话':'Recent messages');
        messages.forEach(m=>{
          const role=(m.role||m.type||'').toLowerCase();
          const isUser=role==='user';
          const content=typeof m.content==='string'?m.content:(m.text||(m.parts&&m.parts[0]&&m.parts[0].text)||JSON.stringify(m).slice(0,200));
          const modelHint=m.model?` <span class="live-msg-model">${m.model}</span>`:'';
          const div=document.createElement('div');
          div.className='live-msg '+(isUser?'user-msg':'ai-msg');
          div.innerHTML=`<div class="live-msg-role">${isUser?(L==='zh'?'用户':'User'):(L==='zh'?'助手':'Assistant')}${modelHint}</div><div class="live-msg-bubble">${escapeHtml(content)}</div>`;
          list.appendChild(div);
        });
        historyEl.appendChild(list);
      }
      return;
    }
    const modelName=session.model||session.modelId||session.defaultModel||'--';
    const rows=[];
    rows.push({k:L==='zh'?'模型':'Model',v:modelName});
    if(session.updatedAt||session.createdAt)rows.push({k:L==='zh'?'更新时间':'Updated',v:new Date(session.updatedAt||session.createdAt).toLocaleString()});
    if(session.createdAt&&session.updatedAt!==session.createdAt)rows.push({k:L==='zh'?'创建时间':'Created',v:new Date(session.createdAt).toLocaleString()});
    if(session.usage&&(session.usage.totalTokens!=null||session.usage.input!=null))rows.push({k:L==='zh'?'Token':'Tokens',v:[session.usage.totalTokens,session.usage.input,session.usage.output].filter(x=>x!=null).join(' / ')||'--'});
    Object.keys(session).filter(x=>!['sessionKey','key','id','status','state','active','updatedAt','createdAt','lastActivity','model','modelId','defaultModel','usage'].includes(x)).slice(0,8).forEach(k=>{const v=session[k];if(v!=null&&typeof v!=='object')rows.push({k,v:String(v)});});
    let html=`<div class="live-detail-summary" style="margin-bottom:12px;padding:10px;background:rgba(255,255,255,.04);border-radius:8px;font-size:11px;color:var(--dim);">`;
    rows.forEach(r=>{html+=`<div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:4px;"><span>${r.k}</span><span style="color:var(--txt)">${escapeHtml(r.v)}</span></div>`;});
    html+=`</div>`;
    historyEl.innerHTML=html;
    if(messages.length){
      const list=document.createElement('div');
      list.className='live-chat-messages';
      list.setAttribute('aria-label',L==='zh'?'最近对话':'Recent messages');
      messages.forEach(m=>{
        const role=(m.role||m.type||'').toLowerCase();
        const isUser=role==='user';
        const content=typeof m.content==='string'?m.content:(m.text||(m.parts&&m.parts[0]&&m.parts[0].text)||JSON.stringify(m).slice(0,200));
        const modelHint=m.model?` <span class="live-msg-model">${m.model}</span>`:'';
        const div=document.createElement('div');
        div.className='live-msg '+(isUser?'user-msg':'ai-msg');
        div.innerHTML=`<div class="live-msg-role">${isUser?(L==='zh'?'用户':'User'):(L==='zh'?'助手':'Assistant')}${modelHint}</div><div class="live-msg-bubble">${escapeHtml(content)}</div>`;
        list.appendChild(div);
      });
      historyEl.appendChild(list);
    }else{
      const p=document.createElement('p');
      p.style.cssText='font-size:11px;color:var(--dim);margin:0;';
      p.textContent=L==='zh'?'无对话记录或接口不可用。':'No messages or API unavailable.';
      historyEl.appendChild(p);
    }
  },

  /* ── 状态点 ── */
  _updateStatusDot(state){
    const dot=document.getElementById('live-status-dot');
    if(!dot)return;
    dot.classList.remove('connected','error');
    if(state==='connected')dot.classList.add('connected');
    else if(state==='error')dot.classList.add('error');
  },

  /* ── 无 Gateway 时显示提示 ── */
  showOffline(){
    const container=document.getElementById('live-sessions-list');
    const emptyEl=document.getElementById('live-sessions-empty');
    const L=this._lang();
    if(emptyEl){
      const g=typeof OpenClawGateway!=='undefined'&&OpenClawGateway&&typeof OpenClawGateway.getDisplay==='function'?OpenClawGateway.getDisplay():'';
      emptyEl.style.display='block';
      emptyEl.textContent=L==='zh'?('未连接 Gateway，请先连接'+(g?' '+g:'')):('Gateway not connected. Please connect to'+(g?' '+g:''));
    }
    const gwEl=document.getElementById('live-gw-status');
    if(gwEl)gwEl.textContent=L==='zh'?'未连接':'Offline';
    const healthEl=document.getElementById('live-gw-health');
    if(healthEl){healthEl.textContent='--';healthEl.className='live-stat-value';}
    const gwBlockEl=document.getElementById('live-block-gw');
    if(gwBlockEl)gwBlockEl.textContent=L==='zh'?'未连接':'Offline';
    this._updateUsageDetail(null);
    this._updateQuickBlocks(null,null,null);
    this._updateStatusDot('error');
    try{
      window.__openclawScheduledTaskLabels=[];
      window.__openclawHeartbeatMdReadOk=false;
      window.__openclawHeartbeatTasksLines=[];
      delete window.__openclawHeartbeatTasksCount;
    }catch{}
    if(state&&state.payload){
      state.metrics=processStats(state.payload,state.lang||'zh');
      state.themes=themes(state.metrics,state.lang||'zh');
      if(state.idx===3||state.idx===4)renderTheme(state.idx);
      if(state.idx===6)refreshDetails();
    }
  },

  /* ── 更新标签语言 ── */
  updateLabels(L){
    const map={
      'live-sessions-title':{'zh':'实时会话','en':'Live Sessions'},
      'lbl-gw-status':{'zh':'Gateway','en':'Gateway'},
      'lbl-gw-health':{'zh':'健康','en':'Health'},
      'live-gw-restart-btn':{'zh':'重启网关','en':'Restart gateway'},
      'lbl-token-total':{'zh':'Token 总量','en':'Total tokens'},
      'lbl-token-in':{'zh':'输入','en':'Input'},
      'lbl-token-out':{'zh':'输出','en':'Output'},
      'lbl-sess-cnt':{'zh':'会话数','en':'Sessions'},
      'lbl-task-cnt':{'zh':'任务','en':'Tasks'},
      'lbl-usage':{'zh':'用量','en':'Usage'},
      'lbl-presence':{'zh':'在线实例','en':'Online'},
      'live-sessions-empty':{'zh':'等待 Gateway 连接...','en':'Waiting for Gateway...'},
      'live-select-hint':{'zh':'← 选择一条会话查看详情','en':'← Select a session to view details'},
      'live-block-save-title':{'zh':'省钱','en':'Save $'},
      'live-block-easy-title':{'zh':'方便','en':'Convenience'},
      'live-block-use-title':{'zh':'实用','en':'Practical'},
      'lbl-block-usage':{'zh':'用量','en':'Usage'},
      'lbl-block-models':{'zh':'模型','en':'Models'},
      'lbl-block-conn':{'zh':'连接','en':'Connection'},
      'lbl-block-gw':{'zh':'Gateway','en':'Gateway'},
      'live-refresh-models':{'zh':'刷新模型','en':'Refresh models'},
      'live-fetch-link':{'zh':'获取对话链接','en':'Get dialogue link'},
      'live-copy-link':{'zh':'复制链接','en':'Copy link'},
      'live-block-use-hint':{'zh':'左侧为会话列表，选一条可看详情','en':'Sessions on the left; select one for details'},
      'live-open-chat':{'zh':'打开聊天','en':'Open chat'}
    };
    Object.entries(map).forEach(([id,texts])=>{const el=document.getElementById(id);if(el)el.textContent=texts[L]||texts['zh'];});
  }
};

/* 绑定实时视图 close / 刷新 / 三版块按钮 */
(function(){
  const $=id=>document.getElementById(id);
  const closeBtn=document.getElementById('live-detail-close');
  if(closeBtn)closeBtn.addEventListener('click',()=>{
    const dc=document.getElementById('live-detail-content');
    const ph=document.getElementById('live-detail-placeholder');
    if(dc)dc.style.display='none';
    if(ph)ph.style.display='flex';
    LiveController.selectedKey=null;
    document.querySelectorAll('.live-session-item').forEach(el=>el.classList.remove('selected'));
  });
  const refreshBtn=document.getElementById('live-refresh-btn');
  if(refreshBtn)refreshBtn.addEventListener('click',()=>{
    if(state.idx===LIVE_IDX){
      if(ClawController&&ClawController.authenticated)LiveController._pollAll();
      else LiveController.showOffline();
    }
  });
  /* 重启网关 */
  const gwRestartBtn=$('live-gw-restart-btn');
  const GW_RESTART_CMD='openclaw gateway restart';
  if(gwRestartBtn)gwRestartBtn.addEventListener('click',async ()=>{
    gwRestartBtn.classList.add('loading');
    const L=state.lang==='zh';
    /* 1) 尝试网关 HTTP 重启（不依赖 npm run dev；若网关提供 /api/restart 或 /restart 则生效） */
    for(const path of['/api/restart','/restart','/api/gateway-restart']){
      try{
        const r=await fetch(OpenClawGateway.httpBase()+path,{method:'POST',headers:{'Content-Type':'application/json'},mode:'cors'});
        const body=await r.json().catch(()=>({}));
        if(r.ok&&(body&&(body.ok===true||body.success===true))){
          gwRestartBtn.classList.remove('loading');
          alert(L?'网关重启指令已发送，请稍候连接恢复':'Gateway restart sent. Reconnect in a moment.');
          return;
        }
      }catch(_){}
    }
    /* 2) 同源开发服务执行命令行（需 npm run dev） */
    try{
      const r=await fetch(window.location.origin+'/api/gateway-restart',{method:'POST',headers:{'Content-Type':'application/json'}});
      const body=await r.json().catch(()=>({}));
      if(r.ok&&body&&body.ok){
        gwRestartBtn.classList.remove('loading');
        alert(L?'已通过本地命令执行 openclaw gateway restart，网关约几秒后恢复':'openclaw gateway restart executed. Gateway will be back in a few seconds.');
        return;
      }
      if(r.status!==404&&body&&!body.ok){
        gwRestartBtn.classList.remove('loading');
        alert(L?'执行失败: '+(body.error||''):'Failed: '+(body.error||''));
        return;
      }
    }catch(_){}
    /* 3) 网关 WebSocket RPC */
    if(ClawController&&ClawController.authenticated){
      try{
        await ClawController.rpcCall('gateway.restart',{});
        gwRestartBtn.classList.remove('loading');
        alert(L?'重启指令已发送':'Restart command sent');
        return;
      }catch(e){
        try{
          await ClawController.rpcCall('lifecycle.restart',{});
          gwRestartBtn.classList.remove('loading');
          alert(L?'重启指令已发送':'Restart command sent');
          return;
        }catch(e2){}
      }
    }
    gwRestartBtn.classList.remove('loading');
    const msg=L?'无法远程重启。请在本机终端执行以下命令（可点击复制）：':'Cannot restart remotely. Run this in your terminal (click to copy):';
    const copied=L?'已复制，请到终端粘贴并回车':'Copied. Paste in terminal and press Enter.';
    const copyAndAlert=()=>{
      navigator.clipboard&&navigator.clipboard.writeText(GW_RESTART_CMD).then(()=>alert(msg+'\n\n'+GW_RESTART_CMD+'\n\n'+copied)).catch(()=>alert(msg+'\n\n'+GW_RESTART_CMD));
    };
    if(navigator.clipboard)copyAndAlert();
    else alert(msg+'\n\n'+GW_RESTART_CMD);
  });
  /* 省钱：刷新用量 */
  const btnRefreshUsage=$('live-refresh-usage');
  if(btnRefreshUsage)btnRefreshUsage.addEventListener('click',async ()=>{
    if(!ClawController||!ClawController.authenticated)return;
    btnRefreshUsage.classList.add('loading');
    try{
      const v=await ClawController.rpcCall('usage-cost',{});
      const uc=v.totalCostUSD!=null?`$${Number(v.totalCostUSD).toFixed(4)}`:v.cost||'?';
      const uEl=$('live-block-usage');if(uEl)uEl.textContent=uc;
      const topEl=$('live-usage');if(topEl)topEl.textContent=uc;
    }catch(_){}
    finally{btnRefreshUsage.classList.remove('loading');}
  });
  /* 省钱：刷新模型 */
  const btnRefreshModels=$('live-refresh-models');
  if(btnRefreshModels)btnRefreshModels.addEventListener('click',async ()=>{
    if(!ClawController||!ClawController.authenticated)return;
    btnRefreshModels.classList.add('loading');
    try{
      const res=await ClawController.rpcCall('models.list',{});
      const list=Array.isArray(res)?res:(Array.isArray(res&&res.models)?res.models:[]);
      const L=state.lang||'zh';
      const modelsEl=$('live-models-list');
      if(modelsEl)modelsEl.textContent=list.length?list.slice(0,12).map(m=>typeof m==='string'?m:(m.id||m.name||m.model||'')).filter(Boolean).join(', ')+(list.length>12?' …':''):(L==='zh'?'暂无':'None');
    }catch(_){}
    finally{btnRefreshModels.classList.remove('loading');}
  });
  /* 方便：获取对话链接 */
  async function fetchDialogueLinkForLive(){
    try{
      const r0=await fetch(window.location.origin+'/api/dialogue-token',{cache:'no-store'});
      const b0=await r0.json().catch(()=>({}));
      if(b0&&b0.ok&&b0.dialogueUrl)return b0.dialogueUrl;
      if(b0&&b0.ok&&b0.token){const path=window.location.pathname||'/openclaw2.html';const pth=path.endsWith('openclaw2.html')?path:path.replace(/\/?$/, '/openclaw2.html');return window.location.origin+pth+'#token='+encodeURIComponent(b0.token);}
    }catch(_){}
    try{
      const r=await fetch(OpenClawGateway.httpBase()+'/api/dialogue-token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:'auto'})});
      if(r.ok){const b=await r.json().catch(()=>({}));if(b&&b.ok&&b.dialogueUrl)return b.dialogueUrl;if(b&&b.ok&&b.token){const path=window.location.pathname||'/openclaw2.html';const base=path.endsWith('openclaw2.html')?path:path.replace(/\/?$/, '/openclaw2.html');return window.location.origin+base+'#token='+encodeURIComponent(b.token);}}
    }catch(_){}
    return null;
  }
  const btnFetchLink=$('live-fetch-link');
  if(btnFetchLink)btnFetchLink.addEventListener('click',async ()=>{
    btnFetchLink.classList.add('loading');
    const urlInp=$('live-dialogue-url');const copyBtn=$('live-copy-link');
    try{
      const url=await fetchDialogueLinkForLive();
      if(urlInp)urlInp.value=url||'';
      if(copyBtn)copyBtn.style.display=url?'inline-block':'none';
    }finally{btnFetchLink.classList.remove('loading');}
  });
  /* 方便：复制链接 */
  const btnCopyLink=$('live-copy-link');
  if(btnCopyLink)btnCopyLink.addEventListener('click',()=>{
    const urlInp=$('live-dialogue-url');const url=urlInp&&urlInp.value?urlInp.value.trim():'';
    if(!url)return;
    navigator.clipboard&&navigator.clipboard.writeText(url).then(()=>{
      btnCopyLink.textContent=state.lang==='zh'?'已复制':'Copied';
      setTimeout(()=>{btnCopyLink.textContent=state.lang==='zh'?'复制链接':'Copy link';},2000);
    }).catch(()=>{});
  });
  /* 实用：打开聊天（新标签） */
  const linkOpenChat=$('live-open-chat');
  if(linkOpenChat)linkOpenChat.addEventListener('click',function(e){
    e.preventDefault();
    const tok=ClawController&&ClawController.getSavedToken&&ClawController.getSavedToken();
    const path=window.location.pathname||'/openclaw2.html';
    const base=path.endsWith('openclaw2.html')?path:path.replace(/\/?$/, '/openclaw2.html');
    const url=tok?window.location.origin+base+'#token='+encodeURIComponent(tok):(($('live-dialogue-url')&&$('live-dialogue-url').value)||window.location.origin+base);
    window.open(url,'_blank','noopener');
  });
})();

/* 瞳孔 #pupil-l / #pupil-r 闪烁 r 11->15->11，发送/回车时触发 */
function blinkEyes(){if(!pl||!pr)return;const open=()=>{pl.setAttribute('r','15');pr.setAttribute('r','15');};const close=()=>{pl.setAttribute('r','11');pr.setAttribute('r','11');};open();setTimeout(close,100);setTimeout(()=>{open();setTimeout(close,100);},200);}
/* ===== ClawController: 完整聊天控制器 ===== */
const ClawController={
  ws:null,
  msgId:0,
  authenticated:false,
  supportedMethods:null,
  handshakeTimeout:null,
  retryCount:0,
  maxRetry:5,
  retryTimer:null,
  currentAiEl:null,
  currentMsgId:null,
  challengeReceived:false,
  _pendingNonce:'',
  _instanceId:null,
  _connectSending:false,
  /* 未认证消息限流：最多显示3条，之后折叠 */
  unauthMsgCount:0,
  maxUnauthDisplay:3,

  /* ───── 获取 token ───── */
  getSavedToken(){
    const keys=['openclaw_gatewayToken','openclaw_token','maca_token'];
    for(const k of keys){
      try{const t=localStorage.getItem(k);if(t&&t.trim())return t.trim();}catch{}
    }
    return null;
  },

  /* ───── UI 辅助 ───── */
  /* 从 AI 正文中提取「核心一句」：首段或前 200 字，用于精准对话 */
  /* 流式结束后将 AI 气泡改为「核心摘要 + 展开全文」结构 */
  _finalizeAiMsg(bodyEl){
    if(!bodyEl||bodyEl.classList.contains('has-core'))return;
    const text=(bodyEl.textContent||'').trim();
    if(!text)return;
    const {core,full}=this._coreSummary(text);
    if(!full){bodyEl.textContent=text;return;}
    bodyEl.classList.add('has-core');
    bodyEl.innerHTML='<div class="msg-core"></div><div class="msg-full"></div>';
    bodyEl.querySelector('.msg-core').textContent=core;
    bodyEl.querySelector('.msg-full').textContent=full;
    const actions=document.createElement('div');
    actions.className='msg-actions';
    const btnExpand=document.createElement('button');
    btnExpand.type='button';
    btnExpand.textContent='展开全文';
    btnExpand.addEventListener('click',()=>{bodyEl.classList.toggle('expanded');btnExpand.textContent=bodyEl.classList.contains('expanded')?'收起':'展开全文';});
    const btnCopy=document.createElement('button');
    btnCopy.type='button';
    btnCopy.textContent='复制回复';
    btnCopy.addEventListener('click',()=>{
      const fullText=bodyEl.querySelector('.msg-full').textContent||bodyEl.querySelector('.msg-core').textContent;
      navigator.clipboard&&navigator.clipboard.writeText(fullText).then(()=>{btnCopy.textContent='已复制';setTimeout(()=>btnCopy.textContent='复制回复',1500);}).catch(()=>{});
    });
    actions.appendChild(btnExpand);actions.appendChild(btnCopy);
    bodyEl.appendChild(actions);
  },
  _coreSummary(text){
    const t=(text||'').trim();
    if(!t)return {core:'',full:''};
    const maxCore=200;
    const firstLineEnd=t.indexOf('\n');
    if(firstLineEnd===-1)return t.length<=maxCore?{core:t,full:''}:{core:t.slice(0,maxCore)+'…',full:t};
    const firstLine=t.slice(0,firstLineEnd).trim();
    if(firstLine.length<=maxCore&&t.length<=maxCore+50)return {core:firstLine,full:''};
    if(firstLine.length<=maxCore)return {core:firstLine,full:t};
    return {core:firstLine.slice(0,maxCore)+'…',full:t};
  },
  _extractDisplayText(v){
    if(v==null)return '';
    if(typeof v==='object')return (v.text||v.content||v.message||'').trim();
    let s=String(v).trim();
    if(!s)return '';
    try{
      const o=JSON.parse(s);
      if(o&&typeof o==='object')return (o.text||o.content||o.message||s).trim();
    }catch{}
    const m=s.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"|"content"\s*:\s*"((?:[^"\\]|\\.)*)"|"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if(m)return (m[1]||m[2]||m[3]||'').replace(/\\"/g,'"').trim();
    return s;
  },
  _getOrCreateSysGroup(){
    const el=$("chat-history-content");if(!el)return null;
    let group=el.querySelector('.msg-sys-group');
    if(!group){
      group=document.createElement('div');
      group.className='msg-sys-group collapsed';
      const header=document.createElement('div');
      header.className='msg-sys-group-header';
      header.setAttribute('role','button');
      header.setAttribute('tabindex','0');
      const L=state.lang||'zh';
      const t=i18n[L];
      header.textContent=(t&&t.sysGroupHeader?t.sysGroupHeader:(L==='zh'?'系统与连接':'System & connection'))+' (0)';
      header.addEventListener('click',()=>{
        group.classList.toggle('collapsed');
        this._updateSysGroupHeader(group);
      });
      header.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();header.click();}});
      const body=document.createElement('div');
      body.className='msg-sys-group-body';
      group.appendChild(header);
      group.appendChild(body);
      el.insertBefore(group,el.firstChild);
    }
    return group;
  },
  _updateSysGroupHeader(group){
    if(!group)return;
    const body=group.querySelector('.msg-sys-group-body');
    const n=body?body.children.length:0;
    const L=state.lang||'zh';
    const t=i18n[L];
    const label=t&&t.sysGroupHeader?t.sysGroupHeader:(L==='zh'?'系统与连接':'System & connection');
    const h=group.querySelector('.msg-sys-group-header');
    if(h)h.textContent=label+' ('+n+')';
  },
  appendMsg(role, text, streaming=false){
    const el=$("chat-history-content");if(!el)return null;
    if(role==='sys'||role==='err'){
      const group=this._getOrCreateSysGroup();
      if(!group)return null;
      const body=group.querySelector('.msg-sys-group-body');
      if(!body)return null;
      const line=document.createElement('div');
      line.className='msg-sys-line'+(role==='err'?' err':'');
      line.textContent=text||'';
      body.appendChild(line);
      this._updateSysGroupHeader(group);
      body.scrollTop=body.scrollHeight;
      return line;
    }
    const wrap=document.createElement('div');
    wrap.className='msg '+role;
    const roleEl=document.createElement('div');
    roleEl.className='msg-role';
    roleEl.textContent=role==='user'?'You':role==='ai'?'OpenClaw':role==='err'?'ERROR':'System';
    const bodyEl=document.createElement('div');
    bodyEl.className='msg-body'+(streaming?' streaming':'');
    const displayText=(role==='user'||role==='ai')?this._extractDisplayText(text||''):(text||'');
    if(role==='ai'&&displayText&&!streaming){
      const {core,full}=this._coreSummary(displayText);
      if(full){
        bodyEl.classList.add('has-core');
        bodyEl.innerHTML='<div class="msg-core"></div><div class="msg-full"></div>';
        bodyEl.querySelector('.msg-core').textContent=core;
        bodyEl.querySelector('.msg-full').textContent=full;
        const actions=document.createElement('div');
        actions.className='msg-actions';
        const btnExpand=document.createElement('button');
        btnExpand.type='button';
        btnExpand.textContent='展开全文';
        btnExpand.addEventListener('click',()=>{bodyEl.classList.toggle('expanded');btnExpand.textContent=bodyEl.classList.contains('expanded')?'收起':'展开全文';});
        const btnCopy=document.createElement('button');
        btnCopy.type='button';
        btnCopy.textContent='复制回复';
        btnCopy.addEventListener('click',()=>{
          const fullText=bodyEl.querySelector('.msg-full').textContent||bodyEl.querySelector('.msg-core').textContent;
          navigator.clipboard&&navigator.clipboard.writeText(fullText).then(()=>{btnCopy.textContent='已复制';setTimeout(()=>btnCopy.textContent='复制回复',1500);}).catch(()=>{});
        });
        actions.appendChild(btnExpand);actions.appendChild(btnCopy);
        bodyEl.appendChild(actions);
      }else{
        bodyEl.textContent=displayText;
      }
    }else{
      bodyEl.textContent=streaming?(text||''):displayText;
    }
    wrap.appendChild(roleEl);
    wrap.appendChild(bodyEl);
    el.appendChild(wrap);
    el.scrollTop=el.scrollHeight;
    return bodyEl;
  },
  setStatus(s){
    const el=$("status-indicator");if(!el)return;
    const map={linked:['LINKED','linked'],offline:['OFFLINE','offline'],connecting:['CONNECTING…','connecting']};
    const [txt,cls]=map[s]||['OFFLINE','offline'];
    el.textContent=txt;
    el.className=cls;
  },
  clearHistory(){const el=$("chat-history-content");if(el){el.innerHTML='';this.unauthMsgCount=0;}},
  /** 从 chat.history 接口响应中解析出 messages 数组（兼容多种后端返回结构） */
  getMessagesFromHistoryResponse(res){
    if(!res)return [];
    if(Array.isArray(res))return res;
    if(Array.isArray(res.messages))return res.messages;
    if(Array.isArray(res.data&&res.data.messages))return res.data.messages;
    if(Array.isArray(res.result&&res.result.messages))return res.result.messages;
    if(Array.isArray(res.result&&res.result.data&&res.result.data.messages))return res.result.data.messages;
    if(Array.isArray(res.history))return res.history;
    if(Array.isArray(res.data))return res.data;
    if(Array.isArray(res.items))return res.items;
    if(Array.isArray(res.result))return res.result;
    return [];
  },
  /** 从单条消息中提取展示用文本（兼容 content 字符串、content 数组 parts、text、message 等） */
  _getMessageDisplayText(m){
    if(!m)return '';
    const c=m.content;
    if(typeof c==='string'&&c.trim())return c.trim();
    if(Array.isArray(c)){
      const parts=c.map(p=>{
        if(typeof p==='string')return p;
        if(p&&typeof p==='object')return p.text||p.content||p.message||'';
        return '';
      }).filter(Boolean);
      if(parts.length)return parts.join('\n').trim();
    }
    const single=m.text||m.message||m.body||(m.parts&&m.parts[0]&&(m.parts[0].text||m.parts[0].content));
    if(single!=null&&typeof single==='string')return single.trim();
    if(typeof single==='object'&&single!==null&&(single.text||single.content))return (single.text||single.content).trim();
    return '';
  },
  /** 将实时后台某会话的对话历史映射到右侧 chat-history（先清空再按条追加 user/ai） */
  syncHistoryFromMessages(messages,sessionKey){
    const el=$("chat-history-content");if(!el)return;
    this.clearHistory();
    const L=state.lang||'zh';
    if(sessionKey)this.appendMsg('sys',(L==='zh'?'已加载会话「'+sessionKey+'」的对话历史':'Loaded chat history for session "'+sessionKey+'"'));
    if(!Array.isArray(messages)||!messages.length)return;
    messages.forEach(m=>{
      let role=(m.role||m.type||m.actor||'').toLowerCase().trim();
      if(role==='assistant')role='ai';
      if(role==='human')role='user';
      if(role!=='user'&&role!=='ai')return;
      const raw=this._getMessageDisplayText(m);
      const content=raw?this._extractDisplayText(raw):'';
      if(content)this.appendMsg(role,content,false);
    });
    el.scrollTop=el.scrollHeight;
  },
  setInputEnabled(on){
    const inp=$("command-input"),btn=$("btn-send");
    if(inp)inp.disabled=!on;
    if(btn)btn.disabled=!on;
  },

  /* ───── 设备身份（Ed25519 via crypto.subtle，localStorage 持久化） ───── */
  _DEVICE_KEY:'openclaw-device-identity-v1',

  /* 生成 UUID（安全/非安全均可） */
  _uuid(){
    try{if(crypto&&crypto.randomUUID)return crypto.randomUUID();}catch{}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
      const r=Math.random()*16|0;return(c==='x'?r:(r&0x3|0x8)).toString(16);
    });
  },

  /* Uint8Array → base64url */
  _b64u(buf){
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  },
  /* base64url → Uint8Array */
  _fromb64u(s){
    const b=s.replaceAll('-','+').replaceAll('_','/');
    const pad=b+'='.repeat((4-b.length%4)%4);
    return Uint8Array.from(atob(pad),c=>c.charCodeAt(0));
  },
  /* Uint8Array → hex */
  _hex(buf){return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');},

  /* 获取或创建设备密钥对（Ed25519，持久化到 localStorage） */
  async _getOrCreateDeviceIdentity(){
    const subtle=crypto&&crypto.subtle;
    if(!subtle)return null;
    /* 尝试读取已存身份 */
    try{
      const raw=localStorage.getItem(this._DEVICE_KEY);
      if(raw){
        const d=JSON.parse(raw);
        if(d&&d.version===1&&d.deviceId&&d.publicKeyJwk&&d.privateKeyJwk){
          const pub=await subtle.importKey('jwk',d.publicKeyJwk,{name:'Ed25519'},true,['verify']);
          const priv=await subtle.importKey('jwk',d.privateKeyJwk,{name:'Ed25519'},true,['sign']);
          return{deviceId:d.deviceId,publicKey:pub,privateKey:priv};
        }
      }
    }catch{}
    /* 创建新密钥对 */
    try{
      const kp=await subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
      const pubJwk=await subtle.exportKey('jwk',kp.publicKey);
      const privJwk=await subtle.exportKey('jwk',kp.privateKey);
      /* deviceId = SHA-256(raw public key bytes) as hex，与官方一致 */
      const pubRaw=await subtle.exportKey('raw',kp.publicKey);
      const hashBuf=await subtle.digest('SHA-256',pubRaw);
      const deviceId=this._hex(hashBuf);
      localStorage.setItem(this._DEVICE_KEY,JSON.stringify({
        version:1,deviceId,publicKeyJwk:pubJwk,privateKeyJwk:privJwk,
        createdAtMs:Date.now()
      }));
      return{deviceId,publicKey:kp.publicKey,privateKey:kp.privateKey};
    }catch(e){
      console.warn('[ClawCtrl] Ed25519 key generation failed:',e);
      return null;
    }
  },

  /* 构建签名载荷（v2 格式，与官方完全一致）并签名 */
  async _signDevice(identity,nonce,token,role,scopes){
    const subtle=crypto.subtle;
    const signedAtMs=Date.now();
    /* 导出 public key bytes → base64url（作为 publicKey 字段） */
    const pubRaw=await subtle.exportKey('raw',identity.publicKey);
    const publicKeyB64u=this._b64u(pubRaw);
    /* 签名载荷：v2|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce */
    const payload=[
      'v2',
      identity.deviceId,
      'openclaw-control-ui',  /* clientId */
      'webchat',              /* clientMode */
      role,
      scopes.join(','),
      String(signedAtMs),
      token||'',
      nonce||''
    ].join('|');
    const msgBuf=new TextEncoder().encode(payload);
    const sigBuf=await subtle.sign({name:'Ed25519'},identity.privateKey,msgBuf);
    return{
      id:identity.deviceId,
      publicKey:publicKeyB64u,
      signature:this._b64u(sigBuf),
      signedAt:signedAtMs,
      nonce:nonce||''
    };
  },

  /* ───── 发送 connect 请求（完整设备签名，与官方协议完全一致） ───── */
  async sendConnectRequest(){
    /* 防重入 */
    if(this._connectSending)return;
    this._connectSending=true;
    if(!this._instanceId)this._instanceId=this._uuid();

    const savedToken=this.getSavedToken();

    /* 使用 "webchat" 客户端 id（无需设备签名），通过 gateway token 认证 */
    const params={
      minProtocol:3,
      maxProtocol:3,
      client:{
        id:'webchat',
        version:'dev',
        platform:(typeof navigator!=='undefined'&&navigator.platform)||'web',
        mode:'webchat',
        instanceId:this._instanceId
      },
      role:'operator',
      scopes:['operator.admin','operator.approvals','operator.pairing'],
      caps:[],
      userAgent:(typeof navigator!=='undefined'&&navigator.userAgent)||'',
      locale:(typeof navigator!=='undefined'&&navigator.language)||'zh-CN'
    };
    if(savedToken)params.auth={token:savedToken};

    const connectMsg={type:'req',id:'connect-'+(++this.msgId),method:'connect',params};
    console.log('[ClawCtrl] sendConnectRequest token=',savedToken?savedToken.substring(0,8)+'…':'none');
    try{
      this.ws.send(JSON.stringify(connectMsg));
      this.appendMsg('sys','发送认证请求 (token: '+(savedToken?savedToken.substring(0,8)+'…':'无)'));
    }catch(e){
      this.appendMsg('err','发送认证请求失败: '+e.message);
    }finally{
      this._connectSending=false;
    }
  },

  /* ───── 认证握手处理 ───── */
  handleHandshake(msg){
    const p=msg.payload||msg.params||msg.result||{};
    const ev=msg.event||msg.type||msg.method||'';

    /* 1. connect.challenge → 收到挑战，回复 connect */
    if(ev==='connect.challenge'){
      clearTimeout(this.handshakeTimeout);
      this.challengeReceived=true;clearTimeout(this._challengeTimeout);
      const nonce=p.nonce||'';
      this._pendingNonce=nonce;  /* 保存 nonce 供签名使用 */
      this._connectSending=false; /* 重置防重入标志，允许本次发送 */
      this.appendMsg('sys','收到挑战 (nonce: '+nonce.substring(0,8)+(nonce.length>8?'…':'')+')');
      this.sendConnectRequest().catch(e=>this.appendMsg('err','认证发送失败: '+e.message));
      return;
    }

    /* 2. JSON-RPC connect 响应（id 以 connect- 开头）*/
    if(typeof msg.id==='string'&&msg.id.startsWith('connect-')){
      /* 兼容两种格式：
         1) {error: {...}}
         2) {ok:false,error:{...}} */
      if(msg.error||msg.ok===false){
        const errObj=msg.error||{};
        const errMsg=errObj.message||JSON.stringify(errObj)||'Auth error';
        const code=errObj.code||'';
        const isPairing=errMsg.toLowerCase().includes('pairing')||code==='PAIRING_REQUIRED';
        if(isPairing){
          this.appendMsg('sys','设备需配对审批！请在 '+OpenClawGateway.httpBase()+' 后台批准，然后点击「↺ 重连」。');
        }else{
          this.appendMsg('err','认证失败: '+errMsg);
          this.appendMsg('sys','请确认 Token 正确，或留空尝试本地模式（如服务器已配置 trusted-proxy）。');
        }
        this.authenticated=false;
        this.setStatus('offline');
        this.setInputEnabled(false);
        this.showTokenPanel(true);
        try{this.ws.close();}catch{}
        return;
      }
      /* 兼容两种成功格式：
         1) {result:{...}}
         2) {ok:true,payload:{...}} */
      if(msg.result!==undefined||msg.ok===true){
        const data=msg.result!==undefined?msg.result:(msg.payload||{});
        this._pendingNonce='';
        this._connectSending=false;
        this._onAuthSuccess(data);
        return;
      }
    }

    /* 3. hello-ok 格式（旧版） */
    if(ev==='hello-ok'||(msg.result&&!msg.error&&this.challengeReceived)){
      this._onAuthSuccess(p);
      return;
    }

    /* 4. hello-error 格式（旧版） */
    if(ev==='hello-error'||ev==='pairing.required'){
      const errMsg=p.message||'Auth error';
      const isPairing=ev==='pairing.required'||errMsg.toLowerCase().includes('pairing');
      if(isPairing){
        this.appendMsg('sys','设备需配对审批！请在 '+OpenClawGateway.httpBase()+' 后台批准，然后点击「↺ 重连」。');
      }else{
        this.appendMsg('err','认证失败: '+errMsg);
      }
      this.authenticated=false;
      this.setStatus('offline');
      this.setInputEnabled(false);
      this.showTokenPanel(true);
      try{this.ws.close();}catch{}
    }
  },

  _onAuthSuccess(result){
    clearTimeout(this.handshakeTimeout);
    clearTimeout(this.retryTimer);
    this.authenticated=true;
    this.retryCount=0;
    this.unauthMsgCount=0;
    this.setStatus('linked');
    this.setInputEnabled(true);
    const r=result||{};
    const deviceToken=r.deviceToken;
    if(deviceToken){try{localStorage.setItem('openclaw_deviceToken',deviceToken);}catch{}}
    this.supportedMethods=Array.isArray(r.methods)?r.methods.slice():null;
    const methods=(r.methods||[]).length;
    const events=(r.events||[]).length;
    this.showTokenPanel(false);
    this.appendMsg('sys','✓ 认证成功'+(methods?' (methods: '+methods+', events: '+events+')':''));
    if(typeof window.refreshChatLoadSession==='function')window.refreshChatLoadSession();
    if(typeof window.startOpenclawHeartbeatStatsSync==='function')window.startOpenclawHeartbeatStatsSync();
    if(typeof LiveController!=='undefined'&&LiveController&&typeof LiveController._isVisible==='function'&&LiveController._isVisible()){
      LiveController.start();
    }
  },
  hasMethod(method){
    if(!method)return false;
    if(!Array.isArray(this.supportedMethods)||!this.supportedMethods.length)return true;
    return this.supportedMethods.includes(method);
  },

  /* ───── 处理收到的消息 ───── */
  handleMessage(raw){
    let msg;
    try{msg=JSON.parse(raw);}catch(e){this.appendMsg('err','消息解析失败: '+e.message);return;}

    console.log('[ClawCtrl] rx:', JSON.stringify(msg).substring(0,300));

    const ev=msg.event||msg.type||msg.method||'';

    /* 握手阶段消息路由 */
    const isHandshake=
      ev==='connect.challenge'||
      ev==='hello-ok'||ev==='hello-error'||ev==='pairing.required'||
      (typeof msg.id==='string'&&msg.id.startsWith('connect-')&&(msg.result!==undefined||msg.payload!==undefined||msg.error||msg.ok===true||msg.ok===false));

    if(isHandshake){this.handleHandshake(msg);return;}

    /* RPC 响应路由（非握手的 id 请求） */
    if(msg.id&&this._rpcPending&&this._rpcPending[msg.id]){
      const p=this._rpcPending[msg.id];
      delete this._rpcPending[msg.id];
      clearTimeout(p.timeout);
      if(msg.error)p.reject(new Error(msg.error.message||JSON.stringify(msg.error)));
      else{
        let body=msg.result!==undefined?msg.result:msg.payload;
        if(body===null&&msg.payload!==undefined&&msg.payload!==null)body=msg.payload;
        p.resolve(body);
      }
      return;
    }

    if(!this.authenticated){
      /* 过滤心跳/tick，只统计计数；其他未认证消息限量显示 */
      const silent=['health','tick','ping','pong'];
      if(silent.includes(ev))return;
      this.unauthMsgCount++;
      if(this.unauthMsgCount<=this.maxUnauthDisplay){
        const shortMsg=raw.length>180?raw.substring(0,180)+'…':raw;
        this.appendMsg('sys','[未认证] '+shortMsg);
      }else if(this.unauthMsgCount===this.maxUnauthDisplay+1){
        this.appendMsg('sys','[未认证消息过多，已静默。请检查 Token 后重连]');
      }
      return;
    }

    /* 已认证后的消息处理 */
    /* 事件推送：event 字段处理 */
    if(ev==='event'||ev==='push'||ev==='notification'){
      const payload=msg.payload||msg.params||{};
      const evType=payload.event||payload.type||'';
      const aiText=this._extractDisplayText(payload.text||payload.content||payload.message||'');
      if(aiText){
        this.appendMsg('ai',aiText,false);
        return;
      }
      const silent2=['health','tick','ping','pong','heartbeat'];
      if(!silent2.includes(evType)){
        this.appendMsg('sys','['+evType+'] '+JSON.stringify(payload).substring(0,120));
      }
      return;
    }

    /* 聊天消息响应（streaming） */
    const respPayload=msg.payload||(msg.result&&typeof msg.result==='object'?msg.result:null);
    if((ev==='response'||ev==='chat.response'||msg.result!==undefined)&&respPayload){
      const text=this._extractDisplayText(respPayload.text||respPayload.content||respPayload.message||'');
      if(msg.id&&msg.id===this.currentMsgId&&this.currentAiEl){
        if(text)this.currentAiEl.textContent+=text;
        const el=$("chat-history-content");if(el)el.scrollTop=el.scrollHeight;
        if(respPayload.done||respPayload.finish_reason||respPayload.finished){
          this._finalizeAiMsg(this.currentAiEl);
          this.currentAiEl.classList.remove('streaming');
          this.currentAiEl=null;this.currentMsgId=null;
        }
      }else if(text){
        this.currentMsgId=msg.id||null;
        this.currentAiEl=this.appendMsg('ai',text,true);
      }
      return;
    }

    if(ev==='error'||msg.error){
      const errMsg=msg.payload?.message||msg.error?.message||JSON.stringify(msg.error||'Server error');
      this.appendMsg('err',errMsg);
      if(this.currentAiEl){this.currentAiEl.classList.remove('streaming');this.currentAiEl=null;this.currentMsgId=null;}
      return;
    }

    /* 其他事件：若含 text/content 则按 AI 回复展示，否则非 ping/pong/tick/health 才记入 sys */
    const restPayload=msg.payload||msg.params||{};
    const restText=this._extractDisplayText(restPayload.text||restPayload.content||restPayload.message||'');
    if(restText){
      this.appendMsg('ai',restText,false);
      return;
    }
    const silentEvs=['ping','pong','tick','health','heartbeat'];
    if(ev&&!silentEvs.includes(ev)){
      this.appendMsg('sys','['+ev+'] '+JSON.stringify(restPayload).substring(0,120));
    }
  },

  /* ───── 连接 ───── */
  connect(tokenOverride){
    if(this.ws&&(this.ws.readyState===WebSocket.OPEN||this.ws.readyState===WebSocket.CONNECTING))return;
    if(this.retryCount>=this.maxRetry){
      this.appendMsg('err','已达最大重试次数('+this.maxRetry+'次)，请手动点击「↺ 重连」或检查 Token。');
      this.setStatus('offline');this.showTokenPanel(true);return;
    }
    if(tokenOverride!==undefined){
      try{
        if(tokenOverride)localStorage.setItem('openclaw_gatewayToken',tokenOverride);
        else localStorage.removeItem('openclaw_gatewayToken');
      }catch{}
    }
    clearTimeout(this.retryTimer);
    this.authenticated=false;
    this.challengeReceived=false;
    this.unauthMsgCount=0;
    this.setStatus('connecting');
    this.setInputEnabled(false);

    const savedTok=this.getSavedToken();
    /* 始终直连 openclaw 服务（WebSocket 无同源限制）
       token 同时放在 URL query 和 connect 消息的 auth.token 中，确保双通道认证 */
    const wsBase=OpenClawGateway.wsBase();
    const qp=[];
    if(savedTok)qp.push('token='+encodeURIComponent(savedTok));
    const wsUrl=wsBase+(qp.length?'?'+qp.join('&'):'');

    this.appendMsg('sys',(savedTok?'连接中 (token: '+savedTok.substring(0,10)+'…)':'连接中（无token）')+' [第'+(this.retryCount+1)+'次]');

    try{
      this.ws=new WebSocket(wsUrl);

      /* 握手超时 12s */
      this.handshakeTimeout=setTimeout(()=>{
        if(!this.authenticated&&this.ws){
          this.appendMsg('err','握手超时（12s），服务可能未运行或 Token 错误。');
          this.ws.close();
        }
      },12000);

      this.ws.onopen=()=>{
        this.appendMsg('sys','WebSocket 已连接');
        this._pendingNonce='';
        this._connectSending=false;
        /* 等待 challenge（500ms 超时），兼容标准模式和 trusted-proxy 模式 */
        this._challengeTimeout=setTimeout(()=>{
          if(!this.challengeReceived&&this.ws&&this.ws.readyState===WebSocket.OPEN){
            this.appendMsg('sys','未收到挑战，尝试 trusted-proxy 模式...');
            this.sendConnectRequest().catch(e=>this.appendMsg('err','认证失败：'+e.message));
          }
        },500);
      };


      this.ws.onmessage=(e)=>this.handleMessage(e.data);

      this.ws.onerror=(e)=>{
        console.error('[ClawCtrl] ws error', e);
        this.setStatus('offline');
        this.appendMsg('err','WebSocket 连接错误，请确认 OpenClaw 服务运行于 '+OpenClawGateway.getDisplay());
      };

      this.ws.onclose=(e)=>{
        clearTimeout(this.handshakeTimeout);
        try{if(typeof window.stopOpenclawHeartbeatStatsSync==='function')window.stopOpenclawHeartbeatStatsSync();}catch{}
        this.authenticated=false;
        this.setStatus('offline');
        this.setInputEnabled(false);
        if(this.currentAiEl){this.currentAiEl.classList.remove('streaming');this.currentAiEl=null;this.currentMsgId=null;}
        const reason=e.reason||'连接关闭';
        const isAuthFail=(e.code===1008||reason.toLowerCase().includes('auth')||reason.toLowerCase().includes('token')||reason.toLowerCase().includes('unauthorized'));
        this.appendMsg('sys','断开 (code: '+e.code+(reason?' · '+reason.substring(0,60):'')+')');
        if(isAuthFail){
          this.retryCount=this.maxRetry;
          this.showTokenPanel(true);
          this.appendMsg('sys','Token 认证失败。请重新输入正确的 Gateway Token。');
        }else if(this.retryCount<this.maxRetry){
          this.retryCount++;
          const delay=Math.min(2000*this.retryCount,10000);
          this.appendMsg('sys','将在 '+(delay/1000).toFixed(0)+'s 后自动重连…');
          this.retryTimer=setTimeout(()=>this.connect(),delay);
        }
        if(typeof LiveController!=='undefined'&&LiveController&&typeof LiveController._isVisible==='function'&&LiveController._isVisible()){
          LiveController.showOffline();
        }
      };
    }catch(e){
      this.setStatus('offline');
      this.appendMsg('err','无法建立 WebSocket: '+e.message);
      this.retryCount++;
    }
  },

  /* ───── 手动重连 ───── */
  reconnect(){
    clearTimeout(this.retryTimer);
    this.retryCount=0;
    if(this.ws){try{this.ws.close();}catch{}this.ws=null;}
    this.connect();
  },

  /* ───── Token 面板开关 ───── */
  showTokenPanel(show){
    const panel=$("token-panel");
    if(panel)panel.classList.toggle('show',show);
  },

  /* ───── 发送聊天消息 ───── */
  sendMessage(text){
    const t=(text||'').trim();if(!t)return;
    if(!this.ws||this.ws.readyState!==WebSocket.OPEN){
      this.appendMsg('err','未连接，正在尝试重连…');
      this.reconnect();return;
    }
    if(!this.authenticated){
      this.appendMsg('err','尚未认证，请等待连接或重新填写 Token。');return;
    }
    blinkEyes();
    this.appendMsg('user',t);
    this.currentAiEl=null;this.currentMsgId=null;
    try{
      const msgId='msg-'+(++this.msgId);
      this.currentMsgId=msgId;
      /* OpenClaw Gateway chat.send API 格式 */
      const msg={
        type:'req',
        id:msgId,
        method:'chat.send',
        params:{
          message:t,
          idempotencyKey:msgId,
          sessionKey:'main'
        }
      };
      this.ws.send(JSON.stringify(msg));
    }catch(e){
      this.appendMsg('err','发送失败: '+e.message);
    }
  },

  /* ───── HTTP API 调用（备选，直接调用后台 REST 端点） ───── */
  async apiRequest(endpoint, options={}){
    const token=this.getSavedToken();
    const url=OpenClawGateway.httpBase()+endpoint;
    const cfg={
      method:options.method||'GET',
      headers:{'Content-Type':'application/json',...(token?{'Authorization':'Bearer '+token}:{})},
      mode:'cors',
      credentials:'include'
    };
    if(options.body)cfg.body=JSON.stringify(options.body);
    const resp=await fetch(url,cfg);
    if(!resp.ok){
      const err=await resp.text().catch(()=>resp.statusText);
      throw new Error('HTTP '+resp.status+': '+err.substring(0,120));
    }
    return resp.json().catch(()=>resp.text());
  },

  /* ───── 通过 WebSocket JSON-RPC 调用后台方法 ───── */
  rpcCall(method, params={}){
    return new Promise((resolve,reject)=>{
      if(!this.ws||this.ws.readyState!==WebSocket.OPEN||!this.authenticated){
        reject(new Error('未连接'));return;
      }
      const id='rpc-'+(++this.msgId);
      const timeout=setTimeout(()=>{
        delete this._rpcPending[id];
        reject(new Error('RPC timeout: '+method));
      },15000);
      this._rpcPending=this._rpcPending||{};
      this._rpcPending[id]={resolve,reject,timeout};
      const msg={type:'req',id,method,params};
      this.ws.send(JSON.stringify(msg));
    });
  }
};
const LIVE_IDX=5,DETAIL_IDX=6;
function renderTheme(i){
  const liveView=document.getElementById('live-view');
  const detailView=document.getElementById('detail-view');
  const stageEl=document.querySelector('.stage');
  const heroEl=document.querySelector('.hero');
  if(i===LIVE_IDX){
    if(liveView){liveView.style.display='flex';liveView.classList.add('active');liveView.setAttribute('aria-hidden','false');}
    if(detailView){detailView.style.display='none';detailView.classList.remove('active');detailView.setAttribute('aria-hidden','true');}
    if(stageEl)stageEl.style.visibility='hidden';
    if(heroEl)heroEl.style.visibility='hidden';
    const th=state.themes[i];
    if(th)sub.textContent=th.n;
    cl.textContent=String(i+1).padStart(2,'0');
    return;
  }
  if(i===DETAIL_IDX){
    if(liveView){liveView.style.display='none';liveView.classList.remove('active');liveView.setAttribute('aria-hidden','true');}
    if(detailView){detailView.style.display='flex';detailView.classList.add('active');detailView.setAttribute('aria-hidden','false');}
    if(stageEl)stageEl.style.visibility='hidden';
    if(heroEl)heroEl.style.visibility='hidden';
    refreshDetails();
    const th=state.themes[i];
    if(th)sub.textContent=th.n;
    cl.textContent=String(i+1).padStart(2,'0');
    return;
  }
  if(liveView){liveView.style.display='none';liveView.classList.remove('active');liveView.setAttribute('aria-hidden','true');}
  if(detailView){detailView.style.display='none';detailView.classList.remove('active');detailView.setAttribute('aria-hidden','true');}
  if(stageEl)stageEl.style.visibility='';
  if(heroEl)heroEl.style.visibility='';
  const th=state.themes[i];if(!th)return;sub.textContent=th.n;cl.textContent=String(i+1).padStart(2,'0');orbit.innerHTML='';th.c.forEach((it,idx)=>orbit.appendChild(cardNode(it,idx,th.c.length,i)));requestAnimationFrame(()=>{orbit.querySelectorAll('.card').forEach((c,idx)=>{const x=N(c.dataset.x,0),y=N(c.dataset.y,0);setTimeout(()=>{c.style.opacity='1';c.style.transform=`translate3d(${x}px,${y}px,0) scale(1)`},idx*22);});orbit.querySelectorAll('.card').forEach(card=>{card.addEventListener('click',e=>{e.stopPropagation();const t=Number(card.dataset.theme),j=Number(card.dataset.card);if(Number.isFinite(t)&&Number.isFinite(j))openCardModal(t,j);});card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();const t=Number(card.dataset.theme),j=Number(card.dataset.card);if(Number.isFinite(t)&&Number.isFinite(j))openCardModal(t,j);}});});});
}
function out(dir){orbit.querySelectorAll('.card').forEach((c,idx)=>{const x=N(c.dataset.x,0),y=N(c.dataset.y,0),len=Math.max(1,Math.sqrt(x*x+y*y)),nx=x/len,ny=y/len,b=118+idx*14;c.style.opacity='0';c.style.transform=`translate3d(${x+nx*b+dir*30}px,${y+ny*b*.72}px,0) scale(.72)`;});}
function react(dir){reactor.style.transform=`rotate(${dir*8}deg)`;setTimeout(()=>reactor.style.transform='rotate(0deg)',200)}
function navState(){nav.querySelectorAll('.btn').forEach(b=>b.classList.toggle('on',Number(b.dataset.i)===state.idx));}
function sw(next,dir){
  if(state.anim||next===state.idx)return;
  const prevIdx=state.idx;
  state.anim=true;state.dir=dir>=0?1:-1;react(state.dir);
  if(prevIdx!==LIVE_IDX&&prevIdx!==DETAIL_IDX)out(state.dir);
  setTimeout(()=>{
    if(prevIdx===LIVE_IDX)LiveController.stop();
    state.idx=next;
    renderTheme(state.idx);
    navState();
    if(next===LIVE_IDX){
      if(ClawController&&ClawController.authenticated)LiveController.start();
      else LiveController.showOffline();
    }
    setTimeout(()=>state.anim=false,780);
  },260);
}
function mountNav(){nav.innerHTML='';state.themes.forEach((th,i)=>{const b=document.createElement('button');b.className='btn';b.type='button';b.dataset.i=String(i);b.textContent=th.n;b.addEventListener('click',()=>sw(i,i>state.idx?1:-1));nav.appendChild(b);});navState();}
function tick(){const n=new Date();time.textContent=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')} ${n.toTimeString().slice(0,8)}`}
function pupil(p,c,x,y){const r=oc.getBoundingClientRect(),rx=(x-r.left)*(500/r.width),ry=(y-r.top)*(500/r.height),dx=rx-c.x,dy=ry-c.y,a=Math.atan2(dy,dx),dis=Math.min(Math.sqrt(dx*dx+dy*dy),eyeLimit);p.setAttribute('cx',(c.x+Math.cos(a)*dis).toFixed(2));p.setAttribute('cy',(c.y+Math.sin(a)*dis).toFixed(2));}
const ptr=(x,y)=>{pupil(pl,eyes.l,x,y);pupil(pr,eyes.r,x,y)};
function bind(){
  try{OpenClawGateway.refreshSubtitle();}catch(_){}
  window.addEventListener('mousemove',e=>ptr(e.clientX,e.clientY));
  window.addEventListener('touchmove',e=>{if(e.touches&&e.touches.length)ptr(e.touches[0].clientX,e.touches[0].clientY)},{passive:true});
  const stageEl=document.querySelector('.stage');
  window.addEventListener('wheel',e=>{if(!stageEl||!stageEl.contains(e.target))return;e.preventDefault();if(!state.themes.length)return;const now=performance.now();if(now-state.lastWheel<180||state.anim)return;state.lastWheel=now;const dir=e.deltaY>0?1:-1;sw((state.idx+dir+state.themes.length)%state.themes.length,dir)},{passive:false});
  let sy=null,touchInStage=false;
  window.addEventListener('touchstart',e=>{const t=e.touches&&e.touches.length?e.touches[0]:null;sy=t?t.clientY:null;touchInStage=!!(stageEl&&t&&stageEl.contains(t.target));},{passive:true});
  window.addEventListener('touchend',e=>{if(sy==null||state.anim||!state.themes.length||!touchInStage)return;const ey=e.changedTouches&&e.changedTouches.length?e.changedTouches[0].clientY:sy,d=sy-ey;if(Math.abs(d)>42){const dir=d>0?1:-1;sw((state.idx+dir+state.themes.length)%state.themes.length,dir)}sy=null;touchInStage=false;},{passive:true});
  window.addEventListener('resize',()=>{if(state.anim)return;const cs=orbit.querySelectorAll('.card'),t=cs.length||1;cs.forEach((c,i)=>{const p=pose(i,t);c.dataset.x=String(p.x);c.dataset.y=String(p.y);c.style.transform=`translate3d(${p.x}px,${p.y}px,0) scale(1)`});if(state.idx===DETAIL_IDX)drawRadar(state.metrics?.radar||[],state.lang)});
  const cardModal=$("card-modal"),cardModalClose=$("card-modal-close");
  if(cardModal)cardModal.addEventListener("click",e=>{if(e.target===cardModal)closeCardModal();});
  if(cardModalClose)cardModalClose.addEventListener("click",closeCardModal);
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&cardModal&&cardModal.classList.contains("open"))closeCardModal();});

  /* ── 聊天输入 ── */
  const cmdInput=$("command-input"),btnSend=$("btn-send");
  function doSend(){if(!cmdInput)return;const v=cmdInput.value.trim();if(!v)return;ClawController.sendMessage(v);cmdInput.value='';cmdInput.style.height='42px';}
  if(cmdInput){
    cmdInput.addEventListener('keydown',e=>{
      if((e.key==='Enter'||e.which===13)&&!e.shiftKey){
        e.preventDefault();doSend();
      }
    });
    cmdInput.addEventListener('input',()=>{
      cmdInput.style.height='42px';
      cmdInput.style.height=Math.min(cmdInput.scrollHeight,120)+'px';
    });
  }
  if(btnSend)btnSend.addEventListener('click',doSend);

  /* ── 从 URL hash 或 query 读取并保存 Token（与官方 Dashboard 兼容） ── */
  (function(){
    const hash=window.location.hash||'', search=window.location.search||'';
    const fromHash=hash.match(/(?:^#?|\?|&)token=([^&]+)/);
    const fromSearch=search.match(/[?&]token=([^&]+)/);
    const match=fromHash||fromSearch;
    if(match&&match[1]){
      const token=decodeURIComponent(match[1].trim());
      try{
        localStorage.setItem('openclaw_gatewayToken',token);
        console.log('[Init] Token saved from URL:',token.substring(0,10)+'...');
      }catch(e){console.error('[Init] Failed to save token:',e);}
    }
  })();

  /* ── 对话链接：通过 /api/dialogue-token 从本地文件或 openclaw dashboard --no-open 获取 token 并组合 URL ── */
  function showDialogueLinkBox(url){
    const box=$("token-link-box"),urlInp=$("token-link-url"),btnCopy=$("btn-copy-link"),btnOpen=$("btn-open-dialogue");
    if(!box||!urlInp)return;
    urlInp.value=url||'';
    if(url){
      box.classList.add('show');
      if(btnCopy){
        btnCopy.onclick=function(){
          navigator.clipboard&&navigator.clipboard.writeText(url).then(()=>{
            btnCopy.textContent='已复制';btnCopy.classList.add('copied');
            setTimeout(()=>{btnCopy.textContent='复制链接';btnCopy.classList.remove('copied');},2000);
          }).catch(()=>{});
        };
      }
      if(btnOpen){btnOpen.onclick=function(){window.open(url,'_blank');};}
    }else{box.classList.remove('show');}
  }
  function setFetchStatus(msg,isErr){
    const el=$("token-fetch-status");if(el){el.textContent=msg||'';el.classList.toggle('err',!!isErr);}
  }
  async function fetchDialogueLink(){
    const btn=$("btn-fetch-dialogue-link");
    if(btn)btn.classList.add('loading');
    setFetchStatus('正在从本地文件或 openclaw 命令获取 token…',false);
    try{
      const base=window.location.origin;
      const r=await fetch(base+'/api/dialogue-token',{cache:'no-store'});
      const body=await r.json().catch(()=>({}));
      if(body&&body.ok&&body.dialogueUrl){
        if(body.token){try{localStorage.setItem('openclaw_gatewayToken',body.token);}catch{}}
        showDialogueLinkBox(body.dialogueUrl);
        setFetchStatus('已获取（来源: '+(body.source==='file'?'本地文件':'dashboard 命令')+'）',false);
      }else{
        setFetchStatus(body&&body.error?body.error:'无法获取对话链接',true);
        showDialogueLinkBox('');
      }
    }catch(e){
      setFetchStatus('请求失败: '+(e&&e.message)+'。请确保在本机运行开发服务器 (npm run dev) 以使用此功能。',true);
      showDialogueLinkBox('');
    }finally{
      if(btn)btn.classList.remove('loading');
    }
  }
  const btnFetchLink=$("btn-fetch-dialogue-link");
  if(btnFetchLink)btnFetchLink.addEventListener('click',fetchDialogueLink);

  /* ── 自动获取并填充 Token（参考 token_optimization.js）：分析完结果后打开本页无需手动填写 ── */
  async function autoFetchToken(){
    const statusEl=$("token-fetch-status");
    const setAutoStatus=(msg,isErr)=>{if(statusEl){statusEl.textContent=msg||'';statusEl.className='token-fetch-status'+(isErr?' err':'');}};
    setAutoStatus('正在自动获取 Token…',false);
    try{
      /* 方法 1：开发服务器 /api/dialogue-token（读本地文件或 openclaw dashboard） */
      try{
        const r0=await fetch(window.location.origin+'/api/dialogue-token',{cache:'no-store'});
        const body0=await r0.json().catch(()=>({}));
        if(body0&&body0.ok&&body0.token){
          try{localStorage.setItem('openclaw_gatewayToken',body0.token);}catch{}
          setAutoStatus('✓ Token 已获取（'+(body0.source==='file'?'本地文件':'dashboard')+'）',false);
          const inp=$("token-input");if(inp)inp.value=body0.token.substring(0,10)+'…';
          if(body0.dialogueUrl)showDialogueLinkBox(body0.dialogueUrl);
          return body0.token;
        }
      }catch(_){}
      /* 方法 2：经同源代理访问 Gateway（若网关暴露 /api/dialogue-token） */
      try{
        const r=await fetch(OpenClawGateway.httpBase()+'/api/dialogue-token',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({source:'auto'})
        });
        if(r.ok){
          const body=await r.json().catch(()=>({}));
          if(body&&body.ok&&body.token){
            try{localStorage.setItem('openclaw_gatewayToken',body.token);}catch{}
            setAutoStatus('✓ Token 已获取（Gateway）',false);
            const inp=$("token-input");if(inp)inp.value=body.token.substring(0,10)+'…';
            return body.token;
          }
        }
      }catch(_){}
      throw new Error('未获取到 Token');
    }catch(e){
      setAutoStatus('✗ 自动获取失败: '+(e&&e.message?e.message:String(e)),true);
      return null;
    }
  }

  function buildDialogueUrlFromSaved(){
    const tok=ClawController.getSavedToken();
    if(!tok)return '';
    const path=window.location.pathname||'/openclaw2.html';
    const base=path.endsWith('openclaw2.html')?path:path.replace(/\/?$/, '/openclaw2.html');
    return window.location.origin+base+'#token='+encodeURIComponent(tok);
  }

  /* ── Token 面板 ── */
  const btnToggleToken=$("btn-toggle-token");
  if(btnToggleToken)btnToggleToken.addEventListener('click',()=>{
    const panel=$("token-panel");
    if(panel)panel.classList.toggle('show');
  });
  const btnTokenSave=$("btn-token-save");
  if(btnTokenSave)btnTokenSave.addEventListener('click',()=>{
    const inp=$("token-input");
    const tok=(inp?inp.value:'').trim();
    /* 先保存 token，再 reconnect（只调用一次，避免双重连接） */
    if(tok){
      try{localStorage.setItem('openclaw_gatewayToken',tok);}catch{}
      ClawController.appendMsg('sys','Token 已保存，正在重新连接…');
    }else{
      try{localStorage.removeItem('openclaw_gatewayToken');}catch{}
      ClawController.appendMsg('sys','以本地模式重新连接…');
    }
    if(tok&&typeof showDialogueLinkBox==='function')showDialogueLinkBox(buildDialogueUrlFromSaved());
    const panel=$("token-panel");
    if(panel)panel.classList.remove('show');
    ClawController.reconnect(); /* 只调用一次，reconnect 内部会读 localStorage 中的 token */
  });

  /* ── agent 标签栏：渲染可切换的会话标签，点击即加载该会话聊天记录 ── */
  window.renderChatAgentTabs=function(sessions,activeKey){
    const tabsEl=$("chat-agents-tabs");
    if(!tabsEl)return;
    tabsEl.innerHTML='';
    if(!Array.isArray(sessions)||!sessions.length)return;
    sessions.forEach(s=>{
      const key=s.sessionKey||s.key||s.id||'unknown';
      const tab=document.createElement('button');
      tab.type='button';
      tab.className='agent-tab'+(key===(activeKey||'').trim()?' active':'');
      tab.dataset.key=key;
      tab.textContent=key.length>24?key.slice(0,24)+'…':key;
      tab.title=key;
      tab.setAttribute('role','tab');
      tab.addEventListener('click',function(){
        const k=(this.dataset.key||'').trim();
        if(!k)return;
        const sel=$("chat-load-session");
        if(sel)sel.value=k;
        tabsEl.querySelectorAll('.agent-tab').forEach(t=>t.classList.toggle('active',t.dataset.key===k));
        if(typeof LiveController!=='undefined'&&state.idx===LIVE_IDX){
          LiveController._selectSession(k,null);
        }else if(ClawController&&ClawController.authenticated){
          ClawController.rpcCall('chat.history',{sessionKey:k,limit:100}).then(res=>{
            const messages=ClawController.getMessagesFromHistoryResponse?ClawController.getMessagesFromHistoryResponse(res):(Array.isArray(res&&res.messages)?res.messages:[]);
            ClawController.syncHistoryFromMessages(messages,k);
          }).catch(()=>{});
        }
        try{localStorage.setItem('openclaw2_lastSessionKey',k);}catch(e){}
      });
      tabsEl.appendChild(tab);
    });
  };

  const chatLoadSession=$("chat-load-session");
  if(chatLoadSession)chatLoadSession.addEventListener('change',async function(){
    const key=(this.value||'').trim();
    if(!key)return;
    if(!ClawController){return;}
    if(typeof LiveController!=='undefined'&&state.idx===LIVE_IDX){
      LiveController._selectSession(key,null);
      try{localStorage.setItem('openclaw2_lastSessionKey',key);}catch(e){}
      return;
    }
    if(!ClawController.authenticated){return;}
    try{
      const res=await ClawController.rpcCall('chat.history',{sessionKey:key,limit:100});
      const messages=ClawController.getMessagesFromHistoryResponse?ClawController.getMessagesFromHistoryResponse(res):(Array.isArray(res&&res.messages)?res.messages:[]);
      ClawController.syncHistoryFromMessages(messages,key);
      try{localStorage.setItem('openclaw2_lastSessionKey',key);}catch(e){}
      const tabsEl=$("chat-agents-tabs");if(tabsEl)tabsEl.querySelectorAll('.agent-tab').forEach(t=>t.classList.toggle('active',t.dataset.key===key));
    }catch(e){}
  });

  window.refreshChatLoadSession=async function(){
    if(!ClawController||!ClawController.authenticated)return;
    const sel=$("chat-load-session");
    const lab=$("chat-load-session-label");
    const L=state.lang||'zh';
    if(lab)lab.textContent=L==='zh'?'加载会话':'Load session';
    if(!sel)return;
    try{
      const res=await fetchGatewaySessionsData();
      let sessions=extractSessionsListFromGatewayValue(res&&res.data);
      sessions=sessions.slice().sort((a,b)=>(new Date(b.updatedAt||b.createdAt||0)).getTime()-(new Date(a.updatedAt||a.createdAt||0)).getTime());
      sel.innerHTML='<option value="">'+(L==='zh'?'选择会话…':'Select session…')+'</option>';
      sessions.forEach(s=>{
        const key=s.sessionKey||s.key||s.id||'unknown';
        const opt=document.createElement('option');
        opt.value=key;
        opt.textContent=key.length>36?key.slice(0,36)+'…':key;
        sel.appendChild(opt);
      });
      if(typeof window.renderChatAgentTabs==='function')window.renderChatAgentTabs(sessions,null);
      const lastKey=typeof localStorage!=='undefined'?localStorage.getItem('openclaw2_lastSessionKey'):null;
      if(lastKey&&sessions.some(s=>(s.sessionKey||s.key||s.id)===''+lastKey)){
        sel.value=lastKey;
        try{
          const hist=await ClawController.rpcCall('chat.history',{sessionKey:lastKey,limit:100});
          const messages=ClawController.getMessagesFromHistoryResponse?ClawController.getMessagesFromHistoryResponse(hist):(Array.isArray(hist&&hist.messages)?hist.messages:[]);
          ClawController.syncHistoryFromMessages(messages,lastKey);
          if(typeof window.renderChatAgentTabs==='function')window.renderChatAgentTabs(sessions,lastKey);
        }catch(e){}
      }else if(typeof window.renderChatAgentTabs==='function')window.renderChatAgentTabs(sessions,null);
    }catch(e){}
  };

  /* ── 清空 ── */
  const btnClear=$("btn-clear");
  if(btnClear)btnClear.addEventListener('click',()=>ClawController.clearHistory());

  /* ── 手动重连（先自动探测端口，适配网关随机端口） ── */
  const btnReconn=$("btn-reconnect");
  if(btnReconn)btnReconn.addEventListener('click',async ()=>{
    try{await OpenClawGateway.autoDetectPort();}catch(_){}
    ClawController.reconnect();
  });

  /* ── API 控制面板 ── */
  const btnToggleApi=$("btn-toggle-api");
  const apiPanel=$("api-panel");
  const apiResult=$("api-result");

  function showApiResult(text,isOk){
    if(!apiResult)return;
    apiResult.textContent=text;
    apiResult.className='show '+(isOk?'ok':'err');
  }

  /* API 按钮映射到 RPC 方法（借鉴 Control Center 思路：总览/会话/任务/审批/员工/通道，自有实现） */
  const apiActionMap={
    status:  {rpc:'status',            http:null},
    health:  {rpc:'health',            http:null},
    sessions:{rpc:'sessions.list',    http:null},
    heartbeat:{rpc:'last-heartbeat',  http:null},
    models:  {rpc:'models.list',      http:null},
    config:  {rpc:'config.get',       http:null},
    tasks:   {rpc:'tasks.list',       http:'/tasks'},
    projects:{rpc:'projects.list',    http:'/projects'},
    approvals:{rpc:'approvals.list',  http:'/api/action-queue'},
    presence:{rpc:'system-presence',   http:null},
    channels:{rpc:'channels.list',    http:null},
    usage:   {rpc:'usage-cost',       http:'/api/usage-cost'}
  };

  async function runApiAction(action){
    const map=apiActionMap[action];
    if(!map)return;
    /* 设置 loading 状态 */
    const btn=apiPanel?apiPanel.querySelector('[data-action="'+action+'"]'):null;
    if(btn)btn.classList.add('loading');
    if(apiResult){apiResult.textContent='请求中…';apiResult.className='show';}
    try{
      let result;
      if(ClawController.authenticated&&ClawController.ws&&ClawController.ws.readyState===WebSocket.OPEN){
        /* 优先使用 WebSocket RPC */
        result=await ClawController.rpcCall(map.rpc,{});
      }else{
        /* 降级为 HTTP API */
        const endpoint=map.http||('/api/'+map.rpc.replace(/\./g,'/'));
        result=await ClawController.apiRequest(endpoint);
      }
      const text=typeof result==='string'?result:JSON.stringify(result,null,2);
      showApiResult(text.substring(0,600)+(text.length>600?'\n…(截断)':''),true);
    }catch(e){
      showApiResult('错误: '+e.message,false);
    }finally{
      if(btn)btn.classList.remove('loading');
    }
  }

  if(btnToggleApi){
    btnToggleApi.addEventListener('click',()=>{
      if(!apiPanel)return;
      const open=apiPanel.classList.toggle('show');
      btnToggleApi.classList.toggle('active',open);
      if(apiResult&&!open){apiResult.textContent='';apiResult.className='';}
    });
  }

  if(apiPanel){
    apiPanel.querySelectorAll('.api-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const action=btn.dataset.action;
        if(action)runApiAction(action);
      });
    });
  }

  /* 管理命令区文案随语言更新（供 applyLang 调用） */
  function updateMgmtLabels(){
    const L=state.lang;
    const t=L==='zh'?{title:'管理命令',tasks:'任务',projects:'项目',approvals:'审批',presence:'在线节点',channels:'通道',usage:'用量'}
      :{title:'Management',tasks:'Tasks',projects:'Projects',approvals:'Approvals',presence:'Presence',channels:'Channels',usage:'Usage'};
    const titleEl=document.getElementById('mgmt-section-title');
    if(titleEl)titleEl.textContent=t.title;
    const mgmtBtns=document.querySelectorAll('#api-btns-mgmt .api-btn');
    mgmtBtns.forEach(btn=>{
      const a=btn.dataset.action;
      if(t[a])btn.textContent=t[a];
    });
  }
  window.updateMgmtLabels=updateMgmtLabels;
  if(document.getElementById('mgmt-section'))updateMgmtLabels();

  /* ── 语言切换 ── */
  const btnZh=$("btn-lang-zh"),btnEn=$("btn-lang-en");
  if(btnZh)btnZh.addEventListener('click',()=>{const L='zh';state.metrics=processStats(state.payload||{},L);state.themes=themes(state.metrics,L);mountNav();renderTheme(state.idx);refreshDetails();applyLang(L);});
  if(btnEn)btnEn.addEventListener('click',()=>{const L='en';state.metrics=processStats(state.payload||{},L);state.themes=themes(state.metrics,L);mountNav();renderTheme(state.idx);refreshDetails();applyLang(L);});

  /* ── 初始化连接：先探测 Gateway 端口，再无 token 时自动获取后连接 ── */
  (async function startConnect(){
    try{await OpenClawGateway.autoDetectPort();}catch(_){}
    if(ClawController.getSavedToken()){
      ClawController.connect();
      return;
    }
    try{
      const tok=await autoFetchToken();
      ClawController.connect();
      if(tok){
        ClawController.appendMsg('sys','Token 已自动填充，正在连接…');
        var statusEl=$("token-fetch-status");if(statusEl)statusEl.textContent='';
      }
    }catch(_){ClawController.connect();}
  })();
}
const setStatus=t=>status.textContent=t,hideBoot=()=>boot.classList.add('hide');
async function bootstrap(){const L=state.lang;setStatus(i18n[L].statusLoading);const local=localPayload();setStatus(i18n[L].statusFetch);const remote=await workerPayload();state.payload=score(remote)>score(local)?remote:local;try{if(state.payload&&Object.keys(state.payload).length)sessionStorage.setItem('openclaw_analysis_data',JSON.stringify(state.payload));}catch{}setStatus(i18n[L].statusProcess);state.metrics=processStats(state.payload||{},L);state.themes=themes(state.metrics,L);try{const sc=score(state.payload||{}),pk=state.payload||{},hasP=!!(pk.openclawPortrait&&Object.keys(pk.openclawPortrait).length),hasS=!!(pk.openclawSessionsSummary&&Object.keys(pk.openclawSessionsSummary).length);console.info('[openclaw2] 载荷诊断 quality=%s portrait=%s sessions=%s keys=%s',sc,hasP,hasS,Object.keys(pk).join(','));}catch{}}
async function init(){applyLang(state.lang);bind();tick();setInterval(tick,1000);setInterval(()=>{if(Math.random()>.82){pl.setAttribute('r','14');pr.setAttribute('r','14');setTimeout(()=>{pl.setAttribute('r','11');pr.setAttribute('r','11')},110)}},2800);await bootstrap();mountNav();renderTheme(state.idx);refreshDetails();setStatus(i18n[state.lang].statusOnline);setTimeout(hideBoot,220);applyLang(state.lang);}
function applyLang(L){state.lang=L;try{localStorage.setItem("openclaw2_lang",L);}catch{}const t=i18n[L];if(!t)return;$("top-title").textContent=t.topTitle;$("top-sub").textContent=t.topSub;const heroTitle=$("hero-title");if(heroTitle)heroTitle.textContent=t.heroTitle;$("link-report").textContent=t.linkReport;$("link-report").title=t.linkReport;$("link-stats").textContent=t.linkStats;$("link-stats").title=t.linkStats;$("boot").querySelector(".t").textContent=t.bootTitle;const dv=$("detail-view");if(dv){const sigTitle=$("detail-view-signal-title"),sessTitle=$("detail-view-session-title");if(sigTitle)sigTitle.textContent=t.signalPanels;if(sessTitle)sessTitle.textContent=t.sessionList;const leftBlks=dv.querySelectorAll(".detail-view-left .blk .pt");if(leftBlks[0])leftBlks[0].textContent=t.radar;if(leftBlks[1])leftBlks[1].textContent=t.wordCloud;}const dsTitle=$("data-source-title"),dsDesc=$("data-source-desc");if(dsTitle&&t.dataSourceTitle)dsTitle.textContent=t.dataSourceTitle;if(dsDesc&&t.dataSourceDesc){let txt=t.dataSourceDesc;try{if(state.metrics&&typeof score==="function"&&t.dataSourcePayloadHint&&score(state.payload||{})<4)txt=txt+"\n\n"+t.dataSourcePayloadHint;}catch{}dsDesc.textContent=txt;}const tabsEl=$("chat-agents-tabs"),histEl=$("chat-history-content");if(tabsEl)tabsEl.setAttribute("data-empty-text",L==="zh"?"暂无会话标签":"No session tabs yet");if(histEl)histEl.setAttribute("data-empty-text",L==="zh"?"连接后或加载会话后，这里会显示聊天记录。":"Chat history will appear here after connection or session load.");const sg=histEl&&histEl.querySelector(".msg-sys-group");if(sg&&typeof ClawController!=="undefined"&&ClawController._updateSysGroupHeader)ClawController._updateSysGroupHeader(sg);const bzh=$("btn-lang-zh"),ben=$("btn-lang-en");if(bzh)bzh.classList.toggle("active",L==="zh");if(ben)ben.classList.toggle("active",L==="en");document.documentElement.lang=L==="zh"?"zh-CN":"en";if(typeof window.updateMgmtLabels==="function")window.updateMgmtLabels();if(typeof LiveController!=="undefined")LiveController.updateLabels(L);}
init().catch(()=>{const L=state.lang;sub.textContent=L==="zh"?"数据离线":"DATA OFFLINE";setStatus(i18n[L].statusFailed);state.metrics=processStats({},L);state.themes=themes(state.metrics,L);mountNav();renderTheme(state.idx);refreshDetails();setTimeout(hideBoot,320);applyLang(L);});
})();
