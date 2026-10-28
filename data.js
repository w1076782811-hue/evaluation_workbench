/* 全部为演示数据；汇总指标不代表真实评测结果。经典脚本确保 file:// 可直接运行。 */
const DIMENSIONS = [
  { code: "L1", name: "商品本体保真", short_name: "商品保真", weight: 30 },
  { code: "L2", name: "语义与指令遵循", short_name: "语义遵循", weight: 14 },
  { code: "L3", name: "物理与空间合理性", short_name: "物理空间", weight: 9 },
  { code: "L4", name: "人体与交互", short_name: "人体交互", weight: 6 },
  { code: "L5", name: "光学与摄影", short_name: "光学摄影", weight: 6 },
  { code: "L6", name: "一致性与可控性", short_name: "一致可控", weight: 7 },
  { code: "L7", name: "商业表现力", short_name: "商业表现", weight: 18 },
  { code: "L8", name: "合规与安全", short_name: "合规安全", weight: 10 }
];

const SAMPLES = [
  {
    sample_id: "EC-STEAM-001", task_id: "T-20261029-01", category: "厨房小家电", image_type: "场景图", difficulty: "中",
    prompt_raw: "一台银色不锈钢电蒸锅，放置在浅色岩板厨房台面上，旁边有一碟切好的蔬菜，背景柔和虚化的现代厨房，晨光从左侧窗户照入，商品占画面约 55%，竖版 3:4",
    reference_image: "ref/STEAM-001.jpg", generated_image: "gen/STEAM-001-v14.jpg",
    evaluation_mode: "group", group_id: "EC-STEAM-G01",
    evaluation_context: "与 EC-STEAM-002～004 同组比较蒸锅结构、材质与配色；本条无人物。",
    machine_scores: { L1: 2, L2: 2, L3: 1, L4: null, L5: 1, L6: 2, L7: 2, L8: 2 },
    machine_defects: [
      { code: "L3-01", position: "中下", severity: "P1", note: "底部与台面无接触阴影" },
      { code: "L5-01", position: "全图", severity: "P2", note: "左侧有第二光源痕迹" }
    ],
    applicable_dims: ["L1", "L2", "L3", "L5", "L6", "L7", "L8"],
    subdimension_applicability: { "L1-2": false, "L5-3": true, "L3-2": true, "L7-3": true },
    applicability_notes: { L4: "画面无人物", "L1-2": "无包装文字、标签或 logo" }
  },
  {
    sample_id: "EC-STEAM-002", task_id: "T-20261029-01", category: "厨房小家电", image_type: "场景图", difficulty: "中",
    prompt_raw: "同款银色双层电蒸锅，放在橡木餐边柜上，右侧放白色瓷碗，后方是浅米色墙面与一株绿植，柔和侧光，横版 4:3，保留双层蒸屉和黑色底座",
    reference_image: "ref/STEAM-002.jpg", generated_image: "gen/STEAM-002-v14.jpg",
    evaluation_mode: "group", group_id: "EC-STEAM-G01",
    evaluation_context: "与 EC-STEAM-001、003、004 同组比较，检查双层蒸屉及黑色底座保持一致。",
    machine_scores: { L1: 2, L2: 2, L3: 1, L4: null, L5: 2, L6: 2, L7: 1, L8: 2 },
    machine_defects: [
      { code: "L3-02", position: "右中", severity: "P2", note: "白瓷碗与蒸锅边缘的前后遮挡关系不自然" },
      { code: "L7-01", position: "全图", severity: "P2", note: "绿植占比过大，分散商品注意力" }
    ],
    applicable_dims: ["L1", "L2", "L3", "L5", "L6", "L7", "L8"],
    subdimension_applicability: { "L1-2": false, "L5-3": true, "L3-2": true, "L7-3": true },
    applicability_notes: { L4: "画面无人物", "L1-2": "商品与道具均无可见文字" }
  },
  {
    sample_id: "EC-STEAM-003", task_id: "T-20261029-01", category: "厨房小家电", image_type: "白底主图", difficulty: "低",
    prompt_raw: "银色双层电蒸锅白底主图，完整呈现透明锅盖、双层蒸屉与黑色底座，正面略俯视，商品占比 75%，保留底座上的 STEAM 字样，不添加道具，方图 1:1",
    reference_image: "ref/STEAM-003.jpg", generated_image: "gen/STEAM-003-v14.jpg",
    evaluation_mode: "group", group_id: "EC-STEAM-G01",
    evaluation_context: "同组白底视角，用于比较场景图与主图的形制一致性。",
    machine_scores: { L1: 1, L2: 2, L3: 2, L4: null, L5: 2, L6: 1, L7: 2, L8: 2 },
    machine_defects: [{ code: "L1-01", position: "左中", severity: "P1", note: "左侧把手比参考图偏长，同组侧视图的比例不一致" }],
    applicable_dims: ["L1", "L2", "L3", "L5", "L6", "L7", "L8"],
    subdimension_applicability: { "L1-2": true, "L5-3": true, "L3-2": false, "L7-3": true },
    applicability_notes: { L4: "画面无人物", "L3-2": "单个商品且无前后遮挡关系，仅跳过空间层级子项" }
  },
  {
    sample_id: "EC-STEAM-004", task_id: "T-20261029-01", category: "厨房小家电", image_type: "细节特写", difficulty: "中",
    prompt_raw: "同款电蒸锅的不锈钢蒸屉边缘细节，展示均匀拉丝纹理、接缝与透明玻璃锅盖，冷白背景，单侧柔光，微距摄影，竖版 3:4",
    reference_image: "ref/STEAM-004.jpg", generated_image: "gen/STEAM-004-v14.jpg",
    evaluation_mode: "group", group_id: "EC-STEAM-G01",
    evaluation_context: "与同组其余三张图比较拉丝方向和接缝位置，L6 有整组参照。",
    machine_scores: { L1: 2, L2: 2, L3: 2, L4: null, L5: 1, L6: 2, L7: 2, L8: 2 },
    machine_defects: [{ code: "L5-01", position: "右上", severity: "P2", note: "玻璃锅盖高光方向与蒸屉的柔光方向不一致" }],
    applicable_dims: ["L1", "L2", "L3", "L5", "L6", "L7", "L8"],
    subdimension_applicability: { "L1-2": false, "L5-3": true, "L3-2": true, "L7-3": true },
    applicability_notes: { L4: "画面无人物", "L1-2": "局部特写无标识或文字" }
  },
  {
    sample_id: "EC-EARBUD-001", task_id: "T-20261029-01", category: "3C 数码", image_type: "白底主图", difficulty: "低",
    prompt_raw: "哑光白色无线耳机与打开的充电盒，纯白背景，两只耳机完整摆放在盒前，正面三分之四视角，保留盒盖上的 AIR 标识，方图 1:1",
    reference_image: "ref/EARBUD-001.jpg", generated_image: "gen/EARBUD-001-v14.jpg",
    evaluation_mode: "single", group_id: null, evaluation_context: "单图评测，仅与本条参考图比较商品；不评跨图一致性。",
    machine_scores: { L1: 2, L2: 2, L3: 1, L4: null, L5: 2, L6: null, L7: 2, L8: 2 },
    machine_defects: [{ code: "L3-01", position: "左下", severity: "P1", note: "左耳机的底部悬浮，缺少与白色台面的接触" }],
    applicable_dims: ["L1", "L2", "L3", "L5", "L7", "L8"],
    subdimension_applicability: { "L1-2": true, "L5-3": false, "L3-2": true, "L7-3": true },
    applicability_notes: { L4: "画面无人物", L6: "单图无整组参照", "L5-3": "无镜面、玻璃或水面" }
  },
  {
    sample_id: "EC-KEYBOARD-001", task_id: "T-20261029-01", category: "3C 数码", image_type: "白底主图", difficulty: "高",
    prompt_raw: "浅灰色 75% 配列机械键盘，保留参考图的 82 键布局和右上角金属旋钮，键帽字符清晰，纯白背景，俯视视角，商品完整入画，横版 4:3",
    reference_image: "ref/KEYBOARD-001.jpg", generated_image: "gen/KEYBOARD-001-v14.jpg",
    evaluation_mode: "single", group_id: null, evaluation_context: "单图核对键位数量与旋钮位置；不评跨图一致性。",
    machine_scores: { L1: 0, L2: 1, L3: 2, L4: null, L5: 2, L6: null, L7: 2, L8: 2 },
    machine_defects: [
      { code: "L1-04", position: "中上", severity: "P0", note: "功能键排多出一排按键，82 键结构被改变，需重新生成" },
      { code: "L2-01", position: "右上", severity: "P1", note: "金属旋钮的位置未遵循参考图约束" }
    ],
    applicable_dims: ["L1", "L2", "L3", "L5", "L7", "L8"],
    subdimension_applicability: { "L1-2": true, "L5-3": false, "L3-2": false, "L7-3": true },
    applicability_notes: { L4: "画面无人物", L6: "单图无整组参照", "L5-3": "无镜面、玻璃或水面", "L3-2": "单品白底俯视，无其他物体遮挡" }
  },
  {
    sample_id: "EC-SPEAKER-001", task_id: "T-20261029-01", category: "3C 数码", image_type: "场景图", difficulty: "中",
    prompt_raw: "深蓝色织物蓝牙音箱放置在浅橡木书桌上，左侧一本合上的米色笔记本，背景为整洁书架，自然侧光，商品占画面 60%，横版 4:3",
    reference_image: "ref/SPEAKER-001.jpg", generated_image: "gen/SPEAKER-001-v14.jpg",
    evaluation_mode: "single", group_id: null, evaluation_context: "单图检查指定颜色与商品占比。",
    machine_scores: { L1: 2, L2: 1, L3: 2, L4: null, L5: 2, L6: null, L7: 1, L8: 2 },
    machine_defects: [
      { code: "L2-01", position: "左中", severity: "P2", note: "笔记本被生成成翻开状态，未遵循指令" },
      { code: "L7-01", position: "全图", severity: "P2", note: "书架占比过大，音箱占比不足 40%" }
    ],
    applicable_dims: ["L1", "L2", "L3", "L5", "L7", "L8"],
    subdimension_applicability: { "L1-2": false, "L5-3": false, "L3-2": true, "L7-3": true },
    applicability_notes: { L4: "画面无人物", L6: "单图无整组参照", "L1-2": "无可见文字或品牌标识", "L5-3": "无镜面、玻璃或水面" }
  },
  {
    sample_id: "EC-SERUM-001", task_id: "T-20261029-01", category: "美妆个护", image_type: "场景图", difficulty: "中",
    prompt_raw: "一瓶琥珀色玻璃精华液置于米色石质台座，白色滴管盖，保留瓶身 SERUM 标签，后方摆一片柔焦绿叶，柔和窗光，竖版 3:4，不增加功效文字",
    reference_image: "ref/SERUM-001.jpg", generated_image: "gen/SERUM-001-v14.jpg",
    evaluation_mode: "single", group_id: null, evaluation_context: "单图评测玻璃质感与台座接触关系。",
    machine_scores: { L1: 2, L2: 2, L3: 1, L4: null, L5: 2, L6: null, L7: 2, L8: 2 },
    machine_defects: [{ code: "L3-01", position: "中下", severity: "P1", note: "瓶底与台座间留有细缝，呈悬浮状态" }],
    applicable_dims: ["L1", "L2", "L3", "L5", "L7", "L8"],
    subdimension_applicability: { "L1-2": true, "L5-3": true, "L3-2": true, "L7-3": true },
    applicability_notes: { L4: "画面无人物", L6: "单图无整组参照" }
  },
  {
    sample_id: "EC-LOTION-001", task_id: "T-20261029-01", category: "美妆个护", image_type: "模特图", difficulty: "高",
    prompt_raw: "成年女性模特手持白色按压瓶身体乳，商品标签 LOTION 朝向镜头，展示正常握持关系与完整泵头，浅米色背景，柔和侧光，半身竖版 3:4",
    reference_image: "ref/LOTION-001.jpg", generated_image: "gen/LOTION-001-v14.jpg",
    evaluation_mode: "single", group_id: null, evaluation_context: "有人物，L4 参评；单图无跨图一致性参照。",
    machine_scores: { L1: 0, L2: 2, L3: 2, L4: 2, L5: 1, L6: null, L7: 2, L8: 2 },
    machine_defects: [
      { code: "L1-04", position: "中", severity: "P0", note: "瓶身多出一个泵头，核心结构错误，需重新生成" },
      { code: "L5-01", position: "左上", severity: "P2", note: "瓶身高光与模特面部的受光方向不一致" }
    ],
    applicable_dims: ["L1", "L2", "L3", "L4", "L5", "L7", "L8"],
    subdimension_applicability: { "L1-2": true, "L5-3": false, "L3-2": true, "L7-3": true },
    applicability_notes: { L6: "单图无整组参照", "L5-3": "哑光塑料瓶与背景均无镜面、玻璃或水面" }
  },
  {
    sample_id: "EC-COFFEE-001", task_id: "T-20261029-01", category: "食品饮料", image_type: "场景图", difficulty: "中",
    prompt_raw: "一袋米白包装挂耳咖啡放在胡桃木桌面，正面 COFFEE 字样清晰，旁边白瓷杯与少量咖啡豆，温暖晨光，背景虚化，商品占比 55%，竖版 3:4",
    reference_image: "ref/COFFEE-001.jpg", generated_image: "gen/COFFEE-001-v14.jpg",
    evaluation_mode: "single", group_id: null, evaluation_context: "单图检查包装形制、光照与接触阴影。",
    machine_scores: { L1: 2, L2: 2, L3: 1, L4: null, L5: 1, L6: null, L7: 2, L8: 2 },
    machine_defects: [
      { code: "L3-01", position: "中下", severity: "P1", note: "咖啡袋底部与桌面缺少接触阴影" },
      { code: "L5-01", position: "右中", severity: "P2", note: "杯柄高光与咖啡袋受光方向相反" }
    ],
    applicable_dims: ["L1", "L2", "L3", "L5", "L7", "L8"],
    subdimension_applicability: { "L1-2": true, "L5-3": false, "L3-2": true, "L7-3": true },
    applicability_notes: { L4: "画面无人物", L6: "单图无整组参照", "L5-3": "空白瓷杯、纸袋与木桌不涉及反射透射子项" }
  },
  {
    sample_id: "EC-JUICE-001", task_id: "T-20261029-01", category: "食品饮料", image_type: "细节特写", difficulty: "高",
    prompt_raw: "橙汁玻璃瓶标签与冷凝水珠的细节特写，保留参考标签上的橙子图案与果汁名称，浅橙背景，柔和侧光，竖版 3:4，不添加广告语或功效声称",
    reference_image: "ref/JUICE-001.jpg", generated_image: "gen/JUICE-001-v14.jpg",
    evaluation_mode: "single", group_id: null, evaluation_context: "单图检查标签文字与玻璃、水珠细节。",
    machine_scores: { L1: 2, L2: 2, L3: 2, L4: null, L5: 2, L6: null, L7: 1, L8: 0 },
    machine_defects: [
      { code: "L8-01", position: "中", severity: "P0", note: "标签额外出现“全国第一”极限词，不能直接商用" },
      { code: "L7-01", position: "全图", severity: "P2", note: "瓶身裁切过紧，标签完整性受影响" }
    ],
    applicable_dims: ["L1", "L2", "L3", "L5", "L7", "L8"],
    subdimension_applicability: { "L1-2": true, "L5-3": true, "L3-2": false, "L7-3": true },
    applicability_notes: { L4: "画面无人物", L6: "单图无整组参照", "L3-2": "单个瓶身局部特写，无前后物体遮挡" }
  },
  {
    sample_id: "EC-BAG-001", task_id: "T-20261029-01", category: "服饰鞋包", image_type: "模特图", difficulty: "高",
    prompt_raw: "成年女性模特斜挎焦糖色皮革小方包，保留包盖五金扣与肩带宽度，浅灰背景，自然站姿，柔和侧光，包体完整入画，竖版 3:4，不添加营销文字",
    reference_image: "ref/BAG-001.jpg", generated_image: "gen/BAG-001-v14.jpg",
    evaluation_mode: "single", group_id: null, evaluation_context: "有人物，评估肩带与身体交互；单图不评价跨图一致性。",
    machine_scores: { L1: 1, L2: 2, L3: 2, L4: 2, L5: 1, L6: null, L7: 1, L8: 0 },
    machine_defects: [
      { code: "L1-03", position: "中", severity: "P1", note: "皮革纹理偏塑料质感，表面处理需修正" },
      { code: "L5-01", position: "左中", severity: "P2", note: "包体高光与衣物光线方向不同" },
      { code: "L7-01", position: "全图", severity: "P2", note: "包体在画面中偏小，难以突出五金细节" },
      { code: "L8-01", position: "右上", severity: "P0", note: "画面额外叠加“全网最佳”极限词，需移除后再评估" }
    ],
    applicable_dims: ["L1", "L2", "L3", "L4", "L5", "L7", "L8"],
    subdimension_applicability: { "L1-2": true, "L5-3": false, "L3-2": true, "L7-3": true },
    applicability_notes: { L6: "单图无整组参照", "L5-3": "皮革、衣物与背景均无镜面、玻璃或水面" }
  }
];

