import { useEffect, useState } from "react";
import "./styles.css";
import { definePlugin, type JsonValue, type PluginSettingsProps } from "@tau/plugins";
import { Button, Input, Select, Switch } from "@tau/ui";
import { createPublisher, readConfig, repoBasePath } from "./publish";

declare const __PLUGIN_META__: { id: string; name: string; version: string };
function Settings({ context, publishConfig }: PluginSettingsProps) {
  const [form, setForm] = useState(() => readConfig(publishConfig?.value ?? {}));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [repos, setRepos] = useState<string[]>([]),
    [branches, setBranches] = useState<string[]>([]);
  useEffect(() => {
    setForm(readConfig(publishConfig?.value ?? {}));
  }, [publishConfig?.value]);
  const string = (key: string) => (typeof form[key] === "string" ? (form[key] as string) : "");
  const field = (key: string, label: string, secret = false) => (
    <label className="flex flex-col gap-1" key={key}>
      <span>{label}</span>
      <Input
        aria-label={label}
        type={secret ? "password" : "text"}
        value={string(key)}
        onChange={(event) => setForm((old) => ({ ...old, [key]: event.target.value }))}
      />
    </label>
  );
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };
  const list = async (url: string): Promise<any[]> => {
    const result: any[] = [];
    for (let page = 1; ; page++) {
      const response = await context.fetch(
        url + (url.includes("?") ? "&" : "?") + "per_page=100&page=" + page,
        {
          headers: {
            Authorization: "Bearer " + string("token"),
            Accept: "application/vnd.github+json",
          },
        }
      );
      if (!response.ok) throw new Error("GitHub 查询失败（HTTP " + response.status + "）");
      const values = await response.json();
      if (!Array.isArray(values)) throw new Error("GitHub 列表响应无效");
      result.push(...values);
      if (values.length < 100) return result;
    }
  };
  return (
    <fieldset disabled={busy} className="tau-publish-github">
      {field("token", "GitHub Token", true)}
      {field("repo", "仓库 owner/repo")}
      <Button
        size="sm"
        loading={busy}
        onClick={() =>
          void run(async () =>
            setRepos(
              (await list("https://api.github.com/user/repos")).map((item) => item.full_name)
            )
          )
        }
      >
        读取仓库
      </Button>
      {repos.length > 0 && (
        <Select
          aria-label="选择仓库"
          value={string("repo")}
          options={repos.map((value) => ({ value, label: value }))}
          onValueChange={(value) => {
            setForm((old) => ({ ...old, repo: value, basePath: repoBasePath(value) }));
            setBranches([]);
          }}
        />
      )}
      {field("branch", "部署分支")}
      <Button
        size="sm"
        loading={busy}
        onClick={() =>
          void run(async () =>
            setBranches(
              (
                await list(
                  "https://api.github.com/repos/" +
                    string("repo").split("/").map(encodeURIComponent).join("/") +
                    "/branches"
                )
              ).map((item) => item.name)
            )
          )
        }
      >
        读取分支
      </Button>
      {branches.length > 0 && (
        <Select
          aria-label="选择分支"
          value={string("branch")}
          options={branches.map((value) => ({ value, label: value }))}
          onValueChange={(value) => setForm((old) => ({ ...old, branch: value }))}
        />
      )}
      {field("basePath", "访问路径")}
      {field("committerName", "提交者名称")}
      {field("committerEmail", "提交者邮箱")}
      <label className="flex items-center gap-2">
        <Switch
          checked={form.useGitCli !== false}
          onCheckedChange={(value) => setForm((old) => ({ ...old, useGitCli: value }))}
        />
        Git Push（关闭后使用 GitHub API）
      </label>
      {form.useGitCli !== false && (
        <div className="space-y-2">
          <p>{string("cacheLabel") || "使用应用缓存目录"}</p>
          <Button
            size="sm"
            onClick={() =>
              void run(async () => {
                const directory = await context.services.git.selectCacheDirectory({});
                if (directory)
                  setForm((old) => ({
                    ...old,
                    cacheId: directory.id,
                    cacheLabel: directory.label,
                  }));
              })
            }
          >
            选择 Git 缓存目录
          </Button>
          {string("cacheId") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setForm((old) => ({ ...old, cacheId: "", cacheLabel: "" }))}
            >
              使用默认目录
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <Button
        variant="secondary"
        loading={busy}
        onClick={() =>
          void run(async () => {
            if (!publishConfig) throw new Error("请在博客发布页配置");
            await publishConfig.save(form as JsonValue);
          })
        }
      >
        保存发布配置
      </Button>
    </fieldset>
  );
}
export default definePlugin({
  ...__PLUGIN_META__,
  create: () => ({
    activate(context) {
      if (!context.publish) throw new Error("请更新 Tau 以使用博客发布插件");
      context.publish.register({
        id: context.pluginId,
        name: "GitHub Pages",
        create: (config) => createPublisher(context, config),
      });
      context.settings.register({
        id: "publish",
        title: "GitHub 发布配置",
        target: "publish",
        component: Settings,
      });
    },
  }),
});
