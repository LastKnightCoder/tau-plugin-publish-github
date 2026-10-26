import { expect, it, vi } from "vitest";
import type { PluginContext } from "@tau/plugins";
import { createPublisher } from "./publish";
const config = {
  repo: "owner/blog",
  branch: "pages/main",
  token: "test-secret",
  useGitCli: false,
  basePath: "/blog/",
};
const signal = () => new AbortController().signal;
it("REST 保留分支、SHA、二进制与路径语义，目标身份不依赖 Token", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = vi.fn(async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("/git/ref/")) return Response.json({ object: { sha: "branch-sha" } });
    if (init?.method === "GET") return Response.json({ sha: "old-sha" });
    return Response.json({ content: {} });
  }) as typeof globalThis.fetch;
  const publisher = createPublisher({ fetch } as PluginContext, config);
  if (publisher.mode !== "files") throw new Error("类型错误");
  const target = await publisher.describe(signal());
  expect(target.identity).toBe(JSON.stringify(["github", "owner/blog", "pages/main"]));
  expect(
    await createPublisher({ fetch } as PluginContext, { ...config, token: "changed" }).describe(
      signal()
    )
  ).toEqual(target);
  await publisher.uploadFile("assets/中文 *.bin", new Uint8Array([0, 255, 123]), signal());
  const put = calls.find((call) => call.init?.method === "PUT")!;
  expect(put.url).toContain("assets/%E4%B8%AD%E6%96%87%20*.bin");
  expect(JSON.parse(put.init!.body as string)).toMatchObject({
    sha: "old-sha",
    branch: "pages/main",
    content: "AP97",
  });
  expect(publisher.concurrency).toBe(1);
});
it("获取 SHA 的认证失败中止上传，删除不存在文件幂等", async () => {
  const fetch = vi.fn(async (input, init) =>
    String(input).includes("/git/ref/")
      ? Response.json({})
      : new Response("", { status: init?.method === "GET" ? 403 : 200 })
  ) as typeof globalThis.fetch;
  const provider = createPublisher({ fetch } as PluginContext, config);
  if (provider.mode !== "files") throw new Error("类型错误");
  await expect(provider.uploadFile("index.html", new Uint8Array(), signal())).rejects.toThrow(
    "403"
  );
  expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  const missing = createPublisher(
    { fetch: vi.fn(async () => new Response("", { status: 404 })) } as unknown as PluginContext,
    config
  );
  if (missing.mode === "files")
    await expect(missing.deleteFile("old.html", signal())).resolves.toBeUndefined();
});
it("Git Push 仅调用受控快照服务，凭据不进入远端或目标身份", async () => {
  const publishSnapshot = vi.fn().mockResolvedValue(undefined);
  const provider = createPublisher(
    { services: { git: { publishSnapshot } } } as unknown as PluginContext,
    { ...config, useGitCli: true }
  );
  if (provider.mode !== "snapshot") throw new Error("类型错误");
  await provider.publish({ id: "publication", files: [], deletions: [] }, signal());
  expect(publishSnapshot.mock.calls[0][0]).toMatchObject({
    publicationId: "publication",
    remote: "https://github.com/owner/blog.git",
    branch: "pages/main",
    authentication: { password: "test-secret" },
  });
  expect((await provider.describe(signal())).identity).not.toContain("test-secret");
});
it("声明式表单存的字符串开关：\"false\" 走 GitHub API，\"true\" 走 Git Push", () => {
  const context = { services: { git: { publishSnapshot: vi.fn() } } } as unknown as PluginContext;
  expect(createPublisher(context, { ...config, useGitCli: "false" }).mode).toBe("files");
  expect(createPublisher(context, { ...config, useGitCli: "true" }).mode).toBe("snapshot");
});