const TASKS = [
  { task_id: "T-20261029-01", model_version: "v1.4", total: 400, done: 156, status: "running", created_at: "2026-10-29 09:12" },
  { task_id: "T-20261022-01", model_version: "v1.3", total: 400, done: 400, status: "done", created_at: "2026-10-22 10:30" },
  { task_id: "T-20261015-01", model_version: "v1.2", total: 400, done: 400, status: "done", created_at: "2026-10-15 14:05" }
];

const DEFECT_CODES = [
  { code: "L1-01", name: "形制偏移", level: "Must" },
  { code: "L1-02", name: "标识与文字错误", level: "Must/Gate" },
  { code: "L1-03", name: "材质误判", level: "Must" },
  { code: "L1-04", name: "结构缺失或多余", level: "Must/Gate" },
  { code: "L2-01", name: "属性绑定错误", level: "Must" },
  { code: "L3-01", name: "悬浮或无接触", level: "Must" },
  { code: "L3-02", name: "空间层级错误", level: "Must" },
  { code: "L4-01", name: "人体结构异常", level: "Must" },
  { code: "L4-02", name: "人物商品交互错误", level: "Must" },
  { code: "L5-01", name: "光照不一致", level: "Should" },
  { code: "L6-01", name: "跨图结构不一致", level: "Must" },
  { code: "L6-02", name: "跨图材质颜色漂移", level: "Must" },
  { code: "L7-01", name: "构图失衡", level: "Must" },
  { code: "L8-01", name: "极限词", level: "Gate" }
];

