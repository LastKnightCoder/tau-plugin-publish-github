import { useEffect, useRef, useState, type ReactNode } from "react";
import "./styles.css";
import {
  definePlugin,
  useSettingsDraft,
  type JsonValue,
  type PluginSettingsProps,
  type SettingsDraftChange,
} from "@tau/plugins";
import { Button, Input, Select, Switch } from "@tau/ui";
import { createPublisher, readConfig, repoBasePath } from "./publish";

declare const __PLUGIN_META__: { id: string; name: string; version: string };
type Form = Record<string, JsonValue>;

/** 宿主发布页组卡片内的一行：左标签 + 右控件，度量与宿主「服务」行一致 */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tpg-row">
      <span className="tpg-label">{label}</span>
      <div className="tpg-control">{children}</div>
    </div>
  );
}

const LABELS: [key: string, label: string][] = [
  ["token", "Token"],
  ["repo", "仓库"],
  ["branch", "部署分支"],
  ["basePath", "访问路径"],
  ["committerName", "提交者名称"],
  ["committerEmail", "提交者邮箱"],
  ["useGitCli", "Git Push"],
  ["cacheLabel", "缓存目录"],
];

/** 离开确认里的修改清单；Token 只说改了 */
function describeChanges(saved: Form, form: Form): SettingsDraftChange[] {
  const show = (key: string, value: JsonValue | undefined) =>
    key === "useGitCli"
      ? value === false
        ? "关"
        : "开"
      : key === "cacheLabel"
        ? (typeof value === "string" && value) || "默认"
        : typeof value === "string"
          ? value
          : "";
  return LABELS.filter(
    ([key]) => show(key, saved[key]) !== show(key, form[key]) || (key === "token" && saved[key] !== form[key])
  ).map(([key, label]) =>
    key === "token" ? { label } : { label, from: show(key, saved[key]), to: show(key, form[key]) }
  );
}

