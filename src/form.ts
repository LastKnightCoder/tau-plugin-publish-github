import { messages } from "./i18n";
import type { ProviderFormDeclaration, ProviderFormValues } from "@tau/plugins";

type Fetch = typeof globalThis.fetch;

/** 分页读取 GitHub 列表：每页 100 条，直到不满一页。 */
async function list(fetch: Fetch, url: string, values: ProviderFormValues, signal: AbortSignal) {
  if (!values.token) throw new Error("请先填写 Token");
  const result: Record<string, unknown>[] = [];
  for (let page = 1; ; page++) {
    const response = await fetch(
      `${url}${url.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
      {
        signal,
        headers: { Authorization: `Bearer ${values.token}`, Accept: "application/vnd.github+json" },
      }
    );
    if (response.status === 401) throw new Error("Token 无效或已过期");
    if (!response.ok) throw new Error(`GitHub 查询失败（HTTP ${response.status}）`);
    const items = await response.json();
    if (!Array.isArray(items)) throw new Error("GitHub 列表响应无效");
    result.push(...items);
    if (items.length < 100) return result;
  }
}

/** 发布目标表单：仓库与分支从账号实时加载，Git Push 时可选缓存目录。 */
export function createPublishForm(fetch: Fetch): ProviderFormDeclaration {
  return {
    groups: [
      {
        title: messages.ref("account.title"),
        description: messages.ref("account.description"),
        link: {
          label: messages.ref("account.createToken"),
          url: "https://github.com/settings/tokens",
        },
        fields: [{ key: "token", label: messages.ref("account.token"), type: "secret" }],
      },
      {
        title: messages.ref("location.title"),
        fields: [
          {
            key: "repo",
            label: messages.ref("repository.label"),
            type: "remote-choice",
            placeholder: "owner/repo",
            summary: true,
            dependsOn: ["token"],
            load: async (values, signal) =>
              (
                await list(fetch, "https://api.github.com/user/repos?sort=updated", values, signal)
              ).map(item => ({
                value: String(item.full_name),
                description: messages.ref(
                  item.private ? "repository.private" : "repository.public"
                ),
              })),
          },
          {
            key: "branch",
            label: messages.ref("branch.label"),
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
            label: messages.ref("basePath.label"),
            type: "text",
            optional: true,
            placeholder: "/",
            description: messages.ref("basePath.description"),
          },
        ],
      },
      {
        title: messages.ref("push.title"),
        fields: [
          {
            key: "committerName",
            label: messages.ref("committerName.label"),
            type: "text",
            optional: true,
            placeholder: "Tau Publisher",
          },
          {
            key: "committerEmail",
            label: messages.ref("committerEmail.label"),
            type: "text",
            optional: true,
            placeholder: "noreply@tau-editor.local",
          },
          {
            key: "useGitCli",
            label: messages.ref("gitPush.label"),
            type: "switch",
            default: true,
            description: messages.ref("gitPush.description"),
          },
          {
            key: "cacheId",
            label: messages.ref("cache.label"),
            type: "service-choice",
            service: "git.cacheDirectory",
            labelKey: "cacheLabel",
            placeholder: messages.ref("cache.placeholder"),
            description: messages.ref("cache.description"),
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
