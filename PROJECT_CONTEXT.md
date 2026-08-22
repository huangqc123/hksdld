# 项目上下文与数据规范

> 最后更新：2026-08-22
> 项目：微信小程序「海克斯大乱斗」
> 目标数据范围：中国大陆腾讯国服，不能用全球服数据冒充国服数据。

本文用于后续开发会话快速恢复上下文。修改数据层、推荐算法或数据文案前，应先阅读本文和 `README.md`。

## 1. 项目定位

这是一个原生微信小程序，提供：

- 海克斯大乱斗英雄排行；
- 强化符文排行与详情；
- 英雄专属强化推荐；
- 基于单张强化数据生成的启发式组合；
- ARAM 装备资料；
- 英雄中文名、外号和拼音搜索。

项目没有自有后端、数据库或 npm 依赖，主要数据逻辑位于：

```text
miniprogram/utils/api.js
```

页面不应直接适配第三方原始字段。所有第三方数据都应先在 `api.js` 中转换成项目现有字段契约。

## 2. 国服数据约束

用户明确要求使用中国大陆腾讯国服数据。

必须遵守：

- Riot Match-v5 没有腾讯中国大陆平台路由，不能作为国服数据源；
- OP.GG、U.GG、Lolalytics 等全球服统计不能标为国服；
- Data Dragon 的 `zh_CN` 只是中文静态资料，不代表腾讯国服统计；
- CommunityDragon 的 `zh_cn` 是 Riot 资源的中文本地化，不代表腾讯国服版本或国服对局统计；
- 腾讯 LCU、SGP、掌盟和 WeGame 私有接口需要登录或动态令牌，没有公开第三方授权，不能直接接入公开小程序；
- 页面必须准确声明数据样本范围，不能写成“腾讯官方全服统计”。

## 3. 当前数据源

### 3.1 国服统计主源：Hexdata

域名：

```text
https://hexdata.com.cn
```

当前已验证快照：

```text
Patch: 16.16
数据日期: 2026-08-19
Build ID: hexdata-2026-08-19-2a6a2393a083
有统计英雄: 172
强化: 208
```

Hexdata 公布的样本口径：

```text
艾欧尼亚 Queue 2400 活跃玩家关系网冻结样本
只统计正常结束且超过 4 分钟的比赛
非随机抽样，不代表腾讯国服全部对局
```

相关入口：

```text
https://hexdata.com.cn/heroes
https://hexdata.com.cn/augments
https://hexdata.com.cn/methodology
```

项目当前使用：

```text
/heroes                         英雄排行和英雄样本
/augments                       强化全局排行
/data/heroes/{championId}.json  完整英雄强化数据
/augment/{id}-{slug}            强化详情公开摘要和适配英雄
```

重要授权边界：Hexdata 方法页允许个人查询和注明来源的引用，但明确说明批量转载数据集或商业再分发需要另行取得许可。正式商业上线前应联系数据方取得 API 或快照授权。

### 3.2 英雄和装备静态资料：Data Dragon

域名：

```text
https://ddragon.leagueoflegends.com
```

用途：

- 最新静态版本；
- 中文英雄名称、称号、职业标签和图片；
- 中文装备名称、描述、价格、标签和图片。

主要接口：

```text
/api/versions.json
/cdn/{version}/data/zh_CN/champion.json
/cdn/{version}/data/zh_CN/item.json
```

Data Dragon 只负责静态资料，不能据此声称数据来自国服对局。

### 3.3 强化静态资料：CommunityDragon

域名：

```text
https://raw.communitydragon.org/latest
```

用途：

- `augment-lists.json`：筛选 `modeName === "KIWI"` 的强化池；
- `cherry-augments.json`：强化 ID、名称、稀有度和图标；
- `cdragon/arena/zh_cn.json`：补充部分强化描述。

主要接口：

```text
/plugins/rcp-be-lol-game-data/global/zh_cn/v1/augment-lists.json
/plugins/rcp-be-lol-game-data/global/zh_cn/v1/cherry-augments.json
/cdragon/arena/zh_cn.json
```

当前验证结果：

