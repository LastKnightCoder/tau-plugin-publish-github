# 开发与发布

使用 Node.js 22 及以上和 pnpm 11.9.0。插件通过公共 npm 的固定别名依赖 `@tau/plugins → @xiongtao.xt/tau-plugins@0.21.0`、`@tau/ui → @xiongtao.xt/tau-ui@0.1.1`，不需要宿主源码或本地 SDK 归档。

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

构建产物为 `dist/<插件 ID>-<版本>.zip`。插件只在渲染进程执行，网络通过宿主 fetch；测试使用模拟响应，不需要真实账号。视觉与实际账号部署另行验收。

提交时保留 pnpm-lock.yaml。先同步 manifest.json、package.json 和 CHANGELOG.md，再推送对应 `v<版本>` 标签；GitHub Actions 会冻结安装、运行测试和构建，并把 ZIP 发布到 GitHub Release。主分支与 PR 同样运行验证，不自动提交插件中心。
