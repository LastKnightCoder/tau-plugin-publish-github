import type { JsonValue, PluginContext, PublishInstance } from "@tau/plugins";

export const readConfig = (value: JsonValue): Record<string, JsonValue> =>
  value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
const text = (value: JsonValue | undefined) => (typeof value === "string" ? value : "");
export function repoBasePath(repo: string) {
  const [owner, name] = repo.split("/");
  return name?.toLowerCase() === owner?.toLowerCase() + ".github.io" ? "/" : "/" + name + "/";
}
const basePath = (value: string) =>
  value ? "/" + value.replace(/^\/+|\/+$/g, "") + (value === "/" ? "" : "/") : "/";
const encodePath = (value: string) => value.split("/").map(encodeURIComponent).join("/");
const base64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 16384)
    binary += String.fromCharCode(...bytes.subarray(index, index + 16384));
  return btoa(binary);
};

export function createPublisher(context: PluginContext, value: JsonValue): PublishInstance {
  const config = readConfig(value);
  const repo = text(config.repo),
    branch = text(config.branch),
    token = text(config.token);
  const [owner, name] = repo.split("/");
  const root =
    "https://api.github.com/repos/" +
    encodeURIComponent(owner ?? "") +
    "/" +
    encodeURIComponent(name ?? "");
  const assertConfig = () => {
    if (
      !/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/.test(repo) ||
      [".", ".."].includes(name) ||
      !branch ||
      !token
    )
      throw new Error("请填写有效的 Token、仓库和分支");
  };
  const request = async (url: string, signal: AbortSignal, method = "GET", body?: unknown) => {
    const response = await context.fetch(url, {
      method,
      signal,
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok && response.status !== 404)
      throw new Error("GitHub 请求失败（HTTP " + response.status + "）");
    return response;
  };
  const json = async (url: string, signal: AbortSignal, method = "GET", body?: unknown) => {
    const response = await request(url, signal, method, body);
    if (!response.ok) throw new Error("GitHub 目标不存在（HTTP " + response.status + "）");
    return response.json();
  };
  const describe = async () => {
    assertConfig();
    const base = basePath(text(config.basePath) || repoBasePath(repo));
    return {
      identity: JSON.stringify(["github", repo, branch]),
      basePath: base,
      publicUrl: "https://" + owner.toLowerCase() + ".github.io" + base,
    };
  };
  const checkConnection = async (signal: AbortSignal) => {
    assertConfig();
    return (await request(root, signal)).ok;
  };
  if (config.useGitCli !== false)
    return {
      mode: "snapshot",
      describe,
      checkConnection,
      publish: async (snapshot, signal) => {
        assertConfig();
        if (!context.services.git) throw new Error("请更新 Tau 以使用 Git Push 发布");
        await context.services.git.publishSnapshot(
          {
            publicationId: snapshot.id,
            remote: "https://github.com/" + repo + ".git",
            branch,
            author: {
              name: text(config.committerName) || "Tau Publisher",
              email: text(config.committerEmail) || "noreply@tau-editor.local",
            },
            authentication: { username: "x-access-token", password: token },
            ...(text(config.cacheId) ? { cacheId: text(config.cacheId) } : {}),
          },
          { signal }
        );
      },
    };
  let branchReady: Promise<void> | undefined;
  const ensureBranch = (signal: AbortSignal) =>
    (branchReady ??= (async () => {
      const response = await request(root + "/git/ref/heads/" + encodePath(branch), signal);
      if (response.ok) return;
      const repository = await json(root, signal);
      const ref = await json(
        root + "/git/ref/heads/" + encodePath(repository.default_branch),
        signal
      );
      await json(root + "/git/refs", signal, "POST", {
        ref: "refs/heads/" + branch,
        sha: ref.object.sha,
      });
    })().catch((error) => {
      branchReady = undefined;
      throw error;
    }));
  const sha = async (file: string, signal: AbortSignal) => {
    const response = await request(
      root + "/contents/" + encodePath(file) + "?ref=" + encodeURIComponent(branch),
      signal
    );
    if (response.status === 404) return undefined;
    const data = await response.json();
    if (typeof data.sha !== "string") throw new Error("GitHub 文件摘要无效");
    return data.sha as string;
  };
  const committer =
    text(config.committerName) && text(config.committerEmail)
      ? { committer: { name: text(config.committerName), email: text(config.committerEmail) } }
      : {};
  return {
    mode: "files",
    concurrency: 1,
    describe,
    checkConnection,
    uploadFile: async (file, bytes, signal) => {
      assertConfig();
      await ensureBranch(signal);
      const current = await sha(file, signal);
      await json(root + "/contents/" + encodePath(file), signal, "PUT", {
        message: "Update " + file,
        branch,
        content: base64(bytes),
        ...(current ? { sha: current } : {}),
        ...committer,
      });
    },
    deleteFile: async (file, signal) => {
      assertConfig();
      const current = await sha(file, signal);
      if (!current) return;
      await json(root + "/contents/" + encodePath(file), signal, "DELETE", {
        message: "Delete " + file,
        branch,
        sha: current,
        ...committer,
      });
    },
  };
}