```text
Hexdata 强化总数: 208
成功关联图标: 208 / 208
CommunityDragon 通用描述直接覆盖: 约 91 / 208
```

缺少通用描述时，强化详情页按需读取 Hexdata 公开效果摘要，不在首页启动时批量请求 208 个详情页面。

## 4. 为什么没有改成纯 OP.GG

已经核对 OP.GG 当前模式：

```text
https://op.gg/lol/modes/aram-mayhem-classic/{champion}/augments
```

截至 2026-08-22、Patch 16.16 的抽样结果：

- Vayne：有强化数据；
- Ezreal：有强化数据；
- Caitlyn：`No data available`；
- Jinx：`No data available`；
- Kai'Sa：`No data available`。

OP.GG 的其他问题：

- 数据不是腾讯国服；
- 没有公开、稳定、文档化的 API；
- 页面数据位于 Next.js React Server Components payload；
- 页面强化顺序主要按选取率或场次，而不是按强度；
- 部分英雄完全没有数据；
- 私有页面结构可能随部署变化。

因此 OP.GG 只能作为人工交叉校验源，不能作为当前项目的唯一主源。

## 5. Hexdata 完整英雄强化字段

完整英雄数据接口：

```text
https://hexdata.com.cn/data/heroes/{championId}.json
```

顶层主要结构：

```js
{
  augments: [],
  items: [],
  trios: [],
  summonerSpellPairs: [],
  terminalItemTrios: [],
  teammateSynergies: [],
  strongAgainst: [],
  weakAgainst: []
}
```

`augments[]` 关键字段：

| 原始字段 | 含义 | 项目字段 |
|---|---|---|
| `augmentId` | 强化数字 ID | `id` |
| `augmentName` | 中文名称 | `name` |
| `augmentDescription` | 效果说明 | `desc`, `tooltip` |
| `augmentIconUrl` | 图标相对地址 | `smallIcon`, `largeIcon` |
| `rarity` | 白银、黄金、棱彩 | 转换为 `1`, `4`, `8` |
| `hexScore` | Hexdata 强度分 | `score`, `performance`, `avgPerf` |
| `pairWinRate` | 英雄与强化搭配胜率 | `winRate` |
| `heroWinRate` | 英雄基准胜率 | 保留用于分析 |
| `deltaWinRate` | 相对英雄基准收益 | 保留用于分析 |
| `pickRate` | 强化选择率 | `pickRate`, `popular` |
| `games` | 样本场次 | `play`, `games` |
| `wins` | 胜场 | `wins` |
| `tier` | 数据档位 | `fitTier`, `globalTier` |
| `stages` | 各选牌阶段统计 | `stages` |

注意：

- 总体胜率字段是 `pairWinRate`，不是 `winRate`；
- 当前推荐排序字段是 `hexScore`，不是原始字段 `score`；
- `pickRate` 已经由数据源提供，不要使用 `games / heroGames` 重算；
- `tier` 是数据档位，不是数组排名；
- `augmentId` 和 `heroId` 原始值可能是字符串，使用前应转为数字。

## 6. 英雄强化推荐规则

此前异常的根因是读取 Hexdata 页面 SEO 摘要中的前 8 条。这些条目混入了：

```text
1 场 100%
2 场 100%
8 场 87.5%
几十场高胜率
```

这些低样本强化会产生明显错误推荐，例如让 ADC 默认选择坦克任务或重装战士强化。

当前推荐改为读取完整英雄 JSON，并执行以下规则。

### 6.1 最低样本门槛

强化必须同时满足：

```js
games >= 1000
games >= heroGames * 0.005
```

即：

- 至少 1000 场；
- 至少达到该英雄总样本的 0.5%。

这样可以排除个位数、几十场和占比极低的偶发高胜率结果。

### 6.2 排序规则

```text
1. HexScore 降序
2. HexScore 相同时按 games 降序
```

页面“按强度”必须比较 `score`，不能优先比较裸胜率。裸胜率会再次把低样本异常值顶到前面。

### 6.3 射手定位冲突过滤