function Settings({ context, publishConfig }: PluginSettingsProps) {
  const [form, setForm] = useState<Form>(() => readConfig(publishConfig?.value ?? {}));
  const [reading, setReading] = useState<"repo" | "branch" | null>(null);
  const [error, setError] = useState("");
  const [reveal, setReveal] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [repos, setRepos] = useState<string[]>([]),
    [branches, setBranches] = useState<string[]>([]);
  // 最近一次提交给宿主的配置：宿主回写同一份值时不覆盖正在输入的表单
  const [saved, setSaved] = useState<Form>(form);
  const savedJson = JSON.stringify(saved);
  const formRef = useRef(form);
  formRef.current = form;

  useEffect(() => {
    const next = readConfig(publishConfig?.value ?? {});
    setSaved((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
    setForm((old) => (JSON.stringify(old) === savedJson ? next : old));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishConfig?.value]);

  const changes = describeChanges(saved, form);
  const save = async () => {
    if (!publishConfig) throw new Error("请更新 Tau 以保存发布配置");
    const value = formRef.current;
    await publishConfig.save(value as JsonValue);
    setSaved(value);
    setError("");
  };
  const draft = useSettingsDraft({
    dirty: changes.length > 0,
    changes,
    saveLabel: "保存配置",
    save,
    reset: () => setForm(saved),
  });
  const saveHere = async () => {
    try {
      await save();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  const string = (key: string) => (typeof form[key] === "string" ? (form[key] as string) : "");
  const update = (patch: Form) => setForm((old) => ({ ...old, ...patch }));
  const input = (key: string, label: string, extra?: { mono?: boolean; placeholder?: string }) => (
    <Input
      aria-label={label}
      className={extra?.mono ? "tpg-mono" : undefined}
      wrapperClassName="tpg-grow"
      placeholder={extra?.placeholder}
      value={string(key)}
      onChange={(event) => update({ [key]: event.target.value })}
    />
  );
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
  const read = async (kind: "repo" | "branch", action: () => Promise<void>) => {
    setReading(kind);
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setReading(null);
    }
  };
  const readButton = (kind: "repo" | "branch", disabled: boolean, action: () => Promise<void>) => (
    <Button
      size="sm"
      variant="ghost"
      disabled={disabled}
      loading={reading === kind}
      onClick={() => void read(kind, action)}
    >
      {(kind === "repo" ? repos : branches).length > 0 ? "刷新" : "读取"}
    </Button>
  );
  const choices = (values: string[], current: string) =>
    (current && !values.includes(current) ? [current, ...values] : values).map((value) => ({
      value,
      label: value,
    }));
  const useGitCli = form.useGitCli !== false;

  return (
    <div className="tau-publish-github">
      <Row label="Token">
        <Input
          aria-label="GitHub Token"
          className="tpg-mono"
          wrapperClassName="tpg-grow"
          type={reveal ? "text" : "password"}
          value={string("token")}
          onChange={(event) => update({ token: event.target.value })}
            />
        <Button size="sm" variant="ghost" onClick={() => setReveal((value) => !value)}>
          {reveal ? "隐藏" : "显示"}
        </Button>
      </Row>
      <Row label="仓库">
        {repos.length > 0 ? (
          <Select
            aria-label="仓库 owner/repo"
            className="tpg-grow tpg-mono"
            searchable
            creatable
            value={string("repo")}
            options={choices(repos, string("repo"))}
            onValueChange={(value) => {
              update({ repo: value, basePath: repoBasePath(value) });
              setBranches([]);
            }}
          />
        ) : (
          input("repo", "仓库 owner/repo", { mono: true, placeholder: "owner/repo" })
        )}
        {readButton("repo", !string("token"), async () =>
          setRepos(
            (await list("https://api.github.com/user/repos")).map((item) => item.full_name)
          )
        )}
      </Row>
      <Row label="部署分支">
        {branches.length > 0 ? (
          <Select
            aria-label="部署分支"
            className="tpg-grow tpg-mono"
            searchable
            creatable
            value={string("branch")}
            options={choices(branches, string("branch"))}
            onValueChange={(value) => update({ branch: value })}
          />
        ) : (
          input("branch", "部署分支", { mono: true, placeholder: "gh-pages" })
        )}
        {readButton("branch", !string("token") || !string("repo").includes("/"), async () =>
          setBranches(
            (
              await list(
                "https://api.github.com/repos/" +
                  string("repo").split("/").map(encodeURIComponent).join("/") +
                  "/branches"
              )
            ).map((item) => item.name)
          )
        )}
      </Row>
      <Row label="访问路径">{input("basePath", "访问路径", { mono: true, placeholder: "/" })}</Row>
      <button
        type="button"
        className="tpg-disclose"
        aria-expanded={advanced}
        onClick={() => setAdvanced((value) => !value)}
      >
        <span>
          高级选项
          {!advanced && <small>提交者、推送方式、缓存目录</small>}
        </span>
        <span className="tpg-chevron" aria-hidden>
          ›
        </span>
      </button>
      {advanced && (
        <>
          <Row label="提交者">
            {input("committerName", "提交者名称", { placeholder: "名称" })}
            {input("committerEmail", "提交者邮箱", { mono: true, placeholder: "邮箱" })}
          </Row>
          <Row label="推送方式">
            <span className="tpg-grow">
              Git Push
              <small className="tpg-hint">关闭后改用 GitHub API</small>
            </span>
            <Switch
              aria-label="Git Push"
              checked={useGitCli}
              onCheckedChange={(value) => update({ useGitCli: value })}
            />
          </Row>
          {useGitCli && (
            <Row label="缓存目录">
              <span className="tpg-grow tpg-muted" title={string("cacheLabel") || undefined}>
                {string("cacheLabel") || "应用缓存目录（默认）"}
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  void context.services.git
                    .selectCacheDirectory({})
                    .then((directory) => {
                      if (directory) update({ cacheId: directory.id, cacheLabel: directory.label });
                    })
                    .catch((failure: unknown) =>
                      setError(failure instanceof Error ? failure.message : String(failure))
                    )
                }
              >
                选择…
              </Button>
              {string("cacheId") && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => update({ cacheId: "", cacheLabel: "" })}
                >
                  恢复默认
                </Button>
              )}
            </Row>
          )}
        </>
      )}
      {!draft && (
        <Button variant="primary" onClick={() => void saveHere()}>
          保存配置
        </Button>
      )}
      {error && (
        <p role="alert" className="tpg-error">
          {error}
        </p>
      )}
    </div>
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
