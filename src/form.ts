import type { ProviderForm, ProviderFormValues } from "@tau/plugins";

type Fetch = typeof globalThis.fetch;

/** 分页读取 GitHub 列表：每页 100 条，直到不满一页。 */
async function list(fetch: Fetch, url: string, values: ProviderFormValues, signal: AbortSignal) {
  if (!values.token) throw new Error("请先填写 Token");
  const result: Record<string, unknown>[] = [];
  for (let page = 1; ; page++) {
    const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}per_page=100&page=${page}`, {
      signal,
      headers: { Authorization: `Bearer ${values.token}`, Accept: "application/vnd.github+json" },
    });
    if (response.status === 401) throw new Error("Token 无效或已过期");
    if (!response.ok) throw new Error(`GitHub 查询失败（HTTP ${response.status}）`);
    const items = await response.json();
    if (!Array.isArray(items)) throw new Error("GitHub 列表响应无效");
    result.push(...items);
    if (items.length < 100) return result;
  }
}

/** 发布目标表单：仓库与分支从账号实时加载，Git Push 时可选缓存目录。 */
export function createPublishForm(fetch: Fetch): ProviderForm {
  return {
    groups: [
      {
        title: "账号",
        description: "Token 需要目标仓库的内容写权限；受保护分支仍遵守仓库规则。",
        link: { label: "创建 Token", url: "https://github.com/settings/tokens" },
        fields: [{ key: "token", label: "Token", type: "secret" }],
      },
      {
        title: "发布位置",
        fields: [
          {
            key: "repo",
            label: "仓库",
            type: "remote-choice",
            placeholder: "owner/repo",
            summary: true,
            dependsOn: ["token"],
            load: async (values, signal) =>
              (await list(fetch, "https://api.github.com/user/repos?sort=updated", values, signal)).map(
                item => ({
                  value: String(item.full_name),
                  description: item.private ? "私有" : "公开",
                })
              ),
          },
          {
            key: "branch",
            label: "部署分支",
            type: "remote-choice",
            placeholder: "gh-pages",
            summary: true,
            dependsOn: ["repo"],
            load: async (values, signal) => {
              if (!values.repo.includes("/")) throw new Error("请先选择仓库");
              const path = values.repo.split("/").map(encodeURIComponent).join("/");
              return (
                await list(fetch, `https://api.github.com/repos/${path}/branches`, values, signal)
              ).map(item => ({ value: String(item.name) }));
            },
          },
          {
            key: "basePath",
            label: "访问路径",
            type: "text",
            optional: true,
            placeholder: "/",
            description: "留空按仓库推断：用户主页仓库为 /，其他仓库为 /仓库名/",
          },
        ],
      },
      {
        title: "提交与推送",
        fields: [
          { key: "committerName", label: "提交者名称", type: "text", optional: true, placeholder: "Tau Publisher" },
          { key: "committerEmail", label: "提交者邮箱", type: "text", optional: true, placeholder: "noreply@tau-editor.local" },
          {
            key: "useGitCli",
            label: "Git Push",
            type: "switch",
            default: true,
            description: "使用系统 Git 推送；关闭后改用 GitHub API 逐个上传文件",
          },
          {
            key: "cacheId",
            label: "缓存目录",
            type: "service-choice",
            service: "git.cacheDirectory",
            labelKey: "cacheLabel",
            placeholder: "应用缓存目录（默认）",
            description: "保存 Git 工作副本，加快之后的发布",
            visibleWhen: { key: "useGitCli", equals: "true" },
          },
        ],
      },
    ],
    beforeSave: async values => {
      const repo = values.repo.trim();
      if (!/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/.test(repo))
        throw new Error("仓库格式应为 owner/repo");
      return { ...values, repo, branch: values.branch.trim(), token: values.token.trim() };
    },
  };
}
