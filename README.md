# 海克斯大乱斗（hksdld）

纯前端微信小程序：查询 LOL **海克斯大乱斗** 英雄强度、强化牌、装备。

后续开发或新会话请先阅读 [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md)，其中记录了国服数据源、字段映射、推荐过滤规则、验证结果和维护边界。

## 功能

| 模块 | 内容 |
|------|------|
| **英雄** | 宫格/列表、评级、定位筛选、胜率/登场排序 |
| **强化** | 稀有度/核心/特殊/谨慎、HexScore 与胜率 |
| **搭配** | 按效果关键词聚合的流派强化池 |
| **装备** | ARAM 成品装分类 |
| **详情** | 英雄适配强化与组合；强化效果详情 |
| **搜索** | 中文名 / 外号 / 拼音（如 `js`→剑圣） |

## 数据源

- Hexdata：国服 Queue 2400 英雄、强化及英雄适配公开统计页面
- Riot Data Dragon：英雄、装备和版本静态资料
- CommunityDragon：KIWI 强化池、名称、稀有度、描述和图标补全

Hexdata 样本不是腾讯官方全服统计，具体大区、时间窗和样本规模以其当前构建说明为准。批量转载或商业再分发前需取得数据方许可。

## 本地运行

微信开发者工具导入本目录，本地已关 `urlCheck`。

上线域名：

```
https://ddragon.leagueoflegends.com
https://hexdata.com.cn
https://raw.communitydragon.org
```

request 与 downloadFile 都要配上述三个域名。真机预览约 10 分钟后生效。

## 首屏加载策略

首屏只保证「英雄」可交互，不改变现有布局。强化、搭配、装备不得阻塞首页。

启动顺序：

1. `app.js` 并行 `initStaticData` 与 `getMayhemChampions`（英雄榜 HTML 与 Data Dragon 静态资料同时拉）。
2. 首页拿到英雄列表后立刻 `setData` 并结束 loading。
3. 强化榜在后台 `ensureAugs`；点「强化 / 搭配 / 装备」时若尚未缓存再请求。
4. 英雄宫格先渲染前 40 个，其余下一帧补齐，避免一次 setData 173 条卡住首屏。

请求层：

- Data Dragon 的 `versions.json` / `champion.json` / `item.json` 以及 CommunityDragon 静态 JSON 开 `enableCache`。
- Hexdata 英雄榜、强化榜与 manifest 并行，不再先等 manifest 再下 HTML。
- 不再下载体积很大的 `queues.json`；KIWI 池数量和强化关联率仍作校验。
- 启动时不预拉强化。装备、搭配只在进入对应 Tab 时加载。

后续改首页时保持：英雄可先出；统计栏数字可稍后填入；不要把 `getHomeSummary` 重新改成等强化返回才结束 loading。