对 Data Dragon 标签包含 `Marksman` 的英雄，默认排除明显改变射手核心定位的强化。

当前黑名单位于：

```js
MARKSMAN_CONFLICT_AUGMENTS
```

当前包含：

| 强化 ID | 类型 |
|---:|---|
| `1041` | 重装巨人化 |
| `1056` | 法力坦克化 |
| `1134` | 近战转职 |
| `1152` | 心之钢任务 |
| `1181` | 生命值伤害流 |
| `1319` | 献祭坦克升级 |
| `1353` | 坦克化成长 |
| `1361` | 坦克装备任务 |
| `2091` | 重装战士技能 |
| `2102` | 最大生命值伤害 |
| `2143` | 重装战士升级 |

该过滤只作用于射手。坦克和战士仍然可以正常获得这些推荐。

注意：这不是说这些强化绝对不能给射手使用，而是它们会明显改变默认玩法。未来如果页面增加“实验流派”区域，可以把这些高样本强化单独展示，而不是永久删除。

### 6.4 不允许全局榜伪装成英雄推荐

英雄完整数据请求失败时：

- 不再使用全局强化榜前 12 作为英雄专属推荐；
- 不再悄悄混入 `钢化你心`、`艾卡西亚的陷落` 等全局高分牌；
- 返回空的英雄推荐，让页面明确显示数据不足或加载失败。

这是准确性优先于“页面必须有内容”的设计决定。

## 7. 当前射手验证结果

以下结果均经过完整英雄 JSON、样本门槛和射手冲突过滤。

### 薇恩

```text
掷骰狂人
双刀流
暗影疾奔
连拨击锤
逃跑计划
双发快射
渴血
暴击飞弹
会心防御
邦！
```

### 凯特琳

```text
掷骰狂人
逃跑计划
升级：无尽之刃
大力
魔法转物理
灵魂虹吸
会心防御
暴击飞弹
巨人杀手
双刀流
```

### 金克丝

```text
掷骰狂人
逃跑计划
升级：无尽之刃
暴击飞弹
踢踏舞
灵魂虹吸
捐赠
渴血
唯快不破
家园卫士
双刀流
巨人杀手
```

### 卡莎

```text
掷骰狂人
回归基本功
虚幻武器
有始有终
逃跑计划
升级：耀光
无限循环往复
属性叠属性！
术士果汁盒
沃格勒特的巫师帽
回力 OK 镖
巨人杀手
```

### 伊泽瑞尔

```text
咒语裂变
掷骰狂人
升级：耀光
逃跑计划
无限循环往复
有始有终
巨人杀手
回归基本功
大力
牙仙子
质变：棱彩阶
渴血
```

非射手回归验证：

- 剑魔仍能获得战士类强化；
- 石头人仍能获得坦克任务和生命值强化；
- 拉克丝仍能获得法术和功能类强化。

## 8. 推荐组合的真实含义

页面中的“推荐组合”不是四张强化共同出现时的真实组合统计。

当前算法：

1. 获取该英雄通过样本过滤的单张强化；
2. 按单张 HexScore 排序；
3. 按综合、棱彩、黄金、白银偏好启发式拼接；
4. 显示所选单张强化 HexScore 的平均值。

因此文案必须保持：

```text
启发式组合
均 HexScore
不代表组合胜率
```

禁止改回：

```text
真实组合胜率
均胜率
组合按胜率聚合
```

## 9. 缓存和刷新规则

当前数据层包含：

- 静态英雄请求去重；
- 英雄榜请求去重；
- 强化榜请求去重；
- 装备请求去重；
- 30 分钟内存缓存；
- 下拉刷新传递 `force`；
- 初始化失败后清除 rejected `bootPromise`，允许重新初始化；
- 请求失败或解析为空时不写入成功缓存。

页面刷新时不要直接操作 `api.js` 的模块级缓存变量，应通过各 API 的 `force` 参数刷新。

## 10. 页面数据契约

替换数据源时应继续保持以下字段，避免页面跟随第三方接口变化。

### 英雄