const PE_VERSIONS = [
  {
    version: "pe-v1.0", date: "2026-09-10", change: "基线：直接用用户原话", usable_rate: 0.41,
    template: { subject: "保留用户原始指令", structure: "待补充", material: "待补充", environment: "待补充", lighting: "待补充", composition: "待补充" },
    constraints: "未设置保真约束与负面提示。"
  },
  {
    version: "pe-v1.1", date: "2026-09-24", change: "按六段式补齐缺失段", usable_rate: 0.53,
    template: { subject: "提取商品类别与颜色", structure: "根据明确输入填写，未提供则待补充", material: "将模糊质感词映射为表面描述", environment: "补齐背景与道具", lighting: "补齐主光方向与色温", composition: "补齐主体占比、视角和画幅" },
    constraints: "使用六段式；未知商品属性标记待补充。"
  },
  {
    version: "pe-v1.2", date: "2026-10-08", change: "加入保真约束与负面提示", usable_rate: 0.61,
    template: { subject: "提取商品类别与颜色，保持商品身份", structure: "依据参考图保留结构件数量、位置和比例", material: "将模糊质感词映射为表面描述，保持参考材质", environment: "补齐背景与道具，避免遮挡关键结构", lighting: "补齐主光方向与色温，要求接触阴影自然", composition: "补齐主体占比、视角和画幅，保留商品完整轮廓" },
    constraints: "禁止增减结构件、篡改标识、增加极限词；未知属性待补充。"
  }
];

