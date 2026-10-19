# 开发与发布

使用 Node.js 22 及以上和 pnpm 11.9.0。插件通过公共 npm 的固定别名依赖 `@tau/plugins → @xiongtao.xt/tau-plugins@0.21.0`、`@tau/ui → @xiongtao.xt/tau-ui@0.1.1`，不需要宿主源码或本地 SDK 归档。

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

构建产物为 `dist/<插件 ID>-<版本>.zip`。插件只在渲染进程执行，网络通过宿主 fetch；测试使用模拟响应，不需要真实账号。视觉与实际账号部署另行验收。

首次发布先在 [Tau 插件中心](https://plugins.taunote.app/submissions) 上传 ZIP 并提交，绑定本仓库。提交时保留 pnpm-lock.yaml，先同步 manifest.json、package.json 和 CHANGELOG.md，再推送对应 `v<版本>` 标签。GitHub Actions 会冻结安装、测试、构建、发布 GitHub Release，并用短期 OIDC 令牌把稳定版本 ZIP 自动提交到插件中心，无需保存门户令牌。普通作者进入待审；审核者本人推送时按服务端规则自动批准。主分支、PR 和预发布版本只验证或发布 Release，不提交插件中心。

重跑工作流复用既有 Release ZIP，保持同版本摘要一致。首次绑定缺失、仓库不匹配或提交失败都会使步骤失败；完成绑定后可重跑，不能覆盖同版本 ZIP 或移动已发布标签。