```text
id
key
name
title
tags
icon
searchText
role
roleLabel
grade
gradeClass
rank
winRate
pickRate
play
winRateText
pickRateText
playText
```

### 强化

```text
id
key
name
smallIcon
largeIcon
rarity
rarityName
rarityKey
rarityColor
desc
tooltip
score
avgPerf
winRate
pickRate
play
perfText
winRateText
pickRateText
playText
tags
styleKeys
grade
gradeClass
```

稀有度仍使用项目内部值：

```text
1 = 白银
4 = 黄金
8 = 棱彩
```

## 11. 数据源候选与结论

### ARAMGG

```text
https://aramgg.com
https://data.dtodo.cn/developer.html?locale=zh-CN
```

优点：有正式开发者平台，理论上是长期接入的首选候选。

限制：需要 API Key、套餐和展示授权。没有 Key 时不要逆向其网页私有接口。

### ARAMKit

```text
https://aramkit.com
https://data.aramkit.com
```

优点：国服样本大、字段丰富、当前更新较新。

限制：使用条款禁止未经许可的批量抓取和对基础设施造成负担。未经授权不能直接接入其完整数据集。

### 腾讯、掌盟、WeGame

没有找到面向第三方公开、文档化、稳定且有授权的海克斯大乱斗聚合统计 API。

不要接入：

- 登录后的掌盟私有接口；
- WeGame 客户端私有接口；
- 腾讯 SGP 动态令牌接口；
- 从客户端内存或登录态提取的凭据。

## 12. 上线域名

微信公众平台需要配置：

```text
https://hexdata.com.cn
https://ddragon.leagueoflegends.com
https://raw.communitydragon.org
```

需要分别检查 `request`、图片和下载相关合法域名要求。

## 13. 验证命令

项目没有 npm 测试框架。修改后至少执行 JavaScript 语法检查：

```powershell
$files = @(Get-ChildItem -LiteralPath "miniprogram" -Recurse -Filter "*.js" | ForEach-Object { $_.FullName })
foreach ($file in $files) {
  node --check "$file"
  if (-not $?) { exit 1 }
}
```

JSON 配置检查：

```powershell
$files = @(Get-ChildItem -LiteralPath "." -Recurse -Filter "*.json" | ForEach-Object { $_.FullName })
foreach ($file in $files) {
  $null = Get-Content -Raw -LiteralPath "$file" | ConvertFrom-Json
}
```

数据逻辑修改后，至少验证：

```text
静态英雄约 173
有统计英雄约 172
强化约 208
强化图标无大面积缺失
薇恩、凯特琳、金克丝、卡莎、伊泽瑞尔推荐无低样本坦克牌
剑魔、石头人、拉克丝不受射手过滤误伤
```

数量会随版本变化，不能永久写死为断言，但出现大幅下降时应阻止发布。

## 14. 后续优先事项

1. 联系 Hexdata 或 ARAMGG，取得正式 API、缓存和二次展示授权。
2. 将第三方页面解析迁移到自有后端或每日静态快照，避免小程序直连网页。
3. 给数据快照增加 `patch`、`dataDate`、`buildId` 和 schema 校验。
4. 增加英雄强化最低样本、排序和定位过滤的自动化测试。
5. 将被默认过滤但高样本的强化放入“实验流派”，例如射手的近战转职。
6. 为强化详情接入完整 `stages` 阶段数据。
7. 增加数据源失败状态，明确区分英雄榜、强化榜和静态资源错误。
8. 长期使用腾讯国服客户端离线快照校验强化池和中文描述，避免全球静态资源与国服热补丁不同步。

## 15. 修改原则

后续会话应遵循：

- 准确性优先于列表数量；
- 无英雄专属数据时宁可显示暂无数据，也不要用全局榜伪装；
- 不以低样本高胜率作为默认推荐；
- 不把全球服统计标成国服；
- 不把启发式组合标成真实组合胜率；
- 不逆向需要登录、签名或动态令牌的腾讯私有接口；
- 数据源改变时优先修改 `api.js` 适配层，尽量保持页面字段契约；
- 商业上线前确认第三方数据的缓存、转载和再分发授权。
