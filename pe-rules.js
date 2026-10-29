// PE 转写规则库。普通 script 加载，兼容本地双击；不读取网络或本地 JSON。
// 本文件只负责规则数据；较长的初始化用于完整保留来源条目，不包含转写或页面逻辑。
window.PE_RULES = (() => {
  'use strict';

  const FUZZY_PROFILES = {
    '高级一点': { aliases: ['高级', '高级点', '高级感', '高端', '有档次'], params: { color: { saturation: [15, 35] }, material: { texture: '材质纹理清晰可见', props_count: 0 }, environment: { background: '纯色或极简背景' } } },
    '有质感': { aliases: ['质感好', '质感明显'], params: { material: { texture: '表面纹理与高光符合实际材质' } } },
    '温馨': { aliases: ['温馨一点', '温馨点'], params: { light: { softness: '柔和', kelvin: [3500, 4000] }, color: { tone: '暖色调' }, material: { props_type: '暖色木质生活道具' } } },
    '干净': { aliases: ['干净一点', '清洁感'], params: { environment: { background: '纯白或浅灰背景' }, composition: { subject_ratio: 70 }, material: { props_count: 0 } } },
    '大气': { aliases: ['大气一点'], params: { composition: { subject_ratio: [40, 50], angle: '仰视或平视', whitespace: '大面积留白' }, light: { depth: '背景有纵深' } } },
    'ins 风': { aliases: ['ins风', 'ins', '小红书风', '博主风'], params: { light: { direction: '自然侧逆光', softness: '柔和' }, color: { tone: '莫兰迪色系', saturation: [20, 40] }, composition: { whitespace: '大面积留白' }, material: { props_type: '生活化道具' } } },
    '有氛围感': { aliases: ['氛围感'], params: { light: { direction: '明确主光与辅助环境光', depth: '背景虚化，前后景有层次' }, composition: { framing: '前景适度遮挡，保持商品关键部分可见' } } },
    '像杂志': { aliases: ['杂志感', '杂志风'], params: { light: { direction: '单侧光', softness: '硬光', contrast: '高' }, composition: { framing: '几何构图' }, environment: { background: '纯色背景' } } }
  };

  const BASE_FUZZY_RULES = FUZZY_MAP.map(item => ({
    triggers: [item.user_says, ...(FUZZY_PROFILES[item.user_says]?.aliases || [])],
    fragment: item.rewrite,
    params: FUZZY_PROFILES[item.user_says]?.params || {},
    label: item.user_says,
    means: item.means,
    source: 'data.js / FUZZY_MAP'
  }));

  const ADDITIONAL_FUZZY_RULES = [
    { triggers: ['有细节', '细节清楚'], fragment: '近景展示，材质纹理清晰可见，主体占比不低于70%', params: { composition: { framing: '近景', subject_ratio: 70 }, material: { texture: '材质纹理清晰可见' } } },
    { triggers: ['不土', '不要土气'], fragment: '低饱和色调，去除花哨道具，采用简洁几何构图', params: { color: { saturation: [15, 35] }, composition: { framing: '简洁几何构图' }, material: { props_count: 0 } } },
    { triggers: ['亮一点', '更亮一点'], fragment: '提高整体明度，主体正面适度补光，高光不过曝', params: { light: { brightness: 1.1 } } },
    { triggers: ['别太假', '不要太假'], fragment: '材质反射真实，保留自然纹理和轻微不规则，避免塑料感', params: { material: { texture: '真实自然纹理与轻微不规则，避免塑料感' } } },
    { triggers: ['有食欲', '看起来好吃'], fragment: '暖色温3800K，近景呈现真实食材纹理、油光或水汽', params: { light: { kelvin: 3800 }, composition: { framing: '近景微距' }, material: { texture: '真实食材纹理，油光或水汽按实际内容呈现' } } },
    { triggers: ['显大', '显得大'], fragment: '主体占画面65%以上；尺寸参照物仅在用户明确要求时添加', params: { composition: { subject_ratio: 65 } } },
    { triggers: ['显小', '显得小'], fragment: '主体占画面约30%，保留大面积环境空间', params: { composition: { subject_ratio: 30, whitespace: '保留大面积环境空间' } } },
    { triggers: ['更专业', '专业一点', '专业'], fragment: '主光明确、适度补光，主体居中，背景纯净，无多余道具', params: { light: { direction: '明确主光，辅助补光不过度' }, composition: { subject_position: '居中' }, environment: { background: '纯净背景' }, material: { props_count: 0 } } },
    { triggers: ['别太满', '不要太满'], fragment: '道具不超过1件，留白不少于40%', params: { material: { props_count: 1 }, composition: { whitespace: '不少于40%' } } },
    { triggers: ['像实拍', '实拍感', '自然一点'], fragment: '采用自然光与自然构图，保留轻微不规则，避免过度对称', params: { light: { direction: '自然光' }, composition: { framing: '自然构图，避免过度对称' }, material: { texture: '保留真实自然纹理' } } },
    { triggers: ['很通透', '通透一点'], fragment: '逆光或侧逆光，高光不过曝，高明度低饱和，留白不少于35%', params: { light: { direction: '逆光或侧逆光', depth: '全景深' }, color: { brightness: '高明度', saturation: [15, 35] }, composition: { whitespace: '不少于35%' } } }
  ];

  const IMAGERY_RULES = [
    {
      id: 'style-ins', type: 'A', canonical: 'ins风', triggers: ['ins风', 'ins 风', 'ins', '小红书风', '博主风'],
      params: { light: { direction: '自然侧光或侧逆光', softness: '柔和', kelvin: [4500, 5500], contrast: '低' }, composition: { angle: '俯拍或平视', ratio: '1:1或4:5', whitespace: '大面积留白', subject_position: '偏中心' }, color: { saturation: [20, 40], tone: '莫兰迪暖灰或奶油调', max_colors: 3 }, material: { finish: '哑光', props_count: [1, 2], props_type: '木质、亚麻或陶瓷生活道具' } },
      fragment: '自然侧光柔和，低饱和莫兰迪色调，画面大面积留白，木质或亚麻道具仅作点缀', conflicts_with: ['style-cyber', 'style-dark']
    },
    {
      id: 'style-japanese', type: 'A', canonical: '日系', triggers: ['日系', '和风', '无印风', '清爽'],
      params: { light: { direction: '柔和散射光', softness: '柔和', kelvin: [5000, 6000], contrast: '低' }, composition: { angle: '平视或微俯', whitespace: '不少于40%', framing: '主体偏小' }, color: { saturation: [15, 35], tone: '偏青蓝', brightness: '高明度' }, material: { finish: '自然哑光', props_count: 1, props_type: '棉麻、原木或白瓷' } },
      fragment: '柔和散射光，高光不过曝，偏青蓝低饱和，平视微俯并留出较大空间', conflicts_with: ['style-cyber', 'style-dark']
    },
    {
      id: 'style-nordic', type: 'A', canonical: '北欧', triggers: ['北欧', '简约北欧', '宜家风'],
      params: { light: { direction: '大窗自然光', softness: '柔和', kelvin: 5500, contrast: '中低' }, composition: { angle: '平视', framing: '简洁几何构图' }, color: { tone: '白色与木色，少量莫兰迪色点缀', saturation: [15, 35], brightness: '高明度' }, material: { props_type: '原木、羊毛织物或绿植', props_count: 1 }, environment: { background: '简洁白墙背景' } },
      fragment: '明亮窗光，平视几何构图，白与浅木色为主，少量低饱和色点缀', conflicts_with: ['style-cyber']
    },
    {
      id: 'style-vintage', type: 'A', canonical: '复古', triggers: ['复古胶片', '复古', 'vintage'],
      params: { light: { direction: '暖调窗光', softness: '硬光', kelvin: [3000, 3500], contrast: '高' }, composition: { angle: '略仰视', framing: '近景', subject_position: '居中' }, color: { tone: '暖黄棕调', brightness: '低明度', saturation: [45, 70] }, material: { props_type: '皮革、黄铜或深色木', props_count: [2, 3], texture: '轻微胶片颗粒' } },
      fragment: '暖黄棕调与高对比窗光，近景略仰视，保留轻微胶片颗粒', conflicts_with: ['style-cyber']
    },
    {
      id: 'style-cyber', type: 'A', canonical: '赛博朋克', triggers: ['赛博朋克', '赛博', '未来感'],
      params: { light: { direction: '主光明确，霓虹环境光点缀', softness: '硬光', contrast: '高' }, composition: { angle: '仰视或极端透视', framing: '广角' }, color: { tone: '青与洋红对冲，暗部偏蓝紫', saturation: [70, 90] }, material: { finish: '金属或玻璃反光质感', props_type: '霓虹灯管视觉元素' } },
      fragment: '主光方向明确，青与洋红霓虹点缀，高对比硬光与广角透视', conflicts_with: ['style-ins', 'style-japanese', 'style-nordic', 'style-vintage', 'style-white']
    },
    {
      id: 'style-white', type: 'A', canonical: '极简白底', triggers: ['极简白底', '电商白底', '纯白底', '白底'],
      params: { light: { direction: '均匀柔光，阴影方向一致', softness: '柔和', kelvin: 5500, contrast: '低' }, composition: { subject_position: '正中', subject_ratio: 70 }, color: { tone: '纯白与产品本色' }, material: { props_count: 0 }, environment: { background: '纯白无缝背景' } },
      fragment: '纯白无缝背景，均匀柔光，商品居中占七成，无额外道具', conflicts_with: ['style-cyber', 'style-dark']
    },
    {
      id: 'style-luxury', type: 'A', canonical: '高级感与轻奢', triggers: ['高级感', '轻奢', '高级', '高端', '有档次'],
      params: { light: { direction: '单侧主光', softness: '硬中带柔', kelvin: [4000, 4500], contrast: '暗角明显' }, composition: { whitespace: '不少于60%', subject_position: '偏一侧', ratio: '3:4' }, color: { tone: '黑白灰基底，少量金属色', saturation: [15, 35] }, material: { props_type: '大理石、金属或丝绒', props_count: 2 } },
      fragment: '单侧光突出材质，低饱和黑白灰与少量金属色，大留白，质感保持统一', conflicts_with: []
    },
    {
      id: 'style-chinese', type: 'A', canonical: '国潮与新中式', triggers: ['新中式', '国潮', '东方'],
      params: { light: { direction: '侧光', softness: '柔和', kelvin: [3500, 4000] }, composition: { framing: '对称或三分法', ratio: '3:4', whitespace: '30%至40%' }, color: { tone: '朱红、墨黑与米色留白', saturation: [35, 55] }, material: { props_type: '竹木、宣纸或陶瓷', props_count: [1, 2] } },
      fragment: '暖色柔和侧光，对称或三分法构图，朱红墨黑与米色留白，少量竹木或陶瓷点缀', conflicts_with: []
    },
    {
      id: 'style-industrial', type: 'A', canonical: '工业风', triggers: ['工业风', 'loft', '钢筋水泥'],
      params: { light: { direction: '明确侧向主光', softness: '硬光', kelvin: [6000, 6500], contrast: '高' }, composition: { angle: '平视或低角度', ratio: '16:9' }, color: { tone: '灰黑，金属反光作点缀', saturation: [15, 35] }, material: { props_type: '水泥、铁锈或裸露管线', props_count: [2, 3] } },
      fragment: '冷调高对比硬光，宽画幅低角度，灰黑色为主，金属反光点缀', conflicts_with: ['style-cream']
    },
    {
      id: 'style-cream', type: 'A', canonical: '奶油风', triggers: ['奶油风', '奶fufu', '温柔'],
      params: { light: { direction: '大窗自然光', softness: '柔和', kelvin: [4200, 4800], contrast: '低' }, composition: { angle: '平视', subject_position: '居中', whitespace: '25%' }, color: { tone: '奶油白、浅粉与浅杏', saturation: [15, 25] }, material: { finish: '哑光', props_type: '绒面或圆角道具', props_count: [1, 2] } },
      fragment: '暖调窗光柔和，奶油白浅粉浅杏低饱和，平视居中，留白约四分之一', conflicts_with: ['style-industrial']
    },
    {
      id: 'style-dark', type: 'A', canonical: '暗调与黑底', triggers: ['低调摄影', '黑底', '暗调'],
      params: { light: { direction: '单侧光或侧逆光', softness: '硬光', kelvin: 4000, contrast: '高' }, composition: { subject_position: '居中', subject_ratio: 70 }, color: { tone: '背景全暗，产品亮部为主要高光', brightness: '暗部占比不少于60%' }, material: { props_type: '黑石或深木台面', props_count: [0, 1] }, environment: { background: '全暗背景' } },
      fragment: '暗背景压暗，单侧光突出商品轮廓与材质，商品居中偏大', conflicts_with: ['style-ins', 'style-japanese', 'style-white']
    },
    {
      id: 'style-summer', type: 'A', canonical: '清爽夏季', triggers: ['清爽夏季', '夏天', '夏日', '清凉'],
      params: { light: { direction: '强自然光', softness: '硬光', kelvin: 6000, contrast: '高' }, composition: { whitespace: '35%' }, color: { tone: '蓝绿黄', saturation: [65, 85], brightness: '高明度', max_colors: 3 }, material: { props_type: '玻璃、藤编、水果或水珠，仅按需要选用' } },
      fragment: '明亮自然光与高对比，蓝绿黄配色不超过三色，保留约三成半留白', conflicts_with: []
    },
    {
      id: 'brand-ikea', type: 'B', canonical: '像宜家', triggers: ['像宜家', '宜家那种', '宜家'],
      params: { light: { direction: '均匀自然光', softness: '柔和', kelvin: 5500 }, composition: { angle: '平视', subject_ratio: 45, framing: '生活化场景' }, color: { tone: '白与浅木色，少量亮色点缀' }, material: { props_type: '棉麻、收纳盒等生活材质' }, environment: { background: '简洁家居场景' } },
      fragment: '明亮自然光，平视生活化构图，白与浅木色搭配，不增加参照品牌标识', conflicts_with: []
    },
    {
      id: 'brand-apple', type: 'B', canonical: '像苹果', triggers: ['像苹果', '苹果风', '苹果广告', 'apple风'],
      params: { light: { direction: '单一主光，极简布光', kelvin: 5000, contrast: '适度暗角' }, composition: { subject_position: '居中', subject_ratio: 80 }, color: { tone: '纯黑、纯白或深空灰' }, material: { props_count: 0 }, environment: { background: '纯色背景' } },
      fragment: '极简主光、纯色背景，商品居中特大，保留原商品造型，不增加参照品牌标识', conflicts_with: []
    },
    {
      id: 'brand-muji', type: 'B', canonical: '像无印良品', triggers: ['像无印良品', '无印良品', 'muji风', 'muji'],
      params: { light: { direction: '柔和散射光', softness: '柔和', kelvin: 5600, contrast: '低' }, composition: { angle: '平视', subject_ratio: 50, whitespace: '40%' }, color: { tone: '米白、浅灰与原木色' }, material: { props_type: '棉麻、白瓷或原木' } },
      fragment: '柔和散射光，米白浅灰原木色，平视极简构图，不增加参照品牌文字', conflicts_with: []
    },
    {
      id: 'brand-xiaohongshu', type: 'B', canonical: '像小红书爆款', triggers: ['像小红书爆款', '小红书爆款', '小红书同款'],
      params: { light: { direction: '侧逆光与辅助补光', kelvin: 4500 }, composition: { angle: '俯拍45度', subject_ratio: 55 }, color: { tone: '低饱和基底，一处高饱和点缀', saturation: [20, 40] }, material: { props_type: '亚克力、玻璃或鲜花' } },
      fragment: '侧逆光适度补光，俯拍45度，低饱和基底加一处色彩点缀，无他人账号水印', conflicts_with: []
    },
    {
      id: 'brand-advertising', type: 'B', canonical: '像广告片', triggers: ['像广告片', '广告片风', '广告片'],
      params: { light: { direction: '主光明确，反光板适度补光', softness: '硬光', contrast: '高' }, composition: { angle: '低角度仰视', subject_ratio: 65 }, color: { saturation: [65, 85], tone: '以用户明确的商品配色为主' }, material: { props_type: '金属或玻璃质感视觉参考' } },
      fragment: '高对比主光与反光板补光，低角度仰视，突出商品，不添加虚假功效表述', conflicts_with: []
    },
    {
      id: 'scene-cafe', type: 'C', canonical: '像咖啡馆', triggers: ['像咖啡馆', '咖啡馆', '咖啡店'],
      params: { light: { direction: '窗光侧入，暖色灯光作辅助', kelvin: [3500, 4000], depth: '背景虚化' }, composition: { angle: '平视', subject_ratio: 50 }, color: { tone: '保持商品本色，环境呈暖色' }, material: { props_count: 0 }, environment: { background: '木质桌面，咖啡馆背景虚化，不额外增加道具' } },
      fragment: '木质桌面与虚化咖啡馆背景，暖调侧窗光，平视展示，不额外增加道具', conflicts_with: []
    },
    {
      id: 'scene-kitchen', type: 'C', canonical: '像家里厨房', triggers: ['像家里厨房', '家里厨房', '厨房场景', '厨房'],
      params: { light: { direction: '窗光为主，顶部柔光适度补光', softness: '柔和', kelvin: 4500 }, composition: { angle: '平视', subject_ratio: 55 }, color: { tone: '保持商品本色' }, material: { props_count: 0 }, environment: { background: '真实厨房岩板台面，不额外增加砧板或食材' } },
      fragment: '真实厨房台面，平视拍摄，窗光与柔和补光协调，不增加未要求的食材道具', conflicts_with: []
    },
    {
      id: 'scene-showroom', type: 'C', canonical: '像展厅', triggers: ['像展厅', '展厅', '展台'],
      params: { light: { direction: '顶部主光与合理地面反射', softness: '硬光', kelvin: 4000 }, composition: { angle: '低角度', subject_ratio: 60 }, color: { tone: '纯净中性色' }, material: { props_count: 0 }, environment: { background: '简洁白墙与展台，无生活道具' } },
      fragment: '简洁白墙展台，顶部主光与合理反射，低角度突出商品，无生活道具', conflicts_with: []
    },
    {
      id: 'scene-picnic', type: 'C', canonical: '像户外野餐', triggers: ['像户外野餐', '户外野餐', '野餐'],
      params: { light: { direction: '强自然光', softness: '硬光', kelvin: 6000 }, composition: { angle: '俯拍', subject_ratio: 50 }, color: { tone: '保持商品本色与自然环境色' }, material: { props_count: 0 }, environment: { background: '自然草地；格纹布或藤篮仅在明确需要时添加' } },
      fragment: '自然草地与明亮日光，俯拍展示商品，保留野餐氛围，不自动堆加道具', conflicts_with: []
    },
    {
      id: 'scene-hotel', type: 'C', canonical: '像酒店房间', triggers: ['像酒店房间', '酒店房间', '酒店客房'],
      params: { light: { direction: '窗光为主，暖色床头灯作辅助', kelvin: 3200 }, composition: { angle: '平视', subject_ratio: 45 }, color: { tone: '温暖中性色，保持商品本色' }, material: { props_count: 0 }, environment: { background: '整洁酒店床头柜与床品背景，不额外增加道具' } },
      fragment: '整洁酒店客房背景，平视展示，窗光与暖色灯光协调，不额外增加道具', conflicts_with: []
    },
    {
      id: 'season-summer', type: 'D', canonical: '夏日', triggers: ['夏日感', '夏日', '夏季感'],
      params: { light: { direction: '强自然光', kelvin: 6000, contrast: '高' }, color: { tone: '蓝绿为主', saturation: [65, 85], brightness: '高明度' }, material: { props_count: 0 } },
      fragment: '高明度蓝绿夏日色调，自然光明亮，不自动添加水果、水杯或水珠', conflicts_with: []
    },
    {
      id: 'season-autumn', type: 'D', canonical: '秋冬', triggers: ['秋冬', '秋天', '冬日', '冬天'],
      params: { light: { direction: '暖调自然主光', kelvin: 3500, contrast: '低' }, color: { tone: '暖棕与焦糖色', brightness: '低明度' }, material: { props_count: 0 } },
      fragment: '暖棕焦糖色与柔和暖光，整体明度偏低，不自动添加毛毯或干花', conflicts_with: []
    },
    {
      id: 'season-festival', type: 'D', canonical: '过年与节日', triggers: ['过年', '春节', '节日感', '节日'],
      params: { light: { direction: '暖调主光', kelvin: 3000 }, color: { tone: '红金为主', saturation: [65, 85] }, material: { props_count: 0 } },
      fragment: '红金暖色与明亮节日配色，保持商品本色，不默认添加灯笼或红包', conflicts_with: []
    },
    {
      id: 'feeling-cinematic', type: 'E', canonical: '有电影感', triggers: ['有电影感', '电影感', '像电影'],
      params: { light: { direction: '单侧硬光或窗光', softness: '硬光', contrast: '高', depth: '浅景深，主体清晰背景虚化' }, composition: { ratio: '2.35:1', framing: '三分法，前景适度遮挡' }, color: { tone: '青橙调，暖高光冷阴影', saturation: [20, 40], brightness: '暗部压暗' } },
      fragment: '宽画幅三分法，单侧光明暗分明，暖高光冷阴影，主体清晰背景虚化', conflicts_with: []
    },
    {
      id: 'feeling-advertising', type: 'E', canonical: '像广告大片', triggers: ['像广告大片', '广告大片', '大片感'],
      params: { light: { direction: '主光为主，轮廓光与反光板作辅助', contrast: '高', depth: '中景深' }, composition: { angle: '低角度仰视', subject_ratio: 65 }, color: { saturation: [65, 85], tone: '以用户明确的商品配色为主' } },
      fragment: '明确主光与辅助轮廓光，高对比，低角度展示，采用已确认的商品配色', conflicts_with: []
    },
    {
      id: 'feeling-clear', type: 'E', canonical: '很通透', triggers: ['很通透', '通透感', '通透'],
      params: { light: { direction: '逆光或侧逆光，高光不过曝', depth: '全景深' }, composition: { whitespace: '不少于35%' }, color: { tone: '偏冷中性色', saturation: [15, 35], brightness: '高明度' } },
      fragment: '逆光或侧逆光，高光不过曝，高明度低饱和，保留充足留白与清晰景深', conflicts_with: []
    },
    {
      id: 'feeling-texture', type: 'E', canonical: '有质感', triggers: ['有质感', '质感好', '质感明显'],
      params: { light: { direction: '单侧光突出表面纹理', kelvin: 4500, depth: '微距浅景深' }, composition: { framing: '近景', subject_ratio: 70 }, color: { saturation: [20, 40], tone: '突出商品材质本色' }, material: { texture: '符合实际材质的表面纹理与高光' } },
      fragment: '单侧光突出真实表面纹理，近景展示材质本色，背景适度虚化', conflicts_with: []
    },
    {
      id: 'feeling-cozy', type: 'E', canonical: '很温馨', triggers: ['很温馨', '温馨感', '温馨'],
      params: { light: { direction: '暖调主光，生活环境光作辅助', softness: '柔和', kelvin: [3500, 4000], depth: '中景深' }, composition: { angle: '平视', subject_ratio: 50 }, color: { tone: '暖黄调', saturation: [20, 40] }, material: { props_type: '生活化道具，仅按用户用途选择' } },
      fragment: '柔和暖调主光与生活环境光，平视构图，暖黄低饱和，商品清楚可见', conflicts_with: []
    }
  ];

  return {
    version: 'pe-rules-v2.0',
    metadata: {
      sources: ['自动化PE转写规则全集_V2.0.md', '自动化PE规则文档_V1.0.md', 'PE引擎升级_开发任务书.md', 'data.js / FUZZY_MAP'],
      description: '30条意象来自V1.0完整库，其余管线依据V2.0；摄影参数为经验规则，生成效果尚待实测。',
      adaptations: '三级兜底以开发任务书为准；品类不臆造商品部件、材质牌号与标识；未给定的拍摄数值是建议，不是测量结果。',
      dimension_fallback: '时间、场景或感受条目未提供的维度继承用户要求，缺失时再由品类或默认规则补齐，不为凑齐四维编造参数。',
      imagery_count: 30,
      category_count: 6,
      numeric_defaults: '将低/中/高等描述转成数值区间仅用于规则合并，不能作为模型准确率或实际画面测量值。'
    },
    pipeline: ['terminology', 'fuzzy', 'imagery', 'negation', 'completion', 'guardrail'],
    terminology: {
      material: [
        { triggers: ['那个亮面的', '亮面的', '亮面'], target: '抛光镜面，高反射', path: 'material.finish', value: '抛光镜面，高反射' },
        { triggers: ['磨砂的', '磨砂'], target: '哑光磨砂，低反射', path: 'material.finish', value: '哑光磨砂，低反射' },
        { triggers: ['透明的', '透明'], target: '高透表面，具体材质按实物确认', path: 'material.finish', value: '高透明，透射清晰，材质按实物确认' },
        { triggers: ['毛茸茸的', '毛茸茸'], target: '绒毛织物纹理，长短按实物确认', path: 'material.texture', value: '自然绒毛织物纹理' },
        { triggers: ['硬邦邦的', '硬邦邦'], target: '硬质表面，无明显弹性形变', path: 'material.texture', value: '硬质表面，保持实物形态' },
        { triggers: ['软塌塌的', '软塌塌'], target: '软质，垂坠感明显', path: 'material.texture', value: '自然软质垂坠感' },
        { triggers: ['亮闪闪的', '亮闪闪'], target: '高光泽表面，具体工艺按实物确认', path: 'material.finish', value: '高光泽表面，工艺按实物确认' },
        { triggers: ['木头那种', '木头质感'], target: '原木纹理，木种按实物确认', path: 'material.texture', value: '自然木纹，保留实物木色' },
        { triggers: ['石头感', '石头质感'], target: '自然石质纹理，石种按实物确认', path: 'material.texture', value: '自然石质纹理' },
        { triggers: ['布的', '布料那种'], target: '织物纹理，具体面料按实物确认', path: 'material.texture', value: '真实织物纹理与垂坠感' }
      ],
      color: [
        { triggers: ['那个奶白色', '奶白色'], target: '象牙白或奶油白', path: 'color.tone', value: '象牙白或奶油白' },
        { triggers: ['灰不溜秋的', '灰不溜秋'], target: '雾霾灰或浅灰', path: 'color.tone', value: '雾霾灰或浅灰' },
        { triggers: ['大红', '大红色'], target: '正红或朱红', path: 'color.tone', value: '正红或朱红' },
        { triggers: ['有点黄', '淡黄色'], target: '米黄或淡黄', path: 'color.tone', value: '米黄或淡黄' },
        { triggers: ['黑不黑灰不灰'], target: '深空灰或炭灰', path: 'color.tone', value: '深空灰或炭灰' },
        { triggers: ['那种绿色的'], target: '绿色，具体明度与色相待确认', path: 'color.tone', value: '保留明确绿色，具体色相待确认' }
      ],
      light: [
        { triggers: ['亮堂堂的', '亮堂堂'], target: '均匀高照度，阴影柔和', path: 'light.brightness', value: 1.2 },
        { triggers: ['有点阴暗', '阴暗一点'], target: '低照度暗调，明暗对比明显', path: 'light.brightness', value: 0.8 },
        { triggers: ['光线柔柔的', '柔柔的光'], target: '柔和散射光，无明显硬阴影', path: 'light.softness', value: '柔和散射光' },
        { triggers: ['太阳光那种', '太阳光'], target: '自然直射光，阴影有明确方向', path: 'light.direction', value: '自然直射光' },
        { triggers: ['侧逆光', '逆着光'], target: '侧后方主光，突出轮廓', path: 'light.direction', value: '侧逆光' },
        { triggers: ['窗光', '窗户光'], target: '自然窗光', path: 'light.direction', value: '自然窗光' }
      ],
      composition: [
        { triggers: ['小小的一个', '小小的'], target: '主体占比约30%，保留环境空间', path: 'composition.subject_ratio', value: 30 },
        { triggers: ['大大的'], target: '主体占比不低于70%，近景展示', path: 'composition.subject_ratio', value: 70 },
        { triggers: ['正俯拍', '正上方拍'], target: '正上方俯拍', path: 'composition.angle', value: '正上方俯拍' },
        { triggers: ['低角度', '往上拍'], target: '低角度仰视', path: 'composition.angle', value: '低角度仰视' },
        { triggers: ['正中间', '放中间'], target: '主体居中', path: 'composition.subject_position', value: '居中' }
      ]
    },
    fuzzy: {
      subjective: [...BASE_FUZZY_RULES, ...ADDITIONAL_FUZZY_RULES],
      degree: { '一点': 0.1, '稍微': 0.1, '略微': 0.1, '比较': 0.2, '挺': 0.2, '还算': 0.2, '很': 0.3, '非常': 0.3, '特别': 0.3, '极致': 0.4, '最': 0.4, '到顶': 0.4 },
      relative: [
        { triggers: ['比白底好看点'], fragment: '浅色渐变背景，保留自然环境阴影', params: { environment: { background: '浅色渐变背景' } } },
        { triggers: ['别那么正式'], fragment: '生活化构图，主体略偏离中心，道具按需要选择', params: { composition: { subject_position: '略偏离中心', framing: '生活化构图' }, material: { props_count: [1, 2], props_type: '生活化道具' } } },
        { triggers: ['不要太摆拍', '别太摆拍'], fragment: '采用自然抓拍感构图，主体略偏离中心', params: { composition: { subject_position: '略偏离中心', framing: '自然抓拍感构图' } } },
        { triggers: ['跟上次差不多', '和上次差不多'], fragment: '保留上一轮参数，仅调整本轮明确提出的内容', params: {} },
        { triggers: ['换个风格但别太跳'], fragment: '在同一色系内调整，保留现有饱和度区间', params: {} }
      ]
    },
    imagery: IMAGERY_RULES,
    explicit: {
      ratio: [
        { triggers: ['横版', '横幅', '16:9', '横图'], value: '16:9' },
        { triggers: ['竖版', '竖屏', '9:16', '竖图'], value: '9:16' },
        { triggers: ['方图', '正方形', '1:1'], value: '1:1' }
      ],
      subject_ratio: [
        { triggers: ['超大特写', '大特写'], value: '85%' },
        { triggers: ['特写', '近景'], value: '70%' },
        { triggers: ['中景'], value: '55%' },
        { triggers: ['场景全景', '环境图', '全景'], value: '35%' }
      ],
      whitespace: [
        { triggers: ['满版', '出血', '铺满', '不要留白', '无边距'], value: 'none' },
        { triggers: ['留白多', '大面积留白'], value: '40%' }
      ]
    },
    negation: [
      { triggers: ['不要人物', '不要人', '别加人', '不需要人物', '无人物', '无模特'], positive: '纯商品场景，无人物出现', negative: ['people', 'person', 'hand', 'finger'], params: {}, constraint: true },
      { triggers: ['别加文字', '不要文字', '无文字'], positive: '画面纯净，不额外添加文字元素', negative: ['text', 'letters', 'watermark', 'logo', 'label'], params: {}, constraint: true },
      { triggers: ['别太花', '不要太花'], positive: '配色不超过3色，道具不超过2件', negative: ['colorful', 'busy', 'cluttered'], params: { color: { max_colors: 3 }, material: { props_count: 2 } } },
      { triggers: ['不要背景', '无背景'], positive: '纯白无缝背景，主体独立呈现', negative: ['scenery', 'props'], params: { environment: { background: '纯白无缝背景' }, material: { props_count: 0 } } },
      { triggers: ['别露手', '不要手', '无手持'], positive: '商品独立摆放，无手持动作', negative: ['hand', 'arm', 'holding'], params: {}, constraint: true },
      { triggers: ['不要反光', '别反光'], positive: '控制眩光，避免过强镜面反射；保留商品真实材质', negative: ['glare', 'excessive reflection'], params: { material: { texture: '控制眩光，保留真实材质反射' } } },
      { triggers: ['别太远', '不要太远'], positive: '近景展示，主体占画面70%以上', negative: ['wide shot', 'distant'], params: { composition: { subject_ratio: 70, framing: '近景' } } },
      { triggers: ['不要阴影', '别加阴影'], positive: '均匀柔光，减少明显投影，保留合理接触关系', negative: ['hard cast shadow'], params: { light: { softness: '均匀柔光，减少明显投影' } } },
      { triggers: ['别用木头的', '不要木头', '不要木质'], positive: '不使用木质；商品具体材质按明确要求或实物确认', negative: ['wood', 'wooden texture'], params: {}, constraint: true },
      { triggers: ['不要道具', '无道具', '别加道具'], positive: '纯商品场景，不增加道具', negative: ['props', 'clutter'], params: { material: { props_count: 0, props_type: '无道具' } }, constraint: true },
      { triggers: ['别太亮', '不要太亮'], positive: '整体明度适中，高光不过曝', negative: ['overexposure'], params: { light: { brightness: 0.9 } } },
      { triggers: ['别太冷', '不要太冷', '别太冷淡'], positive: '保留原有风格，调整为中性偏暖调', negative: [], params: { color: { tone: '中性偏暖，保留商品本色' } } }
    ],
    completion: {
      '厨房小家电': {
        triggers: ['蒸锅', '电蒸锅', '蒸笼', '锅', '电饭煲', '空气炸锅', '电水壶', '料理机', '咖啡机', '小家电'],
        structure: '按实物或参考确认部件数量、面板按键与开盖方式，不增减组件',
        material: '按实物保留机身、面板与密封部件的材质、颜色和纹理，不推定材质牌号',
        params: { environment: { background: '浅色岩板台面，虚化现代厨房背景' }, light: { direction: '左侧窗光', softness: '柔和', kelvin: 5000 }, composition: { subject_ratio: 60, ratio: '3:4', whitespace: '顶部15%' }, material: { props_count: 0 } }
      },
      '3C 数码': {
        triggers: ['耳机', '手机', '电脑', '音箱', '相机', '键盘', '鼠标', '充电器', '数码', '3C'],
        structure: '按实物或参考确认屏幕、接口与按键位置，不臆造尺寸或新增功能件',
        material: '按实物保留外壳、屏幕或软质部件的表面处理，反射与实际材质相符',
        params: { environment: { background: '纯浅灰背景' }, light: { direction: '均匀主光', softness: '柔和', kelvin: 5500 }, composition: { subject_ratio: 65, ratio: '1:1', subject_position: '居中' }, material: { props_count: 0 } }
      },
      '美妆个护': {
        triggers: ['精华', '护肤', '口红', '面霜', '洗发', '香水', '美妆', '个护', '化妆'],
        structure: '按实物或参考保留瓶身、泵头或盖型，标签位置与包装结构一致',
        material: '按实物保留容器透明度、表面处理与包装颜色，不将所有容器推定为玻璃',
        params: { environment: { background: '浅色台面' }, light: { direction: '主光柔和，少量侧逆光作辅助', softness: '柔和', kelvin: 5200 }, composition: { subject_ratio: 55, ratio: '4:5', subject_position: '居中偏上' }, material: { props_count: 0 } }
      },
      '食品饮料': {
        triggers: ['食品', '饮料', '咖啡', '果汁', '茶饮', '饼干', '零食', '巧克力', '牛奶', '气泡水', '食材'],
        structure: '按实物或参考确认包装形态、份量与内容物，不改变配料或包装标识',
        material: '按实际包装与食材保留玻璃、金属、纸盒或食物表面特征，不臆造内容物',
        params: { environment: { background: '木质或岩板台面' }, light: { direction: '有方向的暖调主光', softness: '自然', kelvin: 4000 }, composition: { subject_ratio: 60, angle: '俯拍45度' }, material: { props_count: 0 } }
      },
      '服饰鞋包': {
        triggers: ['服饰', '衣服', '上衣', '外套', '连衣裙', '鞋', '手提包', '背包', '箱包', '裤', '裙', '包'],
        structure: '按实物或参考保留版型、领口袖口、鞋型与装饰件，不擅自改动组件数量',
        material: '按实物保留面料纹理、垂坠感或皮革表面处理，不推定材质成分',
        params: { environment: { background: '纯白或浅灰背景' }, light: { direction: '均匀主光', softness: '柔和', kelvin: 5500 }, composition: { subject_ratio: 70, angle: '正上方俯拍', subject_position: '居中' }, material: { props_count: 0 } }
      },
      '家居日用': {
        triggers: ['家居', '日用', '家具', '沙发', '椅', '桌', '灯具', '花瓶', '水杯', '收纳', '枕', '床品'],
        structure: '按实物或参考保留尺寸关系、放置方式与结构件，不臆造功能或尺寸',
        material: '按实物如实呈现材质、纹理和表面处理，接触与支撑关系自然',
        params: { environment: { background: '真实整洁家居环境' }, light: { direction: '自然光', softness: '柔和', kelvin: 5000 }, composition: { subject_ratio: 50, ratio: '4:3' }, material: { props_count: 0 } }
      }
    },
    guardrail: {
      hard: {
        constraints: ['画面内不额外添加第三方文字、logo或水印', '单一主光方向，辅助光不形成冲突的主光、阴影与反射'],
        negatives: ['unauthorized text', 'third-party logo', 'watermark', 'extra fingers', 'deformed hands', 'blurry', 'jpeg artifacts'],
        message_on_conflict: '已保留第三方标识与光照一致性约束；商品原有标识按实物保留，其余按你的要求执行。'
      },
      conditional: [
        { id: 'full_product', text: '商品完整入画不裁切', yield_to: ['局部', '特写', '大特写', '裁切', '只露'] },
        { id: 'safe_margin', text: '四周保留8%安全边距', yield_to: ['满版', '出血', '铺满', '无边距', '不要留白'] }
      ],
      defaults: { subject_ratio: '50%-65%', ratio: '3:4', whitespace: '顶部15%' }
    },
    imagery_hints: ['风', '感', '那种', '像', '风格', '调性']
  };
})();
