# Task Center 设计文档（2026-08-02）

## 背景
- 用户有 20-30 个任务 + 几十个历史会话，现有会话列表（按设备→项目）难以管理
- app 底部"收件箱"tab（好友/动态 feed）用户不需要，改为"任务"中心
- 需求：任务中心方案 A（任务列表视图）+ 布局 B（只留"运行中 + 全部"）

## 决定
1. 底部 tab："收件箱" → "任务"
2. 布局：两个分区
   - 运行中：在线且正在工作的会话；行内显示状态（思考中/等权限/运行中）+ Goal 进度（token/时长/进度条）
   - 全部：其余会话按项目路径分组，可折叠（本地设置记忆折叠状态）
3. 任务行操作（用户选择 B）：点击行直达会话；行内快捷图标（置顶/归档）；长按保留完整菜单（置顶/重命名/详情/归档等，复用 useSessionActionAlert）
4. 社交入口（好友/动态）：完全移除 tab 入口；friends 路由代码保留不暴露

## 数据
- 全部来自现有 storage（sessions / machines / agentState / pinnedSessionIds / 本地设置），无后端改动
- 运行中判定：session.active + presence online；agentState.requests 非空 → 等权限；session.thinking → 思考中
- Goal 进度复用 resolveVisibleAgentGoalStatus
- 排序：运行中按最近活动倒序；项目组按路径排序；组内按最近活动倒序

## 组件
- 新增 `utils/taskCenterData.ts`：纯函数构建分区数据（含单测）
- 新增 `components/TaskCenterView.tsx`：两分区 + 点击直达 + 行内快捷图标 + 长按菜单
- 修改 MainView / TabBar：tab 渲染与文案
- 复用：useSessionQuickActions（菜单）、SessionItem 样式参考、Modal.prompt（重命名）

## 测试
- taskCenterData 纯函数单测：运行中判定、Goal 透传、项目分组排序、折叠过滤
- app 全量测试 + typecheck

## 非目标
- 不做看板/标签/自定义文件夹
- 不改后端
- 不删 friends 代码，只移除入口