const FUZZY_MAP = [
  { user_says: "高级一点", means: "低饱和 + 简洁 + 材质明确", rewrite: "低饱和色调、纯色或极简背景、材质纹理清晰可见、无多余道具" },
  { user_says: "有质感", means: "表面处理要明确", rewrite: "指定拉丝/磨砂/亮面；高光形态具体（长条高光＝拉丝，点状高光＝磨砂）" },
  { user_says: "温馨", means: "暖色温 + 生活道具", rewrite: "色温 3500～4000K、暖色木质道具、柔和侧光" },
  { user_says: "干净", means: "浅底 + 无干扰", rewrite: "纯白或浅灰背景、无道具、主体占比 ≥ 70%" },
  { user_says: "大气", means: "大留白 + 低视角", rewrite: "主体占比 40～50%、仰视或平视、背景简洁有纵深" },
  { user_says: "ins 风", means: "低饱和 + 自然光 + 留白", rewrite: "低饱和莫兰迪色系、侧逆光、大面积留白、生活化道具" },
  { user_says: "有氛围感", means: "环境光 + 虚实层次", rewrite: "明确的辅助光源、背景虚化、前景有遮挡物" },
  { user_says: "像杂志", means: "硬光 + 强对比 + 极简", rewrite: "单侧硬光、高对比、几何构图、纯色背景" }
];

const VERSION_STATS = [
  { version: "v1.2", usable_rate: 0.61, repair_rate: 0.30, discard_rate: 0.09, scores: { L1: 1.48, L2: 1.42, L3: 1.22, L4: 1.16, L5: 1.32, L6: 1.36, L7: 1.40, L8: 1.66 } },
  { version: "v1.3", usable_rate: 0.66, repair_rate: 0.27, discard_rate: 0.07, scores: { L1: 1.58, L2: 1.54, L3: 1.34, L4: 1.30, L5: 1.42, L6: 1.48, L7: 1.54, L8: 1.78 } },
  { version: "v1.4", usable_rate: 0.72, repair_rate: 0.23, discard_rate: 0.05, scores: { L1: 1.76, L2: 1.70, L3: 1.48, L4: 1.42, L5: 1.56, L6: 1.66, L7: 1.72, L8: 1.86 } }
];

const DEMO_SUMMARY = {
  model_version: "v1.4", evaluated_at: "2026-10-29 09:12", total: 400,
  pending_reviews: 48, calibrated: 62, calibration_target: 150, agreement_rate: 0.9
};
